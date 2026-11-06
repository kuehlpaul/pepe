// Auth for the product:
//  - OAuth 2.1 authorization server (claude.ai, ChatGPT, Cursor … anything that speaks MCP OAuth), one grant per user
//  - Personal API tokens `pcl_…` (clients that only support a static Bearer header), owned by a user
//  - Email + password sessions for the web UI, the admin panel and the OAuth consent page
//  - Invite-only sign-up (/join), password reset (/forgot, /reset)
import {
	AuthorizationError,
	CimdFetchError,
	OAuthAuthorizationServer,
	OAuthResourceServer,
	insufficientScope,
	type ConsentDescription,
} from "@cloudflare/workers-oauth-provider";
import { env } from "cloudflare:workers";
import {
	LEGACY_OWNER,
	MIN_PASSWORD_LENGTH,
	adminUserId,
	deleteUserRows,
	legacyOwnerUserId,
	authenticate,
	clearSessionCookie,
	consumeInvite,
	createPasswordReset,
	createUser,
	currentUser,
	emailConfigured,
	getInviteByCode,
	getUser,
	getUserByEmail,
	inviteProblem,
	isConfiguredAdmin,
	isEmail,
	normalizeEmail,
	publicUrl,
	sendEmail,
	sessionCookie,
	setPassword,
	userForApiToken,
	userForResetToken,
	type User,
} from "./accounts";
import { escape, htmlResponse, layout, redirect, sameOrigin } from "./html";
import type { AuthProps } from "./mcp";
import { mcpHandler } from "./mcp";
import { Store } from "./store";

const SCOPES = ["mcp:read", "mcp:write", "offline_access"];
export const MCP_RESOURCE = `${publicUrl()}/mcp`;

export const authorizationServer = new OAuthAuthorizationServer<Env>({
	issuer: publicUrl(),
	resources: [MCP_RESOURCE],
	scopesSupported: SCOPES,
	clientIdMetadataDocumentEnabled: true, // modern MCP clients identify via a metadata URL
	clientRegistrationEndpoint: "/oauth/register", // Dynamic Client Registration for older clients
	accessTokenTTL: 60 * 60, // 1h, refreshed via offline_access
});

export const resourceServer = new OAuthResourceServer<Env, AuthProps>({
	resourceMetadata: { resource: MCP_RESOURCE, authorization_servers: [publicUrl()], resource_name: "Personal Context Layer" },
	requiredScopes: ["mcp:read"],
	validateToken: (env) => async (resource, token) => {
		try {
			// Personal API tokens are recognised by shape and checked against D1 first.
			if (token.startsWith("pcl_")) {
				const row = await userForApiToken(token);
				if (!row) return null;
				const scopes = ["mcp:read", "mcp:write"];
				return { props: { userId: row.user_id, client: `token:${row.name}`, scopes }, audience: resource, scope: scopes, userId: row.user_id };
			}
			const valid = await authorizationServer.validateToken<AuthProps>(resource, token, env);
			if (!valid) return null;
			// Grants issued before accounts existed carry the legacy owner id. They belong to exactly the account
			// that adopted the legacy data (recorded once at claim time), never to "whoever is admin now".
			if (valid.props?.userId === LEGACY_OWNER) {
				const owner = await legacyOwnerUserId();
				if (!owner) return null;
				valid.props.userId = owner;
				valid.userId = owner;
			}
			const user = valid.props?.userId ? await getUser(valid.props.userId) : null;
			if (!user || user.status !== "active") return null; // disabled or deleted accounts lose MCP access immediately
			return valid;
		} catch (err) {
			// The library turns a throw into a bare 503; log the cause (never the token).
			console.error("validateToken failed", { resource, error: String(err), stack: (err as Error)?.stack });
			throw err;
		}
	},
	handler: {
		fetch(request, env, ctx) {
			const c = ctx as ExecutionContext & { auth: { scope: string[] } };
			if (!c.auth.scope.includes("mcp:read")) return insufficientScope(c.auth as never, ["mcp:read"]);
			return mcpHandler(request, env, ctx);
		},
	},
});

// Only same-origin paths: no scheme, no "//", no backslash (browsers treat "/\evil" as "//evil").
const safeNext = (next: string | null) => (next && /^\/(?![\/\\])[^\\]*$/.test(next) ? next : "/ui");

/** OAuth grant ids this user may manage: their own, plus pre-accounts grants if they adopted the legacy data. */
export async function grantSubjectsFor(userId: string) {
	const subjects = [userId];
	if ((await legacyOwnerUserId()) === userId) subjects.push(LEGACY_OWNER);
	return subjects;
}

export async function listGrantsFor(userId: string) {
	const api = authorizationServer.getOAuthApi(env as Env);
	const out: { id: string; userId: string; clientId: string; scope?: string[]; createdAt: number; metadata?: unknown }[] = [];
	for (const subject of await grantSubjectsFor(userId)) {
		try {
			out.push(...(await api.listUserGrants(subject)).items.map((g) => ({ ...g, userId: subject })));
		} catch (err) {
			console.warn("listUserGrants failed", subject, String(err));
		}
	}
	return out;
}

export async function revokeGrantFor(userId: string, grantId: string) {
	const api = authorizationServer.getOAuthApi(env as Env);
	for (const subject of await grantSubjectsFor(userId)) await api.revokeGrant(grantId, subject).catch(() => {});
}

/** Deletes the account, all its data and vectors, and revokes every OAuth grant it holds. Irreversible. */
export async function deleteAccount(userId: string) {
	for (const g of await listGrantsFor(userId)) await revokeGrantFor(userId, g.id);
	await deleteUserRows(userId);
}
const slowDown = () => new Promise((r) => setTimeout(r, 600)); // blunt brake on credential guessing

// ---------------------------------------------------------------- login / logout

export async function handleLogin(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const next = safeNext(url.searchParams.get("next"));
	if (await currentUser(request)) return redirect(next);
	if (request.method === "POST") {
		if (!sameOrigin(request)) return new Response("Bad origin", { status: 403 });
		const form = await request.formData();
		const email = normalizeEmail(form.get("email"));
		const user = await authenticate(email, String(form.get("password") ?? ""));
		if (user) {
			await new Store(env as Env, user.id, "web-ui").log("login");
			return redirect(next, { "Set-Cookie": await sessionCookie(user.id) });
		}
		await slowDown();
		return htmlResponse(loginPage(next, email, "Wrong email or password, or the account is disabled."), 401);
	}
	return htmlResponse(loginPage(next));
}

export function handleLogout(): Response {
	return redirect("/", { "Set-Cookie": clearSessionCookie() });
}

function loginPage(next: string, email = "", error?: string) {
	return layout(
		"Sign in",
		`<form method="post" action="/login?next=${encodeURIComponent(next)}" class="card narrow">
			<h1>Sign in</h1>
			${error ? `<p class="error">${escape(error)}</p>` : ""}
			<label>Email <input type="email" name="email" value="${escape(email)}" autocomplete="email" autofocus required></label>
			<label>Password <input type="password" name="password" autocomplete="current-password" required></label>
			<button>Sign in</button>
			<p class="muted">Have an invite? <a href="/join">Create your account</a> · <a href="/forgot">Forgot password</a> · <a href="/">Join the waitlist</a></p>
		</form>`,
	);
}

// ---------------------------------------------------------------- /join (invite-only sign-up)

export async function handleJoin(request: Request, ctx: ExecutionContext): Promise<Response> {
	const url = new URL(request.url);
	if (await currentUser(request)) return redirect("/ui");
	const codeFromUrl = url.searchParams.get("code") ?? "";

	if (request.method === "POST") {
		if (!sameOrigin(request)) return new Response("Bad origin", { status: 403 });
		const form = await request.formData();
		const code = String(form.get("code") ?? "").trim();
		const email = normalizeEmail(form.get("email"));
		const name = String(form.get("name") ?? "").trim();
		const password = String(form.get("password") ?? "");
		const show = (error: string, status = 400) => htmlResponse(joinPage({ code, email, name, error }), status);

		if (!isEmail(email)) return show("Please enter a valid email address.");
		if (password.length < MIN_PASSWORD_LENGTH) return show(`Use at least ${MIN_PASSWORD_LENGTH} characters for the password.`);
		if (await getUserByEmail(email)) return show("There is already an account for this email. Sign in instead.");

		// The configured admin can bootstrap without an invite, once. Everyone else needs a valid invite.
		const bootstrap = isConfiguredAdmin(email) && !(await adminUserId());
		const invite = code ? await getInviteByCode(code) : null;
		if (!bootstrap) {
			if (!code) return show("An invite code is required. Join the waitlist on the start page to get one.");
			const problem = inviteProblem(invite, email);
			if (problem) {
				await slowDown();
				return show(problem);
			}
			if (!(await consumeInvite(invite!.id))) return show("This invite has already been used.");
		}
		const user = await createUser({ email, name, password, inviteId: invite?.id }, ctx);
		return redirect("/ui?welcome=1", { "Set-Cookie": await sessionCookie(user.id) });
	}

	const invite = codeFromUrl ? await getInviteByCode(codeFromUrl) : null;
	const problem = codeFromUrl ? inviteProblem(invite) : null;
	return htmlResponse(joinPage({ code: codeFromUrl, email: invite?.email ?? "", error: problem ?? undefined }), problem ? 400 : 200);
}

function joinPage(v: { code: string; email?: string; name?: string; error?: string }) {
	const hasCode = !!v.code;
	return layout(
		"Create account",
		`<form method="post" action="/join" class="card narrow">
			<h1>Create your account</h1>
			<p class="muted">Context Layer is invite-only right now. Your data stays yours: export or delete it any time.</p>
			${v.error ? `<p class="error">${escape(v.error)}</p>` : ""}
			${hasCode ? `<input type="hidden" name="code" value="${escape(v.code)}">` : `<label>Invite code <input name="code" placeholder="From your invite link" required autofocus></label>`}
			<label>Email <input type="email" name="email" value="${escape(v.email)}" autocomplete="email" required ${hasCode ? "autofocus" : ""}></label>
			<label>Name <input name="name" value="${escape(v.name)}" autocomplete="name" placeholder="How agents should address you"></label>
			<label>Password <input type="password" name="password" autocomplete="new-password" minlength="${MIN_PASSWORD_LENGTH}" required></label>
			<button>Create account</button>
			<p class="muted">Already have an account? <a href="/login">Sign in</a></p>
		</form>`,
	);
}

// ---------------------------------------------------------------- password reset

export async function handleForgot(request: Request): Promise<Response> {
	const page = (msg?: string, isError = false) =>
		htmlResponse(
			layout(
				"Reset password",
				`<form method="post" action="/forgot" class="card narrow"><h1>Reset your password</h1>
				${msg ? `<p class="${isError ? "error" : "ok"}">${escape(msg)}</p>` : ""}
				${
					emailConfigured()
						? `<p class="muted">Enter your email and we will send you a reset link.</p><label>Email <input type="email" name="email" required autofocus></label><button>Send reset link</button>`
						: `<p>Self-service reset is not enabled on this instance. Ask the person who invited you for a reset link; they can create one in the admin panel.</p>`
				}
				<p class="muted"><a href="/login">Back to sign in</a></p></form>`,
			),
		);
	if (request.method !== "POST" || !emailConfigured()) return page();
	if (!sameOrigin(request)) return new Response("Bad origin", { status: 403 });
	const form = await request.formData();
	const user = await getUserByEmail(normalizeEmail(form.get("email")));
	if (user && user.status === "active") {
		const link = await createPasswordReset(user.id, 2);
		try {
			await sendEmail(user.email, "Reset your Context Layer password", `Hi ${user.name || ""},\n\nReset your password here (valid for 2 hours):\n${link}\n\nIf you did not ask for this, ignore this email.`);
		} catch (err) {
			console.error("reset email failed", String(err));
		}
	}
	await slowDown();
	return page("If an account exists for that email, a reset link is on its way.");
}

export async function handleReset(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const token = url.searchParams.get("token") ?? "";
	const user = await userForResetToken(token);
	const page = (error?: string, status = 200) =>
		htmlResponse(
			layout(
				"Set new password",
				user
					? `<form method="post" action="/reset?token=${encodeURIComponent(token)}" class="card narrow"><h1>Set a new password</h1>
					<p class="muted">for ${escape(user.email)}</p>${error ? `<p class="error">${escape(error)}</p>` : ""}
					<label>New password <input type="password" name="password" autocomplete="new-password" minlength="${MIN_PASSWORD_LENGTH}" required autofocus></label><button>Save password</button></form>`
					: `<div class="card narrow"><h1>Link not valid</h1><p>This reset link is invalid or has expired. <a href="/forgot">Request a new one</a>.</p></div>`,
			),
			status,
		);
	if (!user) return page(undefined, 400);
	if (request.method !== "POST") return page();
	if (!sameOrigin(request)) return new Response("Bad origin", { status: 403 });
	const password = String((await request.formData()).get("password") ?? "");
	if (password.length < MIN_PASSWORD_LENGTH) return page(`Use at least ${MIN_PASSWORD_LENGTH} characters.`, 400);
	await setPassword(user.id, password);
	await new Store(env as Env, user.id, "web-ui").log("password_reset");
	return redirect("/ui", { "Set-Cookie": await sessionCookie(user.id) });
}

// ---------------------------------------------------------------- /authorize (consent)

function consentPage(d: ConsentDescription, handle: string, user: User) {
	const origin = d.clientDomain
		? `Published by <strong>${escape(d.clientDomain)}</strong>.`
		: "This app registered itself; its name is not verified.";
	const scopeLabel: Record<string, string> = {
		"mcp:read": "Read your memories, documents and skills",
		"mcp:write": "Save and change memories, documents and skills",
		offline_access: "Stay connected (refresh tokens)",
	};
	const scopes = d.scope
		.map((s) => `<label class="check"><input type="checkbox" name="scope" value="${escape(s)}" checked> ${escape(scopeLabel[s] ?? s)}</label>`)
		.join("");
	return layout(
		"Authorize",
		`<form method="post" class="card narrow">
			<h1>Connect ${escape(d.clientName)}?</h1>
			<p>${origin} Access to the context of <strong>${escape(user.email)}</strong> will be sent to <strong>${escape(d.redirectHost)}</strong>.</p>
			${d.redirectIsLoopback ? '<p class="warn">This sends access to an app on your computer. Continue only if you just started connecting from it.</p>' : ""}
			<input type="hidden" name="handle" value="${escape(handle)}">
			${scopes}
			<p class="row"><button name="decision" value="approve">Allow</button> <button name="decision" value="deny" class="secondary">Deny</button></p>
			<p class="muted">Not you? <a href="/logout">Sign out</a> and sign in with the right account.</p>
		</form>`,
	);
}

export async function handleAuthorize(request: Request): Promise<Response> {
	const e = env as Env;
	try {
		const user = await currentUser(request);
		if (!user) {
			const url = new URL(request.url);
			return redirect(`${url.origin}/login?next=${encodeURIComponent(url.pathname + url.search)}`);
		}
		const oauth = authorizationServer.getOAuthApi(e);
		const remember = { secret: e.CONSENT_SECRET, subject: user.id };
		const props = (details: ConsentDescription, scope: string[]): AuthProps => ({ userId: user.id, client: details.clientDomain ?? details.clientName, scopes: scope });

		if (request.method === "POST") {
			if (!sameOrigin(request)) return new Response("Bad origin", { status: 403 });
			const form = await request.formData();
			const handle = String(form.get("handle"));
			if (form.get("decision") !== "approve") {
				const denied = await oauth.denyConsent(request, handle);
				denied.headers.set("Location", denied.redirectTo);
				return new Response(null, { status: 302, headers: denied.headers });
			}
			const approved = await oauth.approveConsent(request, handle, { scope: form.getAll("scope").map(String), remember });
			const details = await oauth.describeConsent(approved.request);
			const { redirectTo } = await oauth.completeAuthorization({
				request: approved.request,
				userId: user.id,
				metadata: { client: details.clientName },
				scope: approved.request.scope,
				props: props(details, approved.request.scope),
			});
			await new Store(e, user.id, "web-ui").log("authorize_client", details.clientId, details.clientName);
			approved.headers.set("Location", redirectTo);
			return new Response(null, { status: 302, headers: approved.headers });
		}

		const authRequest = await oauth.parseAuthRequest(request);
		const details = await oauth.describeConsent(authRequest);
		if (await oauth.isConsentRemembered(request, authRequest, remember)) {
			const { redirectTo } = await oauth.completeAuthorization({
				request: authRequest,
				userId: user.id,
				metadata: { client: details.clientName },
				scope: authRequest.scope,
				props: props(details, authRequest.scope),
			});
			return redirect(redirectTo);
		}
		const consent = await oauth.beginConsent(authRequest);
		return htmlResponse(consentPage(details, consent.handle, user), 200, consent.headers);
	} catch (error) {
		if (error instanceof AuthorizationError && error.redirectTo) return redirect(error.redirectTo);
		if (error instanceof AuthorizationError || error instanceof CimdFetchError) {
			const message = error instanceof AuthorizationError ? error.description : "This app could not be verified.";
			return htmlResponse(layout("Error", `<div class="card narrow"><h1>Could not connect</h1><p>${escape(message)}</p></div>`), 400);
		}
		throw error;
	}
}
