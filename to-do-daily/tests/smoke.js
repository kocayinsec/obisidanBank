#!/usr/bin/env node
// Smoke test for vault/To-Do daily/_scripts/todo.js.
// Runs the real script against a tiny in-memory fake of Obsidian's vault API (no Obsidian needed):
//   node tests/smoke.js
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..", "vault", "To-Do daily");
const SCRIPT = path.join(ROOT, "_scripts", "todo.js");
const SETTINGS_TEXT = fs.readFileSync(path.join(ROOT, "Ayarlar.md"), "utf8");

let fails = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) fails++;
};

// ---------------------------------------------------------------- fake vault
let NOW = "2026-11-10";
let files = new Map();

function parseFm(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return [null, text];
  const fm = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (v === "") v = null;
    else if (v === "true") v = true;
    else if (v === "false") v = false;
    else if (v === "[]") v = [];
    else if (/^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
    else if (/^".*"$/.test(v)) v = v.slice(1, -1);
    fm[k] = v;
  }
  return [fm, m[2]];
}
function serializeFm(fm, body) {
  const lines = Object.entries(fm).map(([k, v]) => {
    if (v === null) return `${k}:`;
    if (Array.isArray(v)) return `${k}: []`;
    if (typeof v === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${k}: "${v}"`;
    return `${k}: ${v}`;
  });
  return `---\n${lines.join("\n")}\n---\n${body}`;
}
const fileObj = (p) => (files.has(p) ? { path: p, basename: path.basename(p, ".md") } : null);
const noop = () => ({});

global.window = global;
global.require = require;
global.document = { addEventListener() {}, removeEventListener() {} };
global.window.moment = () => ({ format: () => NOW });
global.app = {
  metadataCache: {
    on: noop,
    offref() {},
    getFileCache: (f) => ({ frontmatter: parseFm(files.get(f.path))[0] || undefined }),
  },
  vault: {
    on: noop,
    offref() {},
    getAbstractFileByPath: fileObj,
    getMarkdownFiles: () => [...files.keys()].filter((p) => p.endsWith(".md")).map(fileObj),
    read: async (f) => files.get(f.path),
    modify: async (f, text) => void files.set(f.path, text),
    create: async (p, text) => {
      if (files.has(p)) throw new Error("File already exists.");
      files.set(p, text);
      return fileObj(p);
    },
  },
  workspace: { on: noop, offref() {} },
  fileManager: {
    processFrontMatter: async (f, fn) => {
      const [fm, body] = parseFm(files.get(f.path));
      fn(fm);
      files.set(f.path, serializeFm(fm, body));
    },
  },
};

const NAMES = { walking: "walking🍃30m", med: "meditation🪐20m", thoughts: "thoughts🧠30m", stretch: "stretchx2" };
const taskPath = (day, habit) => `To-Do daily/Tasks/${day} ${NAMES[habit]}.md`;
const fmOf = (p) => parseFm(files.get(p))[0];
const panel = () => files.get("To-Do daily/Sayaçlar.md") || "";
const setFm = (p, patch) => app.fileManager.processFrontMatter(fileObj(p), (fm) => Object.assign(fm, patch));
const resetVault = () => {
  files = new Map([["To-Do daily/Ayarlar.md", SETTINGS_TEXT]]);
  window.__todoWeekOffset = 0;
  window.__todoPreparing = null;
};
const el = (attrs) => ({
  classList: { s: new Set(), add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); }, contains(c) { return this.s.has(c); } },
  getAttribute: (k) => attrs[k] ?? null,
});
const click = (selector, attrs) => ({ target: { closest: (s) => (s === selector ? el(attrs) : null) }, preventDefault() {}, stopPropagation() {} });
const count = (text, re) => (text.match(re) || []).length;

(async () => {
  const mod = require(SCRIPT);

  console.log("== pure stats ==");
  const t = (habit, due, extra) => ({ path: `x/${habit}${due}`, name: habit, due, done: false, s1: false, s2: false, habit, linked: true, archived: false, ...extra });
  const tasks = [
    t("walking", "2026-11-10", { done: true }),
    t("stretch", "2026-11-10", { s1: true }),
    t("stretch", "2026-11-09", { s1: true, s2: true, done: true }),
  ];
  const st = mod.computeStats(tasks, { thoughtsStartOn: "2026-11-01" }, "2026-11-10");
  ok(st.periods[0].done === 1 && st.periods[0].count === 2, "today: walking done, stretch half-done -> 1 of 2 (stretch needs both boxes)");
  ok(st.totalAll === 2 && st.totals.stretch.done === 1, "totals count a day once per habit, stretch only when both boxes are on");
  ok(st.weekStart === "2026-11-09" && st.view.length === 7, "default view is the current Monday-to-Sunday week");

  console.log("\n== first run on an empty vault ==");
  resetVault();
  await mod.__prepare();
  ok(Object.keys(NAMES).every((h) => files.has(taskPath("2026-11-10", h))), "today's four default notes were created");
  ok(fmOf(taskPath("2026-11-10", "walking")).habit === "walking" && fmOf(taskPath("2026-11-10", "walking")).done === false, "a note carries its habit and starts unticked");
  const settings = fmOf("To-Do daily/Ayarlar.md");
  ok(["thoughtsStartOn", "generatedThrough"].every((k) => settings[k] === "2026-11-10"), "blank date settings were filled with the first-run day");
  const p1 = panel();
  ok(p1.includes("BUGÜN · SALI, 10 KASIM") && p1.includes("BU HAFTA · 9–15 KAS"), "panel header and week title");
  ok(p1.includes(`INPUT[toggle:To-Do daily/Tasks/2026-11-10 ${NAMES.walking}#done]`) && p1.includes("<b>0</b> / 4"), "toggles bind to the task notes, hero shows 0 / 4");

  console.log("\n== toggles, stretch reconcile ==");
  await setFm(taskPath("2026-11-10", "walking"), { done: true });
  await mod.__updateStats();
  ok(panel().includes("<b>1</b> / 4"), "ticking walking updates the hero to 1 / 4");
  await setFm(taskPath("2026-11-10", "stretch"), { stretch_1: true, stretch_2: true });
  await mod.__updateStats();
  ok(fmOf(taskPath("2026-11-10", "stretch")).done === true && panel().includes("<b>2</b> / 4"), "both stretch boxes -> done synced, hero 2 / 4");

  console.log("\n== week navigation ==");
  for (let d = 2; d <= 9; d++) await mod("tp", "ensure", `2026-11-0${d}`);
  await setFm(taskPath("2026-11-02", "walking"), { done: true });
  window.__todoWeekOffset = -1;
  await mod.__updateStats();
  const p2 = panel();
  ok(p2.includes("GEÇEN HAFTA · 2–8 KAS") && p2.includes(`INPUT[toggle:To-Do daily/Tasks/2026-11-02 ${NAMES.walking}#done]`), "previous week shows its own days");
  ok(count(p2, /<span class="td-off">–<\/span>/g) === 7, "thoughts shows a dash before its start date");
  window.__todoWeekOffset = -9;
  await mod.__updateStats();
  ok(window.__todoWeekOffset === -1, "cannot go back past the first record's week");
  window.__todoWeekOffset = 3;
  await mod.__updateStats();
  ok(window.__todoWeekOffset === 0 && panel().includes("BU HAFTA"), "cannot go past the current week");

  console.log("\n== clicks ==");
  await mod.__onClick(click("[data-td-week]", { "data-td-week": "-1" }));
  ok(window.__todoWeekOffset === -1 && panel().includes("GEÇEN HAFTA"), "‹ pages back one week");
  await mod.__onClick(click("[data-td-week]", { "data-td-week": "0" }));
  ok(window.__todoWeekOffset === 0 && panel().includes("BU HAFTA"), "'bugün' returns to this week");
  await mod.__onClick(click("[data-td-add]", { "data-td-add": "2026-11-01" }));
  ok(files.has(taskPath("2026-11-01", "walking")), "a dashed cell starts the missing day");
  await mod.__onClick(click("[data-td-add]", { "data-td-add": "2026-11-20" }));
  ok(!files.has(taskPath("2026-11-20", "walking")), "future days are ignored");

  console.log("\n== midnight rollover ==");
  NOW = "2026-11-11";
  await mod.__prepare();
  ok(files.has(taskPath("2026-11-11", "walking")) && files.has(taskPath("2026-11-11", "stretch")), "the next day's notes are created when the date changes");

  console.log("\n== adding a habit ==");
  const patched = [
    ['stretch: "stretchx2",', 'stretch: "stretchx2",\n  reading: "reading📚20m",'],
    ['const CORE = ["walking", "med", "thoughts", "stretch"];', 'const CORE = ["walking", "med", "thoughts", "stretch", "reading"];'],
    ['stretch: { icon: "", label: "stretch", sub: "×2" },', 'stretch: { icon: "", label: "stretch", sub: "×2" },\n  reading: { icon: "📚", label: "reading", sub: "20 dk" },'],
    ['  ["stretch", "", "stretch"],', '  ["stretch", "", "stretch"],\n  ["reading", "📚", "reading"],'],
  ].reduce((src, [a, b]) => {
    if (!src.includes(a)) throw new Error("script layout changed, update this test: " + a);
    return src.replace(a, b);
  }, fs.readFileSync(SCRIPT, "utf8"));
  const tmp = path.join(os.tmpdir(), `todo-extra-${process.pid}.js`);
  fs.writeFileSync(tmp, patched);
  NOW = "2026-11-10";
  resetVault();
  const extra = require(tmp);
  await extra.__prepare();
  fs.unlinkSync(tmp);
  ok(files.has("To-Do daily/Tasks/2026-11-10 reading📚20m.md"), "the new habit gets a daily note");
  ok(panel().includes("<b>reading</b>") && panel().includes("<b>0</b> / 5") && panel().includes("reading</span>"), "it shows up in the hero count, tiles, grid and totals");

  clearInterval(window.__todoTimer);
  console.log(fails ? `\n${fails} check(s) FAILED` : "\nAll checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error("unexpected error:", e);
  process.exit(2);
});
