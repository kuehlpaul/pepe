// Docs-style HTML shell for /setup — modeled on Notion's Mintlify prompt page
// (developers.notion.com/prompts/setup): top bar, sidebar, article, on-this-page TOC.
import { marked } from "marked";
import { escape } from "./html";
import { SETUP_PUBLISHED, SETUP_VERSION, setupMarkdown } from "./setup";

type ParsedSetup = {
	title: string;
	description: string;
	note: string;
	bodyMarkdown: string;
};

function slugify(text: string) {
	return text
		.toLowerCase()
		.replace(/<[^>]+>/g, "")
		.replace(/&[a-z#0-9]+;/gi, "")
		.replace(/[^a-z0-9\s-]/g, "")
		.trim()
		.replace(/\s+/g, "-")
		.slice(0, 80);
}

function parseSetupMarkdown(md: string): ParsedSetup {
	const lines = md.replace(/\r\n/g, "\n").split("\n");
	let title = "Set up the Personal Context Layer for your agent";
	let description = "";
	let note = "";
	let i = 0;

	while (i < lines.length && !lines[i].trim()) i++;
	if (lines[i]?.startsWith("# ")) {
		title = lines[i].slice(2).trim();
		i++;
	}
	while (i < lines.length && !lines[i].trim()) i++;

	if (lines[i]?.startsWith(">") && !lines[i].includes("[!")) {
		const parts: string[] = [];
		while (i < lines.length && lines[i].startsWith(">")) {
			parts.push(lines[i].replace(/^>\s?/, ""));
			i++;
		}
		description = parts.join(" ").trim();
		while (i < lines.length && !lines[i].trim()) i++;
	}

	if (lines[i]?.match(/^>\s*\[!NOTE\]/i)) {
		i++;
		const parts: string[] = [];
		while (i < lines.length && lines[i].startsWith(">")) {
			parts.push(lines[i].replace(/^>\s?/, ""));
			i++;
		}
		note = parts.join("\n").trim();
		while (i < lines.length && !lines[i].trim()) i++;
	}

	return { title, description, note, bodyMarkdown: lines.slice(i).join("\n").trim() };
}

function extractToc(html: string): { id: string; text: string; level: 2 | 3 }[] {
	const toc: { id: string; text: string; level: 2 | 3 }[] = [];
	const re = /<h([23])\s+id="([^"]+)">([\s\S]*?)<\/h\1>/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(html))) {
		toc.push({
			level: Number(m[1]) as 2 | 3,
			id: m[2],
			text: m[3].replace(/<[^>]+>/g, "").trim(),
		});
	}
	return toc;
}

function renderMarkdown(md: string): string {
	const renderer = new marked.Renderer();

	renderer.heading = function (token) {
		const text = this.parser.parseInline(token.tokens);
		const id = slugify(text);
		const level = Math.min(Math.max(token.depth, 2), 4);
		const plain = text.replace(/<[^>]+>/g, "");
		return `<h${level} id="${id}"><a class="anchor" href="#${id}" aria-label="Navigate to header: ${escape(plain)}">${text}</a></h${level}>\n`;
	};

	renderer.code = function ({ text, lang }) {
		const language = (lang || "txt").replace(/[^a-z0-9+-]/gi, "") || "txt";
		return `<div class="code-block"><div class="code-toolbar"><span class="code-lang">${escape(language)}</span><button type="button" class="copy-code" data-copy>Copy</button></div><pre><code class="language-${escape(language)}">${escape(text)}</code></pre></div>\n`;
	};

	renderer.table = function (token) {
		const th = token.header.map((cell) => `<th>${this.parser.parseInline(cell.tokens)}</th>`).join("");
		const body = token.rows
			.map((row) => `<tr>${row.map((cell) => `<td>${this.parser.parseInline(cell.tokens)}</td>`).join("")}</tr>`)
			.join("\n");
		return `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>\n${body}\n</tbody></table></div>\n`;
	};

	renderer.blockquote = function (token) {
		return `<blockquote>${this.parser.parse(token.tokens)}</blockquote>\n`;
	};

	return marked.parse(md, { async: false, gfm: true, breaks: false, renderer }) as string;
}

const CSS = `
:root{
  --bg:#ffffff;--bg-sidebar:#fafafa;--bg-elevated:#f5f5f5;--bg-code:#f7f7f5;
  --text:#0f0f0f;--text-2:#5c5c5c;--text-3:#8a8a8a;
  --border:#e8e8e8;--border-strong:#d4d4d4;
  --accent:#2383e2;--callout-bg:#f7f6f3;--callout-border:#e3e2e0;
  --radius:10px;--font:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;
  color-scheme:light dark;
}
@media (prefers-color-scheme:dark){
  :root{
    --bg:#0f0f0f;--bg-sidebar:#0f0f0f;--bg-elevated:#1a1a1a;--bg-code:#171717;
    --text:#ededed;--text-2:#a3a3a3;--text-3:#737373;
    --border:#262626;--border-strong:#333;
    --accent:#59a8f7;--callout-bg:#171717;--callout-border:#2a2a2a;
  }
}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;font-family:var(--font);background:var(--bg);color:var(--text);line-height:1.65;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.topbar{position:sticky;top:0;z-index:40;display:flex;align-items:center;gap:16px;padding:0 20px;height:56px;border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(10px)}
.brand{display:flex;align-items:center;gap:10px;color:var(--text);font-weight:600;font-size:.95rem;text-decoration:none}
.brand:hover{text-decoration:none}
.brand-mark{width:22px;height:22px;border-radius:5px;background:var(--text);color:var(--bg);display:grid;place-items:center;font-size:.7rem;font-weight:700}
.top-links{display:flex;gap:18px;margin-left:12px;font-size:.875rem;height:100%;align-items:stretch}
.top-links a{color:var(--text-2);display:flex;align-items:center;border-bottom:2px solid transparent;padding:0 2px}
.top-links a.active{color:var(--text);border-bottom-color:var(--text);text-decoration:none}
.top-actions{margin-left:auto;display:flex;gap:8px;align-items:center}
.btn{appearance:none;border:1px solid var(--border-strong);background:var(--bg-elevated);color:var(--text);border-radius:8px;padding:6px 12px;font:inherit;font-size:.8125rem;cursor:pointer;display:inline-flex;align-items:center;gap:6px;text-decoration:none}
.btn:hover{border-color:var(--text-3);text-decoration:none}.btn.primary{background:var(--text);color:var(--bg);border-color:transparent}
.layout{display:grid;grid-template-columns:240px minmax(0,1fr) 220px;min-height:calc(100vh - 56px)}
.sidebar{position:sticky;top:56px;align-self:start;height:calc(100vh - 56px);overflow:auto;padding:20px 14px;border-right:1px solid var(--border);background:var(--bg-sidebar)}
.sidebar h2{font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin:0 0 10px 10px;font-weight:600}
.nav-pill{display:block;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:.8125rem;font-weight:500;margin-bottom:8px}
.nav-pill:hover{text-decoration:none;border-color:var(--border-strong)}
.side-link{display:block;padding:6px 10px;border-radius:6px;color:var(--text-2);font-size:.8125rem}
.side-link:hover,.side-link.active{background:var(--bg-elevated);color:var(--text);text-decoration:none}
.main{min-width:0;padding:36px 48px 80px;max-width:820px}
.eyebrow{font-size:.8125rem;color:var(--text-3);margin:0 0 8px}
h1{font-size:2rem;line-height:1.2;letter-spacing:-.02em;margin:0 0 10px;font-weight:700}
.lede{font-size:1.05rem;color:var(--text-2);margin:0 0 18px;max-width:46rem}
.hero-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:22px}
.callout{display:flex;gap:12px;padding:14px 16px;border:1px solid var(--callout-border);background:var(--callout-bg);border-radius:var(--radius);margin:0 0 28px;color:var(--text-2);font-size:.925rem}
.callout-icon{flex:0 0 auto;width:20px;height:20px;border-radius:50%;border:1.5px solid var(--text-3);display:grid;place-items:center;font-size:.7rem;font-weight:700;color:var(--text);margin-top:2px}
.callout p{margin:0 0 .55rem}.callout p:last-child{margin:0}
.prose h2{font-size:1.35rem;margin:2.4rem 0 .75rem;letter-spacing:-.01em;scroll-margin-top:80px}
.prose h3{font-size:1.1rem;margin:1.8rem 0 .55rem;scroll-margin-top:80px}
.prose h4{font-size:1rem;margin:1.4rem 0 .4rem;scroll-margin-top:80px}
.prose .anchor{color:inherit}.prose .anchor:hover{text-decoration:none;color:var(--accent)}
.prose p,.prose li{color:var(--text-2);font-size:.95rem}
.prose strong{color:var(--text);font-weight:600}
.prose ul,.prose ol{padding-left:1.25rem}
.prose li{margin:.35rem 0}
.prose hr{border:0;border-top:1px solid var(--border);margin:2rem 0}
.prose blockquote{margin:1rem 0;padding:.75rem 1rem;border-left:3px solid var(--border-strong);background:var(--bg-elevated);border-radius:0 8px 8px 0;color:var(--text-2)}
.prose blockquote p{margin:.35rem 0}
.prose code{font-family:var(--mono);font-size:.84em;background:var(--bg-elevated);padding:.1em .35em;border-radius:4px;border:1px solid var(--border)}
.table-wrap{overflow:auto;border:1px solid var(--border);border-radius:var(--radius);margin:1rem 0 1.4rem}
.prose table{width:100%;border-collapse:collapse;font-size:.875rem}
.prose th,.prose td{text-align:left;padding:10px 14px;border-bottom:1px solid var(--border);vertical-align:top}
.prose th{color:var(--text-3);font-weight:500;background:var(--bg-elevated)}
.prose tr:last-child td{border-bottom:0}
.prose td{color:var(--text-2)}.prose td:first-child{color:var(--text);font-weight:500}
.code-block{margin:1rem 0 1.4rem;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;background:var(--bg-code)}
.code-toolbar{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border);font-size:.75rem;color:var(--text-3)}
.copy-code{border:0;background:transparent;color:var(--text-2);font:inherit;font-size:.75rem;cursor:pointer;padding:2px 6px;border-radius:4px}
.copy-code:hover{background:var(--bg-elevated);color:var(--text)}
.code-block pre{margin:0;padding:14px 16px;overflow:auto}
.code-block code{font-family:var(--mono);font-size:.8125rem;line-height:1.55;background:transparent;border:0;padding:0;color:var(--text);white-space:pre}
.toc{position:sticky;top:56px;align-self:start;height:calc(100vh - 56px);overflow:auto;padding:28px 16px;border-left:1px solid var(--border)}
.toc h2{font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin:0 0 12px;font-weight:600}
.toc a{display:block;padding:4px 0 4px 10px;border-left:2px solid transparent;color:var(--text-3);font-size:.8rem;line-height:1.35}
.toc a:hover{color:var(--text);text-decoration:none}
.toc a.depth-3{padding-left:20px}
.toc a.active{color:var(--text);border-left-color:var(--accent)}
.footer-note{margin-top:48px;padding-top:20px;border-top:1px solid var(--border);font-size:.8125rem;color:var(--text-3)}
@media (max-width:1100px){.layout{grid-template-columns:220px minmax(0,1fr)}.toc{display:none}}
@media (max-width:820px){
  .layout{grid-template-columns:1fr}.sidebar{display:none}
  .main{padding:28px 18px 64px}.top-links{display:none}h1{font-size:1.65rem}
}
`;

const SCRIPT = `
(() => {
  const md = document.getElementById('setup-markdown')?.textContent ?? '';
  document.querySelectorAll('[data-copy-page]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(md);
        const prev = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = prev; }, 1500);
      } catch {}
    });
  });
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const code = btn.closest('.code-block')?.querySelector('code')?.textContent ?? '';
      try {
        await navigator.clipboard.writeText(code);
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
      } catch {}
    });
  });
  const links = [...document.querySelectorAll('.toc a')];
  const map = links.map((a) => ({ a, id: a.getAttribute('href')?.slice(1) })).filter((x) => x.id);
  const obs = new IntersectionObserver((entries) => {
    const visible = entries.filter((e) => e.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    links.forEach((l) => l.classList.remove('active'));
    const hit = map.find((m) => m.id === visible.target.id);
    hit?.a.classList.add('active');
  }, { rootMargin: '-20% 0px -65% 0px', threshold: [0, .25, .5, 1] });
  map.forEach((m) => { const el = document.getElementById(m.id); if (el) obs.observe(el); });
})();
`;

export function setupPageHtml(baseUrl: string): string {
	const base = baseUrl.replace(/\/$/, "");
	const markdown = setupMarkdown(base);
	const parsed = parseSetupMarkdown(markdown);
	const bodyHtml = renderMarkdown(parsed.bodyMarkdown);
	const toc = extractToc(bodyHtml);
	const tocHtml = toc
		.map((t) => `<a class="depth-${t.level}" href="#${t.id}">${escape(t.text)}</a>`)
		.join("\n");

	const noteBlock = parsed.note
		? `<aside class="callout"><span class="callout-icon" aria-hidden="true">i</span><div>${parsed.note
				.split(/\n\n+/)
				.map((p) => `<p>${escape(p).replace(/\n/g, "<br>")}</p>`)
				.join("")}</div></aside>`
		: "";

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${escape(parsed.title)} · Context Layer</title>
<meta name="description" content="${escape(parsed.description || "Set up the Personal Context Layer as durable, shared context for your agents.")}">
<meta name="x-setup-version" content="${escape(SETUP_VERSION)}">
<link rel="alternate" type="text/markdown" href="${escape(base)}/setup.md">
<style>${CSS}</style>
</head>
<body>
<header class="topbar">
  <a class="brand" href="${escape(base)}/setup"><span class="brand-mark">CL</span> Context Layer Docs</a>
  <nav class="top-links" aria-label="Sections">
    <a class="active" href="${escape(base)}/setup">Prompts</a>
    <a href="${escape(base)}/ui">App</a>
    <a href="${escape(base)}/setup.md">Markdown</a>
  </nav>
  <div class="top-actions">
    <a class="btn" href="${escape(base)}/setup.md">Raw .md</a>
    <button type="button" class="btn primary" data-copy-page>Copy page</button>
  </div>
</header>
<div class="layout">
  <aside class="sidebar" aria-label="Sidebar">
    <h2>Prompts</h2>
    <a class="nav-pill" href="${escape(base)}/setup">Set up Context Layer for your agent</a>
    <a class="side-link active" href="${escape(base)}/setup">Setup prompt</a>
    <a class="side-link" href="#changelog">Changelog</a>
  </aside>
  <main class="main" id="content">
    <p class="eyebrow">Set up Context Layer for your agent</p>
    <h1>${escape(parsed.title)}</h1>
    ${parsed.description ? `<p class="lede">${escape(parsed.description)}</p>` : ""}
    <div class="hero-actions">
      <button type="button" class="btn" data-copy-page>Copy page</button>
      <a class="btn" href="${escape(base)}/setup.md">View as Markdown</a>
    </div>
    ${noteBlock}
    <div class="prose">
      ${bodyHtml}
    </div>
    <p class="footer-note">Version ${escape(SETUP_VERSION)} · Published ${escape(SETUP_PUBLISHED)} · Agents can also fetch <a href="${escape(base)}/setup.md">/setup.md</a></p>
  </main>
  <aside class="toc" aria-label="On this page">
    <h2>On this page</h2>
    ${tocHtml}
  </aside>
</div>
<script type="text/plain" id="setup-markdown">${markdown.replace(/<\/script/gi, "<\\/script")}</script>
<script>${SCRIPT}</script>
</body>
</html>`;
}
