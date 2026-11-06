// Accounts: users, passwords, sessions, waitlist, invites, password resets, personal API tokens.
// Access is invite-only: an account can only be created with a valid invite code, or by the
// configured ADMIN_EMAIL (which bootstraps the first admin and claims legacy single-owner data).
import { env } from "cloudflare:workers";
import { Store, newId, sha256 } from "./store";

export interface User {
	id: string;
	email: string;
	name: string;
	role: "admin" | "member";
	status: "active" | "disabled";
	invite_id: string | null;
	created_at: string;
	last_login_at: string | null;
}

export interface WaitlistEntry {
	id: string;
	email: string;
	name: string | null;
	reason: string | null;
	status: "pending" | "invited" | "joined" | "declined";
	created_at: string;
	updated_at: string;
}

export interface Invite {
	id: string;
	code: string;
	email: string | null;
	note: string | null;
	max_uses: number;
	uses: number;
	created_by: string;
	created_at: string;
	expires_at: string | null;
	revoked_at: string | null;
}

/** user_id value of rows written before accounts existed (migration 0003). */
export const LEGACY_OWNER = "owner";
const SESSION_COOKIE = "pcl_session";
const SESSION_TTL_S = 60 * 60 * 24 * 14;
const PBKDF2_ITERATIONS = 100_000; // Workers cap PBKDF2 at 100k iterations

const E = () => env as Env;
const db = () => E().DB;
if (!E().SESSION_SECRET || E().SESSION_SECRET.length < 32) throw new Error("SESSION_SECRET must be set and at least 32 characters (wrangler secret put SESSION_SECRET)");
const now = () => new Date().toISOString();
const enc = (s: string) => new TextEncoder().encode(s);
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export const normalizeEmail = (email: unknown) => String(email ?? "").trim().toLowerCase();
export const isEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
export const publicUrl = () => E().PUBLIC_URL.replace(/\/$/, "");
export const randomToken = (bytes = 24) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
	if (a.byteLength !== b.byteLength) return false;
	return crypto.subtle.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------- passwords

export const MIN_PASSWORD_LENGTH = 10;

async function derive(password: string, salt: Uint8Array, iterations: number) {
	const key = await crypto.subtle.importKey("raw", enc(password), "PBKDF2", false, ["deriveBits"]);
	const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
	return new Uint8Array(bits);
}

export async function hashPassword(password: string) {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const hash = await derive(password, salt, PBKDF2_ITERATIONS);
	return `pbkdf2$${PBKDF2_ITERATIONS}$${b64url(salt)}$${b64url(hash)}`;
}

export async function verifyPassword(password: string, stored: string) {
	const [scheme, iter, salt, hash] = stored.split("$");
	if (scheme !== "pbkdf2" || !iter || !salt || !hash) return false;
	const actual = await derive(password, fromB64url(salt), Number(iter));
	return timingSafeEqual(actual, fromB64url(hash));
}

// ---------------------------------------------------------------- users

const USER_COLUMNS = "id, email, name, role, status, invite_id, created_at, last_login_at";

export async function getUser(id: string) {
	return db().prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(id).first<User>();
}

export async function getUserByEmail(email: string) {
	return db().prepare(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`).bind(normalizeEmail(email)).first<User>();
}

export async function listUsers() {
	const { results } = await db()
		.prepare(
			`SELECT u.${USER_COLUMNS.replaceAll(", ", ", u.")},
			   (SELECT COUNT(*) FROM memories m WHERE m.user_id = u.id AND m.status = 'active') AS memories,
			   (SELECT COUNT(*) FROM documents d WHERE d.user_id = u.id) AS documents,
			   (SELECT MAX(at) FROM activity a WHERE a.user_id = u.id AND a.actor != 'web-ui' AND a.actor != 'daily-loop') AS last_agent_activity
			 FROM users u ORDER BY created_at DESC`,
		)
		.all<User & { memories: number; documents: number; last_agent_activity: string | null }>();
	return results;
}

export async function adminUserId(): Promise<string | null> {
	const row = await db().prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1").first<{ id: string }>();
	return row?.id ?? null;
}

/** Instance-wide values (not per user). */
export async function getInstanceValue(key: string) {
	const row = await db().prepare("SELECT value FROM instance WHERE key = ?").bind(key).first<{ value: string }>();
	return row?.value ?? null;
}
export async function setInstanceValue(key: string, value: string | null) {
	if (value === null) await db().prepare("DELETE FROM instance WHERE key = ?").bind(key).run();
	else await db().prepare("INSERT INTO instance (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(key, value, now()).run();
}
/** The account that adopted the single-owner data; OAuth grants issued before accounts existed belong to it. */
export const LEGACY_OWNER_KEY = "legacy_owner_user_id";
export const legacyOwnerUserId = () => getInstanceValue(LEGACY_OWNER_KEY);

export const isConfiguredAdmin = (email: string) => !!E().ADMIN_EMAIL && normalizeEmail(email) === normalizeEmail(E().ADMIN_EMAIL);

const DEFAULT_ABOUT = "Not set up yet. Edit this in Settings, or share the setup page with an agent: who you are, your role, current projects, how you like to work.";
const DEFAULT_GUIDE = `# Agent Operating Guide

Version 0.1.0

## Where things live
- Memories: \`remember\` / \`update_memory\` (durable facts, preferences, decisions, project state)
- Documents: \`save_document\` (plans, specs, research, notes)
- Skills: \`list_skills\` / \`get_skill\`

## User preferences
Not recorded yet.

## Version history
- 0.1.0 — initial setup`;

/**
 * Creates an account. Caller has already validated the invite (or the admin bootstrap).
 * The configured admin email becomes an admin and claims rows written before accounts existed.
 */
export async function createUser(input: { email: string; name: string; password: string; inviteId?: string }, ctx?: ExecutionContext) {
	const email = normalizeEmail(input.email);
	const id = newId("usr");
	const admin = isConfiguredAdmin(email);
	await db()
		.prepare("INSERT INTO users (id, email, name, password_hash, role, invite_id) VALUES (?, ?, ?, ?, ?, ?)")
		.bind(id, email, input.name.trim().slice(0, 120), await hashPassword(input.password), admin ? "admin" : "member", input.inviteId ?? null)
		.run();

	if (admin) {
		const claimed = await claimLegacyData(id);
		if (claimed && ctx) ctx.waitUntil(new Store(E(), id, "system").reindexAll());
	}
	await db().batch([
		db().prepare("INSERT OR IGNORE INTO settings (user_id, key, value) VALUES (?, 'about', ?)").bind(id, DEFAULT_ABOUT),
		db().prepare("INSERT OR IGNORE INTO settings (user_id, key, value) VALUES (?, 'guide', ?)").bind(id, DEFAULT_GUIDE),
		db().prepare("UPDATE waitlist SET status = 'joined', updated_at = ? WHERE email = ?").bind(now(), email),
	]);
	await new Store(E(), id, "web-ui").log("signup", id, email);
	return (await getUser(id))!;
}

/** Moves rows from the pre-accounts era to the first admin. Returns true if anything was moved. */
async function claimLegacyData(userId: string) {
	const tables = ["memories", "documents", "document_revisions", "lessons", "exclusions", "api_tokens", "activity", "skills", "settings", "tombstones"];
	const results = await db().batch(tables.map((t) => db().prepare(`UPDATE ${t} SET user_id = ? WHERE user_id = ?`).bind(userId, LEGACY_OWNER)));
	const claimed = results.some((r) => (r.meta.changes ?? 0) > 0);
	// Bind the legacy OAuth grants to this exact account, once; never re-resolved from roles later.
	if (claimed && !(await legacyOwnerUserId())) await setInstanceValue(LEGACY_OWNER_KEY, userId);
	return claimed;
}

export async function updateUser(id: string, patch: Partial<Pick<User, "name" | "role" | "status">>) {
	const u = await getUser(id);
	if (!u) return null;
	const merged = { ...u, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as User;
	await db().prepare("UPDATE users SET name = ?, role = ?, status = ? WHERE id = ?").bind(merged.name, merged.role, merged.status, id).run();
	return merged;
}

/** Also bumps session_version, so every existing session cookie for this user stops working. */
export async function setPassword(userId: string, password: string) {
	await db().batch([
		db().prepare("UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?").bind(await hashPassword(password), userId),
		db().prepare("DELETE FROM password_resets WHERE user_id = ?").bind(userId),
	]);
}

export async function checkPassword(userId: string, password: string) {
	const row = await db().prepare("SELECT password_hash FROM users WHERE id = ?").bind(userId).first<{ password_hash: string }>();
	return !!row && (await verifyPassword(password, row.password_hash));
}

/** Everything the user owns in D1 and Vectorize. Irreversible. OAuth grants are revoked by deleteAccount in auth.ts, which calls this. */
export async function deleteUserRows(userId: string) {
	await new Store(E(), userId, "web-ui").deleteAllData();
	await db().batch([
		db().prepare("DELETE FROM api_tokens WHERE user_id = ?").bind(userId),
		db().prepare("DELETE FROM password_resets WHERE user_id = ?").bind(userId),
		db().prepare("DELETE FROM users WHERE id = ?").bind(userId),
	]);
	if ((await legacyOwnerUserId()) === userId) await setInstanceValue(LEGACY_OWNER_KEY, null);
}

// ---------------------------------------------------------------- login + sessions

/** Returns the user on success, null otherwise. Disabled accounts cannot sign in. */
export async function authenticate(email: string, password: string): Promise<User | null> {
	const row = await db()
		.prepare(`SELECT ${USER_COLUMNS}, password_hash FROM users WHERE email = ?`)
		.bind(normalizeEmail(email))
		.first<User & { password_hash: string }>();
	// Verify against a dummy hash when the user is unknown so timing does not reveal account existence.
	const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
	if (!row || !ok || row.status !== "active") return null;
	await db().prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(now(), row.id).run();
	const { password_hash: _, ...user } = row;
	return user;
}
const DUMMY_HASH = "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

async function hmac(data: string) {
	const key = await crypto.subtle.importKey("raw", enc(E().SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc(data))));
}

export async function sessionCookie(userId: string) {
	const row = await db().prepare("SELECT session_version FROM users WHERE id = ?").bind(userId).first<{ session_version: number }>();
	const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_S;
	const payload = `${userId}.${exp}.${row?.session_version ?? 1}`;
	return `${SESSION_COOKIE}=${payload}.${await hmac(payload)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_S}`;
}

export const clearSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/** The signed-in, active user for this request, or null. */
export async function currentUser(request: Request): Promise<User | null> {
	const match = (request.headers.get("Cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
	if (!match) return null;
	const [userId, exp, version, sig] = match[1].split(".");
	if (!userId || !exp || !version || !sig || Number(exp) < Date.now() / 1000) return null;
	if (!timingSafeEqual(enc(sig), enc(await hmac(`${userId}.${exp}.${version}`)))) return null;
	const user = await db().prepare(`SELECT ${USER_COLUMNS}, session_version FROM users WHERE id = ?`).bind(userId).first<User & { session_version: number }>();
	if (!user || user.status !== "active" || String(user.session_version) !== version) return null; // password changed → old cookies die
	const { session_version: _, ...rest } = user;
	return rest;
}

// ---------------------------------------------------------------- waitlist

export async function joinWaitlist(input: { email: string; name?: string; reason?: string }) {
	const email = normalizeEmail(input.email);
	await db()
		.prepare(
			`INSERT INTO waitlist (id, email, name, reason) VALUES (?, ?, ?, ?)
			 ON CONFLICT(email) DO UPDATE SET name = COALESCE(waitlist.name, excluded.name), reason = COALESCE(waitlist.reason, excluded.reason), updated_at = ?`,
		)
		.bind(newId("wl"), email, input.name?.trim().slice(0, 120) || null, input.reason?.trim().slice(0, 1000) || null, now())
		.run();
}

export async function listWaitlist() {
	const { results } = await db()
		.prepare("SELECT * FROM waitlist ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'invited' THEN 1 WHEN 'joined' THEN 2 ELSE 3 END, created_at")
		.all<WaitlistEntry>();
	return results;
}

export async function setWaitlistStatus(id: string, status: WaitlistEntry["status"]) {
	await db().prepare("UPDATE waitlist SET status = ?, updated_at = ? WHERE id = ?").bind(status, now(), id).run();
}

export async function deleteWaitlistEntry(id: string) {
	await db().prepare("DELETE FROM waitlist WHERE id = ?").bind(id).run();
}

// ---------------------------------------------------------------- invites

export async function createInvite(input: { createdBy: string; email?: string; note?: string; maxUses?: number; expiresInDays?: number }) {
	const id = newId("inv");
	const code = randomToken(18);
	const email = input.email ? normalizeEmail(input.email) : null;
	const expires = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86400_000).toISOString() : null;
	await db()
		.prepare("INSERT INTO invites (id, code, email, note, max_uses, created_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
		.bind(id, code, email, input.note?.trim().slice(0, 300) || null, Math.max(1, input.maxUses ?? 1), input.createdBy, expires)
		.run();
	if (email) await db().prepare("UPDATE waitlist SET status = 'invited', updated_at = ? WHERE email = ? AND status = 'pending'").bind(now(), email).run();
	return (await getInvite(id))!;
}

export async function getInvite(id: string) {
	return db().prepare("SELECT * FROM invites WHERE id = ?").bind(id).first<Invite>();
}

export async function getInviteByCode(code: string) {
	if (!code || code.length > 64) return null;
	return db().prepare("SELECT * FROM invites WHERE code = ?").bind(code).first<Invite>();
}

export async function listInvites() {
	const { results } = await db().prepare("SELECT * FROM invites ORDER BY created_at DESC LIMIT 200").all<Invite>();
	return results;
}

export async function revokeInvite(id: string) {
	await db().prepare("UPDATE invites SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").bind(now(), id).run();
}

export const inviteLink = (invite: Invite) => `${publicUrl()}/join?code=${encodeURIComponent(invite.code)}`;

/** Why an invite cannot be used right now, or null if it can. */
export function inviteProblem(invite: Invite | null, email?: string): string | null {
	if (!invite) return "This invite link is not valid.";
	if (invite.revoked_at) return "This invite has been revoked.";
	if (invite.expires_at && invite.expires_at < now()) return "This invite has expired.";
	if (invite.uses >= invite.max_uses) return "This invite has already been used.";
	if (email && invite.email && invite.email !== normalizeEmail(email)) return "This invite was issued for a different email address.";
	return null;
}

/** Atomically consumes one use. Returns false if the invite was exhausted in the meantime. */
export async function consumeInvite(id: string) {
	const r = await db()
		.prepare("UPDATE invites SET uses = uses + 1 WHERE id = ? AND uses < max_uses AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)")
		.bind(id, now())
		.run();
	return (r.meta.changes ?? 0) > 0;
}

// ---------------------------------------------------------------- password resets

export async function createPasswordReset(userId: string, ttlHours = 24) {
	const token = randomToken(24);
	await db()
		.prepare("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
		.bind(await sha256(token), userId, new Date(Date.now() + ttlHours * 3600_000).toISOString())
		.run();
	return `${publicUrl()}/reset?token=${encodeURIComponent(token)}`;
}

export async function userForResetToken(token: string): Promise<User | null> {
	if (!token || token.length > 64) return null;
	const row = await db()
		.prepare("SELECT user_id FROM password_resets WHERE token_hash = ? AND expires_at > ?")
		.bind(await sha256(token), now())
		.first<{ user_id: string }>();
	return row ? getUser(row.user_id) : null;
}

// ---------------------------------------------------------------- personal API tokens

export async function createApiToken(userId: string, name: string) {
	const raw = crypto.getRandomValues(new Uint8Array(32));
	const token = `pcl_${[...raw].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
	const id = newId("tok");
	await db()
		.prepare("INSERT INTO api_tokens (id, user_id, name, token_hash, prefix) VALUES (?, ?, ?, ?, ?)")
		.bind(id, userId, name.trim().slice(0, 80), await sha256(token), token.slice(0, 10))
		.run();
	await new Store(E(), userId, "web-ui").log("create_token", id, name);
	return token; // shown once, never stored in plain text
}

export async function listApiTokens(userId: string) {
	const { results } = await db()
		.prepare("SELECT id, name, prefix, created_at, last_used_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC")
		.bind(userId)
		.all<{ id: string; name: string; prefix: string; created_at: string; last_used_at: string | null }>();
	return results;
}

export async function revokeApiToken(userId: string, id: string) {
	await db().prepare("DELETE FROM api_tokens WHERE id = ? AND user_id = ?").bind(id, userId).run();
	await new Store(E(), userId, "web-ui").log("revoke_token", id);
}

/** Resolves a `pcl_…` token to its active owner. */
export async function userForApiToken(token: string) {
	const row = await db()
		.prepare("SELECT t.id, t.name, t.user_id FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ? AND u.status = 'active'")
		.bind(await sha256(token))
		.first<{ id: string; name: string; user_id: string }>();
	if (!row) return null;
	await db().prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ?").bind(now(), row.id).run();
	return row;
}

// ---------------------------------------------------------------- email (optional)

/** Email sending is optional: without it, invite and reset links are copied and sent by the admin. */
export const emailConfigured = () => !!(E().RESEND_API_KEY && E().EMAIL_FROM);

export async function sendEmail(to: string, subject: string, text: string) {
	if (!emailConfigured()) throw new Error("Email sending is not configured (RESEND_API_KEY + EMAIL_FROM).");
	const res = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: { Authorization: `Bearer ${E().RESEND_API_KEY}`, "Content-Type": "application/json" },
		body: JSON.stringify({ from: E().EMAIL_FROM, to: [to], subject, text }),
	});
	if (!res.ok) throw new Error(`Email failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
}
