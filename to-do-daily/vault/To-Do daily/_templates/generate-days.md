<%*
// "Bugünü oluştur" düğmesi ve (açıksa) Obsidian başlangıcı çalıştırır.
// Bugünün eksik görev notlarını ekler, sonra sayaçları yeniler.
// Geçmiş günleri de doldurmak için tarih yaz: örn. "2026-01-01"
const BACKFILL_FROM = null;
const ayar = app.metadataCache.getFileCache(app.vault.getAbstractFileByPath("To-Do daily/Ayarlar.md"))?.frontmatter;
const otomatik = String(tp.config.run_mode) === "5"; // 5 = başlangıç şablonu
if (!(otomatik && ayar && ayar.recurrence === false)) {
  const end = tp.date.now("YYYY-MM-DD");
  let day = BACKFILL_FROM || end;
  while (day <= end) {
    await tp.user.todo(tp, "ensure", day);
    day = window.moment(day, "YYYY-MM-DD").add(1, "day").format("YYYY-MM-DD");
  }
}
await tp.user.todo(tp, "stats");
-%>
