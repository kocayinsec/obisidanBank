---
tags: [todo]
---

Bu not [[To-Do daily/@to-Do daily|@to-Do daily]] sayfasının kılavuzudur. Günlük sayfada yalnızca bugünün işi durur; açıklamalar burada. Ayar değerleri [[To-Do daily/Ayarlar|Ayarlar]] notunda.

## Bugün paneli

- **Kutular:** walking, meditation ve thoughts için birer, stretch için iki yuvarlak onay düğmesi var. Düğmeye dokunmak ilgili görev notundaki alanı değiştirir, ikinci dokunuş geri alır. Kutunun rengi anında değişir; gösterge ve sayılar birkaç saniye içinde yenilenir.
- **Gösterge:** walking, meditation, thoughts ve stretch’ten kaçının tamamlandığını sayar. Üzerine gelince bu hafta, bu ay ve bu yıl oranları görünür.
- **Tamamlandı tanımı:** walking, meditation ve thoughts için Done kutusu; stretch için iki kutunun ikisi de. Gösterge, hafta ızgarası, hafta/ay/yıl oranları ve Analiz grafikleri aynı kuralı kullanır.
- **Hafta ızgarası:** varsayılan olarak bu hafta (pazartesi–pazar), satır = rutin, sütun = gün; bugünün sütunu mor başlıklıdır, gelecek günler soluk bir nokta. Her hücre bugünkü kutularla aynı yuvarlak düğmedir (stretch’te iki tane); dokunmak o günün görev notundaki alanı değiştirir, ikinci dokunuş geri alır. Başlığın sağındaki **‹ bugün ›** düğmeleri haftayı değiştirir: ‹ bir hafta geriye, › ileriye, “bugün” bu haftaya döner. En eski kaydın haftasından öteye ve bu haftadan ileriye gidilmez. Seçili hafta, Obsidian açık kaldığı sürece ve gece yarısına kadar hatırlanır. Başlığın sağındaki “1 / 8”, görünen haftada kaydı olan rutin günlerinden kaçının tamamlandığıdır. Notu olmayan geçmiş gün kesik çizgili halkadır: üzerine gelince + çıkar, dokununca o günün eksik görev notları oluşturulur (kayıt sayıları ve oranlar o günü de sayar) ve kutular açılır. Rutinin başlamadığı günler “–” görünür (thoughts için Ayarlar’daki başlangıç gününden önce).
- **Toplam kartı:** solda walking, meditation, thoughts ve stretch’in genel toplam tamamlanma sayısı. Sağda her etkinliğin kendi sayısı ve “/ N gün” olarak kayıtlı günlerinin kaçını tamamladığı, ince çubukla. Satırların üzerine gelince ilk kayıt tarihi ve ayrıntı yazar.
- **Otomatik hazırlık:** bugünün eksik görevleri günlük sayfa her açıldığında ve gece yarısı eklenir; panel görev değişince kendini yeniler. Bu dinleyici, Obsidian oturumunda başlangıç şablonu ya da aşağıdaki Bakım düğmelerinden biri bir kez çalışınca kurulur. Obsidian her açıldığında kendiliğinden kurulması için Ayarlar → Templater → **Enable startup templates** açık olmalı; bu, cihaza özel bir ayardır ve yalnızca Templater’ın kendi ayar ekranından açılır. `todo.js` kaydedilince açık oturumdaki dinleyici yeni sürümü kendiliğinden yükler.
- **Görünüm:** günlük sayfa Reading görünümünde açılır; kutulara dokunurken Live Preview’un ham `![[Sayaçlar]]` satırını göstermemesi için. Sayfayı düzenlemek için Cmd+E (Windows ve Linux’ta Ctrl+E).

## Görünümler

Tüm görevler `Tasks/` klasöründe, her görev ayrı bir not. Görünümler [[To-Do daily.base|To-Do daily.base]] dosyasında: **Bugün**, **Bu hafta**, **Takvim**, **Alışkanlıklar**, **Son kayıtlar**, **Tüm görevler**. Bugün görünümü günlük sayfada yok (panelin kutuları onun yerini aldı) ama .base içinde duruyor. Tablolardaki Tamam ve Stretch alanları hücreden doğrudan düzenlenir. Takvim görünümü Just Simple Calendar eklentisindendir: boş bir güne çift tıklayınca o güne yeni bir not açılır; mor tamamlananı, renksiz bekleyeni gösterir.

Her rutin için yıllık ısı haritası [[Analiz.base|Analiz.base]] içinde (Life Tracker eklentisi): **Genel**, **Walking**, **Meditation**, **thoughts**, **Stretch ×2**.

## Kendine uyarlamak

- **Etiket ve süre:** `_scripts/todo.js` başındaki `TILES` (kutu etiketi, simge, süre yazısı) ve `GRID` (ızgara satır adı) sabitlerini düzenle. Betik kaydedilince açık oturumdaki panel yeni sürümle kendiliğinden yenilenir.
- **Not adı:** `HABITS` sabiti günlük notların adını belirler (örn. `2026-01-15 walking🍃30m`). Değiştirirsen eski notlar eski adıyla kalır; yalnızca yeni günler yeni adı alır.
- **Yeni rutin:** `HABITS`, `CORE`, `TILES` ve `GRID` sabitlerine birer satır ekle (örn. `reading`). Yeni rutin gösterge, ızgara, toplam kartı ve oranlara kendiliğinden girer; isterseniz Analiz.base’e bir Life Tracker görünümü de ekleyin.
- **Renkler:** `todo-daily.css` başındaki `--td-*` değişkenleri (açık ve koyu tema ayrı).
- **Başlangıç tarihleri ve diğer ayarlar:** Ayarlar notunda.

## Bakım

Normalde gerekmez. Bugünün görevleri ya da panel eksik görünürse bir kez bas: `BUTTON[td-days, td-stats]`
