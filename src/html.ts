import type { User } from "./accounts";

export const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const CSS = `
:root{--bg:#f7f7f5;--surface:#fff;--text:#1d1d1b;--muted:#6b6b66;--border:#e3e3de;--accent:#3b5bdb;--accent-text:#fff;--danger:#c92a2a;--warn-bg:#fff4e0;--ok-bg:#e6f4ea;--chip:#efefea;
font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--surface:#1f1f1d;--text:#ececea;--muted:#9a9a94;--border:#33332f;--accent:#7b93f0;--accent-text:#111;--danger:#ff6b6b;--warn-bg:#3a2e14;--ok-bg:#1d3324;--chip:#2a2a27}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);line-height:1.5}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
header{display:flex;gap:16px;align-items:center;padding:12px 24px;border-bottom:1px solid var(--border);background:var(--surface);flex-wrap:wrap}
header strong{margin-right:8px}header nav{display:flex;gap:14px;flex-wrap:wrap}header .spacer{flex:1}header .who{color:var(--muted);font-size:.85rem}
main{max-width:980px;margin:0 auto;padding:24px 16px}
h1{font-size:1.4rem;margin:0 0 12px}h2{font-size:1.1rem;margin:24px 0 8px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:12px}
.card h2:first-child{margin-top:0}
.narrow{max-width:440px;margin:8vh auto}
.list{display:flex;flex-direction:column;gap:8px}
.item{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px}
.item .meta,.muted{color:var(--muted);font-size:.85rem}
.chip{display:inline-block;background:var(--chip);border-radius:99px;padding:0 8px;font-size:.78rem;margin-right:4px}
.chip.ok{background:var(--ok-bg)}.chip.warn{background:var(--warn-bg)}
label{display:block;margin:10px 0;font-size:.9rem}label.check{display:flex;gap:8px;align-items:center}
input,select,textarea{width:100%;font:inherit;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);margin-top:4px}
input[type=checkbox]{width:auto;margin:0}
textarea{min-height:140px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.88rem}
textarea.tall{min-height:420px}
button{font:inherit;background:var(--accent);color:var(--accent-text);border:0;border-radius:6px;padding:8px 14px;cursor:pointer}
button.secondary{background:var(--chip);color:var(--text)}button.danger{background:var(--danger);color:#fff}button.small{padding:4px 10px;font-size:.85rem}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.grow{flex:1}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:640px){.grid2{grid-template-columns:1fr}}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:12px}
.stat{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 16px}.stat b{font-size:1.5rem;display:block}.stat span{color:var(--muted);font-size:.85rem}
.error{color:var(--danger)}.warn{background:var(--warn-bg);padding:8px 12px;border-radius:6px}.ok{background:var(--ok-bg);padding:8px 12px;border-radius:6px}
pre{white-space:pre-wrap;word-wrap:break-word;font-family:inherit;margin:0}
code,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.85rem;background:var(--chip);padding:1px 5px;border-radius:4px;word-break:break-all}
table{width:100%;border-collapse:collapse;font-size:.88rem}td,th{text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);vertical-align:top}
.table-wrap{overflow-x:auto}
form.inline{display:inline}
.center{text-align:center}
`;

export function layout(title: string, body: string, user?: User | null) {
	const nav = user
		? `<header><strong><a href="/ui" style="color:inherit">Context Layer</a></strong><nav><a href="/ui">Overview</a><a href="/ui/memories">Memories</a><a href="/ui/documents">Documents</a><a href="/ui/skills">Skills</a><a href="/ui/lessons">Lessons</a><a href="/ui/settings">Settings</a><a href="/ui/activity">Activity</a>${
				user.role === "admin" ? '<a href="/admin"><strong>Admin</strong></a>' : ""
			}</nav><span class="spacer"></span><span class="who">${escape(user.email)}</span><a href="/logout">Sign out</a></header>`
		: "";
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)} · Context Layer</title><style>${CSS}</style></head><body>
${nav}
<main>${body}</main></body></html>`;
}

export const htmlResponse = (body: string, status = 200, headers?: HeadersInit) => {
	const h = new Headers(headers);
	h.set("Content-Type", "text/html; charset=utf-8");
	return new Response(body, { status, headers: h });
};
export const redirect = (to: string, headers?: HeadersInit) => {
	const h = new Headers(headers);
	h.set("Location", to);
	return new Response(null, { status: 302, headers: h });
};
/** Same-origin check for state-changing form posts (in addition to SameSite=Lax cookies). */
export const sameOrigin = (request: Request) => {
	const origin = request.headers.get("Origin");
	return !origin || origin === new URL(request.url).origin;
};
