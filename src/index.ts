import { currentUser } from "./accounts";
import { handleAdmin } from "./admin";
import { authorizationServer, handleAuthorize, handleForgot, handleJoin, handleLogin, handleLogout, handleReset, resourceServer } from "./auth";
import { runDaily } from "./daily";
import { handleWaitlist, landingHtml } from "./landing";
import { SETUP_VERSION, setupMarkdown } from "./setup";
import { setupPageHtml } from "./setup-page";
import { handleUi } from "./ui";

const setupHeaders = (type: string) => ({
	"Content-Type": type,
	"Cache-Control": "public, max-age=300",
	"X-Setup-Version": SETUP_VERSION,
});

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		const { pathname } = url;
		const base = env.PUBLIC_URL.replace(/\/$/, "");
		const html = { "Content-Type": "text/html; charset=utf-8" };
		// Optional marketing host (LANDING_HOST): serves only the landing page and the waitlist. The app, docs, OAuth
		// and MCP live on PUBLIC_URL; the workers.dev hostname is an alias and redirects there.
		const landingHost = env.LANDING_HOST || "";
		const landingBase = landingHost ? `https://${landingHost}` : base;
		const moved = (to: string) => Response.redirect(to, request.method === "GET" || request.method === "HEAD" ? 301 : 308);
		if (landingHost && (url.hostname === landingHost || url.hostname === `www.${landingHost}`)) {
			if (url.hostname !== landingHost) return moved(`${landingBase}${pathname}${url.search}`);
			if (pathname === "/") return new Response(landingHtml(base, { joined: url.searchParams.has("joined") }), { headers: html });
			if (pathname === "/waitlist") return handleWaitlist(request, base, landingBase);
			return moved(`${base}${pathname}${url.search}`);
		}
		// The workers.dev URL is an alias of PUBLIC_URL. (Only that one: `wrangler dev` rewrites the request host to the
		// first custom domain, so comparing against PUBLIC_URL would redirect every local request.)
		if (url.hostname.endsWith(".workers.dev")) return moved(`${base}${pathname}${url.search}`);

		// MCP endpoint (+ RFC 9728 protected resource metadata)
		if (pathname === "/mcp" || pathname.startsWith("/mcp/") || pathname.startsWith("/.well-known/oauth-protected-resource")) {
			return resourceServer.fetch(request, env, ctx);
		}

		// OAuth: our consent page, everything else is protocol-owned by the library
		if (pathname === "/authorize") return handleAuthorize(request);
		if (pathname.startsWith("/oauth/") || pathname.startsWith("/.well-known/")) {
			return authorizationServer.fetch(request, env, ctx);
		}

		// Public setup guide (no personal data). HTML docs page like Notion; .md for agents.
		if (pathname === "/setup" || pathname === "/setup.md") {
			const accept = request.headers.get("Accept") ?? "";
			const wantMarkdown =
				pathname === "/setup.md" ||
				accept.includes("text/markdown") ||
				(!accept.includes("text/html") && /curl|wget|python-requests|Go-http-client|axios/i.test(request.headers.get("User-Agent") ?? ""));
			if (wantMarkdown) {
				return new Response(setupMarkdown(base), { headers: setupHeaders("text/markdown; charset=utf-8") });
			}
			return new Response(setupPageHtml(base), { headers: setupHeaders("text/html; charset=utf-8") });
		}

		// Public: start page + waitlist, sign-up by invite, sign-in, password reset
		if (pathname === "/") {
			if (await currentUser(request)) return Response.redirect(`${base}/ui`, 302);
			if (landingHost) return Response.redirect(`${landingBase}/${url.search}`, 302);
			return new Response(landingHtml(base, { joined: url.searchParams.has("joined") }), { headers: html });
		}
		if (pathname === "/waitlist") return handleWaitlist(request, base, landingBase);
		if (pathname === "/join") return handleJoin(request, ctx);
		if (pathname === "/login") return handleLogin(request);
		if (pathname === "/logout") return handleLogout();
		if (pathname === "/forgot") return handleForgot(request);
		if (pathname === "/reset") return handleReset(request);

		// Signed-in area
		if (pathname === "/ui" || pathname.startsWith("/ui/") || pathname === "/admin" || pathname.startsWith("/admin/")) {
			const user = await currentUser(request);
			if (!user) return Response.redirect(`${base}/login?next=${encodeURIComponent(pathname + url.search)}`, 302);
			if (pathname.startsWith("/admin")) {
				if (user.role !== "admin") return new Response("Not found", { status: 404 }); // admins only; don't advertise the panel
				return handleAdmin(request, env, user);
			}
			return handleUi(request, env, user);
		}

		return new Response("Not found", { status: 404 });
	},

	async scheduled(_controller, env, ctx) {
		ctx.waitUntil(runDaily(env));
	},
} satisfies ExportedHandler<Env>;
