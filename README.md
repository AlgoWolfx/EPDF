# EPDF
**EGORA DIGITAL ve Yiğit Osman Bayrak tarafından geliştirilen ücretsiz, çevrimdışı Windows PDF düzenleyicisi.**

[Windows sürümünü indir](https://github.com/AlgoWolfx/EPDF/releases/latest): **Setup.exe** kurulum ve uygulama içinden güncelleme; **Portable.exe** kurulumsuz kullanım. Hesap gerekmez. PDF ve OCR işlemleri bilgisayarında yapılır.

## Düzenleme
- Belge merkezli masaüstü arayüzü: dosya menüsü, belge başlığı, tek biçimli araçlar, sayfa küçük resimleri, içindekiler ve bağlamsal özellikler.
- Açık/koyu tema; Türkçe ve İngilizce arayüz. Tercihler sonraki açılışta korunur.
- **Mevcut metin:** Metni düzenle aracında yazıya tıkla. Doğrudan belge üzerindeki kutuda yaz; sağ panelden yazı tipi, boyut, renk, hizalama, satır/harf aralığı, konum ve kutu genişliğini değiştir. Ctrl+Enter uygular; Escape bekleyen düzenlemeyi iptal eder.
- **Seç:** Tek tıklamayla metin veya eklediğin nesneyi seç; çift tıklamayla metni düzenle. Metni sürükle, sağ kenarından kutusunu boyutlandır veya ok tuşlarıyla taşı. Shift+ok 10 birim taşır. Delete siler; Ctrl+C / Ctrl+V desteklenen nesneleri kopyalayıp ekler.
- **Metin ve resim ekle:** PNG/JPEG yerleştir ve seç. Köşe tutamaçlarından sürükleyerek boyutlandır; “Oranı koru” varsayılan olarak açıktır. Sağ panelden genişlik/yükseklik gir veya Büyüt/Küçült düğmelerini kullan. Resmi taşı, döndür, opaklığını değiştir, kırp veya değiştir. Bir boyutlandırma hareketi tek adımda geri alınır.
- Kalem, fosforlu kalem, vurgu, alt çizgi, çizgi, ok, dikdörtgen, elips ve eklenen notlar için silgi.
- Sayfaları sırala, 90° döndür veya sil. Ortak Ctrl+Z / Ctrl+Y geçmişi metin, OCR, resim, not ve sayfa işlemlerini kapsar.
- **Ctrl+F:** Özgün PDF metni, düzenlenen metin, eklenen yazılar ve OCR satırları içinde ara. Sonuca tıklayınca ilgili sayfa ve bölge vurgulanır.
- Kaydır aracı, sayfa gezinme, yakınlaştırma, genişliğe/sayfaya sığdırma.

## Taranmış PDF ve OCR
**Türkçe, İngilizce ve Portekizce** dil modelleri uygulamada bulunur; ilk kullanımda da internet gerekmez.

Metni düzenle aracında taranmış yazıya tıklamak OCR'yi otomatik başlatır. OCR panelinden bu sayfayı veya tüm sayfaları da tanıyabilirsin. Kullanışlı yerel metin bulunan sayfalar atlanır; görüntü ağırlıklı ve karma sayfalar değerlendirilir. Gerekirse zorla tanıma seçeneğini kullan.

OCR, blok/satır/kelime sırasını, koordinatları, güven değerini, yönü ve tahmini metin rengini tutar. Panelin **Arka planda** düğmesiyle çalışmaya devam et; alt çubuktaki OCR durumuna tıklayarak panele dön. Geçerli sayfa önceliklidir. Sonuçlar açık belge için önbelleğe alınır. İptal başka sayfalarda yaptığın düzenlemeleri geri almaz.

- **Aranabilir PDF:** Özgün tarama korunur; tanınan metin görünmez arama/kopyalama katmanına eklenir. İnceleme panelindeki düzeltmeler bu katmanı değiştirir.
- **Taramayı koruyarak metin düzenle:** Değişmeyen satırlar görünmez kalır. Değiştirdiğin/sildiğin satırın eski harfleri yalnızca o bölgede yerel bir yama ile temizlenir; yeni metin gerçek PDF metni olarak eklenir. Sayfanın tamamı yeniden oluşturulmaz. Diğer görseller ve tablolar korunur.

Sarı inceleme alanları düşük güveni gösterir; şüpheli metin otomatik değiştirilmez. Arka plan onarımı açık renkli kâğıt için tasarlanmıştır. Fotoğraf/doku üzerindeki yazıları kontrol et. Yan duran taramayı Sayfalar ile döndür; otomatik eğiklik/yön düzeltmesi ve el yazısı için özel model yoktur.

## Kayıt ve destek sınırları
Özgün PDF baytları değişmez; düzenleme modeli çıktı üretilirken uygulanır. İlk kayıtta ayrı bir dosya adı seçilir. Yerel taslak, dosyanın SHA-256 özetiyle eşleştirilir. Büyük taslak depolanamazsa uygulama bildirir; PDF olarak kaydet.

Yerel PDF metin nesneleri PDFium ile kaldırılır, yerine gerçek metin yazılır. PDF'nin gömülü yazı tipi her zaman yeniden kullanılamadığından Windows yazı tiplerinden bir karşılık gömülür. Otomatik paragraf akışı yoktur; uzun metinlerin komşu içerikle çakışmadığını önizlemede kontrol et. Form XObject içinde gömülü, aynalanmış/çarpık ve dikey metin için doğrudan düzenleme; şifreli PDF açma; özgün gömülü resimleri seçerek değiştirme henüz desteklenmez. Resim araçları EPDF'de eklediğin resimler içindir.

Dışa aktarılan değişiklikler standart PDF içeriğine işlenir. Kaynak belgeyi aynı bilgisayarda açarak taslağa devam edebilir veya çıktıdaki gerçek metni yeniden seçebilirsin.

## Geliştirme ve doğrulama
Node.js 22 veya üzeri:
```powershell
npm ci
npm start
npm test
npm run dist
npm run dist:portable
```
Çıktılar `dist/` içindedir. `Baslat.bat` uygulamayı başlatır; PDF'yi üzerine sürükleyebilirsin.

`npm test` gerçek Electron'da çalışır. HTTP/HTTPS engelliyken TR/EN/PT OCR, otomatik tanıma, iptal sırasında bağımsız düzenleme, yerel metin, Unicode, stil/konum, sayfa işlemleri, kırpılmış resim, geçmiş, tema, arama ve 125 sayfalı belge kontrol edilir. Çıktılar PDF.js ve PDFium ile yeniden açılır; tarama düzenlemesinde değişmeyen tablo/görsel pikselleri karşılaştırılır. Ayrıntılar: [doğrulama kapsamı](docs/VALIDATION.md), [mimari](docs/ARCHITECTURE.md).

PDFium, PDF oluşturma/yazı tipi altkümesi ve Tesseract ayrı işçilerde çalışır. Sayfa görüntüleri ve küçük resimler ihtiyaç oldukça üretilir.

Arayüz Segoe UI Variable/Segoe UI ile çevrimdışı çalışır. [Görsel üretim promptları](docs/ASSET_PROMPTS.md) uygulama ikonu, açılış illüstrasyonu ve isteğe bağlı GitHub tanıtım görselini tarif eder. [Tipografi kontrolü](docs/UI_TYPOGRAPHY.md).

## Güncellemeler
GitHub üzerinden kullanıcı isteğiyle kontrol, indirme ve yeniden başlatarak kurulum. Portable sürüm yeni dosyayı Releases üzerinden alır.
```powershell
npm test
npm version patch
git push origin main --follow-tags
```
Sürüm etiketi GitHub Actions ile Setup/Portable, blockmap ve `latest.yml` üretir. [Katkı rehberi](CONTRIBUTING.md).

## Gönüllü destek
Tüm araçlar ücretsizdir. Faydalı bulduysan:
- [GitHub'da yıldız ver](https://github.com/AlgoWolfx/EPDF)
- [EGORA DIGITAL Instagram](https://www.instagram.com/egora.digital/)
- [Yiğit Osman Bayrak Instagram](https://www.instagram.com/yigitx.x/)
- [EGORA DIGITAL web sitesi](https://egoradigital.com/)

PDF'ler sunucuya yüklenmez. Güncelleme kontrolü GitHub'a bağlanır; destek bağlantıları varsayılan tarayıcıda açılır.

## Lisanslar
Üçüncü taraf lisansları [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) ve `licenses/` içindedir. EPDF kaynak kodu için ayrı bir lisans henüz belirlenmedi; uygulama ücretsiz dağıtılır.
