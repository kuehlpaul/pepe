// Public start page: what the product is, and the waitlist form. No personal data is shown here.
import { escape } from "./html";
import { isEmail, joinWaitlist, normalizeEmail } from "./accounts";

const CSS = `
:root{--bg:#fff;--bg-2:#f7f7f5;--text:#0f0f0f;--text-2:#5c5c5c;--text-3:#8a8a8a;--border:#e8e8e8;--accent:#0f0f0f;--accent-fg:#fff;--ok-bg:#e6f4ea;--ok-fg:#1e4620;
--font:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--mono:ui-monospace,SFMono-Regular,Menlo,monospace;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#0f0f0f;--bg-2:#171717;--text:#ededed;--text-2:#a3a3a3;--text-3:#737373;--border:#262626;--accent:#ededed;--accent-fg:#0f0f0f;--ok-bg:#1d3324;--ok-fg:#c8e6cf}}
*{box-sizing:border-box}body{margin:0;font-family:var(--font);background:var(--bg);color:var(--text);line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:inherit}
.top{display:flex;align-items:center;gap:16px;padding:0 24px;height:60px;border-bottom:1px solid var(--border)}
.brand{display:flex;align-items:center;gap:10px;font-weight:600;text-decoration:none}
.mark{width:24px;height:24px;border-radius:6px;background:var(--text);color:var(--bg);display:grid;place-items:center;font-size:.7rem;font-weight:700}
.top nav{margin-left:auto;display:flex;gap:18px;font-size:.9rem}.top nav a{color:var(--text-2);text-decoration:none}.top nav a:hover{color:var(--text)}
.wrap{max-width:860px;margin:0 auto;padding:0 20px}
.hero{padding:72px 0 40px}
.eyebrow{display:inline-block;font-size:.78rem;letter-spacing:.04em;text-transform:uppercase;color:var(--text-3);border:1px solid var(--border);border-radius:99px;padding:3px 10px;margin-bottom:18px}
h1{font-size:clamp(2rem,5vw,3rem);line-height:1.1;letter-spacing:-.03em;margin:0 0 16px;font-weight:700}
.lede{font-size:1.15rem;color:var(--text-2);max-width:40rem;margin:0 0 28px}
.form{display:flex;flex-direction:column;gap:10px;max-width:34rem}
.form .row{display:flex;gap:8px;flex-wrap:wrap}
input,textarea{font:inherit;padding:11px 14px;border:1px solid var(--border);border-radius:9px;background:var(--bg-2);color:var(--text);width:100%}
input:focus,textarea:focus{outline:2px solid var(--text);outline-offset:1px}
.row input{flex:1;min-width:200px}
textarea{min-height:70px;resize:vertical}
button{font:inherit;font-weight:600;padding:11px 18px;border:0;border-radius:9px;background:var(--accent);color:var(--accent-fg);cursor:pointer;white-space:nowrap}
.hint{font-size:.85rem;color:var(--text-3);margin:4px 0 0}
.ok{background:var(--ok-bg);color:var(--ok-fg);padding:14px 16px;border-radius:9px;max-width:34rem}
.hp{position:absolute;left:-9999px;opacity:0;height:0;width:0}
section{padding:36px 0;border-top:1px solid var(--border)}
h2{font-size:1.35rem;letter-spacing:-.01em;margin:0 0 18px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.card{border:1px solid var(--border);border-radius:12px;padding:16px 18px;background:var(--bg-2)}
.card h3{margin:0 0 6px;font-size:1rem}.card p{margin:0;color:var(--text-2);font-size:.92rem}
.step{display:flex;gap:14px}.num{flex:0 0 28px;height:28px;border-radius:50%;border:1px solid var(--border);display:grid;place-items:center;font-size:.8rem;font-weight:600}
.steps{display:flex;flex-direction:column;gap:16px;max-width:44rem}.step p{margin:2px 0 0;color:var(--text-2)}
.logos{display:flex;flex-wrap:wrap;gap:8px}.logo{border:1px solid var(--border);border-radius:99px;padding:4px 12px;font-size:.85rem;color:var(--text-2)}
code{font-family:var(--mono);font-size:.85em;background:var(--bg-2);border:1px solid var(--border);padding:.1em .35em;border-radius:4px}
footer{padding:28px 0 48px;color:var(--text-3);font-size:.85rem;border-top:1px solid var(--border)}
footer a{color:var(--text-2)}
`;

export function landingHtml(base: string, state: { joined?: boolean; error?: string; email?: string } = {}) {
	const form = state.joined
		? `<div class="ok"><strong>You're on the list.</strong> Invites go out in small batches. When it's your turn you'll get a personal link to create your account.</div>`
		: `<form class="form" method="post" action="/waitlist">
			${state.error ? `<p class="hint" style="color:#c92a2a">${escape(state.error)}</p>` : ""}
			<div class="row"><input type="email" name="email" placeholder="you@example.com" value="${escape(state.email)}" autocomplete="email" required><button>Request an invite</button></div>
			<textarea name="reason" placeholder="Optional: which agents do you use, and what would you want them to remember?"></textarea>
			<label class="hp" aria-hidden="true">Website <input name="website" tabindex="-1" autocomplete="off"></label>
			<p class="hint">Invite-only while we're small. No newsletter, no sharing of your email.</p>
		</form>`;

	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Context Layer · One memory for every AI agent you use</title>
<meta name="description" content="A personal context layer: one remote MCP server that gives Claude, ChatGPT, Cursor, Claude Code and any other agent the same durable memory about you. You own the data.">
<style>${CSS}</style></head><body>
<header class="top"><a class="brand" href="/"><span class="mark">CL</span> Context Layer</a><nav><a href="${escape(base)}/setup">Setup guide</a><a href="/login">Sign in</a></nav></header>
<main class="wrap">
<div class="hero">
<span class="eyebrow">Private beta · invite only</span>
<h1>One memory for every AI agent you use.</h1>
<p class="lede">Context Layer is a personal memory that Claude, ChatGPT, Cursor, Claude Code and any other MCP-capable agent can read and write. Switch tools without re-explaining yourself. Your context stays yours, not the vendor's.</p>
${form}
</div>

<section><h2>How it works</h2>
<div class="steps">
<div class="step"><span class="num">1</span><div><strong>Connect any agent in one step.</strong><p>Share the setup page with your agent. It connects over MCP with OAuth, installs a short set of custom instructions, and knows when to read and when to save.</p></div></div>
<div class="step"><span class="num">2</span><div><strong>Agents remember what matters.</strong><p>Decisions and why you made them, preferences, project state, lessons from mistakes, reusable skills, plans and research. One fact per memory, with source and date.</p></div></div>
<div class="step"><span class="num">3</span><div><strong>Every next session starts smarter.</strong><p>Any agent calls <code>get_context</code> and <code>search</code> before working on something personal. What one tool learned, the next one knows.</p></div></div>
</div></section>

<section><h2>What it stores</h2>
<div class="grid">
<div class="card"><h3>Memories</h3><p>Preferences, facts, decisions, people, corrections. Superseded instead of overwritten, so history stays.</p></div>
<div class="card"><h3>Documents</h3><p>Plans, specs, research, meeting notes. Every edit is versioned with which agent wrote it.</p></div>
<div class="card"><h3>Lessons</h3><p>When you correct an agent, the correction becomes guidance every other agent gets on connect.</p></div>
<div class="card"><h3>Skills</h3><p>Reusable instructions any agent can load when they apply to the task.</p></div>
</div></section>

<section><h2>Works with</h2>
<div class="logos"><span class="logo">Claude</span><span class="logo">Claude Code</span><span class="logo">ChatGPT</span><span class="logo">Cursor</span><span class="logo">Any MCP client</span></div>
<p style="color:var(--text-2);margin-top:14px">Remote MCP over Streamable HTTP with OAuth 2.1. Clients without OAuth use a personal token.</p></section>

<section><h2>You own it</h2>
<div class="grid">
<div class="card"><h3>Nothing hidden</h3><p>Every write by every agent is logged. Review, edit and delete anything in the web app.</p></div>
<div class="card"><h3>Exclusions &amp; forget</h3><p>Tell it what must never be stored. Forgotten content is blocked from being re-saved.</p></div>
<div class="card"><h3>Export &amp; delete</h3><p>Download everything as JSON or delete your account and all data, any time, in one click.</p></div>
</div></section>
</main>
<footer class="wrap">Context Layer · <a href="${escape(base)}/setup">Setup guide for agents</a> · <a href="/login">Sign in</a></footer>
</body></html>`;
}

export async function handleWaitlist(request: Request, base: string): Promise<Response> {
	if (request.method !== "POST") return Response.redirect(`${base}/`, 302);
	const form = await request.formData();
	// Honeypot: real browsers leave this hidden field empty; bots usually fill every field.
	if (String(form.get("website") ?? "")) return Response.redirect(`${base}/?joined=1`, 302);
	const email = normalizeEmail(form.get("email"));
	if (!isEmail(email)) {
		return new Response(landingHtml(base, { error: "Please enter a valid email address.", email }), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
	}
	await joinWaitlist({ email, reason: String(form.get("reason") ?? "") });
	return Response.redirect(`${base}/?joined=1`, 302);
}
