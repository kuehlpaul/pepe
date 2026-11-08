// Admin panel: waitlist → invites → users. Only users with role 'admin' get here (checked in index.ts).
import {
	createInvite,
	createPasswordReset,
	deleteWaitlistEntry,
	emailConfigured,
	getInvite,
	getUser,
	inviteLink,
	listInvites,
	listUsers,
	listWaitlist,
	publicUrl,
	revokeInvite,
	sendEmail,
	setWaitlistStatus,
	updateUser,
	type Invite,
	type User,
} from "./accounts";
import { deleteAccount } from "./auth";
import { escape, htmlResponse, layout, redirect, sameOrigin, sh } from "./html";
import { Store } from "./store";

const date = (iso: string | null | undefined) => (iso ? escape(iso.slice(0, 16).replace("T", " ")) : "—");
const hidden = (k: string, v: string) => `<input type="hidden" name="${k}" value="${escape(v)}">`;
const act = (action: string, id: string, label: string, cls = "secondary small", extra = "") =>
	`<form method="post" class="inline">${hidden("action", action)}${hidden("id", id)}${extra}<button class="${cls}">${label}</button></form>`;

const inviteState = (i: Invite) =>
	i.revoked_at ? '<span class="chip">revoked</span>' : i.expires_at && i.expires_at < new Date().toISOString() ? '<span class="chip warn">expired</span>' : i.uses >= i.max_uses ? '<span class="chip ok">used</span>' : '<span class="chip ok">open</span>';

export async function handleAdmin(request: Request, env: Env, admin: User): Promise<Response> {
	const url = new URL(request.url);
	const store = new Store(env, admin.id, "web-ui");
	const back = (params: Record<string, string> = {}) => redirect(`/admin${Object.keys(params).length ? "?" + new URLSearchParams(params) : ""}`);

	if (request.method === "POST") {
		if (!sameOrigin(request)) return new Response("Bad origin", { status: 403 });
		const form = await request.formData();
		const f = (k: string) => String(form.get(k) ?? "").trim();
		const action = f("action");
		const id = f("id");

		// ----- waitlist
		if (action === "invite_waitlist") {
			const entry = (await listWaitlist()).find((w) => w.id === id);
			if (!entry) return back({ msg: "Waitlist entry not found." });
			const invite = await createInvite({ createdBy: admin.id, email: entry.email, note: `waitlist: ${entry.name ?? ""}`.trim(), expiresInDays: 14 });
			await store.log("admin_invite", invite.id, entry.email);
			return back({ created: invite.id });
		}
		if (action === "decline_waitlist") (await setWaitlistStatus(id, "declined"), await store.log("admin_decline_waitlist", id));
		if (action === "reopen_waitlist") await setWaitlistStatus(id, "pending");
		if (action === "delete_waitlist") (await deleteWaitlistEntry(id), await store.log("admin_delete_waitlist", id));

		// ----- invites
		if (action === "create_invite") {
			const invite = await createInvite({
				createdBy: admin.id,
				email: f("email") || undefined,
				note: f("note") || undefined,
				maxUses: Number(f("max_uses") || 1),
				expiresInDays: Number(f("days") || 0) || undefined,
			});
			await store.log("admin_invite", invite.id, invite.email ?? `${invite.max_uses} uses`);
			return back({ created: invite.id });
		}
		if (action === "revoke_invite") (await revokeInvite(id), await store.log("admin_revoke_invite", id));
		if (action === "email_invite") {
			const invite = await getInvite(id);
			if (!invite?.email) return back({ msg: "This invite is not bound to an email address." });
			try {
				await sendEmail(
					invite.email,
					"Your invite to Context Layer",
					`Hi,\n\nYou're in. Create your Context Layer account with this personal link${invite.expires_at ? ` (valid until ${invite.expires_at.slice(0, 10)})` : ""}:\n${inviteLink(invite)}\n\nAfter signing up, open the setup guide and share it with your agent: ${publicUrl()}/setup\n\nSee you inside.`,
				);
				await store.log("admin_email_invite", id, invite.email);
				return back({ msg: `Invite emailed to ${invite.email}.` });
			} catch (err) {
				return back({ msg: `Email failed: ${String(err)}` });
			}
		}

		// ----- users
		if (action.startsWith("user_")) {
			const target = await getUser(id);
			if (!target) return back({ msg: "User not found." });
			if (target.id === admin.id && action !== "user_reset_link") return back({ msg: "You cannot change your own account here. Use Settings." });
			if (action === "user_disable") (await updateUser(id, { status: "disabled" }), await store.log("admin_disable_user", id, target.email));
			if (action === "user_enable") (await updateUser(id, { status: "active" }), await store.log("admin_enable_user", id, target.email));
			if (action === "user_make_admin") (await updateUser(id, { role: "admin" }), await store.log("admin_grant_admin", id, target.email));
			if (action === "user_remove_admin") (await updateUser(id, { role: "member" }), await store.log("admin_revoke_admin", id, target.email));
			if (action === "user_reset_link") {
				const link = await createPasswordReset(id, 24);
				await store.log("admin_reset_link", id, target.email);
				return back({ reset: link, msg: `Password reset link for ${target.email} (valid 24h). Send it to them yourself.` });
			}
			if (action === "user_delete") {
				if (f("confirm") !== target.email) return back({ msg: `To delete ${target.email}, type their email into the confirmation field.` });
				await deleteAccount(id);
				await store.log("admin_delete_user", id, target.email);
				return back({ msg: `Deleted ${target.email} and all their data.` });
			}
		}
		return back();
	}

	// ---------------------------------------------------------------- GET
	const [waitlist, invites, users] = await Promise.all([listWaitlist(), listInvites(), listUsers()]);
	const created = url.searchParams.get("created") ? invites.find((i) => i.id === url.searchParams.get("created")) : null;
	const msg = url.searchParams.get("msg");
	const reset = url.searchParams.get("reset");
	const pending = waitlist.filter((w) => w.status === "pending").length;
	const openInvites = invites.filter((i) => !i.revoked_at && i.uses < i.max_uses && (!i.expires_at || i.expires_at > new Date().toISOString())).length;

	const flash = [
		msg ? `<p class="${/failed|not |cannot/i.test(msg) ? "warn" : "ok"}">${escape(msg)}</p>` : "",
		reset ? `<p class="warn">Reset link: <span class="mono">${escape(reset)}</span></p>` : "",
		created
			? `<div class="card"><h2>Invite created${created.email ? ` for ${escape(created.email)}` : ""}</h2>
			<p>Send this link to the person. ${created.expires_at ? `Valid until ${date(created.expires_at)}.` : "Does not expire."} ${created.max_uses > 1 ? `${created.max_uses} uses.` : "Single use."}</p>
			<p class="row"><input class="mono grow" readonly value="${escape(inviteLink(created))}" onclick="this.select()">
			${created.email && emailConfigured() ? act("email_invite", created.id, "Send by email", "") : ""}</p></div>`
			: "",
	].join("");

	const waitlistRows = waitlist
		.map(
			(w) => `<tr><td>${escape(w.email)}${w.name ? `<div class="muted">${escape(w.name)}</div>` : ""}</td>
			<td class="muted">${escape(w.reason ?? "")}</td>
			<td><span class="chip ${w.status === "joined" ? "ok" : w.status === "declined" ? "" : w.status === "invited" ? "warn" : ""}">${w.status}</span></td>
			<td class="muted">${date(w.created_at)}</td>
			<td class="row">${w.status === "pending" ? act("invite_waitlist", w.id, "Invite", "small") + act("decline_waitlist", w.id, "Decline") : ""}${
				w.status === "declined" ? act("reopen_waitlist", w.id, "Reopen") : ""
			}${w.status !== "joined" ? act("delete_waitlist", w.id, "Delete", "danger small") : ""}</td></tr>`,
		)
		.join("");

	const inviteRows = invites
		.map(
			(i) => `<tr><td>${inviteState(i)}</td><td>${i.email ? escape(i.email) : '<span class="muted">anyone</span>'}${i.note ? `<div class="muted">${escape(i.note)}</div>` : ""}</td>
			<td>${i.uses}/${i.max_uses}</td><td class="muted">${date(i.created_at)}</td><td class="muted">${i.expires_at ? date(i.expires_at) : "never"}</td>
			<td class="row">${
				!i.revoked_at && i.uses < i.max_uses
					? `<input class="mono" readonly value="${escape(inviteLink(i))}" onclick="this.select()" style="max-width:260px">` +
						(i.email && emailConfigured() ? act("email_invite", i.id, "Email") : "") +
						act("revoke_invite", i.id, "Revoke", "danger small")
					: ""
			}</td></tr>`,
		)
		.join("");

	const userRows = users
		.map((u) => {
			const self = u.id === admin.id;
			return `<tr><td>${escape(u.email)}${u.name ? `<div class="muted">${escape(u.name)}</div>` : ""}${self ? '<div class="muted">(you)</div>' : ""}</td>
			<td><span class="chip ${u.role === "admin" ? "warn" : ""}">${u.role}</span> <span class="chip ${u.status === "active" ? "ok" : ""}">${u.status}</span></td>
			<td class="muted">${u.memories} mem · ${u.documents} docs</td>
			<td class="muted">joined ${date(u.created_at)}<br>login ${date(u.last_login_at)}<br>agent ${date(u.last_agent_activity)}</td>
			<td>${
				self
					? act("user_reset_link", u.id, "Reset link")
					: `<div class="row">${u.status === "active" ? act("user_disable", u.id, "Disable") : act("user_enable", u.id, "Enable", "small")}${
							u.role === "admin" ? act("user_remove_admin", u.id, "Remove admin") : act("user_make_admin", u.id, "Make admin")
						}${act("user_reset_link", u.id, "Reset link")}</div>
						<details><summary>Delete account…</summary>
						<form method="post" class="row">${hidden("action", "user_delete")}${hidden("id", u.id)}<input name="confirm" placeholder="type ${escape(u.email)}" class="grow"><button class="danger small">Delete user and all data</button></form></details>`
			}</td></tr>`;
		})
		.join("");

	return htmlResponse(
		layout(
			"Admin",
			`${sh("Admin", "", "h1")}
			<div class="stats"><div class="stat"><b>${users.length}</b><span>accounts</span></div><div class="stat"><b>${pending}</b><span>waiting</span></div><div class="stat"><b>${openInvites}</b><span>open invites</span></div><div class="stat"><b>${users.filter((u) => u.last_agent_activity && u.last_agent_activity > new Date(Date.now() - 7 * 86400_000).toISOString()).length}</b><span>active with agents, 7d</span></div></div>
			${flash}

			<div class="card"><h2>Waitlist</h2><p class="muted">Sign-ups from the start page. "Invite" creates a single-use link bound to their email (14 days)${emailConfigured() ? " which you can also send by email" : ""}.</p>
			<div class="table-wrap"><table><tr><th>Who</th><th>Why</th><th>Status</th><th>Signed up</th><th></th></tr>${waitlistRows || '<tr><td colspan="5" class="muted">Nobody waiting.</td></tr>'}</table></div></div>

			<div class="card"><h2>Invites</h2>
			<form method="post" class="row">${hidden("action", "create_invite")}<input name="email" type="email" placeholder="Bind to email (optional)" class="grow"><input name="max_uses" type="number" min="1" value="1" title="Uses" style="width:72px"><input name="days" type="number" min="0" placeholder="Days" title="Expires in days (empty = never)" style="width:84px"><input name="note" placeholder="Note" style="width:160px"><button>Create invite</button></form>
			<div class="table-wrap"><table><tr><th></th><th>For</th><th>Uses</th><th>Created</th><th>Expires</th><th>Link</th></tr>${inviteRows || '<tr><td colspan="6" class="muted">No invites yet.</td></tr>'}</table></div></div>

			<div class="card"><h2>Accounts</h2><p class="muted">Disabling an account signs it out and blocks its tokens and OAuth grants immediately. Deleting removes all of its data and vectors.</p>
			<div class="table-wrap"><table><tr><th>Who</th><th>Role · status</th><th>Data</th><th>Dates</th><th></th></tr>${userRows}</table></div></div>

			<p class="muted">Email sending: ${emailConfigured() ? "configured" : "not configured. Set RESEND_API_KEY (secret) and EMAIL_FROM (var) to send invites and resets from here. Until then, copy links and send them yourself."}</p>`,
			admin,
			"/admin",
		),
	);
}
