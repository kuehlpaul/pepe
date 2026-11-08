// Shared design tokens and base rules. The landing page defines the look (Geist + Geist Mono, 1px rules
// instead of cards and shadows, no rounded corners, mono uppercase labels); every other page reuses
// these so the whole product reads as one system.

export const REPO_URL = "https://github.com/kuehlpaul/personal-context-layer";

export const FONT_LINKS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500&family=Geist+Mono:wght@400;500&display=swap">`;

export const ARROW_RIGHT = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.787 8.667H2.667V7.333h8.12L7.053 3.6 8 2.667l5.333 5.333L8 13.333l-.947-.933 3.734-3.733Z" fill="currentColor"/></svg>`;
export const ARROW_UP_RIGHT = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.267 12 3.333 11.067 9.733 4.667H4V3.333h8v8h-1.333V5.6L4.267 12Z" fill="currentColor"/></svg>`;

/** Mono, uppercase, tracked: the label style used for nav items, section headers, tags and form labels. */
export const LABEL = `font-family:var(--mono);font-weight:500;letter-spacing:var(--wide);text-transform:uppercase`;

/** Declarations shared by <button> and .btn (black block, mono uppercase, no radius). */
export const BTN = `display:inline-flex;align-items:center;justify-content:center;gap:4px;margin:0;padding:8px 16px;border:0;border-radius:0;background:var(--text);color:var(--bg);${LABEL};font-size:11px;line-height:18px;cursor:pointer;white-space:nowrap;text-decoration:none;appearance:none;-webkit-appearance:none`;

export const BASE_CSS = `
:root{--bg:#fff;--bg-2:#f7f7f5;--text:#0f0f0f;--text-2:#5c5c5c;--text-3:#8a8a8a;--border:#e8e8e8;--ok-bg:#e6f4ea;--ok-fg:#1e4620;--warn-bg:#fff4e0;--warn-fg:#5c3d00;--danger:#c92a2a;
--sans:Geist,Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--mono:"Geist Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
--xs:12.5px;--table:14px;--base:16px;--h2:17.6px;--display:48px;--wide:.04em;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#0f0f0f;--bg-2:#171717;--text:#ededed;--text-2:#a3a3a3;--text-3:#737373;--border:#262626;--ok-bg:#1d3324;--ok-fg:#c8e6cf;--warn-bg:#3a2e14;--warn-fg:#f5d9a6;--danger:#ff6b6b}}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;font-family:var(--sans);font-size:var(--table);line-height:18px;letter-spacing:var(--wide);background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
a{color:inherit;text-decoration:none}
.label{${LABEL};font-size:var(--xs);line-height:18px}

.badge{display:inline-flex;align-items:center;gap:8px;padding:4px 12px;border-radius:99px;background:var(--bg-2);font-size:var(--xs);line-height:18px}
.badge .dim{color:var(--text-3)}
.badge .sep{width:1px;height:12px;background:var(--text)}
.badge b{font-weight:500;display:inline-flex;align-items:center;gap:4px}
.badge svg{width:16px;height:16px;flex:none}

.btn{${BTN}}
.btn:hover{opacity:.85}
.btn svg{width:16px;height:16px;flex:none}
.btn.secondary{background:transparent;color:var(--text);box-shadow:inset 0 0 0 1px var(--border)}
.btn.secondary:hover{opacity:1;box-shadow:inset 0 0 0 1px var(--text)}
.btn.danger{background:transparent;color:var(--danger);box-shadow:inset 0 0 0 1px var(--danger)}
.btn.danger:hover{opacity:1;background:var(--danger);color:#fff}
.btn.small{padding:4px 10px;font-size:10.5px;line-height:16px}

.sh{display:flex;align-items:center;gap:16px}
.sh h1,.sh h2,.sh .t{margin:0;${LABEL};font-size:var(--h2);line-height:18px}
.sh h2,.sh .t{white-space:nowrap}
.sh .line{flex:1;height:1px;background:var(--border)}

code{font-family:var(--mono);font-size:.92em;letter-spacing:0;background:var(--bg-2);padding:1px 5px}
`;
