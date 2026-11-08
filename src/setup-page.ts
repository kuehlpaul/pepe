// Docs-style HTML shell for /setup — modeled on Notion's Mintlify prompt page
// (developers.notion.com/prompts/setup): top bar, sidebar, article, on-this-page TOC.
import { marked } from "marked";
import { escape } from "./html";
import { ARROW_UP_RIGHT, BASE_CSS, FONT_LINKS, LABEL, REPO_URL, LOGO } from "./theme";
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
	let title = "Set up Pepe for your agent";
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

const CSS = `${BASE_CSS}
body{line-height:20px}
/* Top bar: brand cell, section cells, actions as cells */
.topbar{position:sticky;top:0;z-index:40;display:flex;align-items:stretch;min-height:48px;border-bottom:1px solid var(--border);background:var(--bg)}
.brand{display:flex;align-items:center;gap:10px;padding:0 16px;border-right:1px solid var(--border);font-weight:500;white-space:nowrap}
.brand-mark{width:22px;height:22px;display:block;flex:none}
.brand-mark svg{display:block;width:100%;height:100%}
.top-links{display:flex;align-items:stretch}
.top-links a{display:flex;align-items:center;padding:0 16px;border-right:1px solid var(--border);${LABEL};font-size:11px;color:var(--text-2)}
.top-links a svg{width:14px;height:14px;margin-left:6px}
.top-links a:hover{background:var(--bg-2);color:var(--text)}
.top-links a.active{color:var(--text);box-shadow:inset 0 -2px 0 var(--text)}
.top-actions{margin-left:auto;display:flex;align-items:stretch}
.top-actions a,.top-actions button{display:flex;align-items:center;gap:6px;padding:0 16px;border:0;border-left:1px solid var(--border);background:transparent;color:var(--text);${LABEL};font-size:11px;cursor:pointer;white-space:nowrap}
.top-actions a:hover,.top-actions button:hover{background:var(--bg-2)}
.top-actions .primary,.top-actions .primary:hover{background:var(--text);color:var(--bg)}

.layout{display:grid;grid-template-columns:240px minmax(0,1fr) 220px;min-height:calc(100vh - 48px)}
.sidebar{position:sticky;top:48px;align-self:start;height:calc(100vh - 48px);overflow:auto;padding:24px 16px;border-right:1px solid var(--border)}
.sidebar h2{margin:0 0 12px;${LABEL};font-size:var(--xs);line-height:16px;color:var(--text-3)}
.nav-pill{display:block;padding:10px 12px;margin-bottom:12px;border:1px solid var(--border);font-size:var(--table);line-height:18px}
.nav-pill:hover{border-color:var(--text)}
.side-link{display:block;padding:6px 12px;color:var(--text-2);font-size:var(--xs);line-height:16px}
.side-link:hover,.side-link.active{background:var(--bg-2);color:var(--text)}

.main{min-width:0;padding:36px 48px 80px;max-width:860px}
.eyebrow{margin:0 0 12px;${LABEL};font-size:var(--xs);line-height:16px;color:var(--text-3)}
h1{margin:0 0 12px;font-size:40px;font-weight:500;line-height:1.1;letter-spacing:-.03em}
.lede{margin:0 0 20px;max-width:46rem;font-size:var(--base);line-height:24px;color:var(--text-2)}
.hero-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:28px}
.callout{display:flex;gap:12px;margin:0 0 36px;padding:14px 16px;border:1px solid var(--border);background:var(--bg-2);color:var(--text-2)}
.callout-icon{flex:0 0 auto;width:18px;height:18px;margin-top:1px;display:grid;place-items:center;border:1px solid var(--text-3);font:500 10px/1 var(--mono);color:var(--text)}
.callout p{margin:0 0 .55rem}.callout p:last-child{margin:0}

.prose h2{display:flex;align-items:center;gap:16px;margin:40px 0 16px;${LABEL};font-size:var(--h2);line-height:18px;scroll-margin-top:72px}
.prose h2::after{content:"";flex:1;height:1px;background:var(--border)}
.prose h3{margin:28px 0 8px;font-size:var(--base);font-weight:500;line-height:20px;scroll-margin-top:72px}
.prose h4{margin:20px 0 6px;font-size:var(--table);font-weight:500;line-height:18px;scroll-margin-top:72px}
.prose .anchor{color:inherit}.prose h2 .anchor:hover,.prose h3 .anchor:hover,.prose h4 .anchor:hover{border-bottom:1px solid var(--text)}
.prose p,.prose li{margin:0 0 12px;font-size:var(--table);line-height:22px;color:var(--text-2)}
.prose a{border-bottom:1px solid var(--border)}.prose a:hover{border-bottom-color:var(--text)}
.prose strong{color:var(--text);font-weight:500}
.prose ul,.prose ol{margin:0 0 16px;padding-left:1.25rem}
.prose li{margin:.3rem 0}
.prose hr{border:0;border-top:1px solid var(--border);margin:32px 0}
.prose blockquote{margin:16px 0;padding:12px 16px;border:1px solid var(--border);border-left:2px solid var(--text);color:var(--text-2)}
.prose blockquote p{margin:.3rem 0}
.prose code{font-family:var(--mono);font-size:.92em;letter-spacing:0;background:var(--bg-2);padding:1px 5px;color:var(--text)}
.table-wrap{overflow:auto;margin:16px 0 24px;border:1px solid var(--border)}
.prose table{width:100%;border-collapse:collapse}
.prose th,.prose td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--border);vertical-align:top;font-size:var(--table);line-height:18px}
.prose th{${LABEL};font-size:var(--xs);line-height:16px;color:var(--text-3)}
.prose tr:last-child td{border-bottom:0}
.prose td{color:var(--text-2)}.prose td:first-child{color:var(--text);font-family:var(--mono);font-size:var(--xs);letter-spacing:0}
.code-block{margin:16px 0 24px;border:1px solid var(--border);background:var(--bg-2)}
.code-toolbar{display:flex;justify-content:space-between;align-items:center;padding:6px 6px 6px 12px;border-bottom:1px solid var(--border)}
.code-lang{${LABEL};font-size:10.5px;line-height:16px;color:var(--text-3)}
.copy-code{border:0;background:transparent;color:var(--text-2);${LABEL};font-size:10.5px;line-height:16px;cursor:pointer;padding:4px 8px}
.copy-code:hover{background:var(--bg);color:var(--text)}
.code-block pre{margin:0;padding:14px 16px;overflow:auto}
.code-block code{font-family:var(--mono);font-size:var(--xs);line-height:18px;letter-spacing:0;background:transparent;padding:0;color:var(--text);white-space:pre}

.toc{position:sticky;top:48px;align-self:start;height:calc(100vh - 48px);overflow:auto;padding:24px 16px;border-left:1px solid var(--border)}
.toc h2{margin:0 0 12px;${LABEL};font-size:var(--xs);line-height:16px;color:var(--text-3)}
.toc a{display:block;padding:4px 0 4px 12px;border-left:1px solid var(--border);color:var(--text-3);font-size:var(--xs);line-height:16px}
.toc a:hover{color:var(--text)}
.toc a.depth-3{padding-left:24px}
.toc a.active{color:var(--text);border-left-color:var(--text)}
.footer-note{margin-top:48px;padding-top:20px;border-top:1px solid var(--border);font-size:var(--xs);line-height:16px;color:var(--text-3)}
.footer-note a{border-bottom:1px solid var(--border)}
@media (max-width:1100px){.layout{grid-template-columns:220px minmax(0,1fr)}.toc{display:none}}
@media (max-width:820px){
  .layout{grid-template-columns:1fr}.sidebar{display:none}
  .main{padding:28px 16px 64px}.top-links{display:none}h1{font-size:30px}
  .brand span.word{display:none}
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
<title>${escape(parsed.title)} · Pepe</title>
<meta name="description" content="${escape(parsed.description || "Set up Pepe, the second brain your agents share.")}">
<meta name="x-setup-version" content="${escape(SETUP_VERSION)}">
<link rel="alternate" type="text/markdown" href="${escape(base)}/setup.md">
${FONT_LINKS}
<style>${CSS}</style>
</head>
<body>
<header class="topbar">
  <a class="brand" href="${escape(base)}/"><span class="brand-mark">${LOGO}</span> Pepe <span class="word">Docs</span></a>
  <nav class="top-links" aria-label="Sections">
    <a class="active" href="${escape(base)}/setup">Docs</a>
    <a href="${escape(base)}/ui">App</a>
    <a href="${REPO_URL}" rel="noopener">GitHub ${ARROW_UP_RIGHT}</a>
  </nav>
  <div class="top-actions">
    <a class="btn" href="${escape(base)}/setup.md">Raw .md</a>
    <button type="button" class="btn primary" data-copy-page>Copy page</button>
  </div>
</header>
<div class="layout">
  <aside class="sidebar" aria-label="Sidebar">
    <h2>Prompts</h2>
    <a class="nav-pill" href="${escape(base)}/setup">Set up Pepe for your agent</a>
    <a class="side-link active" href="${escape(base)}/setup">Setup prompt</a>
    <a class="side-link" href="#changelog">Changelog</a>
  </aside>
  <main class="main" id="content">
    <p class="eyebrow">Set up Pepe for your agent</p>
    <h1>${escape(parsed.title)}</h1>
    ${parsed.description ? `<p class="lede">${escape(parsed.description)}</p>` : ""}
    <div class="hero-actions">
      <button type="button" class="btn" data-copy-page>Copy page</button>
      <a class="btn secondary" href="${escape(base)}/setup.md">View as Markdown</a>
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
