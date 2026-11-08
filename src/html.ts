import type { User } from "./accounts";
import { ARROW_UP_RIGHT, BASE_CSS, BTN, FONT_LINKS, LABEL, REPO_URL } from "./theme";

export const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// App shell in the landing page's language: a cell-based top nav, ruled section headers, 1px borders
// instead of cards, mono uppercase labels, black block buttons, no rounded corners.
const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 6l4 4 4-4' fill='none' stroke='%238a8a8a' stroke-width='1.4'/%3E%3C/svg%3E")`;

export const CSS = `${BASE_CSS}
/* Top nav: brand cell, page cells, user cell, sign-out cell */
.top{position:sticky;top:0;z-index:10;display:flex;align-items:stretch;min-height:48px;border-bottom:1px solid var(--border);background:var(--bg)}
.top a,.top .who{display:flex;align-items:center;gap:6px;padding:0 16px;${LABEL};font-size:11px;line-height:18px;white-space:nowrap}
.top .brand{font-family:var(--sans);font-size:var(--table);font-weight:500;text-transform:none;border-right:1px solid var(--border)}
.top nav{display:flex;align-items:stretch;overflow-x:auto;scrollbar-width:none}
.top nav::-webkit-scrollbar{display:none}
.top nav a+a{border-left:1px solid var(--border)}
.top nav a:hover{background:var(--bg-2)}
.top nav a.active{box-shadow:inset 0 -2px 0 var(--text)}
.top nav a svg{width:14px;height:14px;flex:none}
.top .spacer{flex:1}
.top .who{font-family:var(--sans);text-transform:none;letter-spacing:var(--wide);font-size:var(--xs);color:var(--text-3);border-left:1px solid var(--border)}
.top .out{border-left:1px solid var(--border)}
.top .out:hover{background:var(--bg-2)}

main{max-width:1100px;margin:0 auto;padding:36px}
h1{margin:0 0 12px;font-size:28px;font-weight:500;line-height:1.15;letter-spacing:-.02em}
h2{margin:24px 0 8px;font-size:var(--base);font-weight:400;line-height:18px}
h2.grow{margin:0}
.sh{margin:28px 0 16px}
.sh:first-child,.card .sh:first-child{margin-top:0}
.sh+h1{margin-top:4px}
p{margin:0 0 12px}
p:last-child{margin-bottom:0}
main a{border-bottom:1px solid var(--border)}
main a:hover{border-bottom-color:var(--text)}
main a.btn,.item>a,.sh a,td a{border-bottom:0}
.item>a strong{font-weight:500}
.item>a:hover strong{border-bottom:1px solid var(--text)}

.card{border:1px solid var(--border);padding:16px;margin-bottom:16px}
.card h2:first-child{margin-top:0}
.card>:last-child{margin-bottom:0}
.narrow{max-width:440px;margin:10vh auto;padding:24px}
.narrow h1{margin-bottom:8px}
.narrow .badge{margin-bottom:16px}
.narrow>p.muted:last-child{margin-top:16px}

.list{display:flex;flex-direction:column}
.item{border:1px solid var(--border);padding:12px 16px;min-width:0}
.item+.item{border-top:0}
.item pre{margin-top:6px}
.meta,.muted{color:var(--text-3);font-size:var(--xs);line-height:16px}
.item .meta{margin-top:8px;font-family:var(--mono);letter-spacing:0}
.chip{display:inline-block;margin:0 4px 0 0;padding:0 6px;border:1px solid var(--border);${LABEL};font-size:10px;line-height:16px;color:var(--text-3);vertical-align:2px}
.chip.ok{border-color:transparent;background:var(--ok-bg);color:var(--ok-fg)}
.chip.warn{border-color:transparent;background:var(--warn-bg);color:var(--warn-fg)}

label{display:flex;flex-direction:column;gap:6px;margin:12px 0;${LABEL};font-size:var(--xs);line-height:16px;color:var(--text-3)}
label.check{flex-direction:row;align-items:center;gap:8px;font-family:var(--sans);font-size:var(--table);line-height:18px;text-transform:none;color:var(--text)}
input,select,textarea{display:block;width:100%;margin:0;padding:8px 12px;border:1px solid var(--border);border-radius:0;background:transparent;color:var(--text);font:500 14px/20px var(--sans);letter-spacing:0;outline:0;appearance:none;-webkit-appearance:none}
input:focus,select:focus,textarea:focus{border-color:var(--text)}
input::placeholder{color:var(--text-3);font-weight:400}
input:disabled{color:var(--text-3)}
select{padding-right:32px;background-image:${CHEVRON};background-repeat:no-repeat;background-position:right 10px center;background-size:16px}
input[type=checkbox]{width:14px;height:14px;padding:0;appearance:auto;-webkit-appearance:auto;accent-color:var(--text)}
input[type=number]{-moz-appearance:textfield}
textarea{min-height:140px;font-family:var(--mono);font-size:var(--xs);line-height:18px;font-weight:400;resize:vertical}
textarea.tall{min-height:420px}
input.mono{font-family:var(--mono);font-size:var(--xs);font-weight:400;background:var(--bg-2);border-color:transparent;cursor:copy}
button{${BTN}}
button:hover{opacity:.85}
button.secondary{background:transparent;color:var(--text);box-shadow:inset 0 0 0 1px var(--border)}
button.secondary:hover{opacity:1;box-shadow:inset 0 0 0 1px var(--text)}
button.danger{background:transparent;color:var(--danger);box-shadow:inset 0 0 0 1px var(--danger)}
button.danger:hover{opacity:1;background:var(--danger);color:#fff}
button.small{padding:4px 10px;font-size:10.5px;line-height:16px}
form>button:last-child,form>.row:last-child{margin-top:4px}

.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.row>*{min-width:0}
main>form.row{margin-bottom:16px}
p.label{margin:0 0 8px}
.nowrap{white-space:nowrap}
.row label{margin:0}
.row input,.row select{width:auto}
.grow{flex:1 1 0}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--border);margin-bottom:16px}
.stat{padding:16px;border-right:1px solid var(--border);min-width:0}
.stat:last-child{border-right:0}
.stat b{display:block;margin-bottom:8px;font-size:28px;font-weight:500;line-height:1.1;letter-spacing:-.02em}
.stat span{${LABEL};font-size:var(--xs);line-height:16px;color:var(--text-3)}
a.stat{display:block;border-bottom:0}
a.stat:hover{background:var(--bg-2)}
.tabs{display:flex;flex-wrap:wrap;margin:0 0 16px;border-bottom:1px solid var(--border)}
.tabs a{padding:8px 14px;${LABEL};font-size:11px;line-height:18px;border-bottom:0}
.tabs a:hover{background:var(--bg-2)}
.tabs a.active{box-shadow:inset 0 -2px 0 var(--text)}
.kv th{width:1%;white-space:nowrap;padding-right:24px}

.error{color:var(--danger)}
p.error{margin:0 0 12px}
.warn:not(.chip){background:var(--warn-bg);color:var(--warn-fg);padding:12px 16px;margin:0 0 16px}
.ok:not(.chip){background:var(--ok-bg);color:var(--ok-fg);padding:12px 16px;margin:0 0 16px}
.warn .mono,.ok .mono{background:transparent;padding:0}
pre{margin:0;white-space:pre-wrap;word-wrap:break-word;font-family:inherit;font-size:var(--table);line-height:18px}
code,.mono{font-family:var(--mono);font-size:.92em;letter-spacing:0;background:var(--bg-2);padding:1px 5px;word-break:break-all}

table{width:100%;border-collapse:collapse}
td,th{text-align:left;padding:10px 12px;border-bottom:1px solid var(--border);vertical-align:top;font-size:var(--table);line-height:18px}
th{${LABEL};font-size:var(--xs);line-height:16px;color:var(--text-3)}
tr:last-child td{border-bottom:0}
td.row{display:table-cell}
td.row>*{display:inline-block;vertical-align:middle;margin:0 6px 4px 0}
td.row input{width:auto}
td.row details{display:block;margin:4px 0 0}
.table-wrap{overflow-x:auto}
form.inline{display:inline-block;vertical-align:middle}
.center{text-align:center}
details>summary{cursor:pointer;color:var(--text-3);${LABEL};font-size:var(--xs);line-height:16px}
details[open]>summary{margin-bottom:12px}

@media (max-width:760px){
main{padding:24px 16px}
.top{flex-wrap:wrap}.top .brand{flex:1;border-right:0}.top .spacer{display:none}.top .who{display:none}
.top nav{order:3;flex:0 0 100%;border-top:1px solid var(--border)}.top nav a:first-child{border-left:0}.top a{padding:0 12px}
.grid2{grid-template-columns:1fr}
.stats{grid-template-columns:1fr 1fr}.stat:nth-child(2n){border-right:0}.stat:nth-child(-n+2){border-bottom:1px solid var(--border)}
.narrow{margin:24px auto}
.sh{flex-wrap:wrap}
}
`;

/** Ruled section header, like the landing page's "Readme ———" rows. `extra` sits at the right end of the rule. */
export const sh = (title: string, extra = "", tag: "h1" | "h2" = "h2") => `<div class="sh"><${tag}>${escape(title)}</${tag}><span class="line"></span>${extra}</div>`;
/** Small mono label above a detail-page title ("Memory", "Document", …). */
export const eyebrow = (text: string) => `<div class="sh"><span class="t">${escape(text)}</span><span class="line"></span></div>`;

const NAV: Array<[string, string]> = [
	["/ui", "Overview"],
	["/ui/memory", "Memory"],
	["/ui/activity", "Activity"],
	["/ui/settings", "Settings"],
];

export function layout(title: string, body: string, user?: User | null, current = "") {
	const isActive = (href: string) => (href === "/ui" ? current === "/ui" : current === href || current.startsWith(href + "/"));
	const header = user
		? `<header class="top"><a class="brand" href="/ui">Context Layer</a><nav aria-label="App">${NAV.map(([href, label]) => `<a href="${href}"${isActive(href) ? ' class="active"' : ""}>${label}</a>`).join("")}${
				user.role === "admin" ? `<a href="/admin"${isActive("/admin") ? ' class="active"' : ""}>Admin</a>` : ""
			}</nav><span class="spacer"></span><span class="who">${escape(user.email)}</span><a class="out" href="/logout">Sign out</a></header>`
		: `<header class="top"><a class="brand" href="/">Context Layer</a><span class="spacer"></span><nav aria-label="Site"><a href="/setup">Docs</a><a href="${REPO_URL}" rel="noopener">GitHub ${ARROW_UP_RIGHT}</a><a href="/login"${current === "/login" ? ' class="active"' : ""}>Sign in</a></nav></header>`;
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)} · Context Layer</title>
${FONT_LINKS}
<style>${CSS}</style></head><body>
${header}
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
