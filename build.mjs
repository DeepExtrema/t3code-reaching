// Regenerates theme.json from the upstream Reaching scene (vendor/backdrops/scene-reaching.js).
//   node build.mjs
// The backdrop is upstream's own animated SVG, drawn as a CSS background (a data: URI). T3 Code holds 100,000
// characters of theme CSS and the scene alone is 118,000, so compactScene() rewrites it in fewer characters that
// draw the same picture. check.mjs compares the two renderings pixel by pixel.
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { SCENE } from "./vendor/backdrops/scene-reaching.js";

const HERE = new URL(".", import.meta.url).pathname;

// ---- tuning -----------------------------------------------------------------------------------------------------
// Upstream keeps the chat readable with the Claude app's glass (black at 0.72, no blur, flat over the text column
// and fading out beside it) plus a limiter in the picture that caps the dots behind the text, so the brightest
// reads #3f3f3f. LANE is both in one, in T3 Code's chat area: black at 0.74 leaves the brightest dot at #3f3f3f.
// It is flat over the chat's text column plus `pad` on each side, then takes `fade` to clear. While the sidebar is
// open the lane stays flat on the left, up to the sidebar, and its right fade shortens (to no less than `minFade`)
// so that it ends where it ends with the sidebar closed.
export const LANE = { tint: "0 0 0", opacity: 0.74, pad: "1rem", fade: "13rem", minFade: "3rem" };
export const HEADER_ALPHA = 0.86;     // header: black at this opacity over the picture
// Frosted glass: a tint over the blurred picture. In T3 Code 0.1.11 the blur shows behind the sidebar and the
// composer but not behind the user's message bubbles, so those carry `grain`, white noise at that opacity.
export const GLASS = {
  sidebar: { tint: "14 14 16", opacity: 0.24, blur: "20px" },
  composer: { from: "16 16 18 / .62", to: "10 10 12 / .6", blur: "20px" },
  bubble: { from: "30 30 32 / .6", to: "18 18 20 / .55", blur: "14px", grain: 0.03 },
};
export const APP_ZOOM = 1.2 ** 1.5;   // the Claude app's zoom. Upstream's edge fade is in its CSS px; T3 Code has none

// ---- the scene, in fewer characters ---------------------------------------------------------------------------------
// Upstream draws the wave as 52 band groups. A group holds one path per stroke family of its glyphs (the bars of
// + and #, the rings of %, the black dot that hides the resting dot), and all but the slanted families are the
// same runs of dots shifted by that family's offset. Here each band's runs are written once, in four shared groups
// (light and dense dots, hands and forearms), and each family is one <use> of a whole group with its own class and
// offset. A band's path keeps the band's class, so it still switches on upstream's beat. The slanted families stay
// as upstream wrote them: their runs are sheared row by row and cannot be shared.
//
// [class, x offset, y offset] of every unslanted family, from upstream's themes/reaching/make-scene.py. The first
// of each list is the family the shared runs are taken from.
const LIGHT = [["pn", -4.2, 0], ["pm", -0.75, 0.2]];
const DENSE_HAND = [["pe", -3.55, -2.6], ["pe", -4.5, 1.4], ["ph", -2, -3.1], ["ph", 2, 2.7], ["pi", -2, -3.1], ["pi", 2, 2.7]];
const DENSE_ARM = [["ph", -2, -3.1], ["ph", 2, 2.7], ["pi", -2, -3.1], ["pi", 2, 2.7]];
const PITCH = { "": 11.2, q: 11.25 };   // dot pitch: hands, forearms (upstream's class suffix q)

const r1 = (v) => Math.round(v * 10) / 10;
const short = (v, digits = 1) => String(+v.toFixed(digits)).replace(/^(-?)0\./, "$1.");
const pair = (dx, dy) => { const a = short(dx), b = short(dy); return a + (b.startsWith("-") || (b.startsWith(".") && a.includes(".")) ? "" : " ") + b; };

/** Upstream's path data, "M x y h L m dx dy h L ...", as [[x, y, L]] on its 0.1 grid. */
export function readRuns(d) {
  const runs = []; let x = 0, y = 0;
  for (const [, cmd, args] of d.matchAll(/([Mmh])([^Mmh]*)/g)) {
    const n = (args.match(/-?(?:\d+\.?\d*|\.\d+)/g) ?? []).map(Number);
    if (cmd === "h") { runs.push([x, y, n[0]]); x = r1(x + n[0]); }
    else if (cmd === "M") [x, y] = n;
    else { x = r1(x + n[0]); y = r1(y + n[1]); }
  }
  return runs;
}
export function writeRuns(runs) {
  let d = "", cx = null, cy = null;
  for (const [x, y, len] of runs) {
    d += (cx === null ? `M${short(x)} ${short(y)}` : "m" + pair(x - cx, y - cy)) + "h" + short(len);
    cx = r1(x + len); cy = y;
  }
  return d;
}

/** `zoom` 1 and `limiter` true keep upstream's overlays as they are: check.mjs compares that with upstream's scene. */
export function compactScene(scene, { zoom = APP_ZOOM, limiter = false } = {}) {
  const m = scene.match(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="100%" height="100%"><style>(.*?)<\/style><defs><\/defs>(<svg viewBox="[^"]+" preserveAspectRatio="xMidYMid slice">)(.*?)<\/svg>(<linearGradient id="edge" x2="1">.*?<\/linearGradient>)<rect x="50%" width="12000" height="100%" transform="translate\(-6000 0\)" fill="url\(#edge\)"\/>(.*)<\/svg>$/s);
  if (!m) throw new Error("the scene's layout changed: update compactScene");
  const [, style, viewOpen, drawing, edge, glassLimiter] = m;
  const cut = drawing.indexOf('<g class="'), still = drawing.slice(0, cut);
  const bands = [...drawing.slice(cut).matchAll(/<g class="([CD])(\d+)">(.*?)<\/g>/g)].map(([, kind, n, body]) => ({
    cls: kind + n, q: kind === "D" ? "q" : "",
    paths: [...body.matchAll(/<path (?:transform="(skewX\(-?[\d.]+\))" )?class="([a-z]+)" d="([^"]+)"\/>/g)].map(([, skew, cls, d]) => ({ skew, cls, d })),
  }));
  const rebuilt = bands.map((b) => `<g class="${b.cls}">${b.paths.map((p) => `<path ${p.skew ? `transform="${p.skew}" ` : ""}class="${p.cls}" d="${p.d}"/>`).join("")}</g>`).join("");
  if (rebuilt !== drawing.slice(cut)) throw new Error("the band groups were not read whole: update compactScene");
  for (const b of bands) for (const p of b.paths) if (writeRuns(readRuns(p.d)) !== p.d) throw new Error(`path data of ${b.cls}.${p.cls} does not round-trip`);

  const shared = { a: [], b: [], c: [], e: [] };   // light hands, dense hands, light forearms, dense forearms
  const slanted = [];
  let worst = { glyph: 0, backing: 0 };
  for (const b of bands) {
    const of = (cls) => b.paths.filter((p) => !p.skew && p.cls === cls + b.q).map((p) => readRuns(p.d));
    const families = b.q ? DENSE_ARM : DENSE_HAND, perRun = families.filter((f) => f[0] === families[0][0]).length;
    const light = of("pn")[0] ?? [], denseAll = of(families[0][0])[0] ?? [];
    const dense = denseAll.filter((_, i) => i % perRun === 0);
    if (light.length) shared[b.q ? "c" : "a"].push(`<path class="${b.cls}" d="${writeRuns(light)}"/>`);
    if (dense.length) shared[b.q ? "e" : "b"].push(`<path class="${b.cls}" d="${writeRuns(dense)}"/>`);
    // every family this replaces must be the shared runs at its offset; upstream rounds each to 0.1 on its own
    const check = (runs, list) => {
      const base = list[0], seen = new Set();
      for (const [cls, xo, yo] of list) {
        if (seen.has(cls)) continue; seen.add(cls);
        const want = runs.flatMap(([x, y]) => list.filter((f) => f[0] === cls).map((f) => [x + f[1] - base[1], y + f[2] - base[2]]));
        const got = of(cls)[0] ?? [];
        if (got.length !== want.length) throw new Error(`${b.cls}.${cls}: ${got.length} runs, expected ${want.length}`);
        got.forEach(([x, y], i) => { worst.glyph = Math.max(worst.glyph, Math.abs(x - want[i][0]), Math.abs(y - want[i][1])); });
      }
    };
    check(light, LIGHT); check(dense, families);
    // the backing: one black dot under every glyph. Upstream fits its runs over both kinds of dot together.
    const dots = (runs, extra, x0) => runs.flatMap(([x, y, len]) => Array.from({ length: Math.round((len - extra) / PITCH[b.q]) + 1 }, (_, i) => [x - x0 + i * PITCH[b.q], y]));
    const mine = [...dots(light, 8.4, LIGHT[0][1]), ...dots(dense, families === DENSE_HAND ? 8.2 : 0.1, families[0][1]).map(([x, y]) => [x, y - families[0][2]])];
    const theirs = dots(of("k")[0] ?? [], 0.1, 0);
    if (mine.length !== theirs.length) throw new Error(`${b.cls}: ${mine.length} backing dots, upstream has ${theirs.length}`);
    for (const [x, y] of mine) worst.backing = Math.max(worst.backing, Math.min(...theirs.map(([X, Y]) => Math.hypot(X - x, Y - y))));
    const keep = b.paths.filter((p) => p.skew);
    if (b.paths.some((p) => !p.skew && !["k", "pn", "pm", "pe", "ph", "pi"].includes(p.cls.replace(/q$/, "")))) throw new Error(`${b.cls}: an unslanted family this build does not know`);
    if (keep.length) slanted.push(`<g class="${b.cls}">${keep.map((p) => `<path transform="${p.skew}" class="${p.cls}" d="${p.d}"/>`).join("")}</g>`);
  }
  if (worst.glyph > 0.1001 || worst.backing > 0.8) throw new Error(`shared runs drift from upstream: glyph ${worst.glyph}, backing ${worst.backing}`);

  const use = (id, cls, list, f) => `<use href="#${id}" class="${cls}"${f[1] - list[0][1] ? ` x="${short(f[1] - list[0][1], 2)}"` : ""}${f[2] - list[0][2] ? ` y="${short(f[2] - list[0][2], 2)}"` : ""}/>`;
  const sets = [["a", "", LIGHT], ["b", "", DENSE_HAND], ["c", "q", LIGHT], ["e", "q", DENSE_ARM]].filter(([id]) => shared[id].length);
  const uses = sets.map(([id, q, list]) => use(id, "k" + q, list, ["k", 0, 0])).join("") +
    sets.map(([id, q, list]) => list.map((f) => use(id, f[0] + q, list, f)).join("")).join("");
  // Elements get their stroke from the <use> that draws them, so upstream's `path{...}` default must not sit on them.
  const css = style.replace("path{fill:none;stroke-linecap:round}", "svg{fill:none;stroke-linecap:round}");
  if (css === style) throw new Error("the scene's default path rule changed: update compactScene");
  // The soft dark edge at the far left and right, which upstream measures in the Claude app's zoomed px. The glass
  // limiter that follows it in upstream's scene is left out: it is shaped for that app's glass, and LANE does its job.
  const fade = `<svg x="50%" overflow="visible">${edge}<rect x="-6000" width="12000" height="100%" transform="scale(${short(zoom, 4)} 1)" fill="url(#edge)"/></svg>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><style>${css}</style>${viewOpen}${still}` +
    `<defs>${sets.map(([id]) => `<g id="${id}">${shared[id].join("")}</g>`).join("")}</defs>${uses}${slanted.join("")}</svg>${fade}${limiter ? glassLimiter : ""}</svg>`;
  return { svg, worst };
}

// ---- css --------------------------------------------------------------------------------------------------------
// `<` is escaped so the scene's own </style> cannot end a <style> element the CSS is ever placed in.
const enc = (s) => s.replace(/%/g, "%25").replace(/#/g, "%23").replace(/</g, "%3C").replace(/"/g, "'");
export const dataUri = (svg) => `url("data:image/svg+xml,${enc(svg)}")`;
export const BACKDROP_MARK = "/*panels*/";   // everything before this in `css` is the backdrop

export function backdropCss(svg) {
  // The picture is one layer of its own behind the app (will-change keeps it on the compositor), so a beat of the
  // wave redraws that layer and nothing else.
  return `html{background:#000!important}body{background:none!important}` +
    `html::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;will-change:transform;background:${dataUri(svg)} 50% 50%/100% 100% no-repeat}`;
}

function panelCss() {
  const lane = (a) => `rgb(${LANE.tint} / ${a})`;
  const full = short(LANE.opacity, 3);
  // a smoothstep, as upstream's glass fades: [distance past the lane's edge as a share of the fade, opacity lost there]
  const steps = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map((u) => [short(u, 3), LANE.opacity * u * u * (3 - 2 * u)]);
  const past = (sign, dist) => `calc(var(--rc-mid) ${sign} (var(--rc-half) + ${dist}))`;
  // --rc-lf scales what the left side loses (0 keeps it flat to the edge); --rc-fr is the length of the right fade
  const left = steps.map(([u, lost]) => `${lane(`calc(${full} - ${short(lost, 3)} * var(--rc-lf))`)} ${past("-", `${LANE.fade} * ${u}`)}`).reverse();
  const right = steps.map(([u, lost]) => `${lane(short(LANE.opacity - lost, 3))} ${past("+", `var(--rc-fr) * ${u}`)}`);
  const stops = [...left, `${lane(full)} calc(var(--rc-mid) - var(--rc-half))`, `${lane(full)} calc(var(--rc-mid) + var(--rc-half))`, ...right].join(",");
  const conversation = `[data-workspace-area="conversation"]`;
  const { sidebar, composer, bubble } = GLASS;
  const blur = (b) => `-webkit-backdrop-filter:${b};backdrop-filter:${b}`;
  const grain = dataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/>` +
    `<feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 ${short(bubble.grain, 3)} 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`);
  return BACKDROP_MARK +
    // the app's own full-window boxes are let through, so the one picture shows behind all of them
    `[data-slot="sidebar-wrapper"],[data-slot="sidebar"],[data-slot="sidebar-inset"],div:has(>[data-chat-column]),[data-chat-column],.messages-timeline-scroll,[data-timeline-loading]{background:transparent!important}` +
    // The lane sits where T3 Code puts the chat's text column: the app centres it between two insets (the right one
    // makes room for the thread details card) and publishes them, and the column's width, as these variables.
    `${conversation}{--rc-mid:calc(50% + (var(--chat-lane-inset-start,0px) - var(--chat-lane-inset-end,0px)) / 2);--rc-half:calc(var(--chat-content-max-width,46rem) / 2 + ${LANE.pad});--rc-lf:1;--rc-fr:${LANE.fade};background:linear-gradient(90deg,${stops})!important}` +
    // An open sidebar moves the column right by half its width (16rem until the user resizes it), so the right fade
    // gives that much back. Below 768px the sidebar is a sheet over the chat and moves nothing.
    `@media (min-width:768px){[data-slot="sidebar-wrapper"][data-sidebar-state="expanded"] ${conversation}{--rc-lf:0;--rc-fr:max(${LANE.minFade},calc(${LANE.fade} - var(--sidebar-width,16rem) / 2))}}` +
    `[data-chat-header]{background-color:rgb(0 0 0 / ${HEADER_ALPHA})!important}` +
    `[data-user-message-bubble]{${blur(`blur(${bubble.blur})`)};background:${grain} 0 0/160px 160px,radial-gradient(at 0 0,rgb(255 255 255 / .025),transparent 70%),linear-gradient(155deg,rgb(${bubble.from}),rgb(${bubble.to}))!important;` +
      `border:1px solid rgb(255 255 255 / .12)!important;border-radius:16px;box-shadow:0 12px 24px -12px rgb(0 0 0 / .87),0 4px 7px -4px rgb(0 0 0 / .67),inset 0 1px rgb(255 255 255 / .07),inset 0 -1px rgb(0 0 0 / .33);color:#ececec!important}` +
    `[data-slot="sidebar-inner"]{${blur(`blur(${sidebar.blur}) saturate(120%)`)};background:linear-gradient(180deg,rgb(255 255 255 / .035),transparent 40%),rgb(${sidebar.tint} / ${short(sidebar.opacity, 3)})!important;` +
      `border-right:1px solid rgb(255 255 255 / .08);box-shadow:inset -1px 0 rgb(255 255 255 / .03)}` +
    // the composer: T3 Code's own glass layers (its ::before, its outline) are switched off, so only this one shows
    `[data-slot="composer-shell"]{--chat-composer-glass-surface:transparent!important;--chat-composer-outline:transparent!important;--chat-composer-highlight:rgb(255 255 255 / .06)!important}` +
    `[data-slot="composer-shell"]::before,[data-slot="composer-host"]::before{background:none!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}` +
    `[data-slot="composer-host"]{${blur(`blur(${composer.blur})`)};background:linear-gradient(165deg,rgb(${composer.from}),rgb(${composer.to}) 85%)!important;border:1px solid transparent!important;border-radius:18px;` +
      `transition:border-color .18s,box-shadow .18s;box-shadow:0 20px 36px -16px rgb(0 0 0 / .87),0 6px 10px -5px rgb(0 0 0 / .7),inset 0 1px rgb(255 255 255 / .08),inset 0 -1px rgb(0 0 0 / .5)}` +
    `[data-slot="composer-host"]::after{box-shadow:none!important;border-color:transparent!important}` +
    `[data-slot="composer-host"]:focus-within{border-color:transparent!important;box-shadow:0 22px 38px -16px rgb(0 0 0 / .87),0 0 24px -12px rgb(255 255 255 / .18),inset 0 1px rgb(255 255 255 / .1),inset 0 -1px rgb(0 0 0 / .5)}` +
    `@media (prefers-reduced-motion:reduce){[data-slot="composer-host"]{transition:none!important}}` +
    // T3 Code's 1px border beside the sidebar is clear, so the picture showed through it as a bright line
    `[data-slot="sidebar-container"]{border-right-width:0!important;border-left-width:0!important}`;
}

// ---- theme ------------------------------------------------------------------------------------------------------
export function buildTheme() {
  const { svg, worst } = compactScene(SCENE);
  const backdrop = backdropCss(svg), css = backdrop + panelCss();
  // upstream's Reaching palette (plugins/reaching/hooks/look-reaching.ts): black and white, colour only where it means something
  const ink = { s0: "#000000", s1: "#0a0a0a", s2: "#111111", s3: "#171717", text: "#f4f4f4", text2: "#c9c9c9", text3: "#ababab" };
  const accent = "#d8dde6";
  const theme = {
    version: 1, name: "Reaching", appearance: "dark",
    canvas: ink.s0, accent,
    colors: {
      chrome: ink.s0, toolbar: ink.s0, surface: ink.s1, surfaceOverlay: ink.s2, surfaceRaised: ink.s3,
      text: ink.text, textMuted: ink.text2, mutedForeground: ink.text3, placeholder: ink.text3,
      // T3 Code paints its primary controls (send button, switches) with the messageAction roles
      focus: accent, messageAction: accent, messageActionForeground: ink.s0, messageActionHover: ink.text,
      sidebar: ink.s0, sidebarForeground: ink.text, sidebarMutedForeground: ink.text3,
      codeBackground: ink.s1, codeForeground: ink.text, error: "#e0675e", warning: "#d6ad62",
      terminalBackground: ink.s0, terminalForeground: ink.text,
    },
    css,
  };
  return { theme, svg, worst, backdropLen: backdrop.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { theme, svg, worst, backdropLen } = buildTheme();
  fs.writeFileSync(HERE + "theme.json", JSON.stringify(theme, null, 2) + "\n");
  console.log(`theme.json written: css ${theme.css.length} of 100000 chars (backdrop ${backdropLen}); scene ${SCENE.length} -> ${svg.length} chars; ` +
    `largest shift from upstream: glyph strokes ${worst.glyph.toFixed(2)}, backing dots ${worst.backing.toFixed(2)} (picture units)`);
}
