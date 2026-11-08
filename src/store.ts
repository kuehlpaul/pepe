// Data layer: D1 for records, Vectorize + Workers AI for semantic search.
// A Store is bound to ONE user: every query filters on user_id and every vector lives in the
// user's Vectorize namespace, so no code path can read across accounts by accident.
// Every write goes through here so activity logging and re-embedding stay consistent.

export const MEMORY_TYPES = ["preference", "fact", "decision", "project", "person", "correction", "other"] as const;
export const CONFIDENCE = ["confirmed", "inferred", "uncertain"] as const;
export const DOC_KINDS = ["note", "plan", "spec", "research", "meeting", "other"] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];
export type Confidence = (typeof CONFIDENCE)[number];
export type DocKind = (typeof DOC_KINDS)[number];

export interface Memory {
	id: string;
	type: MemoryType;
	topic: string;
	content: string;
	source: string | null;
	source_date: string | null;
	confidence: Confidence;
	status: "active" | "superseded" | "archived";
	superseded_by: string | null;
	tags: string;
	created_by: string | null;
	created_at: string;
	updated_at: string;
}

export interface Document {
	id: string;
	title: string;
	kind: DocKind;
	project: string | null;
	content: string;
	source: string | null;
	tags: string;
	created_by: string | null;
	updated_by: string | null;
	created_at: string;
	updated_at: string;
}

export interface DocumentRevision {
	id: string;
	document_id: string;
	title: string;
	content: string;
	edited_by: string | null;
	edited_at: string;
	replaced_by: string | null;
	replaced_at: string;
}

export interface Lesson {
	id: string;
	lesson: string;
	context: string | null;
	status: "active" | "archived";
	created_by: string | null;
	created_at: string;
	updated_at: string;
}

export interface Skill {
	id: string;
	name: string;
	description: string;
	content: string;
	enabled: number;
	version: string | null;
	source: string | null;
	created_at: string;
	updated_at: string;
}

export interface SearchHit {
	kind: "memory" | "document" | "skill" | "lesson";
	id: string;
	title: string;
	snippet: string;
	score: number;
	updated_at: string;
}

const now = () => new Date().toISOString();
export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

export async function sha256(text: string): Promise<string> {
	const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

export class Store {
	constructor(
		private env: Env,
		readonly userId: string,
		private actor: string,
	) {
		if (!userId) throw new Error("Store requires a user id");
	}

	private get db() {
		return this.env.DB;
	}
	private get u() {
		return this.userId;
	}

	// ---------- activity ----------
	async log(action: string, target?: string, detail?: string) {
		await this.db
			.prepare("INSERT INTO activity (user_id, actor, action, target, detail) VALUES (?, ?, ?, ?, ?)")
			.bind(this.u, this.actor, action, target ?? null, detail ?? null)
			.run();
	}

	async recentActivity(limit = 50) {
		const { results } = await this.db.prepare("SELECT * FROM activity WHERE user_id = ? ORDER BY at DESC LIMIT ?").bind(this.u, limit).all();
		return results as { id: number; at: string; actor: string; action: string; target: string | null; detail: string | null }[];
	}

	// ---------- embeddings ----------
	private async embed(texts: string[]): Promise<number[][] | null> {
		try {
			const out = (await this.env.AI.run(this.env.EMBEDDING_MODEL as keyof AiModels, { text: texts } as never)) as {
				data?: number[][];
			};
			return out.data ?? null;
		} catch (err) {
			console.warn("embedding unavailable, falling back to keyword search", String(err));
			return null;
		}
	}

	private async index(vectorId: string, text: string, kind: SearchHit["kind"]) {
		const vectors = await this.embed([text.slice(0, 4000)]);
		if (!vectors) return;
		try {
			await this.env.VECTORS.upsert([{ id: vectorId, values: vectors[0], namespace: this.u, metadata: { kind, user: this.u } }]);
		} catch (err) {
			console.warn("vectorize upsert failed", String(err));
		}
	}

	private async unindex(vectorIds: string[]) {
		if (!vectorIds.length) return;
		try {
			await this.env.VECTORS.deleteByIds(vectorIds);
		} catch (err) {
			console.warn("vectorize delete failed", String(err));
		}
	}

	private async semantic(query: string, topK: number): Promise<{ id: string; score: number }[] | null> {
		const vectors = await this.embed([query]);
		if (!vectors) return null;
		try {
			const res = await this.env.VECTORS.query(vectors[0], { topK, namespace: this.u });
			return res.matches.map((m) => ({ id: m.id, score: m.score }));
		} catch (err) {
			console.warn("vectorize query failed", String(err));
			return null;
		}
	}

	/** Re-embeds everything this user owns (used after claiming legacy data, or to repair the index). */
	async reindexAll() {
		const [mems, docs, lessons, skills] = await Promise.all([
			this.db.prepare("SELECT id, topic, content FROM memories WHERE user_id = ? AND status = 'active'").bind(this.u).all<Memory>(),
			this.db.prepare("SELECT id, title, content FROM documents WHERE user_id = ?").bind(this.u).all<Document>(),
			this.db.prepare("SELECT id, lesson, context FROM lessons WHERE user_id = ? AND status = 'active'").bind(this.u).all<Lesson>(),
			this.db.prepare("SELECT id, name, description FROM skills WHERE user_id = ?").bind(this.u).all<Skill>(),
		]);
		for (const m of mems.results) await this.index(`mem:${m.id}`, `${m.topic}\n${m.content}`, "memory");
		for (const d of docs.results) await this.index(`doc:${d.id}`, `${d.title}\n${d.content}`, "document");
		for (const l of lessons.results) await this.index(`les:${l.id}`, `${l.lesson}\n${l.context ?? ""}`, "lesson");
		for (const s of skills.results) await this.index(`skl:${s.id}`, `${s.name}\n${s.description}`, "skill");
		await this.log("reindex", undefined, `${mems.results.length + docs.results.length + lessons.results.length + skills.results.length} vectors`);
	}

	// ---------- settings ----------
	async getSetting(key: "about" | "guide"): Promise<string> {
		const row = await this.db.prepare("SELECT value FROM settings WHERE user_id = ? AND key = ?").bind(this.u, key).first<{ value: string }>();
		return row?.value ?? "";
	}

	async setSetting(key: "about" | "guide", value: string) {
		await this.db
			.prepare(
				"INSERT INTO settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
			)
			.bind(this.u, key, value, now())
			.run();
		await this.log("update_setting", key);
	}

	// ---------- exclusions / forget ----------
	async listExclusions() {
		const { results } = await this.db.prepare("SELECT * FROM exclusions WHERE user_id = ? ORDER BY created_at").bind(this.u).all();
		return results as { id: string; rule: string; created_at: string }[];
	}

	async addExclusion(rule: string) {
		const id = newId("exc");
		await this.db.prepare("INSERT INTO exclusions (id, user_id, rule) VALUES (?, ?, ?)").bind(id, this.u, rule).run();
		await this.log("add_exclusion", id, rule);
		return id;
	}

	async removeExclusion(id: string) {
		await this.db.prepare("DELETE FROM exclusions WHERE id = ? AND user_id = ?").bind(id, this.u).run();
		await this.log("remove_exclusion", id);
	}

	async isTombstoned(content: string) {
		const hash = await sha256(normalize(content));
		return !!(await this.db.prepare("SELECT 1 FROM tombstones WHERE user_id = ? AND content_hash = ?").bind(this.u, hash).first());
	}

	// ---------- memories ----------
	async getMemory(id: string) {
		return this.db.prepare("SELECT * FROM memories WHERE id = ? AND user_id = ?").bind(id, this.u).first<Memory>();
	}

	async listMemories(opts: { status?: string; type?: string; limit?: number } = {}) {
		const where: string[] = ["user_id = ?"];
		const args: unknown[] = [this.u];
		if (opts.status) (where.push("status = ?"), args.push(opts.status));
		if (opts.type) (where.push("type = ?"), args.push(opts.type));
		const sql = `SELECT * FROM memories WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT ?`;
		const { results } = await this.db
			.prepare(sql)
			.bind(...args, opts.limit ?? 100)
			.all<Memory>();
		return results;
	}

	/** Returns existing memories that look like the same topic, so callers can update instead of duplicating. */
	async findSimilarMemories(text: string, threshold = 0.85) {
		const matches = await this.semantic(text, 5);
		if (!matches) return [];
		const ids = matches.filter((m) => m.id.startsWith("mem:") && m.score >= threshold);
		const out: (Memory & { score: number })[] = [];
		for (const m of ids) {
			const mem = await this.getMemory(m.id.slice(4));
			if (mem && mem.status === "active") out.push({ ...mem, score: m.score });
		}
		return out;
	}

	async createMemory(input: {
		type: MemoryType;
		topic: string;
		content: string;
		source?: string;
		source_date?: string;
		confidence?: Confidence;
		tags?: string[];
	}) {
		const id = newId("mem");
		await this.db
			.prepare(
				`INSERT INTO memories (id, user_id, type, topic, content, source, source_date, confidence, tags, created_by)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				id,
				this.u,
				input.type,
				input.topic,
				input.content,
				input.source ?? null,
				input.source_date ?? null,
				input.confidence ?? "confirmed",
				JSON.stringify(input.tags ?? []),
				this.actor,
			)
			.run();
		await this.index(`mem:${id}`, `${input.topic}\n${input.content}`, "memory");
		await this.log("create_memory", id, input.topic);
		return id;
	}

	async updateMemory(
		id: string,
		patch: Partial<Pick<Memory, "type" | "topic" | "content" | "source" | "source_date" | "confidence" | "status">> & {
			tags?: string[];
		},
	) {
		const existing = await this.getMemory(id);
		if (!existing) return null;
		const merged = {
			...existing,
			...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
			tags: patch.tags ? JSON.stringify(patch.tags) : existing.tags,
		} as Memory;
		await this.db
			.prepare(
				`UPDATE memories SET type=?, topic=?, content=?, source=?, source_date=?, confidence=?, status=?, tags=?, updated_at=? WHERE id=? AND user_id=?`,
			)
			.bind(
				merged.type,
				merged.topic,
				merged.content,
				merged.source,
				merged.source_date,
				merged.confidence,
				merged.status,
				merged.tags,
				now(),
				id,
				this.u,
			)
			.run();
		if (merged.status === "active") await this.index(`mem:${id}`, `${merged.topic}\n${merged.content}`, "memory");
		else await this.unindex([`mem:${id}`]);
		await this.log("update_memory", id, merged.topic);
		return merged;
	}

	/** Marks `oldId` as superseded by a new memory (keeps history instead of silently overwriting). */
	async supersedeMemory(oldId: string, replacement: Parameters<Store["createMemory"]>[0]) {
		const old = await this.getMemory(oldId);
		if (!old) return null;
		const newIdValue = await this.createMemory(replacement);
		await this.db
			.prepare("UPDATE memories SET status='superseded', superseded_by=?, updated_at=? WHERE id=? AND user_id=?")
			.bind(newIdValue, now(), oldId, this.u)
			.run();
		await this.unindex([`mem:${oldId}`]);
		await this.log("supersede_memory", oldId, newIdValue);
		return newIdValue;
	}

	/** Hard delete + tombstone so the same content cannot be re-imported. Also removes superseded ancestors. */
	async forgetMemory(id: string) {
		const mem = await this.getMemory(id);
		if (!mem) return false;
		// The memory plus every older version it superseded (any depth).
		const chain = await this.db
			.prepare(
				`WITH RECURSIVE history(id) AS (SELECT ? UNION SELECT m.id FROM memories m JOIN history h ON m.superseded_by = h.id WHERE m.user_id = ?)
				 SELECT m.id, m.content FROM memories m JOIN history h ON m.id = h.id WHERE m.user_id = ?`,
			)
			.bind(id, this.u, this.u)
			.all<{ id: string; content: string }>();
		for (const row of chain.results) {
			await this.db
				.prepare("INSERT OR IGNORE INTO tombstones (user_id, content_hash) VALUES (?, ?)")
				.bind(this.u, await sha256(normalize(row.content)))
				.run();
		}
		const ids = chain.results.map((r) => r.id);
		await this.db
			.prepare(`DELETE FROM memories WHERE user_id = ? AND id IN (${ids.map(() => "?").join(",")})`)
			.bind(this.u, ...ids)
			.run();
		await this.unindex(ids.map((x) => `mem:${x}`));
		await this.log("forget_memory", id, `${ids.length} record(s) removed`);
		return true;
	}

	// ---------- documents ----------
	async getDocument(id: string) {
		return this.db.prepare("SELECT * FROM documents WHERE id = ? AND user_id = ?").bind(id, this.u).first<Document>();
	}

	async listDocuments(limit = 100) {
		const { results } = await this.db
			.prepare(
				"SELECT id, title, kind, project, source, tags, created_by, created_at, updated_at, substr(content,1,280) AS content FROM documents WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?",
			)
			.bind(this.u, limit)
			.all<Document>();
		return results;
	}

	async saveDocument(input: {
		id?: string;
		title: string;
		content: string;
		kind?: DocKind;
		project?: string;
		source?: string;
		tags?: string[];
	}) {
		const id = input.id ?? newId("doc");
		const exists = input.id ? await this.getDocument(input.id) : null;
		if (input.id && !exists) throw new Error(`Document ${input.id} not found`);
		if (exists) {
			const update = this.db
				.prepare("UPDATE documents SET title=?, content=?, kind=?, project=?, source=?, tags=?, updated_at=?, updated_by=? WHERE id=? AND user_id=?")
				.bind(
					input.title,
					input.content,
					input.kind ?? exists.kind,
					input.project ?? exists.project,
					input.source ?? exists.source,
					input.tags ? JSON.stringify(input.tags) : exists.tags,
					now(),
					this.actor,
					id,
					this.u,
				);
			const textChanged = exists.title !== input.title || exists.content !== input.content;
			// Snapshot the previous version in the same transaction, so no edit can lose history.
			const snapshot = this.db
				.prepare(
					"INSERT INTO document_revisions (id, user_id, document_id, title, content, edited_by, edited_at, replaced_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
				)
				.bind(newId("rev"), this.u, id, exists.title, exists.content, exists.updated_by ?? exists.created_by, exists.updated_at, this.actor);
			await this.db.batch(textChanged ? [snapshot, update] : [update]);
		} else {
			await this.db
				.prepare(
					"INSERT INTO documents (id, user_id, title, content, kind, project, source, tags, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
				)
				.bind(
					id,
					this.u,
					input.title,
					input.content,
					input.kind ?? "note",
					input.project ?? null,
					input.source ?? null,
					JSON.stringify(input.tags ?? []),
					this.actor,
					this.actor,
				)
				.run();
		}
		await this.index(`doc:${id}`, `${input.title}\n${input.content}`, "document");
		await this.log(exists ? "update_document" : "create_document", id, input.title);
		return id;
	}

	async deleteDocument(id: string) {
		if (!(await this.getDocument(id))) return false; // never touch (or unindex) a record this user does not own
		await this.db.batch([
			this.db.prepare("DELETE FROM document_revisions WHERE document_id = ? AND user_id = ?").bind(id, this.u),
			this.db.prepare("DELETE FROM documents WHERE id = ? AND user_id = ?").bind(id, this.u),
		]);
		await this.unindex([`doc:${id}`]);
		await this.log("delete_document", id, "including all revisions");
		return true;
	}

	/** Newest first. The current version is the document itself, not a revision. */
	async listRevisions(documentId: string) {
		const { results } = await this.db
			.prepare(
				"SELECT id, document_id, title, edited_by, edited_at, replaced_by, replaced_at, length(content) AS size FROM document_revisions WHERE document_id = ? AND user_id = ? ORDER BY replaced_at DESC",
			)
			.bind(documentId, this.u)
			.all<Omit<DocumentRevision, "content"> & { size: number }>();
		return results;
	}

	async getRevision(revisionId: string) {
		return this.db.prepare("SELECT * FROM document_revisions WHERE id = ? AND user_id = ?").bind(revisionId, this.u).first<DocumentRevision>();
	}

	/** Restoring is itself an edit: the current version is snapshotted first, so a restore can be undone. */
	async restoreRevision(revisionId: string) {
		const rev = await this.getRevision(revisionId);
		if (!rev) return null;
		const doc = await this.getDocument(rev.document_id);
		if (!doc) return null;
		await this.saveDocument({ id: doc.id, title: rev.title, content: rev.content });
		await this.log("restore_revision", doc.id, `restored version from ${rev.edited_at}`);
		return doc.id;
	}

	// ---------- lessons ----------
	async listLessons(status: "active" | "archived" | "all" = "active") {
		const { results } = await this.db
			.prepare(`SELECT * FROM lessons WHERE user_id = ? ${status === "all" ? "" : "AND status = ?"} ORDER BY updated_at DESC LIMIT 200`)
			.bind(this.u, ...(status === "all" ? [] : [status]))
			.all<Lesson>();
		return results;
	}

	async getLesson(id: string) {
		return this.db.prepare("SELECT * FROM lessons WHERE id = ? AND user_id = ?").bind(id, this.u).first<Lesson>();
	}

	async addLesson(input: { lesson: string; context?: string }) {
		const id = newId("les");
		await this.db
			.prepare("INSERT INTO lessons (id, user_id, lesson, context, created_by) VALUES (?, ?, ?, ?, ?)")
			.bind(id, this.u, input.lesson, input.context ?? null, this.actor)
			.run();
		await this.index(`les:${id}`, `${input.lesson}\n${input.context ?? ""}`, "lesson");
		await this.log("create_lesson", id, input.lesson.slice(0, 120));
		return id;
	}

	async updateLesson(id: string, patch: { lesson?: string; context?: string | null; status?: Lesson["status"] }) {
		const existing = await this.getLesson(id);
		if (!existing) return null;
		const merged = { ...existing, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as Lesson;
		await this.db
			.prepare("UPDATE lessons SET lesson=?, context=?, status=?, updated_at=? WHERE id=? AND user_id=?")
			.bind(merged.lesson, merged.context, merged.status, now(), id, this.u)
			.run();
		if (merged.status === "active") await this.index(`les:${id}`, `${merged.lesson}\n${merged.context ?? ""}`, "lesson");
		else await this.unindex([`les:${id}`]);
		await this.log("update_lesson", id, merged.status);
		return merged;
	}

	async deleteLesson(id: string) {
		if (!(await this.getLesson(id))) return false;
		await this.db.prepare("DELETE FROM lessons WHERE id = ? AND user_id = ?").bind(id, this.u).run();
		await this.unindex([`les:${id}`]);
		await this.log("delete_lesson", id);
		return true;
	}

	// ---------- skills ----------
	async listSkills(onlyEnabled = false) {
		const { results } = await this.db
			.prepare(`SELECT * FROM skills WHERE user_id = ? ${onlyEnabled ? "AND enabled = 1" : ""} ORDER BY name`)
			.bind(this.u)
			.all<Skill>();
		return results;
	}

	async getSkill(nameOrId: string) {
		return this.db.prepare("SELECT * FROM skills WHERE user_id = ? AND (name = ? OR id = ?)").bind(this.u, nameOrId, nameOrId).first<Skill>();
	}

	async saveSkill(input: { name: string; description: string; content: string; version?: string; source?: string; enabled?: boolean }) {
		const existing = await this.getSkill(input.name);
		const id = existing?.id ?? newId("skl");
		await this.db
			.prepare(
				`INSERT INTO skills (id, user_id, name, description, content, version, source, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT(user_id, name) DO UPDATE SET description=excluded.description, content=excluded.content,
				 version=excluded.version, source=excluded.source, enabled=excluded.enabled, updated_at=?`,
			)
			.bind(id, this.u, input.name, input.description, input.content, input.version ?? null, input.source ?? null, input.enabled === false ? 0 : 1, now())
			.run();
		await this.index(`skl:${id}`, `${input.name}\n${input.description}`, "skill");
		await this.log(existing ? "update_skill" : "create_skill", id, input.name);
		return id;
	}

	async deleteSkill(id: string) {
		if (!(await this.getSkill(id))) return false;
		await this.db.prepare("DELETE FROM skills WHERE id = ? AND user_id = ?").bind(id, this.u).run();
		await this.unindex([`skl:${id}`]);
		await this.log("delete_skill", id);
		return true;
	}

	// ---------- search ----------
	async search(query: string, opts: { kinds?: SearchHit["kind"][]; limit?: number; includeInactive?: boolean } = {}) {
		const limit = opts.limit ?? 10;
		const kinds = new Set(opts.kinds ?? ["memory", "document", "skill", "lesson"]);
		const hits = new Map<string, SearchHit>();

		// Every lookup below goes through a user-scoped getter, so a stray vector id can never leak another account's data.
		const add = async (vectorId: string, score: number) => {
			const [prefix, id] = [vectorId.slice(0, 3), vectorId.slice(4)];
			if (prefix === "mem" && kinds.has("memory")) {
				const m = await this.getMemory(id);
				if (m && (opts.includeInactive || m.status === "active"))
					hits.set(vectorId, { kind: "memory", id, title: `[${m.type}] ${m.topic}`, snippet: m.content.slice(0, 400), score, updated_at: m.updated_at });
			} else if (prefix === "doc" && kinds.has("document")) {
				const d = await this.getDocument(id);
				if (d) hits.set(vectorId, { kind: "document", id, title: d.title, snippet: d.content.slice(0, 400), score, updated_at: d.updated_at });
			} else if (prefix === "skl" && kinds.has("skill")) {
				const s = await this.getSkill(id);
				if (s) hits.set(vectorId, { kind: "skill", id, title: s.name, snippet: s.description, score, updated_at: s.updated_at });
			} else if (prefix === "les" && kinds.has("lesson")) {
				const l = await this.getLesson(id);
				if (l && (opts.includeInactive || l.status === "active"))
					hits.set(vectorId, { kind: "lesson", id, title: l.lesson.slice(0, 120), snippet: l.context ?? "", score, updated_at: l.updated_at });
			}
		};

		const semantic = await this.semantic(query, Math.min(limit * 2, 50));
		if (semantic) for (const m of semantic) if (m.score >= 0.35) await add(m.id, m.score);

		// Keyword fallback/boost: catches exact names, IDs and works without Vectorize (local dev).
		const like = `%${query.replace(/[%_]/g, "")}%`;
		if (kinds.has("memory")) {
			const { results } = await this.db
				.prepare(
					`SELECT id FROM memories WHERE user_id = ? AND (topic LIKE ? OR content LIKE ? OR tags LIKE ?) ${opts.includeInactive ? "" : "AND status='active'"} ORDER BY updated_at DESC LIMIT ?`,
				)
				.bind(this.u, like, like, like, limit)
				.all<{ id: string }>();
			for (const r of results) if (!hits.has(`mem:${r.id}`)) await add(`mem:${r.id}`, 0.5);
		}
		if (kinds.has("document")) {
			const { results } = await this.db
				.prepare("SELECT id FROM documents WHERE user_id = ? AND (title LIKE ? OR content LIKE ? OR project LIKE ?) ORDER BY updated_at DESC LIMIT ?")
				.bind(this.u, like, like, like, limit)
				.all<{ id: string }>();
			for (const r of results) if (!hits.has(`doc:${r.id}`)) await add(`doc:${r.id}`, 0.5);
		}
		if (kinds.has("skill")) {
			const { results } = await this.db
				.prepare("SELECT id FROM skills WHERE user_id = ? AND (name LIKE ? OR description LIKE ?) LIMIT ?")
				.bind(this.u, like, like, limit)
				.all<{ id: string }>();
			for (const r of results) if (!hits.has(`skl:${r.id}`)) await add(`skl:${r.id}`, 0.5);
		}
		if (kinds.has("lesson")) {
			const { results } = await this.db
				.prepare("SELECT id FROM lessons WHERE user_id = ? AND (lesson LIKE ? OR context LIKE ?) LIMIT ?")
				.bind(this.u, like, like, limit)
				.all<{ id: string }>();
			for (const r of results) if (!hits.has(`les:${r.id}`)) await add(`les:${r.id}`, 0.5);
		}

		return [...hits.values()].sort((a, b) => b.score - a.score).slice(0, limit);
	}

	// ---------- whole-account operations ----------
	async counts() {
		const row = await this.db
			.prepare(
				`SELECT (SELECT COUNT(*) FROM memories WHERE user_id = ?1 AND status = 'active') AS memories,
				        (SELECT COUNT(*) FROM documents WHERE user_id = ?1) AS documents,
				        (SELECT COUNT(*) FROM lessons WHERE user_id = ?1 AND status = 'active') AS lessons,
				        (SELECT COUNT(*) FROM skills WHERE user_id = ?1) AS skills`,
			)
			.bind(this.u)
			.first<{ memories: number; documents: number; lessons: number; skills: number }>();
		return row ?? { memories: 0, documents: 0, lessons: 0, skills: 0 };
	}

	/** Everything the user owns, as plain JSON. Secrets (token hashes) are never included. */
	async exportAll() {
		const all = async <T>(sql: string) => (await this.db.prepare(sql).bind(this.u).all<T>()).results;
		return {
			exported_at: now(),
			format: "pepe/v1",
			settings: Object.fromEntries((await all<{ key: string; value: string }>("SELECT key, value FROM settings WHERE user_id = ?")).map((s) => [s.key, s.value])),
			exclusions: await all("SELECT id, rule, created_at FROM exclusions WHERE user_id = ? ORDER BY created_at"),
			memories: await all<Memory>("SELECT * FROM memories WHERE user_id = ? ORDER BY created_at"),
			documents: await all<Document>("SELECT * FROM documents WHERE user_id = ? ORDER BY created_at"),
			document_revisions: await all<DocumentRevision>("SELECT * FROM document_revisions WHERE user_id = ? ORDER BY replaced_at"),
			lessons: await all<Lesson>("SELECT * FROM lessons WHERE user_id = ? ORDER BY created_at"),
			skills: await all<Skill>("SELECT * FROM skills WHERE user_id = ? ORDER BY name"),
			activity: await all("SELECT at, actor, action, target, detail FROM activity WHERE user_id = ? ORDER BY at"),
		};
	}

	/** Removes every record and vector this user owns. The account row itself is handled by accounts.ts. */
	async deleteAllData() {
		const ids = async (sql: string, prefix: string) => (await this.db.prepare(sql).bind(this.u).all<{ id: string }>()).results.map((r) => `${prefix}:${r.id}`);
		const vectorIds = [
			...(await ids("SELECT id FROM memories WHERE user_id = ?", "mem")),
			...(await ids("SELECT id FROM documents WHERE user_id = ?", "doc")),
			...(await ids("SELECT id FROM lessons WHERE user_id = ?", "les")),
			...(await ids("SELECT id FROM skills WHERE user_id = ?", "skl")),
		];
		for (let i = 0; i < vectorIds.length; i += 500) await this.unindex(vectorIds.slice(i, i + 500));
		const tables = ["memories", "documents", "document_revisions", "lessons", "skills", "settings", "exclusions", "tombstones", "activity"];
		await this.db.batch(tables.map((t) => this.db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(this.u)));
	}
}
