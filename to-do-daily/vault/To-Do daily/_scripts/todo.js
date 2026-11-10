// Templater kullanıcı betiği.
//   tp.user.todo(tp, "ensure", "2026-01-15")   günün eksik görev notlarını oluşturur
//   tp.user.todo(tp, "complete", "walking")    bugünün notunu günceller (stretch: 0 → 1 → 2 → 0; diğerleri: aç/kapa)
//   tp.user.todo(tp, "stats")                  bugünü hazırlar (eksik notları ekler) ve Sayaçlar.md panelini yeniden üretir
// Tek "tamamlandı" tanımı: stretch iki kutu da açıkken, walking/med/thoughts done açıkken.
// Panel (Sayaçlar.md): bugün göstergesi, durumlu kutular (Meta Bind toggle; CSS onu yuvarlak onay düğmesi olarak çizer),
// haftalık ızgara (bu hafta; ‹ › okları önceki haftalara götürür; kaydı olmayan hücreye tıklamak o günü başlatır) ve toplam tamamlanma kartı.
const ROOT = "To-Do daily";
const TASKS = `${ROOT}/Tasks`;
const SETTINGS_PATH = `${ROOT}/Ayarlar.md`;
const STATS_PATH = `${ROOT}/Sayaçlar.md`;
const DASH_PATH = `${ROOT}/@to-Do daily.md`;
const SCRIPT_PATH = `${ROOT}/_scripts/todo.js`;
const HABITS = {
  walking: "walking🍃30m",
  med: "meditation🪐20m",
  thoughts: "thoughts🧠30m", // thoughtsStartOn gününden itibaren günlük üretilir
  stretch: "stretchx2",
};
// Bugün göstergesine, haftalık ızgaraya ve yüzdelere giren rutinler.
const CORE = ["walking", "med", "thoughts", "stretch"];
const TILES = {
  walking: { icon: "🍃", label: "walking", sub: "30 dk" },
  med: { icon: "🪐", label: "meditation", sub: "20 dk" },
  thoughts: { icon: "🧠", label: "thoughts", sub: "30 dk" },
  stretch: { icon: "", label: "stretch", sub: "×2" },
};
// Tarih ayarları boşsa ilk çalıştırmada o günün tarihi yazılır (ensureDay); o zamana kadar okunurken bugünün tarihi sayılır.
const START_KEYS = ["thoughtsStartOn"];
const DEFAULT_SETTINGS = {
  recurrence: true,
  generatedThrough: "",
  thoughtsStartOn: "",
};
const LABELS = { Today: "Bugün", Week: "Bu hafta", Month: "Bu ay", Year: "Bu yıl" };
const HOOK_VERSION = 4;

// ---------------------------------------------------------------- saf hesap
const pad = (n) => String(n).padStart(2, "0");
const percent = (a, b) => (b ? (a / b) * 100 : 0);
const DAY_MS = 86400000;
const noon = (day) => Date.parse(day + "T12:00:00Z");
const addDays = (day, n) => new Date(noon(day) + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((noon(b) - noon(a)) / DAY_MS);
// Günün haftasının pazartesisi (hafta pazartesi başlar, isoWeekKey ile aynı).
const weekStartOf = (day) => addDays(day, -((new Date(noon(day)).getUTCDay() + 6) % 7));

// ISO 8601 hafta anahtarı "YYYY-WW" (yıl da eklendi)
function isoWeekKey(day) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const first = Date.UTC(d.getUTCFullYear(), 0, 1, 12);
  const week = Math.ceil(((d.getTime() - first) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-${pad(week)}`;
}

const isCore = (t) => CORE.includes(t.habit);
// Tek "tamamlandı" tanımı (Analiz.base'teki GunlukOran ile aynı): stretch iki kutu da açıkken, diğerleri done açıkken.
const isDone = (t) => (t.habit === "stretch" ? t.s1 && t.s2 : t.done);

// Gün, hafta, ay ve yıl aynı kuralla sayılır; Status alanı hesaba girmez.
function computeStats(tasks, settings, today, weekStart = weekStartOf(today)) {
  const live = tasks.filter((t) => t.linked && !t.archived);
  const core = live.filter(isCore);
  const week = isoWeekKey(today);
  const groups = {
    Today: core.filter((t) => t.due === today),
    Week: core.filter((t) => t.due && isoWeekKey(t.due) === week),
    Month: core.filter((t) => t.due.slice(0, 7) === today.slice(0, 7)),
    Year: core.filter((t) => t.due.slice(0, 4) === today.slice(0, 4)),
  };
  const periods = Object.entries(groups).map(([name, rows]) => {
    const done = rows.filter(isDone).length;
    return { name, count: rows.length, done, value: percent(done, rows.length) };
  });
  // Haftalık ızgara: weekStart (pazartesi) ile başlayan 7 gün. Notu olmayan günün count değeri 0'dır.
  const view = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(weekStart, i);
    const rows = core.filter((t) => t.due === day);
    return { day, count: rows.length, done: rows.filter(isDone).length };
  });
  // Geriye gidilebilecek en eski hafta: ilk kaydın haftası.
  const firstDue = core.map((t) => t.due).filter(Boolean).sort()[0] || today;
  const weeksBack = Math.round(daysBetween(weekStartOf(firstDue), weekStartOf(today)) / 7);
  // Her rutin için toplam tamamlanma sayısı (tüm kayıtlar, aynı tek tanım).
  const totals = {};
  for (const h of CORE) {
    const rows = core.filter((t) => t.habit === h);
    totals[h] = { done: rows.filter(isDone).length, days: rows.length, since: rows.map((t) => t.due).filter(Boolean).sort()[0] || "" };
  }
  const totalAll = CORE.reduce((s, h) => s + totals[h].done, 0);
  return { periods, view, weekStart, weeksBack, totals, totalAll };
}

// ---------------------------------------------------------------- panel (Sayaçlar.md)
const trNum = (v) => v.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
const prettyDay = (d) => new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(new Date(d + "T12:00:00Z"));
const at = (day) => new Date(day + "T12:00:00Z");
const fmtWeekday = new Intl.DateTimeFormat("tr-TR", { weekday: "long", timeZone: "UTC" });
const fmtWeekdayShort = new Intl.DateTimeFormat("tr-TR", { weekday: "short", timeZone: "UTC" });
const fmtDayMonth = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", timeZone: "UTC" });
const upper = (s) => s.toLocaleUpperCase("tr-TR");
const bindPath = (t) => t.path.replace(/\.md$/, "");
const toggle = (t, prop) => `\`INPUT[toggle:${bindPath(t)}#${prop}]\``;

function tileRow(habit, t) {
  const m = TILES[habit];
  // Kutunun dolu/kısmi görünümü CSS'te düğmenin kendi durumundan okunur (todo-daily.css); burada durum sınıfı üretilmez.
  if (habit === "stretch")
    return `| <span class="td-tile"><b>${m.label}</b><small>${m.sub}</small></span> | ${toggle(t, "stretch_1")} ${toggle(t, "stretch_2")} |`;
  return `| <span class="td-tile"><span class="td-ic">${m.icon}</span><b>${m.label}</b><small>${m.sub}</small></span> | ${toggle(t, "done")} |`;
}

// Haftalık ızgara: satır = rutin, sütun = seçili haftanın 7 günü (pazartesi başlar). Notu olan hücre bir onay düğmesidir (stretch'te iki tane);
// notu olmayan geçmiş hücre kesik halkadır ve tıklanınca o günün eksik görevleri oluşturulur (onClick); gelecek günler boş kalır.
// Rutinin başlamadığı günler "–" görünür. Başlıktaki ‹ › okları haftayı değiştirir (data-td-week → onClick).
const GRID = [
  ["walking", "🍃", "walking"],
  ["med", "🪐", "meditation"],
  ["thoughts", "🧠", "thoughts"],
  ["stretch", "", "stretch"],
];
function weekCell(habit, day, t, settings, today) {
  if (day > today) return '<span class="td-off">·</span>';
  if (t) return habit === "stretch" ? `${toggle(t, "stretch_1")} ${toggle(t, "stretch_2")}` : toggle(t, "done");
  if (habit === "thoughts" && day < settings.thoughtsStartOn) return '<span class="td-off">–</span>';
  return `<span class="td-na" data-td-add="${day}" title="Kayıt yok · tıklayınca ${prettyDay(day)} günü başlar"></span>`;
}
function weekTitle(st, today) {
  const offset = -Math.round(daysBetween(st.weekStart, weekStartOf(today)) / 7);
  const a = at(st.weekStart);
  const b = at(addDays(st.weekStart, 6));
  const dm = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" });
  const mo = new Intl.DateTimeFormat("tr-TR", { month: "short", timeZone: "UTC" });
  const range = a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}–${b.getUTCDate()} ${mo.format(b)}` : `${dm.format(a)} – ${dm.format(b)}`;
  const name = offset === 0 ? "bu hafta" : offset === -1 ? "geçen hafta" : `${-offset} hafta önce`;
  return upper(`${name} · ${range}`);
}
function weekGrid(st, ctx) {
  const { days, settings, today } = ctx;
  const atNow = st.weekStart >= weekStartOf(today);
  const atFirst = -Math.round(daysBetween(st.weekStart, weekStartOf(today)) / 7) <= -st.weeksBack;
  const head = st.view.map(
    (d) =>
      `<span class="td-dh${d.day === today ? " now" : ""}" title="${fmtWeekday.format(at(d.day))}, ${fmtDayMonth.format(at(d.day))}"><small>${fmtWeekdayShort.format(at(d.day))}</small><b>${prettyDay(d.day)}</b></span>`
  );
  const rows = GRID.map(
    ([habit, icon, label]) =>
      `| <span class="td-rh"><span class="td-ic">${icon}</span>${label}</span> | ${st.view.map((d) => weekCell(habit, d.day, days[d.day]?.[habit], settings, today)).join(" | ")} |`
  );
  const sumDone = st.view.reduce((s, d) => s + d.done, 0);
  const sumAll = st.view.reduce((s, d) => s + d.count, 0);
  const btn = (v, ch, tip, off) => `<span class="td-wk${off ? " off" : ""}" role="button" data-td-week="${v}" title="${tip}">${ch}</span>`;
  const nav = `<span class="td-nav">${btn(-1, "‹", "Önceki hafta", atFirst)}${btn(0, "bugün", "Bu haftaya dön", atNow)}${btn(1, "›", "Sonraki hafta", atNow)}</span>`;
  return [
    `<div class="td-label-row"><span class="td-label">${weekTitle(st, today)}</span><span class="td-right"><span class="td-hint" title="Bu haftada kaydı olan rutin günlerinden tamamlananlar">${sumAll ? `${sumDone} / ${sumAll}` : "—"}</span>${nav}</span></div>`,
    "",
    `| <span class="td-gh"></span> | ${head.join(" | ")} |`,
    `| --- | ${head.map(() => "---").join(" | ")} |`,
    ...rows,
    "",
  ];
}

// Toplam kartı: solda dört rutinin genel toplamı, sağda her etkinliğin toplam tamamlanma sayısı,
// kayıtlı günlerin ne kadarının tamamlandığını gösteren ince çubukla.
function sumRow({ icon, name, big, unit, pct, title, cls }) {
  const bar = pct === null ? "" : `<span class="td-bar"><i style="width:${Math.max(0, Math.min(100, pct)).toFixed(1)}%"></i></span>`;
  return `<div class="td-srow${cls ? " " + cls : ""}" title="${title}"><span class="td-sn"><span class="td-ic">${icon}</span><b>${name}</b></span><span class="td-sv"><b>${big}</b><small>${unit}</small></span>${bar}</div>`;
}
function sumCard(st) {
  const when = (d) => (d ? prettyDay(d) : "—");
  const rows = CORE.map((h) => {
    const tot = st.totals[h];
    return sumRow({
      icon: TILES[h].icon,
      name: TILES[h].label,
      big: trNum(tot.done),
      unit: `/ ${trNum(tot.days)} gün`,
      pct: percent(tot.done, tot.days),
      title: `${tot.done} kez tamamlandı · ${tot.days} kayıtlı günün · ${when(tot.since)} → şimdi`,
    });
  });
  const first = CORE.map((h) => st.totals[h].since).filter(Boolean).sort()[0];
  return [
    `<div class="td-label-row"><span class="td-label">TOPLAM</span><span class="td-hint">tüm kayıtlar</span></div>`,
    "",
    `<div class="td-sumcard"><div class="td-big" title="walking + meditation + thoughts + stretch"><b>${trNum(st.totalAll)}</b><span>tamamlanma</span><small>${when(first)} → şimdi</small></div><div class="td-rows">${rows.join("")}</div></div>`,
    "",
  ];
}

// Üretilen not: HTML blokları tek satır, bloklar boş satırla ayrılır. Görünüm todo-daily.css ile verilir.
function renderPanel(st, ctx) {
  const { today, items } = ctx; // ctx.days: seçili haftanın günlerinin notları {gün: {rutin: not}}
  const have = CORE.filter((h) => items[h]);
  const doneN = have.filter((h) => isDone(items[h])).length;
  const tip = st.periods
    .filter((p) => p.name !== "Today")
    .map((p) => `${LABELS[p.name]} ${p.done} / ${p.count}`)
    .join(" · ") + ` · Toplam ${st.totalAll} tamamlanma`;
  const head = upper(`Bugün · ${fmtWeekday.format(at(today))}, ${fmtDayMonth.format(at(today))}`);
  const out = ["---", "cssclasses: [td-generated]", "---"];

  out.push(
    `<div class="td-hero" title="${tip}"><div class="td-label-row"><span class="td-label">${head}</span><span class="td-count">${
      have.length ? `<b>${doneN}</b> / ${have.length}` : "—"
    }</span></div><div class="td-seg">${have.map((h) => `<i${isDone(items[h]) ? ' class="on"' : ""}></i>`).join("")}</div></div>`,
    ""
  );

  if (have.length) {
    out.push("| Rutin | Durum |", "| --- | --- |", ...have.map((h) => tileRow(h, items[h])), "");
  } else {
    out.push('<div class="td-empty">Bugünün görevleri hazırlanıyor…</div>', "");
  }

  out.push(...weekGrid(st, ctx), ...sumCard(st));
  return out.join("\n");
}

// ---------------------------------------------------------------- vault G/Ç
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function fmDay(v) {
  if (!v) return "";
  if (v instanceof Date) return window.moment(v).format("YYYY-MM-DD");
  return String(v).slice(0, 10);
}
function readTasks() {
  const out = [];
  for (const f of app.vault.getMarkdownFiles()) {
    if (!f.path.startsWith(TASKS + "/")) continue;
    const fm = app.metadataCache.getFileCache(f)?.frontmatter;
    if (!fm) continue;
    out.push({
      path: f.path,
      name: String(fm.name ?? f.basename),
      due: fmDay(fm.due),
      done: fm.done === true,
      s1: fm.stretch_1 === true,
      s2: fm.stretch_2 === true,
      habit: String(fm.habit ?? ""),
      linked: fm.linked !== false,
      archived: fm.archived === true,
    });
  }
  return out;
}
function readSettings() {
  const f = app.vault.getAbstractFileByPath(SETTINGS_PATH);
  const fm = (f && app.metadataCache.getFileCache(f)?.frontmatter) || {};
  const s = { ...DEFAULT_SETTINGS };
  for (const k of ["generatedThrough", "thoughtsStartOn"]) if (fm[k]) s[k] = fmDay(fm[k]);
  s.recurrence = fm.recurrence !== false;
  const today = window.moment().format("YYYY-MM-DD");
  for (const k of START_KEYS) if (!s[k]) s[k] = today;
  return s;
}

// Kutular (yuvarlak onay düğmeleri) stretch_1/stretch_2'yi doğrudan değiştirir; bugünün, ızgaradaki haftanın ve son 7 günün stretch notunda
// done'ı buna eşitler (tablolar tutarlı kalsın). Izgarada görünen hafta ve son 7 günün dışındaki kayıtlara dokunulmaz.
async function reconcileStretch(tasks, from, today) {
  for (const t of tasks) {
    if (t.habit !== "stretch" || t.due < from || t.due > today) continue;
    const want = t.s1 && t.s2;
    if (t.done === want) continue;
    const f = app.vault.getAbstractFileByPath(t.path);
    if (f)
      await app.fileManager.processFrontMatter(f, (fm) => {
        fm.done = want;
      });
  }
}

async function updateStats() {
  const settings = readSettings();
  const today = window.moment().format("YYYY-MM-DD");
  const tasks = readTasks();
  // Izgaranın gösterdiği hafta: window.__todoWeekOffset (0 = bu hafta, -1 = geçen hafta …). İlk kaydın haftasından öteye gidilmez.
  const thisWeek = weekStartOf(today);
  let offset = Math.min(0, Math.trunc(Number(window.__todoWeekOffset) || 0));
  let weekStart = addDays(thisWeek, offset * 7);
  let st = computeStats(tasks, settings, today, weekStart);
  if (-offset > st.weeksBack) {
    offset = -st.weeksBack;
    weekStart = addDays(thisWeek, offset * 7);
    st = computeStats(tasks, settings, today, weekStart);
  }
  window.__todoWeekOffset = offset;
  const weekEnd = addDays(weekStart, 6);
  const sevenAgo = addDays(today, -7);
  await reconcileStretch(tasks, weekStart < sevenAgo ? weekStart : sevenAgo, today);
  const items = {}; // bugünün notları
  const days = {}; // seçili haftanın notları (bugün de dahil)
  for (const t of tasks) {
    if (!t.linked || t.archived || !HABITS[t.habit]) continue;
    if (t.due === today) items[t.habit] = t;
    if (t.due >= weekStart && t.due <= weekEnd) (days[t.due] ??= {})[t.habit] = t;
  }
  const md = renderPanel(st, { today, items, days, settings });
  const file = app.vault.getAbstractFileByPath(STATS_PATH);
  if (!file) return app.vault.create(STATS_PATH, md);
  if ((await app.vault.read(file)) === md) return;
  await app.vault.modify(file, md);
}

// Bugünün eksik notlarını ekler (günlük tekrar açıksa) ve paneli yeniler. Aynı anda tek çalışır.
function prepare() {
  if (window.__todoPreparing) return window.__todoPreparing;
  const run = (async () => {
    const settings = readSettings();
    const today = window.moment().format("YYYY-MM-DD");
    if (settings.recurrence !== false) await ensureDay(today);
    await updateStats();
  })();
  window.__todoPreparing = run;
  const clear = () => {
    if (window.__todoPreparing === run) window.__todoPreparing = null;
  };
  run.then(clear, clear);
  return run;
}

// Bu betik dosyası değişince yeni sürümü belleğe alır; açık oturumdaki dinleyiciler yeni işlevleri kullanır.
// Hatalı bir düzenlemede (söz dizimi hatası gibi) eski sürüm çalışmaya devam eder.
async function reloadSelf() {
  const f = app.vault.getAbstractFileByPath(SCRIPT_PATH);
  if (!f) return;
  const src = await app.vault.read(f);
  const mod = { exports: {} };
  window.eval("(function anonymous(require, module, exports){" + src + "\n})")(window.require, mod, mod.exports);
  const m = mod.exports;
  if (typeof m.__updateStats !== "function" || typeof m.__prepare !== "function") throw new Error("todo.js: yeniden yükleme için dışa aktarım yok");
  window.__todoUpdateStats = m.__updateStats;
  window.__todoPrepare = m.__prepare;
  if (typeof m.__onClick === "function") window.__todoClick = m.__onClick;
}

// Izgaradaki tıklamalar: ‹ bugün › okları (data-td-week) haftayı değiştirir; kayıtsız hücre (data-td-add) o günün eksik görev notlarını oluşturur.
// Panel birkaç saniye içinde yenilenir. Gelecek günler ve geçersiz tarihler yok sayılır.
async function onClick(e) {
  const nav = e.target?.closest?.("[data-td-week]");
  if (nav) {
    e.preventDefault();
    e.stopPropagation();
    const v = nav.getAttribute("data-td-week");
    if (v !== "-1" && v !== "0" && v !== "1") return;
    if (nav.classList.contains("off")) return;
    window.__todoWeekOffset = v === "0" ? 0 : (Number(window.__todoWeekOffset) || 0) + Number(v);
    nav.classList.add("busy");
    try {
      await updateStats();
    } catch (err) {
      console.error(err);
      nav.classList.remove("busy");
    }
    return;
  }
  const el = e.target?.closest?.("[data-td-add]");
  if (!el) return;
  e.preventDefault();
  e.stopPropagation();
  const day = el.getAttribute("data-td-add") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > window.moment().format("YYYY-MM-DD")) return;
  el.classList.add("busy");
  try {
    await ensureDay(day);
    await sleep(300);
    await updateStats();
  } catch (err) {
    console.error(err);
    el.classList.remove("busy");
  }
}

// Dinleyiciler (oturum başına bir kez, sürüm değişirse yeniden kurulur):
//   görev ya da ayar notu değişince paneli (800 ms bekleyip) yeniler,
//   günlük sayfa açılınca ve gün değişince bugünü hazırlar,
//   betik dosyası değişince yeni sürümü yükler,
//   ızgaradaki tıklamaları işler: hafta okları, kayıtsız hücre (v4).
function hook() {
  window.__todoUpdateStats = updateStats; // betik güncellenirse yeni sürüm kullanılsın
  window.__todoPrepare = prepare;
  window.__todoClick = onClick;
  if (window.__todoHookVersion === HOOK_VERSION) return;
  if (window.__todoClickRef) document.removeEventListener("click", window.__todoClickRef, true);
  window.__todoClickRef = (e) => window.__todoClick?.(e).catch?.(console.error);
  document.addEventListener("click", window.__todoClickRef, true);
  const old = window.__todoStatsHook;
  if (Array.isArray(old)) {
    try {
      app.metadataCache.offref(old[0]);
      app.vault.offref(old[1]);
    } catch (e) {
      console.error(e);
    }
  }
  if (window.__todoOpenRef) {
    try {
      app.workspace.offref(window.__todoOpenRef);
    } catch (e) {
      console.error(e);
    }
  }
  if (window.__todoScriptRef) {
    try {
      app.vault.offref(window.__todoScriptRef);
    } catch (e) {
      console.error(e);
    }
  }
  if (window.__todoTimer) clearInterval(window.__todoTimer);

  let timer;
  const handler = (file) => {
    const p = file?.path || "";
    if (!(p.startsWith(TASKS + "/") || p === SETTINGS_PATH)) return;
    clearTimeout(timer);
    timer = setTimeout(() => window.__todoUpdateStats().catch(console.error), 800);
  };
  window.__todoStatsHook = [app.metadataCache.on("changed", handler), app.vault.on("delete", handler)];
  window.__todoOpenRef = app.workspace.on("file-open", (file) => {
    if (file && file.path === DASH_PATH) window.__todoPrepare().catch(console.error);
  });
  let lastDay = window.moment().format("YYYY-MM-DD");
  window.__todoTimer = setInterval(() => {
    const d = window.moment().format("YYYY-MM-DD");
    if (d === lastDay) return;
    lastDay = d;
    window.__todoWeekOffset = 0; // gün değişince ızgara yeniden bu haftayı gösterir
    window.__todoPrepare().catch(console.error);
  }, 60000);
  let reloadTimer;
  window.__todoScriptRef = app.vault.on("modify", (file) => {
    if (file?.path !== SCRIPT_PATH) return;
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => reloadSelf().then(() => window.__todoUpdateStats()).catch(console.error), 600);
  });
  window.__todoHookVersion = HOOK_VERSION;
}

// ---------------------------------------------------------------- günlük görevler
function noteText(day, habit, name) {
  return [
    "---",
    `name: "${name}"`,
    `due: ${day}`,
    "done: false",
    "stretch_1: false",
    "stretch_2: false",
    `habit: "${habit}"`,
    "linked: true",
    "tags: []",
    `task_id: "${crypto.randomUUID().replace(/-/g, "")}"`,
    "---",
    "",
  ].join("\n");
}
async function ensureDay(day) {
  const created = [];
  const cfg = readSettings();
  for (const [habit, name] of Object.entries(HABITS)) {
    const path = `${TASKS}/${day} ${name}.md`;
    if (app.vault.getAbstractFileByPath(path)) continue;
    if (habit === "thoughts" && day < cfg.thoughtsStartOn) continue;
    try {
      await app.vault.create(path, noteText(day, habit, name));
      created.push(path);
    } catch (e) {
      if (!/already exists/i.test(String(e))) throw e; // aynı anda başka bir çalıştırma ekledi
    }
  }
  const sf = app.vault.getAbstractFileByPath(SETTINGS_PATH);
  if (sf)
    await app.fileManager.processFrontMatter(sf, (fm) => {
      const cur = fmDay(fm.generatedThrough);
      if (!cur || day > cur) fm.generatedThrough = day;
      const first = window.moment().format("YYYY-MM-DD");
      for (const k of START_KEYS) if (!fm[k]) fm[k] = first; // ilk çalıştırmada başlangıç tarihleri bugün olur
    });
  return created;
}

// Bugünün notunu günceller. Kutular doğrudan Meta Bind ile çalışır; bu işlem bir düğmeye ya da şablona bağlamak içindir.
// Status alanına ve ilgisiz alanlara dokunmaz.
//   stretch: 0 → 1 → 2 → 0 kutu · walking, med, thoughts: aç/kapa
async function complete(tp, habit) {
  const name = HABITS[habit];
  if (!name) throw new Error(`Bilinmeyen alışkanlık: ${habit}`);
  const day = window.moment().format("YYYY-MM-DD");
  await ensureDay(day);
  const file = app.vault.getAbstractFileByPath(`${TASKS}/${day} ${name}.md`);
  if (!file) throw new Error(`Not bulunamadı: ${day} ${name}`);
  let msg = "";
  await app.fileManager.processFrontMatter(file, (fm) => {
    if (habit === "stretch") {
      const next = ((fm.stretch_1 === true ? 1 : 0) + (fm.stretch_2 === true ? 1 : 0) + 1) % 3;
      fm.stretch_1 = next >= 1;
      fm.stretch_2 = next >= 2;
      fm.done = next === 2;
      msg = `${next} / 2`;
    } else {
      fm.done = fm.done !== true;
      msg = fm.done ? "tamamlandı" : "geri alındı";
    }
  });
  new tp.obsidian.Notice(`${name}: ${msg} (${day})`);
  hook();
  await sleep(500);
  await updateStats();
}

module.exports = async function (tp, action, arg) {
  if (action === "ensure") return ensureDay(arg);
  if (action === "complete") return complete(tp, arg);
  if (action === "stats" || action === "prepare") {
    hook();
    return prepare();
  }
  throw new Error(`Bilinmeyen eylem: ${action}`);
};
// Node testleri için (Obsidian içinde kullanılmaz)
module.exports.computeStats = computeStats;
module.exports.renderPanel = renderPanel;
module.exports.isDone = isDone;
// Yeniden yükleme ve testler için (günlük kullanımda çağrılmaz)
module.exports.__updateStats = updateStats;
module.exports.__prepare = prepare;
module.exports.__onClick = onClick;
module.exports.__reloadSelf = reloadSelf;
module.exports.__hook = hook;
