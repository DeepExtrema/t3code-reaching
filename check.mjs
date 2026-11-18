// node check.mjs: validates theme.json and proves the backdrop is upstream's picture and still moves.
//   1. theme.json is what build.mjs produces, fits T3 Code's limits, and uses nothing a theme may not.
//   2. Text stays readable over the brightest dot behind the chat.
//   3. The rewritten scene draws what upstream's scene draws, at 12 beats of the wave and two window sizes.
//   4. Drawn the way T3 Code draws it (a CSS background image), the wave moves through upstream's frames.
//   5. When T3 Code is found, the parts of the app the theme hooks into are still there.
// Exits 1 if a hard limit fails. Writes compare-*.png (upstream left, this theme's scene right).
// Needs a Chromium binary: set CHROMIUM to its path if it is not /usr/bin/chromium.
// To check an installed T3 Code, set T3_APP_ASAR to its app.asar (on Linux a running AppImage is found on its own).
import fs from "node:fs";
import zlib from "node:zlib";
import { chromium } from "playwright-core";
import { SCENE } from "./vendor/backdrops/scene-reaching.js";
import { BACKDROP_MARK, LANE, buildTheme, compactScene } from "./build.mjs";

const HERE = new URL(".", import.meta.url).pathname;
const MAX_CSS = 100000, BEAT = 0.125, BEATS = 60;   // the wave: 60 beats of 0.125 s
const SIZES = [[1512, 949], [2560, 1440]];
const MAX_MEAN = 0.05, MAX_OFF = 0.0005;   // per frame: mean difference per channel (0..255), share of pixels more than 32 levels apart
let failed = false;
const hard = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failed = true; };

// ---- 1. theme.json ------------------------------------------------------------------------------------------------------
let theme;
try { theme = JSON.parse(fs.readFileSync(HERE + "theme.json", "utf8")); console.log("PASS  theme.json parses"); }
catch (e) { console.log("FAIL  theme.json does not parse:", e.message); process.exit(1); }
const built = buildTheme();
hard(JSON.stringify(theme) === JSON.stringify(built.theme), "theme.json is what build.mjs produces");
const hex = /^#[0-9a-f]{6}$/i;
hard(theme.name === "Reaching" && theme.appearance === "dark" && theme.version === 1 && hex.test(theme.canvas) && hex.test(theme.accent) &&
  Object.values(theme.colors).every((v) => hex.test(v)) && typeof theme.css === "string",
  "theme object shape (name, appearance dark, version 1, hex canvas/accent/colors, css string)");
const css = theme.css, cut = css.indexOf(BACKDROP_MARK);
console.log(`INFO  css ${css.length} of ${MAX_CSS} chars: backdrop ${cut}, panels ${css.length - cut}; upstream's scene ${SCENE.length} chars, this theme's ${built.svg.length}`);
hard(css.length <= MAX_CSS, `css <= ${MAX_CSS} chars`);
hard(cut > 0, "backdrop found ahead of the panels");
const bad = [];
if (/@import/i.test(css)) bad.push("@import");
if (/image-set\(/i.test(css)) bad.push("image-set(");
for (const m of css.matchAll(/url\(\s*(?!["']?(?:data:|#|%23))([^)]{0,40})/gi)) bad.push(`url(${m[1]}`);
hard(!bad.length, `no forbidden pattern (@import, image-set(, url( other than data: or #)${bad.length ? ": " + bad.join(", ") : ""}`);
hard(!css.includes("</"), "no `</` in the css, so it cannot close a <style> element it is placed in");
hard(/@media \(prefers-reduced-motion:reduce\)\{\[class\^=C\],\[class\^=D\]\{animation:none!important\}\}/.test(built.svg), "the scene stops its wave under prefers-reduced-motion");

// ---- 2. contrast behind the chat ---------------------------------------------------------------------------------------
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const brightest = [...built.svg.matchAll(/stroke:(#[0-9a-f]{6})/g)].map((m) => rgbOf(m[1])).reduce((a, c) => (lum(c) > lum(a) ? c : a));
const tint = LANE.tint.split(" ").map(Number), dimmed = brightest.map((v, i) => Math.round(tint[i] * LANE.opacity + v * (1 - LANE.opacity)));
console.log(`INFO  brightest stroke rgb(${brightest}); behind the chat it reads rgb(${dimmed})`);
for (const [role, min] of [["text", 7], ["textMuted", 4.5], ["placeholder", 4.5]]) {
  const r = ratio(rgbOf(theme.colors[role]), dimmed);
  hard(r >= min, `contrast ${role} ${theme.colors[role]} over the brightest dot behind the chat = ${r.toFixed(2)}:1 (>= ${min})`);
}

// ---- rendering ---------------------------------------------------------------------------------------------------------
function decodePng(buf) {   // 8-bit RGB or RGBA, not interlaced: what Chromium's screenshots are
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20), ch = buf[25] === 6 ? 4 : 3, idat = [];
  for (let p = 8; p < buf.length;) { const len = buf.readUInt32BE(p); if (buf.toString("latin1", p + 4, p + 8) === "IDAT") idat.push(buf.subarray(p + 8, p + 8 + len)); p += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat)), row = w * ch, out = Buffer.alloc(w * h * 3), cur = Buffer.alloc(row), prev = Buffer.alloc(row);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (row + 1)], src = raw.subarray(y * (row + 1) + 1, (y + 1) * (row + 1));
    for (let x = 0; x < row; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let pr = 0;
      if (f === 1) pr = a; else if (f === 2) pr = b; else if (f === 3) pr = (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = (src[x] + pr) & 255;
    }
    for (let x = 0; x < w; x++) for (let q = 0; q < 3; q++) out[(y * w + x) * 3 + q] = cur[x * ch + q];
    cur.copy(prev);
  }
  return { w, h, px: out };
}
function diff(a, b) {   // mean difference per channel, and the share of pixels more than 32 levels apart in a channel
  let sum = 0, off = 0;
  for (let i = 0; i < a.px.length; i += 3) {
    const d0 = Math.abs(a.px[i] - b.px[i]), d1 = Math.abs(a.px[i + 1] - b.px[i + 1]), d2 = Math.abs(a.px[i + 2] - b.px[i + 2]);
    sum += d0 + d1 + d2; if (d0 > 32 || d1 > 32 || d2 > 32) off++;
  }
  return { mean: sum / a.px.length, off: off / (a.px.length / 3) };
}
const lit = (f) => { let n = 0; for (let i = 0; i < f.px.length; i += 3) if (f.px[i] > 40) n++; return n; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", args: ["--force-device-scale-factor=1", "--hide-scrollbars"] });
try {
  // A scene opened as a document and held at `beat` (plus half a beat, clear of the step) of its 7.5 s loop. It is
  // held in the scene's own CSS, by pausing every band at that moment: script cannot reach the animations that run
  // inside a <use>.
  const frame = async (svg, beat, w, h) => {
    let bands = 0;
    const held = svg.replace(/(animation:[CD] 7\.5s step-end infinite) (-?[\d.]+)s/g, (_, head, delay) => { bands++; return `${head} ${(+delay - (beat + 0.5) * BEAT).toFixed(4)}s paused`; });
    if (bands < 52) throw new Error(`only ${bands} band animations found to hold`);
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.goto("data:image/svg+xml;base64," + Buffer.from(held).toString("base64"));
    const png = await page.screenshot({ type: "png" });
    await page.close();
    return { ...decodePng(png), png };
  };

  // ---- 3. the rewritten scene against upstream's -----------------------------------------------------------------------
  const faithful = compactScene(SCENE, { zoom: 1, limiter: true }).svg;   // upstream's overlays kept, so the whole picture compares
  for (const [w, h] of SIZES) {
    const up = SCENE, mine = faithful;
    let worst = { mean: 0, off: 0 }, crest = 0, rest = null;
    for (let beat = 0; beat < BEATS; beat += 5) {
      const a = await frame(up, beat, w, h), b = await frame(mine, beat, w, h), d = diff(a, b);
      worst = { mean: Math.max(worst.mean, d.mean), off: Math.max(worst.off, d.off) };
      rest ??= a; if (diff(a, rest).off > 0) crest++;
      if (beat === 20) {   // a beat with the wave on the left hand, saved side by side for the eye
        const both = await browser.newPage({ viewport: { width: 2 * w, height: h }, deviceScaleFactor: 1 });
        await both.setContent(`<body style="margin:0;display:flex">${[a, b].map((f) => `<img src="data:image/png;base64,${f.png.toString("base64")}">`).join("")}</body>`);
        fs.writeFileSync(`${HERE}compare-${w}x${h}.png`, await both.screenshot({ type: "png" }));
        await both.close();
      }
    }
    hard(worst.mean <= MAX_MEAN && worst.off <= MAX_OFF, `${w}x${h}: this theme's scene against upstream's over 12 beats: worst mean difference ${worst.mean.toFixed(4)} per channel (<= ${MAX_MEAN}), worst share of pixels over 32 levels apart ${(100 * worst.off).toFixed(4)} % (<= ${100 * MAX_OFF} %)`);
    hard(crest >= 8, `${w}x${h}: the wave is in ${crest} of the other 11 compared beats, so the comparison saw it`);

  }

  // ---- 4. as T3 Code draws it: a CSS background image, running on its own ---------------------------------------------------
  const [w, h] = [1280, 720], frames = [];
  for (let beat = 0; beat < BEATS; beat++) frames.push(await frame(built.svg, beat, w, h));
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent("<!doctype html><meta charset=utf-8><body></body>");
  await page.addStyleTag({ content: css.slice(0, cut) });
  await page.waitForTimeout(500);
  const seen = new Set(); let worstLive = { mean: 0, off: 0 };
  for (let i = 0; i < 30; i++) {
    const shot = decodePng(await page.screenshot({ type: "png" }));
    let best = null;
    frames.forEach((f, beat) => { const d = diff(shot, f); if (!best || d.mean < best.mean) best = { ...d, beat }; });
    seen.add(best.beat); worstLive = { mean: Math.max(worstLive.mean, best.mean), off: Math.max(worstLive.off, best.off) };
    await page.waitForTimeout(230);
  }
  await page.close();
  hard(lit(frames[0]) > 5000, `the backdrop draws: ${lit(frames[0])} lit pixels at ${w}x${h}`);
  hard(worstLive.mean <= MAX_MEAN && worstLive.off <= MAX_OFF, `as a CSS background, every one of 30 screenshots is a frame of the wave: worst mean difference ${worstLive.mean.toFixed(4)}, worst share over 32 levels ${(100 * worstLive.off).toFixed(4)} %`);
  hard(seen.size >= 12, `as a CSS background the wave moves: ${seen.size} different beats seen in 30 screenshots over about 8 s`);
} finally { await browser.close(); }

// ---- 5. T3 Code itself: are the parts the theme hooks into still in the installed app? ------------------------------------
const HOOKS = [
  ["chat area", "data-workspace-area"], ["chat column", "data-chat-column"], ["chat scroller", "messages-timeline-scroll"], ["chat loading state", "data-timeline-loading"],
  ["sidebar", "sidebar-inner"], ["sidebar frame", "sidebar-wrapper"], ["main area", "sidebar-inset"], ["header", "data-chat-header"],
  ["reading lane: left inset", "--chat-lane-inset-start"], ["reading lane: right inset", "--chat-lane-inset-end"], ["reading lane: column width", "--chat-content-max-width"],
];
const asar = process.env.T3_APP_ASAR ?? fs.readdirSync("/tmp").filter((d) => d.startsWith(".mount_T3-Cod")).map((d) => `/tmp/${d}/resources/app.asar`).find((f) => fs.existsSync(f));
if (!asar) console.log("SKIP  T3 Code not found, so its hooks were not checked: set T3_APP_ASAR to its app.asar");
else {
  const app = fs.readFileSync(asar), missing = HOOKS.filter(([, needle]) => !app.includes(needle)).map(([what, needle]) => `${what} (${needle})`);
  hard(!missing.length, `T3 Code at ${asar} still has ${HOOKS.length - missing.length} of the ${HOOKS.length} parts the theme hooks into${missing.length ? "; missing: " + missing.join(", ") : ""}`);
}

console.log(failed ? "RESULT: FAIL" : "RESULT: OK");
process.exit(failed ? 1 : 0);
