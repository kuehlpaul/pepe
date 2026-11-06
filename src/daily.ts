// Daily maintenance (Cron), once per active account. Read-only on content: it reports, it never merges or deletes on its own.
import { authorizationServer } from "./auth";
import { Store, type Memory } from "./store";

const REPORT_TITLE = "Daily maintenance report";

export async function runDaily(env: Env) {
	const { results: users } = await env.DB.prepare("SELECT id FROM users WHERE status = 'active'").all<{ id: string }>();
	for (const u of users) {
		try {
			await runDailyFor(env, u.id);
		} catch (err) {
			console.error("daily failed for user", u.id, String(err));
		}
	}
	// Housekeeping across the whole instance: expired OAuth grants/tokens and stale reset links.
	try {
		const purged = await authorizationServer.purgeExpiredData(env);
		await env.DB.prepare("DELETE FROM password_resets WHERE expires_at < ?").bind(new Date().toISOString()).run();
		console.log("daily: purge", JSON.stringify(purged));
	} catch (err) {
		console.error("daily: purge failed", String(err));
	}
}

async function runDailyFor(env: Env, userId: string) {
	const store = new Store(env, userId, "daily-loop");
	const since = new Date(Date.now() - 26 * 3600 * 1000).toISOString();

	// Nothing changed in the last day → no report churn for idle accounts.
	const changed = await env.DB.prepare("SELECT * FROM memories WHERE user_id = ? AND status='active' AND updated_at >= ? LIMIT 200").bind(userId, since).all<Memory>();
	const activity = await env.DB.prepare("SELECT actor, action, COUNT(*) AS n FROM activity WHERE user_id = ? AND at >= ? AND actor != 'daily-loop' GROUP BY actor, action ORDER BY n DESC")
		.bind(userId, since)
		.all<{ actor: string; action: string; n: number }>();
	if (!changed.results.length && !activity.results.length) return;

	// 1. Possible duplicates among memories changed since the last run.
	const dupes: string[] = [];
	const seen = new Set<string>();
	for (const m of changed.results) {
		for (const s of await store.findSimilarMemories(`${m.topic}\n${m.content}`, 0.9)) {
			const key = [m.id, s.id].sort().join("|");
			if (s.id === m.id || seen.has(key)) continue;
			seen.add(key);
			dupes.push(`- [${m.topic}](/ui/memories/${m.id}) ↔ [${s.topic}](/ui/memories/${s.id}) (similarity ${s.score.toFixed(2)})`);
		}
	}

	// 2. Unconfirmed memories older than 90 days: worth confirming or archiving.
	const staleBefore = new Date(Date.now() - 90 * 86400 * 1000).toISOString();
	const { results: stale } = await env.DB.prepare(
		"SELECT id, topic, confidence FROM memories WHERE user_id = ? AND status='active' AND confidence != 'confirmed' AND updated_at < ? ORDER BY updated_at LIMIT 30",
	)
		.bind(userId, staleBefore)
		.all<{ id: string; topic: string; confidence: string }>();

	const today = new Date().toISOString().slice(0, 10);
	const report = `# ${REPORT_TITLE}

Last run: ${today}

## Possible duplicates (${dupes.length})
${dupes.join("\n") || "None found."}

## Unconfirmed memories older than 90 days (${stale.length})
${stale.map((s) => `- [${s.topic}](/ui/memories/${s.id}) — ${s.confidence}`).join("\n") || "None."}

## Activity in the last 24h
${activity.results.map((a) => `- ${a.actor}: ${a.action} × ${a.n}`).join("\n") || "No changes."}
`;

	const existing = await env.DB.prepare("SELECT id FROM documents WHERE user_id = ? AND title = ? LIMIT 1").bind(userId, REPORT_TITLE).first<{ id: string }>();
	await store.saveDocument({ id: existing?.id, title: REPORT_TITLE, content: report, kind: "other", tags: ["maintenance"] });
}
