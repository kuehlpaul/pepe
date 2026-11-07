// Public start page: what the product is, and the waitlist form. No personal data is shown here.
// Layout follows the "New Design" artboard in the Paper file "Context Layer – Screens & UI":
// a sticky left panel (badge, headline, waitlist form) and a scrolling right column with a
// three-cell nav, ruled section headers, a 1px-bordered feature grid and an infrastructure table.
import { escape } from "./html";
import { isEmail, joinWaitlist, normalizeEmail } from "./accounts";

const CSS = `
:root{--bg:#fff;--bg-2:#f7f7f5;--text:#0f0f0f;--text-2:#5c5c5c;--text-3:#8a8a8a;--border:#e8e8e8;--ok-bg:#e6f4ea;--ok-fg:#1e4620;--danger:#c92a2a;
--sans:Geist,Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--mono:"Geist Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
--xs:12.5px;--table:14px;--base:16px;--h2:17.6px;--display:48px;--wide:.04em;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#0f0f0f;--bg-2:#171717;--text:#ededed;--text-2:#a3a3a3;--text-3:#737373;--border:#262626;--ok-bg:#1d3324;--ok-fg:#c8e6cf;--danger:#ff6b6b}}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;font-family:var(--sans);font-size:var(--table);line-height:18px;letter-spacing:var(--wide);background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
a{color:inherit;text-decoration:none}
.mono{font-family:var(--mono);font-weight:500;text-transform:uppercase;letter-spacing:var(--wide)}

/* Split layout: 40% sticky panel | 1px rule | 60% content */
.page{display:flex;align-items:stretch;min-height:100vh}
.panel{flex:1 1 40%;position:sticky;top:0;height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;gap:16px;padding:16px 32px;overflow:hidden}
.rule-v{flex:0 0 1px;background:var(--border)}
.content{flex:0 0 60%;width:60%;display:flex;flex-direction:column}

/* Left panel */
.badge{display:inline-flex;align-items:center;gap:8px;padding:4px 12px;border-radius:99px;background:var(--bg-2);font-size:var(--xs);line-height:18px}
.badge .dim{color:var(--text-3)}
.badge .sep{width:1px;height:12px;background:var(--text)}
.badge b{font-weight:500;display:inline-flex;align-items:center;gap:4px}
.badge svg{width:16px;height:16px;flex:none}
h1{margin:0;padding-top:16px;max-width:454px;font-size:var(--display);font-weight:500;line-height:1.1;letter-spacing:-.03em}
.form{display:flex;align-items:center;gap:24px;padding-top:16px;flex-wrap:wrap}
.field{position:relative;width:250px;max-width:100%}
.field::before{content:"";position:absolute;left:-6px;right:-6px;top:0;bottom:0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);pointer-events:none}
.field::after{content:"";position:absolute;top:-6px;bottom:-6px;left:0;right:0;border-left:1px solid var(--border);border-right:1px solid var(--border);pointer-events:none}
.field .plus{position:absolute;right:-10px;bottom:-10px;width:8px;height:8px;font:8px/8px var(--mono);color:var(--border);text-align:center;pointer-events:none}
.field input{display:block;width:100%;margin:0;padding:8px 20px;border:0;background:transparent;color:var(--text);font:500 14px/20px var(--sans);letter-spacing:0;outline:0}
.field input::placeholder{color:var(--text-3)}
.btn{display:inline-flex;align-items:center;gap:4px;padding:8px 16px;border:0;background:var(--text);color:var(--bg);font-family:var(--mono);font-size:11px;font-weight:500;line-height:18px;letter-spacing:var(--wide);text-transform:uppercase;cursor:pointer;white-space:nowrap}
.btn:hover{opacity:.85}
.hint{margin:0;font-size:var(--xs);line-height:16px;color:var(--text-3);max-width:454px}
.hint.err{color:var(--danger)}
.hp{position:absolute;left:-9999px;opacity:0;height:0;width:0}
.ok{margin-top:16px;max-width:454px;padding:12px 16px;background:var(--ok-bg);color:var(--ok-fg);font-size:var(--table);line-height:18px}
.ok b{font-weight:500}

/* Right column: nav */
.nav{display:flex;align-items:stretch;border-bottom:1px solid var(--border)}
.nav a{flex:1 1 0;display:flex;align-items:center;justify-content:center;gap:16px;padding:16px;font-size:var(--table);line-height:18px}
.nav a+a{border-left:1px solid var(--border)}
.nav a:hover{background:var(--bg-2)}
.nav a.cta,.nav a.cta:hover{background:var(--text);color:var(--bg)}
.nav svg{width:16px;height:16px;flex:none}

/* Right column: sections */
.body{display:flex;flex-direction:column;gap:36px;padding:36px}
section{display:flex;flex-direction:column;gap:24px}
.sh{display:flex;align-items:center;gap:16px}
.sh h2{margin:0;font-size:var(--h2);line-height:18px;white-space:nowrap}
.sh .line{flex:1;height:1px;background:var(--border)}
section p{margin:0;font-size:var(--table);line-height:18px}
section p+p{margin-top:8px}
code{font-family:var(--mono);font-size:.92em;letter-spacing:0;background:var(--bg-2);padding:1px 5px}


.grid{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--border)}
.cell{display:flex;flex-direction:column;gap:8px;padding:16px 16px 56px;min-width:0;border-right:1px solid var(--border);border-bottom:1px solid var(--border)}
.cell:nth-child(3n){border-right:0}
.cell:nth-last-child(-n+3){border-bottom:0}
.cell .n{font-family:var(--mono);font-size:var(--table);line-height:18px;color:var(--text-3)}
.cell h3{margin:0;font-size:var(--base);font-weight:400;line-height:18px}
.cell p{font-size:var(--xs);line-height:16px;color:var(--text-3)}

pre{margin:0;padding:12px 16px;border:1px solid var(--border);background:var(--bg-2);font-family:var(--mono);font-size:var(--xs);line-height:18px;letter-spacing:0;overflow-x:auto;white-space:pre}
.two{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--border)}
.two>div{display:flex;flex-direction:column;gap:12px;padding:16px;min-width:0}
.two>div+div{border-left:1px solid var(--border)}
.two .tag{font-family:var(--mono);font-size:var(--xs);line-height:18px;color:var(--text-3);text-transform:uppercase;letter-spacing:var(--wide)}
.two h3{margin:0;font-size:var(--base);font-weight:400;line-height:18px}
.two p{color:var(--text-2)}
.two .cta{margin-top:auto;display:inline-flex;align-items:center;gap:4px;align-self:flex-start;font-family:var(--mono);font-size:11px;font-weight:500;line-height:18px;letter-spacing:var(--wide);text-transform:uppercase;border-bottom:1px solid var(--text)}
.two .cta svg{width:16px;height:16px}
.table{border:1px solid var(--border)}
.tr{display:grid;grid-template-columns:180px 1fr;border-bottom:1px solid var(--border)}
.tr:last-child{border-bottom:0}
.tr>*{padding:12px 16px;font-size:var(--table);line-height:18px}
.tr .k{font-family:var(--mono);color:var(--text-3);border-right:1px solid var(--border)}
.tr .v{color:var(--text)}

footer{display:flex;flex-wrap:wrap;gap:8px 24px;padding:16px 36px 36px;font-family:var(--mono);font-size:var(--xs);line-height:18px;letter-spacing:var(--wide);text-transform:uppercase;color:var(--text-3);border-top:1px solid var(--border)}
footer a:hover{color:var(--text)}

@media (max-width:1100px){.grid{grid-template-columns:repeat(2,1fr)}.cell:nth-child(3n){border-right:1px solid var(--border)}.cell:nth-child(2n){border-right:0}.cell:nth-last-child(-n+3){border-bottom:1px solid var(--border)}.cell:nth-last-child(-n+2){border-bottom:0}}
@media (max-width:900px){
.page{flex-direction:column}
.panel{position:static;height:auto;min-height:min(60vh,560px);padding:56px 24px 48px}
.rule-v{flex:0 0 1px;height:1px;width:100%}
.content{flex:1 1 auto;width:100%}
.body{padding:24px 16px;gap:28px}
.nav a{padding:14px 6px;font-size:11px;gap:6px}
.two{grid-template-columns:1fr}.two>div+div{border-left:0;border-top:1px solid var(--border)}
.grid{grid-template-columns:1fr}.cell{border-right:0!important;border-bottom:1px solid var(--border)!important}.cell:last-child{border-bottom:0!important}
.tr{grid-template-columns:120px 1fr}
footer{padding:16px 16px 32px}
}
@media (max-width:480px){h1{font-size:36px}.form{gap:20px}.field{width:100%}.tr{grid-template-columns:1fr}.tr .k{border-right:0;border-bottom:1px solid var(--border);padding-bottom:8px}.tr .v{padding-top:8px}}
`;

export const REPO_URL = "https://github.com/kuehlpaul/personal-context-layer";

const ARROW_RIGHT = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.787 8.667H2.667V7.333h8.12L7.053 3.6 8 2.667l5.333 5.333L8 13.333l-.947-.933 3.734-3.733Z" fill="currentColor"/></svg>`;
const ARROW_UP_RIGHT = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.267 12 3.333 11.067 9.733 4.667H4V3.333h8v8h-1.333V5.6L4.267 12Z" fill="currentColor"/></svg>`;

const FEATURES: Array<[string, string]> = [
	["Memories", "Preferences, facts, decisions and the people around you. One fact per memory, with source and date. Superseded instead of overwritten, so history stays."],
	["Documents", "Plans, specs, research and meeting notes in Markdown. Every edit is versioned with which agent wrote it, and older versions stay readable."],
	["Lessons", "When you correct an agent, the correction becomes guidance every other agent receives the moment it connects. Mistakes are made once."],
	["Skills", "Reusable, SKILL.md-style instructions. Any agent lists them, loads the one that applies to the task and follows it."],
	["Search", "Semantic search over everything you've stored, plus keyword fallback. Agents call it before working on anything personal."],
	["Your rules", "Tell it what must never be stored. Forgotten content is blocked from being re-saved. Every write by every agent is logged and editable."],
];

const INFRA: Array<[string, string]> = [
	["Protocol", "Remote MCP over Streamable HTTP. Works with any MCP-capable agent, no plugin required."],
	["Auth", "OAuth 2.1 with dynamic client registration. Clients without OAuth use a personal token bound to your account."],
	["Runtime", "One Cloudflare Worker serves the MCP endpoint, the web app and this page. No servers to keep alive."],
	["Storage", "Cloudflare D1 for memories, documents, skills and the activity log. Every row is scoped to your account."],
	["Search", "Cloudflare Vectorize with one namespace per user, embeddings from Workers AI (bge-m3)."],
	["Isolation", "Per-user data isolation, independently audited. Disabling an account revokes every session, token and grant at once."],
	["Source", "Open source on GitHub. Self-host it on your own Cloudflare account, read every line that touches your data, or send a pull request."],
	["Exit", "Export everything as JSON or delete the account and all its data in one click. Nothing is kept."],
];

export function landingHtml(base: string, state: { joined?: boolean; error?: string; email?: string } = {}) {
	const form = state.joined
		? `<div class="ok" id="waitlist"><b>You're on the list.</b> Invites go out in small batches. When it's your turn you'll get a personal link to create your account.</div>`
		: `<form class="form" id="waitlist" method="post" action="/waitlist">
			<label class="field"><span class="plus">+</span><input id="email" type="email" name="email" placeholder="Your Email" value="${escape(state.email)}" autocomplete="email" required aria-label="Your email"></label>
			<label class="hp" aria-hidden="true">Website <input name="website" tabindex="-1" autocomplete="off"></label>
			<button class="btn" type="submit">Join waitlist</button>
		</form>
		${state.error ? `<p class="hint err">${escape(state.error)}</p>` : `<p class="hint">Hosted beta is invite-only while we're small. No newsletter, no sharing of your email. Prefer to run it yourself? <a href="${REPO_URL}" style="color:var(--text);border-bottom:1px solid var(--border)">It's open source.</a></p>`}`;

	const features = FEATURES.map(([title, text], i) => `<div class="cell"><span class="n">${String(i + 1).padStart(2, "0")}</span><h3>${escape(title)}</h3><p>${escape(text)}</p></div>`).join("");
	const infra = INFRA.map(([k, v]) => `<div class="tr"><div class="k">${escape(k)}</div><div class="v">${escape(v)}</div></div>`).join("");

	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Context Layer · One memory for every AI agent you use</title>
<meta name="description" content="A personal context layer: one remote MCP server that gives Claude, ChatGPT, Cursor, Claude Code and any other agent the same durable memory about you. You own the data.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500&family=Geist+Mono:wght@400;500&display=swap">
<style>${CSS}</style></head><body>
<div class="page">
<aside class="panel">
<span class="badge"><span class="dim">Private beta</span><span class="sep"></span><b>Invite only ${ARROW_RIGHT}</b></span>
<h1>One memory for every AI agent.</h1>
${form}
</aside>
<div class="rule-v"></div>
<main class="content">
<nav class="nav mono" aria-label="Page">
<a href="#readme">Readme</a>
<a href="${escape(base)}/setup">Docs</a>
<a href="${REPO_URL}" rel="noopener">GitHub ${ARROW_UP_RIGHT}</a>
<a href="#waitlist" class="cta" id="nav-waitlist">Waitlist ${ARROW_UP_RIGHT}</a>
</nav>
<div class="body">

<section id="readme">
<div class="sh"><h2 class="mono">Readme</h2><span class="line"></span></div>
<div>
<p>Context Layer is a personal memory that Claude, ChatGPT, Cursor, Claude Code and any other MCP-capable agent can read and write. Switch tools without re-explaining yourself: what one agent learned, the next one knows. Your context stays yours, not the vendor's.</p>
<p>It's open source. Run the hosted version (invite-only beta, join the waitlist) or deploy your own copy on your Cloudflare account in a few minutes. Same code, same features, either way the data is yours.</p>
<p>Connect an agent in one step by sharing the setup guide with it. It connects over MCP with OAuth, installs a short set of custom instructions and knows when to read and when to save. From then on every session starts with <code>get_context</code> and <code>search</code>, and ends with what's worth remembering.</p>
</div>
</section>

<section id="get-it">
<div class="sh"><h2 class="mono">Hosted or self-hosted</h2><span class="line"></span></div>
<div class="two">
<div><span class="tag">01 · Hosted</span><h3>Use the hosted version</h3><p>We run it on Cloudflare. Accounts are isolated, every write is logged, and you can export or delete everything at any time. Invite-only while the beta is small.</p><a class="cta" href="#waitlist">Join the waitlist ${ARROW_RIGHT}</a></div>
<div><span class="tag">02 · Self-hosted</span><h3>Deploy your own</h3><p>Clone the repository, create the Cloudflare resources listed in the README and deploy. Your account, your Worker, your data.</p><pre>git clone ${REPO_URL}.git
cd personal-context-layer &amp;&amp; npm install
npx wrangler deploy</pre><a class="cta" href="${REPO_URL}" rel="noopener">View on GitHub ${ARROW_UP_RIGHT}</a></div>
</div>
</section>

<section id="features">
<div class="sh"><h2 class="mono">Features</h2><span class="line"></span></div>
<div class="grid">${features}</div>
</section>

<section id="infrastructure">
<div class="sh"><h2 class="mono">Infrastructure</h2><span class="line"></span></div>
<div class="table">${infra}</div>
</section>

</div>
<footer><span>Context Layer</span><a href="${escape(base)}/setup">Setup guide for agents</a><a href="${REPO_URL}" rel="noopener">GitHub</a><a href="/login">Sign in</a></footer>
</main>
</div>
<script>document.getElementById('nav-waitlist').addEventListener('click',function(e){var i=document.getElementById('email');if(i){e.preventDefault();i.scrollIntoView({behavior:'smooth',block:'center'});i.focus({preventScroll:true})}});</script>
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
