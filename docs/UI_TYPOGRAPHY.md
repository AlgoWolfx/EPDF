# Arayüz tipografisi

Arayüz, Windows'ta bulunan Segoe UI Variable Text/Display ailelerini kullanır; bulunmadığında Segoe UI ve sistem yazı tiplerine geçer. Ana kontroller 13 px, açıklamalar 12 px, açılış açıklaması 14 px, ana başlıklar 20 px olarak tanımlanır. Boyutlar ve ağırlıklar `renderer/styles.css` değişkenlerinden yönetilir. PDF metin düzenleyicisinin belgeye ait font ve ölçüleri ayrı kalır.

## Kontrol bulguları

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | `renderer/styles.css:8`, `:19`, `:24`, `:112` | 10–12 px arasında dağınık açıklama/arayüz boyutları | 12/13/14/20 px ölçeği; 400/500/600 ağırlık; metin ve başlık fontları | Tutarlı hiyerarşi ve küçük yazılarda okunabilirlik |
| MEDIUM | `renderer/styles.css:116` | 800 px pencerede gezinme sekmeleri ve İngilizce görsel düğmeleri kesiliyor | Dar görünümde dikey sekmeler, sığan küçük resimler ve özellik kontrolleri | Etiketler erişilebilir ve yatay taşma yok |
| LOW | `renderer/desktop.js:57` | Uzun dosya adı kesildiğinde tam ad için ipucu yok | Dosya sekmesinde tam adı gösteren başlık | Kesilen bilginin geri alınabilir olması |
| LOW | `renderer/styles.css:19` | Arayüzün tamamında metin seçimi kapalı | Seçim yalnızca PDF jest yüzeyinde kapalı | Açıklamalar ve dosya adları seçilip kopyalanabilir |

## Doğrulama

- Gerçek Electron'da 1280 × 860 ve 800 × 500 pencere; açık/koyu tema ve TR/EN görünümü incelendi.
- Açılış ekranı, PDF açıkken metin özellikleri ve seçili görsel özellikleri ekran görüntüleriyle kontrol edildi.
- Hesaplanan ana font: Segoe UI Variable Text, 13 px / 18.2 px. Açıklamalar: 12 px. Başlıklar: 20 px, alt başlıklar: 14 px; gövde satır aralığı 1.55.
- Dar görünümde menü, gezinme ve özellik alanlarının `scrollWidth` değerleri `clientWidth` değerlerini aşmıyor. PDF çalışma alanı ve uzun araç çubuğu gerektiğinde kaydırılabilir.
- `npm test` geçti: gerçek PDF düzenleme/kayıt, resim boyutlandırma, OCR, arama, sayfa işlemleri ve geçmiş kontrolleri.
- **Not verified:** Segoe UI Variable bulunmayan Windows sürümlerindeki yedek fontun görsel görünümü; farklı ekran ölçekleri; henüz üretilmeyen yeni görseller.

**Approve:** incelenen pencere boyutları ve temalarda HIGH tipografi bulgusu kalmadı.
