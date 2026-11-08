// Server-rendered web app so a user can see what agents store about them, and delete it. Content is written by
// agents over MCP, never edited by hand here: the UI is a window plus an emergency exit, not an editor.
import { MIN_PASSWORD_LENGTH, checkPassword, clearSessionCookie, createApiToken, getUser, listApiTokens, revokeApiToken, sessionCookie, setPassword, updateUser, type User } from "./accounts";
import { deleteAccount, listGrantsFor, revokeGrantFor } from "./auth";
import { escape, eyebrow, htmlResponse, layout, redirect, sameOrigin, sh } from "./html";
import { Store, type Memory } from "./store";

const tags = (json: string) => {
	try {
		return (JSON.parse(json) as string[]).map((t) => `<span class="chip">${escape(t)}</span>`).join("");
	} catch {
		return "";
	}
};
const date = (iso: string | null | undefined) => (iso ? escape(iso.slice(0, 16).replace("T", " ")) : "—");
const unix = (s: number) => date(new Date(s * 1000).toISOString());
const empty = (text: string) => `<p class="muted">${text}</p>`;

/** One destructive action per item, as a small inline form. */
const dangerForm = (action: string, label: string, note?: string) =>
	`<form method="post" action="${action}" class="card danger-zone">${note ? `<p class="muted">${note}</p>` : ""}<button class="danger small">${label}</button></form>`;

function memoryItem(m: Memory) {
	return `<div class="item"><a href="/ui/memories/${m.id}"><strong>${escape(m.topic)}</strong></a>
		<span class="chip">${escape(m.type)}</span>${m.confidence !== "confirmed" ? `<span class="chip">${escape(m.confidence)}</span>` : ""}${m.status !== "active" ? `<span class="chip">${escape(m.status)}</span>` : ""}${tags(m.tags)}
		<pre>${escape(m.content)}</pre>
		<div class="meta">${date(m.updated_at)} · by ${escape(m.created_by ?? "?")}${m.source ? ` · source: ${escape(m.source)}` : ""}</div></div>`;
}

const KINDS = ["memories", "documents", "skills", "lessons", "rules"] as const;
type Kind = (typeof KINDS)[number];

export async function handleUi(request: Request, env: Env, user: User): Promise<Response> {
	const url = new URL(request.url);
	const path = url.pathname.replace(/\/$/, "") || "/ui";
	const store = new Store(env, user.id, "web-ui");
	const page = (title: string, body: string, status = 200) => htmlResponse(layout(title, body, user, path), status);
	const notFound = (what: string) => page("Not found", sh(`${what} not found`, "", "h1"), 404);
	const post = request.method === "POST";
	if (post && !sameOrigin(request)) return new Response("Bad origin", { status: 403 });
	// Body-less POSTs (e.g. a bare "forget" button) have no Content-Type; treat them as an empty form.
	const isForm = /multipart\/form-data|application\/x-www-form-urlencoded/.test(request.headers.get("Content-Type") ?? "");
	const form = post ? (isForm ? await request.formData() : new FormData()) : null;
	const f = (k: string) => (form?.get(k) == null ? undefined : String(form.get(k)));
	const base = env.PUBLIC_URL.replace(/\/$/, "");
	const setupPrompt = `<input class="mono" readonly value="Set up Pepe by following ${escape(base)}/setup" onclick="this.select()">`;

	// ---------- overview ----------
	if (path === "/ui") {
		const [about, activity, counts, grants, tokens] = await Promise.all([
			store.getSetting("about"),
			store.recentActivity(10),
			store.counts(),
			listGrantsFor(user.id),
			listApiTokens(user.id),
		]);
		const nothingStored = counts.memories + counts.documents + counts.lessons + counts.skills === 0;
		const connections = [
			...grants.map((g) => ({ name: (g.metadata as { client?: string } | undefined)?.client ?? g.clientId, how: "OAuth", since: unix(g.createdAt) })),
			...tokens.map((t) => ({ name: t.name, how: "Token", since: date(t.created_at) })),
		];
		const welcome =
			url.searchParams.has("welcome") || nothingStored
				? `<div class="card"><h2>${url.searchParams.has("welcome") ? `Welcome${user.name ? `, ${escape(user.name)}` : ""}` : "Get started"}</h2>
				<p>Nothing is stored yet. Open a chat with any agent (Claude, ChatGPT, Cursor, Claude Code …) and paste this:</p>
				<p>${setupPrompt}</p>
				<p class="muted">The agent connects over MCP (you approve it here once), installs custom instructions so future chats check your memory first, and offers to import what it already knows about you.</p></div>`
				: "";
		return page(
			"Overview",
			`${welcome}
			<div class="stats"><a class="stat" href="/ui/memory?kind=memories"><b>${counts.memories}</b><span>memories</span></a><a class="stat" href="/ui/memory?kind=documents"><b>${counts.documents}</b><span>documents</span></a><a class="stat" href="/ui/memory?kind=lessons"><b>${counts.lessons}</b><span>lessons</span></a><a class="stat" href="/ui/memory?kind=skills"><b>${counts.skills}</b><span>skills</span></a></div>
			<div class="grid2"><div>${sh("Connected agents", `<a href="/ui/settings">Manage</a>`)}
			${connections.length ? `<table>${connections.map((c) => `<tr><td>${escape(c.name)}</td><td class="muted">${c.how}</td><td class="muted nowrap">${c.since}</td></tr>`).join("")}</table>` : empty("No agent connected yet. Paste the setup prompt from Settings into any agent chat.")}
			${sh("About me")}${about ? `<pre>${escape(about)}</pre>` : empty("Not written yet. Your agent fills this in during setup.")}</div>
			<div>${sh("Latest activity", `<a href="/ui/activity">All</a>`)}${activity.length ? activityTable(activity) : empty("No writes yet.")}</div></div>`,
		);
	}

	// ---------- memory: everything stored, in one place ----------
	if (path === "/ui/memory") {
		if (post) {
			// The only write here: dropping a lesson. Everything else is created and changed by agents.
			if (f("action") === "delete_lesson" && f("id")) await store.deleteLesson(f("id")!);
			return redirect("/ui/memory?kind=lessons");
		}
		const q = url.searchParams.get("q")?.trim() ?? "";
		const kind = (KINDS as readonly string[]).includes(url.searchParams.get("kind") ?? "") ? (url.searchParams.get("kind") as Kind) : "memories";
		const tabs = `<nav class="tabs" aria-label="Kind">${KINDS.map((k) => `<a href="/ui/memory?kind=${k}"${k === kind && !q ? ' class="active"' : ""}>${k}</a>`).join("")}</nav>`;
		const head = `${sh("Memory", "", "h1")}<p class="muted">Everything agents have stored about you. They write it; here you can read it and remove what you don't want kept.</p>${searchBox(q)}${tabs}`;

		if (q) {
			const hits = await store.search(q, { limit: 30, includeInactive: true });
			const rows = hits
				.map((h) => {
					const href = { memory: "/ui/memories/", document: "/ui/documents/", skill: "/ui/skills/", lesson: "/ui/memory?kind=lessons#" }[h.kind] + h.id;
					return `<div class="item"><span class="chip">${h.kind}</span><a href="${href}"><strong>${escape(h.title)}</strong></a><pre class="muted">${escape(h.snippet)}</pre></div>`;
				})
				.join("");
			return page("Search", `${head}<div class="list">${rows || empty("No results.")}</div>`);
		}

		let body = "";
		if (kind === "memories") {
			const status = url.searchParams.get("status") ?? "active";
			const list = await store.listMemories({ status: status === "all" ? undefined : status, limit: 300 });
			const filter = `<p class="muted label">${["active", "superseded", "archived", "all"].map((s) => (s === status ? `<b>${s}</b>` : `<a href="/ui/memory?kind=memories&status=${s}">${s}</a>`)).join(" · ")} · ${list.length} shown</p>`;
			body = `${filter}<div class="list">${list.map(memoryItem).join("") || empty("None yet.")}</div>`;
		}
		if (kind === "documents") {
			const docs = await store.listDocuments(300);
			body = `<div class="list">${docs.map((d) => `<div class="item"><a href="/ui/documents/${d.id}"><strong>${escape(d.title)}</strong></a> <span class="chip">${escape(d.kind)}</span>${d.project ? `<span class="chip">${escape(d.project)}</span>` : ""}${tags(d.tags)}<div class="meta">${date(d.updated_at)} · by ${escape(d.updated_by ?? d.created_by ?? "?")}</div></div>`).join("") || empty("None yet.")}</div>`;
		}
		if (kind === "skills") {
			const skills = await store.listSkills();
			body = `<div class="list">${skills.map((s) => `<div class="item"><a href="/ui/skills/${s.id}"><strong>${escape(s.name)}</strong></a> ${s.enabled ? "" : '<span class="chip">disabled</span>'}<div class="muted">${escape(s.description)}</div></div>`).join("") || empty("None yet.")}</div>`;
		}
		if (kind === "lessons") {
			const lessons = await store.listLessons("all");
			body = `<p class="muted">Corrections you gave an agent, phrased as guidance. Every agent receives the active ones when it connects.</p>
			<div class="list">${
				lessons
					.map(
						(l) => `<div class="item" id="${l.id}"><strong>${escape(l.lesson)}</strong>${l.status === "archived" ? ' <span class="chip">archived</span>' : ""}
						${l.context ? `<pre class="muted">${escape(l.context)}</pre>` : ""}
						<div class="row"><span class="meta grow">${date(l.created_at)} · by ${escape(l.created_by ?? "?")}</span>
						<form method="post" class="inline"><input type="hidden" name="action" value="delete_lesson"><input type="hidden" name="id" value="${l.id}"><button class="danger small">Delete</button></form></div></div>`,
					)
					.join("") || empty("No lessons yet.")
			}</div>`;
		}
		if (kind === "rules") {
			const [exclusions, guide] = await Promise.all([store.listExclusions(), store.getSetting("guide")]);
			body = `${sh("Exclusions")}<p class="muted">Things that must never be stored. Tell any agent "never store …" and it records the rule here.</p>
			${exclusions.length ? `<table>${exclusions.map((e) => `<tr><td>${escape(e.rule)}</td><td class="muted nowrap">${date(e.created_at)}</td></tr>`).join("")}</table>` : empty("None.")}
			${sh("Agent operating guide")}<p class="muted">Written by your agents during setup: where things live and how to work with you.</p>
			${guide ? `<pre>${escape(guide)}</pre>` : empty("Not written yet.")}`;
		}
		return page("Memory", `${head}${body}`);
	}

	// ---------- memory detail ----------
	const memMatch = path.match(/^\/ui\/memories\/(mem_[a-z0-9]+)(\/forget)?$/);
	if (memMatch) {
		const id = memMatch[1];
		const m = await store.getMemory(id);
		if (!m) return notFound("Memory");
		if (memMatch[2] && post) {
			await store.forgetMemory(id);
			return redirect("/ui/memory?kind=memories");
		}
		return page(
			m.topic,
			`${eyebrow("Memory")}<h1>${escape(m.topic)}</h1>
			<p><span class="chip">${escape(m.type)}</span><span class="chip">${escape(m.confidence)}</span>${m.status !== "active" ? `<span class="chip">${escape(m.status)}</span>` : ""}${tags(m.tags)}</p>
			<div class="card"><pre>${escape(m.content)}</pre></div>
			<table class="kv">
			<tr><th>Written by</th><td>${escape(m.created_by ?? "?")} on ${date(m.created_at)}</td></tr>
			<tr><th>Last updated</th><td>${date(m.updated_at)}</td></tr>
			${m.source ? `<tr><th>Source</th><td>${escape(m.source)}${m.source_date ? ` (${escape(m.source_date)})` : ""}</td></tr>` : ""}
			${m.superseded_by ? `<tr><th>Superseded by</th><td><a href="/ui/memories/${m.superseded_by}">${m.superseded_by}</a></td></tr>` : ""}
			<tr><th>Id</th><td><span class="mono">${m.id}</span></td></tr></table>
			${dangerForm(`/ui/memories/${m.id}/forget`, "Forget permanently", "Deletes this memory and its history, and blocks agents from saving the same content again. To change it instead, tell any agent.")}`,
		);
	}

	// ---------- documents ----------
	const revMatch = path.match(/^\/ui\/documents\/(doc_[a-z0-9]+)\/revisions\/(rev_[a-z0-9]+)$/);
	if (revMatch) {
		const [, docId, revId] = revMatch;
		const rev = await store.getRevision(revId);
		if (!rev || rev.document_id !== docId) return notFound("Version");
		return page(
			`${rev.title} (old version)`,
			`${eyebrow("Document · earlier version")}<h1>${escape(rev.title)}</h1>
			<p><a href="/ui/documents/${docId}">← Current version</a></p>
			<p class="muted">Written by <strong>${escape(rev.edited_by ?? "?")}</strong> on ${date(rev.edited_at)} · replaced by ${escape(rev.replaced_by ?? "?")} on ${date(rev.replaced_at)}</p>
			<div class="card"><pre>${escape(rev.content)}</pre></div>`,
		);
	}
	const docMatch = path.match(/^\/ui\/documents\/(doc_[a-z0-9]+)(\/delete)?$/);
	if (docMatch) {
		const id = docMatch[1];
		const d = await store.getDocument(id);
		if (!d) return notFound("Document");
		if (docMatch[2] && post) {
			await store.deleteDocument(id);
			return redirect("/ui/memory?kind=documents");
		}
		const revisions = await store.listRevisions(d.id);
		return page(
			d.title,
			`${eyebrow("Document")}<h1>${escape(d.title)}</h1>
			<p><span class="chip">${escape(d.kind)}</span>${d.project ? `<span class="chip">${escape(d.project)}</span>` : ""}${tags(d.tags)}</p>
			<p class="muted">Created ${date(d.created_at)} by ${escape(d.created_by ?? "?")} · last edit ${date(d.updated_at)} by ${escape(d.updated_by ?? d.created_by ?? "?")}${d.source ? ` · source: ${escape(d.source)}` : ""}</p>
			<div class="card"><pre>${escape(d.content)}</pre></div>
			${sh("Version history")}<table>
			<tr><td><strong>Current</strong></td><td>${escape(d.updated_by ?? d.created_by ?? "?")}</td><td class="muted">${date(d.updated_at)}</td><td></td></tr>
			${revisions.map((r) => `<tr><td>${escape(r.title)}</td><td>${escape(r.edited_by ?? "?")}</td><td class="muted">${date(r.edited_at)}</td><td><a href="/ui/documents/${d.id}/revisions/${r.id}">View</a></td></tr>`).join("")}
			</table>${revisions.length ? "" : empty("No earlier versions yet.")}
			${dangerForm(`/ui/documents/${d.id}/delete`, "Delete document and all versions")}`,
		);
	}

	// ---------- skills ----------
	const sklMatch = path.match(/^\/ui\/skills\/(skl_[a-z0-9]+)(\/delete)?$/);
	if (sklMatch) {
		const id = sklMatch[1];
		const s = await store.getSkill(id);
		if (!s) return notFound("Skill");
		if (sklMatch[2] && post) {
			await store.deleteSkill(id);
			return redirect("/ui/memory?kind=skills");
		}
		return page(
			s.name,
			`${eyebrow("Skill")}<h1>${escape(s.name)}</h1>
			<p>${s.enabled ? "" : '<span class="chip">disabled</span>'}${s.version ? `<span class="chip">v${escape(s.version)}</span>` : ""}</p>
			<p>${escape(s.description)}</p>
			<p class="muted">Updated ${date(s.updated_at)}${s.source ? ` · source: ${escape(s.source)}` : ""}</p>
			<div class="card"><pre>${escape(s.content)}</pre></div>
			${dangerForm(`/ui/skills/${s.id}/delete`, "Delete skill")}`,
		);
	}

	// ---------- export ----------
	if (path === "/ui/export") {
		await store.log("export");
		return new Response(JSON.stringify(await store.exportAll(), null, 2), {
			headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="pepe-export-${new Date().toISOString().slice(0, 10)}.json"` },
		});
	}

	// ---------- settings: connections and account ----------
	if (path === "/ui/settings") {
		let newToken: string | null = null;
		let notice: { text: string; error?: boolean } | null = null;
		if (post) {
			const action = f("action");
			if (action === "token" && f("name")) newToken = await createApiToken(user.id, f("name")!);
			if (action === "revoke_token" && f("id")) await revokeApiToken(user.id, f("id")!);
			if (action === "revoke_grant" && f("id")) {
				await revokeGrantFor(user.id, f("id")!);
				await store.log("revoke_grant", f("id"));
			}
			if (action === "profile") {
				await updateUser(user.id, { name: (f("name") ?? "").trim().slice(0, 120) });
				user = (await getUser(user.id)) ?? user;
			}
			if (action === "password") {
				const next = f("new_password") ?? "";
				if (!(await checkPassword(user.id, f("current_password") ?? ""))) notice = { text: "Current password is wrong.", error: true };
				else if (next.length < MIN_PASSWORD_LENGTH) notice = { text: `Use at least ${MIN_PASSWORD_LENGTH} characters.`, error: true };
				else {
					await setPassword(user.id, next); // invalidates every other session of this user
					await store.log("password_change");
					return redirect("/ui/settings?pw=1", { "Set-Cookie": await sessionCookie(user.id) });
				}
			}
			if (action === "delete_account") {
				if (!(await checkPassword(user.id, f("password") ?? ""))) notice = { text: "Wrong password. Account not deleted.", error: true };
				else if (f("confirm") !== "DELETE") notice = { text: "Type DELETE to confirm.", error: true };
				else {
					await deleteAccount(user.id);
					return redirect("/?deleted=1", { "Set-Cookie": clearSessionCookie() });
				}
			}
			if (!newToken && !notice) return redirect("/ui/settings");
		}
		const [tokens, grants] = await Promise.all([listApiTokens(user.id), listGrantsFor(user.id)]);
		if (url.searchParams.has("pw")) notice = { text: "Password changed. Other devices have been signed out." };
		const mcpUrl = `${base}/mcp`;
		return page(
			"Settings",
			`${sh("Settings", "", "h1")}
			${notice ? `<p class="${notice.error ? "warn" : "ok"}">${escape(notice.text)}</p>` : ""}
			<div class="card"><h2>Connect an agent</h2>
			<p>Paste this into any agent chat: ${setupPrompt}</p>
			<p>MCP server URL: <span class="mono">${escape(mcpUrl)}</span> · Claude Code: <span class="mono">claude mcp add --transport http context ${escape(mcpUrl)}</span></p>
			<p class="muted">OAuth clients add the MCP URL and approve access here with your login. Every connected agent can read and write. Clients without OAuth: create a personal token below and send it as <span class="mono">Authorization: Bearer pcl_…</span>.</p></div>

			<div class="card"><h2>Connected apps</h2><p class="muted">Agents you approved via OAuth. Revoking disconnects them until they sign in again.</p>
			<table>${
				grants
					.map(
						(g) =>
							`<tr><td>${escape((g.metadata as { client?: string } | undefined)?.client ?? g.clientId)}</td><td class="muted">${(g.scope ?? []).includes("mcp:write") ? "read + write" : "read only"}</td><td class="muted nowrap">${unix(g.createdAt)}</td><td><form method="post" class="inline"><input type="hidden" name="action" value="revoke_grant"><input type="hidden" name="id" value="${escape(g.id)}"><button class="secondary small">Revoke</button></form></td></tr>`,
					)
					.join("") || "<tr><td class=muted>No OAuth connections yet.</td></tr>"
			}</table></div>

			<div class="card"><h2>Personal API tokens</h2>
			${newToken ? `<p class="warn">Copy this token now, it won't be shown again:<br><span class="mono">${escape(newToken)}</span></p>` : ""}
			${tokens.length ? `<table><tr><th>Name</th><th>Prefix</th><th>Created</th><th>Last used</th><th></th></tr>${tokens.map((t) => `<tr><td>${escape(t.name)}</td><td><span class="mono">${escape(t.prefix)}…</span></td><td>${date(t.created_at)}</td><td>${date(t.last_used_at)}</td><td><form method="post" class="inline"><input type="hidden" name="action" value="revoke_token"><input type="hidden" name="id" value="${t.id}"><button class="secondary small">Revoke</button></form></td></tr>`).join("")}</table>` : empty("No tokens yet. Only needed for clients without OAuth.")}
			<form method="post" class="row"><input type="hidden" name="action" value="token"><input name="name" class="grow" placeholder="Token name, e.g. cursor-laptop" required><button>Create token</button></form></div>

			<div class="card"><h2>Account</h2>
			<form method="post"><input type="hidden" name="action" value="profile"><div class="grid2"><label>Email<input value="${escape(user.email)}" disabled></label><label>Name<input name="name" value="${escape(user.name)}"></label></div><button class="secondary">Save name</button></form>
			<form method="post"><input type="hidden" name="action" value="password"><div class="grid2"><label>Current password<input type="password" name="current_password" autocomplete="current-password" required></label><label>New password<input type="password" name="new_password" autocomplete="new-password" minlength="${MIN_PASSWORD_LENGTH}" required></label></div><button class="secondary">Change password</button></form></div>

			<div class="card"><h2>Your data</h2>
			<p>Everything you own as one JSON file: memories, documents with history, lessons, skills, settings, activity. <a class="btn secondary small" href="/ui/export">Download export</a></p>
			<details><summary>Delete account and all data…</summary>
			<form method="post"><input type="hidden" name="action" value="delete_account"><p class="muted">Removes your account, every memory, document, lesson, skill, token and OAuth connection, and the search index. There is no undo. Download an export first if you want to keep anything.</p>
			<div class="grid2"><label>Password<input type="password" name="password" autocomplete="current-password" required></label><label>Type DELETE<input name="confirm" required></label></div><button class="danger">Delete my account</button></form></details></div>`,
		);
	}

	if (path === "/ui/activity") {
		return page("Activity", `${sh("Activity", "", "h1")}<p class="muted">Every write by every agent, and by you.</p>${activityTable(await store.recentActivity(300))}`);
	}

	// Old editor URLs from before the read-only UI.
	if (/^\/ui\/(memories|documents|skills|lessons)$/.test(path)) return redirect(`/ui/memory?kind=${path.slice(4)}`);
	return notFound("Page");
}

function searchBox(q: string) {
	return `<form method="get" action="/ui/memory" class="row card"><input name="q" class="grow" placeholder="Search everything (semantic + keyword)…" value="${escape(q)}"><button>Search</button></form>`;
}

function activityTable(rows: Awaited<ReturnType<Store["recentActivity"]>>) {
	return `<table><tr><th>When</th><th>Who</th><th>What</th></tr>${rows
		.map((a) => `<tr><td class="muted nowrap">${date(a.at)}</td><td class="nowrap">${escape(a.actor)}</td><td>${escape(a.action)} ${a.detail ? `<span class="muted">${escape(a.detail)}</span>` : ""}</td></tr>`)
		.join("")}</table>`;
}
