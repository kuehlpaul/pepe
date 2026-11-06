// Server-rendered web app so a user can see, edit and delete everything agents store about them.
import { MIN_PASSWORD_LENGTH, checkPassword, clearSessionCookie, createApiToken, getUser, listApiTokens, revokeApiToken, sessionCookie, setPassword, updateUser, type User } from "./accounts";
import { deleteAccount, listGrantsFor, revokeGrantFor } from "./auth";
import { escape, htmlResponse, layout, redirect, sameOrigin } from "./html";
import { CONFIDENCE, DOC_KINDS, MEMORY_TYPES, Store, type Memory } from "./store";

const opt = (values: readonly string[], selected?: string | null) =>
	values.map((v) => `<option ${v === selected ? "selected" : ""}>${escape(v)}</option>`).join("");
const tags = (json: string) => {
	try {
		return (JSON.parse(json) as string[]).map((t) => `<span class="chip">${escape(t)}</span>`).join("");
	} catch {
		return "";
	}
};
const splitTags = (v: unknown) =>
	String(v ?? "")
		.split(",")
		.map((t) => t.trim())
		.filter(Boolean);
const date = (iso: string | null | undefined) => (iso ? escape(iso.slice(0, 16).replace("T", " ")) : "—");

function memoryItem(m: Memory) {
	return `<div class="item"><a href="/ui/memories/${m.id}"><strong>${escape(m.topic)}</strong></a>
		<span class="chip">${escape(m.type)}</span>${m.confidence !== "confirmed" ? `<span class="chip">${escape(m.confidence)}</span>` : ""}${m.status !== "active" ? `<span class="chip">${escape(m.status)}</span>` : ""}${tags(m.tags)}
		<pre>${escape(m.content)}</pre>
		<div class="meta">updated ${date(m.updated_at)} · by ${escape(m.created_by ?? "?")}${m.source ? ` · source: ${escape(m.source)}` : ""}</div></div>`;
}

export async function handleUi(request: Request, env: Env, user: User): Promise<Response> {
	const url = new URL(request.url);
	const path = url.pathname.replace(/\/$/, "") || "/ui";
	const store = new Store(env, user.id, "web-ui");
	const page = (title: string, body: string, status = 200) => htmlResponse(layout(title, body, user), status);
	const post = request.method === "POST";
	if (post && !sameOrigin(request)) return new Response("Bad origin", { status: 403 });
	// Body-less POSTs (e.g. a bare "restore" button) have no Content-Type; treat them as an empty form.
	const isForm = /multipart\/form-data|application\/x-www-form-urlencoded/.test(request.headers.get("Content-Type") ?? "");
	const form = post ? (isForm ? await request.formData() : new FormData()) : null;
	const f = (k: string) => (form?.get(k) == null ? undefined : String(form.get(k)));
	const base = env.PUBLIC_URL.replace(/\/$/, "");

	// ---------- overview ----------
	if (path === "/ui") {
		const q = url.searchParams.get("q");
		if (q) {
			const hits = await store.search(q, { limit: 30, includeInactive: true });
			const rows = hits
				.map((h) => {
					const href = { memory: "/ui/memories/", document: "/ui/documents/", skill: "/ui/skills/", lesson: "/ui/lessons#" }[h.kind] + h.id;
					return `<div class="item"><span class="chip">${h.kind}</span><a href="${href}"><strong>${escape(h.title)}</strong></a> <span class="muted">${h.score.toFixed(2)}</span><pre class="muted">${escape(h.snippet)}</pre></div>`;
				})
				.join("");
			return page("Search", `${searchBox(q)}<div class="list">${rows || "<p class=muted>No results.</p>"}</div>`);
		}
		const [about, mems, docs, activity, counts] = await Promise.all([
			store.getSetting("about"),
			store.listMemories({ status: "active", limit: 8 }),
			store.listDocuments(5),
			store.recentActivity(8),
			store.counts(),
		]);
		const empty = counts.memories + counts.documents + counts.lessons + counts.skills === 0;
		const welcome =
			url.searchParams.has("welcome") || empty
				? `<div class="card"><h2>${url.searchParams.has("welcome") ? `Welcome${user.name ? `, ${escape(user.name)}` : ""}!` : "Get started"}</h2>
				<p>Your context layer is empty. The fastest way to fill it: open a chat with any agent (Claude, ChatGPT, Cursor, Claude Code …) and paste this:</p>
				<p><input class="mono" readonly value="Set up my Personal Context Layer by following ${escape(base)}/setup" onclick="this.select()"></p>
				<p class="muted">The agent connects over MCP (you approve it here), installs custom instructions so future chats check your memory first, and offers to import what it already knows about you. Or <a href="/ui/settings">connect manually</a>.</p></div>`
				: "";
		return page(
			"Overview",
			`${welcome}${searchBox("")}
			<div class="stats"><div class="stat"><b>${counts.memories}</b><span>memories</span></div><div class="stat"><b>${counts.documents}</b><span>documents</span></div><div class="stat"><b>${counts.lessons}</b><span>lessons</span></div><div class="stat"><b>${counts.skills}</b><span>skills</span></div></div>
			<div class="card"><div class="row"><h2 class="grow" style="margin:0">About me</h2><a href="/ui/settings">Edit</a></div><pre>${escape(about)}</pre></div>
			<div class="grid2"><div><h2>Recent memories</h2><div class="list">${mems.map(memoryItem).join("") || "<p class=muted>None yet.</p>"}</div></div>
			<div><h2>Recent documents</h2><div class="list">${docs.map((d) => `<div class="item"><a href="/ui/documents/${d.id}"><strong>${escape(d.title)}</strong></a> <span class="chip">${escape(d.kind)}</span><div class="meta">${date(d.updated_at)}</div></div>`).join("") || "<p class=muted>None yet.</p>"}</div>
			<h2>Latest activity</h2>${activityTable(activity)}</div></div>`,
		);
	}

	// ---------- memories ----------
	if (path === "/ui/memories") {
		const status = url.searchParams.get("status") ?? "active";
		const type = url.searchParams.get("type") ?? undefined;
		const list = await store.listMemories({ status: status === "all" ? undefined : status, type, limit: 300 });
		return page(
			"Memories",
			`<div class="row"><h1 class="grow">Memories</h1><a href="/ui/memories/new"><button>New memory</button></a></div>
			<form class="row" method="get"><select name="status" class="grow">${opt(["active", "superseded", "archived", "all"], status)}</select>
			<select name="type" class="grow"><option value="">all types</option>${opt(MEMORY_TYPES, type)}</select><button class="secondary">Filter</button></form>
			<p class="muted">${list.length} shown</p><div class="list">${list.map(memoryItem).join("")}</div>`,
		);
	}
	if (path === "/ui/memories/new") {
		if (post) {
			const id = await store.createMemory({
				type: f("type") as Memory["type"],
				topic: f("topic")!,
				content: f("content")!,
				source: f("source") || undefined,
				source_date: f("source_date") || undefined,
				confidence: f("confidence") as Memory["confidence"],
				tags: splitTags(form!.get("tags")),
			});
			return redirect(`/ui/memories/${id}`);
		}
		return page("New memory", `<h1>New memory</h1>${memoryForm()}`);
	}
	const memMatch = path.match(/^\/ui\/memories\/(mem_[a-z0-9]+)(\/forget)?$/);
	if (memMatch) {
		const id = memMatch[1];
		if (post && !(await store.getMemory(id))) return page("Not found", "<h1>Memory not found</h1>", 404);
		if (memMatch[2] && post) {
			await store.forgetMemory(id);
			return redirect("/ui/memories");
		}
		if (post) {
			await store.updateMemory(id, {
				type: f("type") as Memory["type"],
				topic: f("topic"),
				content: f("content"),
				source: f("source") || null,
				source_date: f("source_date") || null,
				confidence: f("confidence") as Memory["confidence"],
				status: f("status") as Memory["status"],
				tags: splitTags(form!.get("tags")),
			});
			return redirect(`/ui/memories/${id}`);
		}
		const m = await store.getMemory(id);
		if (!m) return page("Not found", "<h1>Memory not found</h1>", 404);
		return page(
			m.topic,
			`<h1>${escape(m.topic)}</h1>
			<p class="muted">id <span class="mono">${m.id}</span> · created ${date(m.created_at)} by ${escape(m.created_by ?? "?")}${m.superseded_by ? ` · superseded by <a href="/ui/memories/${m.superseded_by}">${m.superseded_by}</a>` : ""}</p>
			${memoryForm(m)}
			<form method="post" action="/ui/memories/${m.id}/forget" class="card"><p>Forget deletes this memory and its history permanently and blocks agents from saving the same content again.</p><button class="danger">Forget permanently</button></form>`,
		);
	}

	// ---------- documents ----------
	if (path === "/ui/documents") {
		const docs = await store.listDocuments(300);
		return page(
			"Documents",
			`<div class="row"><h1 class="grow">Documents</h1><a href="/ui/documents/new"><button>New document</button></a></div>
			<div class="list">${docs.map((d) => `<div class="item"><a href="/ui/documents/${d.id}"><strong>${escape(d.title)}</strong></a> <span class="chip">${escape(d.kind)}</span>${d.project ? `<span class="chip">${escape(d.project)}</span>` : ""}${tags(d.tags)}<pre class="muted">${escape(d.content)}…</pre><div class="meta">${date(d.updated_at)} · by ${escape(d.created_by ?? "?")}</div></div>`).join("") || "<p class=muted>None yet.</p>"}</div>`,
		);
	}
	const revMatch = path.match(/^\/ui\/documents\/(doc_[a-z0-9]+)\/revisions\/(rev_[a-z0-9]+)(\/restore)?$/);
	if (revMatch) {
		const [, docId, revId, restore] = revMatch;
		const rev = await store.getRevision(revId);
		if (!rev || rev.document_id !== docId) return page("Not found", "<h1>Version not found</h1>", 404);
		if (restore && post) {
			await store.restoreRevision(revId);
			return redirect(`/ui/documents/${docId}`);
		}
		return page(
			`${rev.title} (old version)`,
			`<p><a href="/ui/documents/${docId}">← Current version</a></p>
			<h1>${escape(rev.title)}</h1>
			<p class="muted">Version written by <strong>${escape(rev.edited_by ?? "?")}</strong> on ${date(rev.edited_at)} · replaced by ${escape(rev.replaced_by ?? "?")} on ${date(rev.replaced_at)}</p>
			<div class="card"><pre>${escape(rev.content)}</pre></div>
			<form method="post" action="/ui/documents/${docId}/revisions/${revId}/restore"><p class="muted">Restoring saves the current version to the history first, so it can be undone.</p><button>Restore this version</button></form>`,
		);
	}

	const docMatch = path.match(/^\/ui\/documents\/(new|doc_[a-z0-9]+)(\/delete)?$/);
	if (docMatch) {
		const id = docMatch[1] === "new" ? undefined : docMatch[1];
		if (docMatch[2] && post && id) {
			await store.deleteDocument(id);
			return redirect("/ui/documents");
		}
		if (post) {
			if (id && !(await store.getDocument(id))) return page("Not found", "<h1>Document not found</h1>", 404);
			const saved = await store.saveDocument({
				id,
				title: f("title")!,
				content: f("content")!,
				kind: f("kind") as never,
				project: f("project") || undefined,
				source: f("source") || undefined,
				tags: splitTags(form!.get("tags")),
			});
			return redirect(`/ui/documents/${saved}`);
		}
		const d = id ? await store.getDocument(id) : null;
		if (id && !d) return page("Not found", "<h1>Document not found</h1>", 404);
		const revisions = d ? await store.listRevisions(d.id) : [];
		const history = d
			? `<div class="card"><h2>Version history</h2><table>
				<tr><td><strong>Current</strong></td><td>${escape(d.updated_by ?? d.created_by ?? "?")}</td><td class="muted">${date(d.updated_at)}</td><td></td></tr>
				${revisions.map((r) => `<tr><td>${escape(r.title)}</td><td>${escape(r.edited_by ?? "?")}</td><td class="muted">${date(r.edited_at)}</td><td><a href="/ui/documents/${d.id}/revisions/${r.id}">View</a></td></tr>`).join("")}
				</table>${revisions.length ? "" : '<p class="muted">No earlier versions yet.</p>'}</div>`
			: "";
		return page(
			d?.title ?? "New document",
			`<h1>${escape(d?.title ?? "New document")}</h1>${d ? `<p class="muted">id <span class="mono">${d.id}</span> · created ${date(d.created_at)} by ${escape(d.created_by ?? "?")} · last edit ${date(d.updated_at)} by ${escape(d.updated_by ?? d.created_by ?? "?")}</p>` : ""}
			<form method="post" class="card"><label>Title<input name="title" required value="${escape(d?.title)}"></label>
			<div class="grid2"><label>Kind<select name="kind">${opt(DOC_KINDS, d?.kind)}</select></label><label>Project<input name="project" value="${escape(d?.project)}"></label></div>
			<div class="grid2"><label>Source<input name="source" value="${escape(d?.source)}"></label><label>Tags (comma separated)<input name="tags" value="${escape(d ? JSON.parse(d.tags).join(", ") : "")}"></label></div>
			<label>Content (Markdown)<textarea name="content" class="tall" required>${escape(d?.content)}</textarea></label><button>Save</button></form>
			${history}
			${d ? `<form method="post" action="/ui/documents/${d.id}/delete"><button class="danger">Delete document and all versions</button></form>` : ""}`,
		);
	}

	// ---------- skills ----------
	if (path === "/ui/skills") {
		const skills = await store.listSkills();
		return page(
			"Skills",
			`<div class="row"><h1 class="grow">Skills</h1><a href="/ui/skills/new"><button>New skill</button></a></div>
			<div class="list">${skills.map((s) => `<div class="item"><a href="/ui/skills/${s.id}"><strong>${escape(s.name)}</strong></a> ${s.enabled ? "" : '<span class="chip">disabled</span>'}<div class="muted">${escape(s.description)}</div></div>`).join("") || "<p class=muted>None yet.</p>"}</div>`,
		);
	}
	const sklMatch = path.match(/^\/ui\/skills\/(new|skl_[a-z0-9]+)(\/delete)?$/);
	if (sklMatch) {
		const id = sklMatch[1] === "new" ? undefined : sklMatch[1];
		if (sklMatch[2] && post && id) {
			await store.deleteSkill(id);
			return redirect("/ui/skills");
		}
		if (post) {
			const saved = await store.saveSkill({ name: f("name")!, description: f("description")!, content: f("content")!, version: f("version") || undefined, source: f("source") || undefined, enabled: f("enabled") === "on" });
			return redirect(`/ui/skills/${saved}`);
		}
		const s = id ? await store.getSkill(id) : null;
		if (id && !s) return page("Not found", "<h1>Skill not found</h1>", 404);
		return page(
			s?.name ?? "New skill",
			`<h1>${escape(s?.name ?? "New skill")}</h1>
			<form method="post" class="card"><div class="grid2"><label>Name (kebab-case)<input name="name" required pattern="[a-z0-9][a-z0-9-]{1,63}" value="${escape(s?.name)}"></label><label>Version<input name="version" value="${escape(s?.version)}"></label></div>
			<label>Description (when to use it)<input name="description" required value="${escape(s?.description)}"></label>
			<label>Source<input name="source" value="${escape(s?.source)}"></label>
			<label class="check"><input type="checkbox" name="enabled" ${!s || s.enabled ? "checked" : ""}> Enabled</label>
			<label>Instructions (Markdown)<textarea name="content" class="tall" required>${escape(s?.content)}</textarea></label><button>Save</button></form>
			${s ? `<form method="post" action="/ui/skills/${s.id}/delete"><button class="danger">Delete skill</button></form>` : ""}`,
		);
	}

	// ---------- lessons ----------
	if (path === "/ui/lessons") {
		if (post) {
			const action = f("action");
			if (action === "add" && f("lesson")) await store.addLesson({ lesson: f("lesson")!, context: f("context") || undefined });
			if (action === "archive" && f("id")) await store.updateLesson(f("id")!, { status: "archived" });
			if (action === "activate" && f("id")) await store.updateLesson(f("id")!, { status: "active" });
			if (action === "delete" && f("id")) await store.deleteLesson(f("id")!);
			return redirect("/ui/lessons");
		}
		const status = (url.searchParams.get("status") ?? "active") as "active" | "archived" | "all";
		const lessons = await store.listLessons(status);
		const btn = (id: string, action: string, label: string, cls = "secondary") =>
			`<form method="post" class="inline"><input type="hidden" name="action" value="${action}"><input type="hidden" name="id" value="${id}"><button class="${cls}">${label}</button></form>`;
		return page(
			"Lessons",
			`<h1>Lessons</h1>
			<p class="muted">Mistakes agents made with you and what to do instead. Every agent gets the active lessons when it connects.</p>
			<form method="post" class="card"><input type="hidden" name="action" value="add">
			<label>Lesson (guidance for next time)<input name="lesson" required placeholder="e.g. Keep art suggestions under $20k"></label>
			<label>What happened (optional)<input name="context"></label><button>Add lesson</button></form>
			<form class="row" method="get"><select name="status" class="grow">${opt(["active", "archived", "all"], status)}</select><button class="secondary">Filter</button></form>
			<div class="list">${
				lessons
					.map(
						(l) => `<div class="item" id="${l.id}"><strong>${escape(l.lesson)}</strong>${l.status === "archived" ? ' <span class="chip">archived</span>' : ""}
						${l.context ? `<pre class="muted">${escape(l.context)}</pre>` : ""}
						<div class="row"><span class="meta grow">${date(l.created_at)} · by ${escape(l.created_by ?? "?")}</span>
						${l.status === "active" ? btn(l.id, "archive", "Archive") : btn(l.id, "activate", "Reactivate")} ${btn(l.id, "delete", "Delete", "danger")}</div></div>`,
					)
					.join("") || "<p class=muted>No lessons yet.</p>"
			}</div>`,
		);
	}

	// ---------- export ----------
	if (path === "/ui/export") {
		await store.log("export");
		return new Response(JSON.stringify(await store.exportAll(), null, 2), {
			headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="context-layer-export-${new Date().toISOString().slice(0, 10)}.json"` },
		});
	}

	// ---------- settings ----------
	if (path === "/ui/settings") {
		let newToken: string | null = null;
		let notice: { text: string; error?: boolean } | null = null;
		if (post) {
			const action = f("action");
			if (action === "about") await store.setSetting("about", f("about") ?? "");
			if (action === "guide") await store.setSetting("guide", f("guide") ?? "");
			if (action === "exclusion" && f("rule")) await store.addExclusion(f("rule")!);
			if (action === "remove_exclusion" && f("id")) await store.removeExclusion(f("id")!);
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
		const [about, guide, exclusions, tokens, grants] = await Promise.all([
			store.getSetting("about"),
			store.getSetting("guide"),
			store.listExclusions(),
			listApiTokens(user.id),
			listGrantsFor(user.id),
		]);
		if (url.searchParams.has("pw")) notice = { text: "Password changed. Other devices have been signed out." };
		const mcpUrl = `${base}/mcp`;
		return page(
			"Settings",
			`<h1>Settings</h1>
			${notice ? `<p class="${notice.error ? "warn" : "ok"}">${escape(notice.text)}</p>` : ""}
			<div class="card"><h2>Connect an agent</h2>
			<p>Easiest: paste this into any agent chat. <input class="mono" readonly value="Set up my Personal Context Layer by following ${escape(base)}/setup" onclick="this.select()"></p>
			<p>MCP server URL: <span class="mono">${escape(mcpUrl)}</span> · Claude Code: <span class="mono">claude mcp add --transport http context ${escape(mcpUrl)}</span></p>
			<p class="muted">OAuth clients add the MCP URL and approve access here with your login. Clients without OAuth: create a personal token below and send it as <span class="mono">Authorization: Bearer pcl_…</span>.</p></div>

			<div class="card"><h2>Connected apps</h2><p class="muted">Agents that you approved via OAuth. Revoking disconnects them until they sign in again.</p>
			<table>${
				grants
					.map(
						(g) =>
							`<tr><td>${escape((g.metadata as { client?: string } | undefined)?.client ?? g.clientId)}</td><td class="muted">${(g.scope ?? []).join(", ")}</td><td class="muted">${date(new Date(g.createdAt * 1000).toISOString())}</td><td><form method="post" class="inline"><input type="hidden" name="action" value="revoke_grant"><input type="hidden" name="id" value="${escape(g.id)}"><button class="secondary small">Revoke</button></form></td></tr>`,
					)
					.join("") || "<tr><td class=muted>No OAuth connections yet.</td></tr>"
			}</table></div>

			<form method="post" class="card"><input type="hidden" name="action" value="about"><h2>About me</h2>
			<p class="muted">Sent to every agent when it connects. Keep it short: who you are, role, current focus, how you like to work.</p>
			<textarea name="about">${escape(about)}</textarea><button>Save</button></form>

			<form method="post" class="card"><input type="hidden" name="action" value="guide"><h2>Agent operating guide</h2>
			<p class="muted">Returned by <span class="mono">get_context</span> / <span class="mono">save_guide</span>. Destinations, preferences, exclusions, setup version — not a copy of your custom instructions.</p>
			<textarea name="guide" class="tall">${escape(guide)}</textarea><button>Save</button></form>

			<div class="card"><h2>Exclusions</h2><p class="muted">Rules agents see on every connect: things that must never be stored.</p>
			<table>${exclusions.map((e) => `<tr><td>${escape(e.rule)}</td><td><form method="post" class="inline"><input type="hidden" name="action" value="remove_exclusion"><input type="hidden" name="id" value="${e.id}"><button class="secondary small">Remove</button></form></td></tr>`).join("") || "<tr><td class=muted>None.</td></tr>"}</table>
			<form method="post" class="row"><input type="hidden" name="action" value="exclusion"><input name="rule" class="grow" placeholder="e.g. Never store anything about my health"><button>Add</button></form></div>

			<div class="card"><h2>Personal API tokens</h2>
			${newToken ? `<p class="warn">Copy this token now, it won't be shown again:<br><span class="mono">${escape(newToken)}</span></p>` : ""}
			<table><tr><th>Name</th><th>Prefix</th><th>Created</th><th>Last used</th><th></th></tr>${tokens.map((t) => `<tr><td>${escape(t.name)}</td><td class="mono">${escape(t.prefix)}…</td><td>${date(t.created_at)}</td><td>${date(t.last_used_at)}</td><td><form method="post" class="inline"><input type="hidden" name="action" value="revoke_token"><input type="hidden" name="id" value="${t.id}"><button class="secondary small">Revoke</button></form></td></tr>`).join("")}</table>
			<form method="post" class="row"><input type="hidden" name="action" value="token"><input name="name" class="grow" placeholder="Token name, e.g. cursor-laptop" required><button>Create token</button></form></div>

			<div class="card"><h2>Account</h2>
			<form method="post"><input type="hidden" name="action" value="profile"><div class="grid2"><label>Email<input value="${escape(user.email)}" disabled></label><label>Name<input name="name" value="${escape(user.name)}"></label></div><button class="secondary">Save name</button></form>
			<form method="post"><input type="hidden" name="action" value="password"><div class="grid2"><label>Current password<input type="password" name="current_password" autocomplete="current-password" required></label><label>New password<input type="password" name="new_password" autocomplete="new-password" minlength="${MIN_PASSWORD_LENGTH}" required></label></div><button class="secondary">Change password</button></form></div>

			<div class="card"><h2>Your data</h2>
			<p>Everything you own as one JSON file: memories, documents with history, lessons, skills, settings, activity. <a href="/ui/export"><button class="secondary small">Download export</button></a></p>
			<details><summary style="cursor:pointer">Delete account and all data…</summary>
			<form method="post"><input type="hidden" name="action" value="delete_account"><p class="muted">Removes your account, every memory, document, lesson, skill, token and OAuth connection, and the search index. There is no undo. Download an export first if you want to keep anything.</p>
			<div class="grid2"><label>Password<input type="password" name="password" autocomplete="current-password" required></label><label>Type DELETE<input name="confirm" required></label></div><button class="danger">Delete my account</button></form></details></div>`,
		);
	}

	if (path === "/ui/activity") {
		return page("Activity", `<h1>Activity</h1><p class="muted">Every write by every agent and by you.</p>${activityTable(await store.recentActivity(300))}`);
	}

	return page("Not found", "<h1>Not found</h1>", 404);
}

function searchBox(q: string) {
	return `<form method="get" action="/ui" class="row card"><input name="q" class="grow" placeholder="Search everything (semantic + keyword)…" value="${escape(q)}" style="margin:0"><button>Search</button></form>`;
}

function activityTable(rows: Awaited<ReturnType<Store["recentActivity"]>>) {
	return `<table><tr><th>When</th><th>Who</th><th>What</th></tr>${rows
		.map((a) => `<tr><td class="muted">${date(a.at)}</td><td>${escape(a.actor)}</td><td>${escape(a.action)} ${a.detail ? `<span class="muted">${escape(a.detail)}</span>` : ""}</td></tr>`)
		.join("")}</table>`;
}

function memoryForm(m?: Memory) {
	return `<form method="post" class="card">
		<label>Topic<input name="topic" required value="${escape(m?.topic)}"></label>
		<div class="grid2"><label>Type<select name="type">${opt(MEMORY_TYPES, m?.type)}</select></label><label>Confidence<select name="confidence">${opt(CONFIDENCE, m?.confidence)}</select></label></div>
		<label>Content<textarea name="content" required>${escape(m?.content)}</textarea></label>
		<div class="grid2"><label>Source<input name="source" value="${escape(m?.source)}"></label><label>Source date (when it was true)<input name="source_date" value="${escape(m?.source_date)}" placeholder="2026-11-06"></label></div>
		<div class="grid2"><label>Tags (comma separated)<input name="tags" value="${escape(m ? JSON.parse(m.tags).join(", ") : "")}"></label>
		${m ? `<label>Status<select name="status">${opt(["active", "superseded", "archived"], m.status)}</select></label>` : ""}</div>
		<button>Save</button></form>`;
}
