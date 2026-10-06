# EPDF · Ders PDF Editor

**EGORA DIGITAL ve Yiğit Osman Bayrak tarafından geliştirilen ücretsiz, çevrimdışı PDF düzenleyicisi.**

Taranmış PDF'lerde Türkçe ve İngilizce yazıları çevrimdışı tanı; metni düzelt, PDF'in mevcut metnini değiştir, not ekle ve sayfaları düzenle. Hesap gerekmez; PDF'ler bilgisayarında işlenir.

## İndir

[GitHub Releases](https://github.com/AlgoWolfx/EPDF/releases/latest) üzerinden Windows x64 sürümünü indir:

- **Setup.exe:** Windows'a kurulum; uygulama içinden güncelleme kontrolü ve kurulum.
- **Portable.exe:** Kurulumsuz kullanım; yeni sürümü Releases sayfasından indir.

## Özellikler

- **Çevrimdışı OCR:** Türkçe, İngilizce veya her iki dili kullanarak bu sayfayı ya da bütün sayfaları tara. Dil dosyaları uygulamada bulunur; ilk kullanımda da internet gerekmez.
- **OCR sonuçlarını düzelt:** Tanınan satırlar ve güven değerleri görünür. Düşük güvenli satırlar sarı çerçeveyle işaretlenir. Sonucu değiştirmeden önce kontrol et.
- **İki OCR çıktısı:** Aranabilir PDF seçeneği tarama görüntüsünü koruyup görünmez metin katmanı ekler. Düzenlenebilir metin PDF'i seçilen sayfalardaki görüntüyü tanınan metinle değiştirir; resimler ve tablo görünümü korunmaz. Bu seçenekte satırlar sonradan “Metni düzenle” ile değiştirilebilir.
- **Mevcut metni düzenle:** “Metni düzenle” aracını seç ve PDF üzerindeki metin kutusuna tıkla. Yeni metni, boyutunu ve rengini belirle. Alanı boş bırakarak metni sil. Eski metin nesnesi PDF içeriğinden kaldırılır; üzerine beyaz bir kutu konmaz.
- **Sayfaları yönet:** Sayfaları sırala, 90° döndür veya sil. Değişiklikler anında önizlenir ve geri alınabilir.
- **Not ve çizim:** Kalem, fosforlu kalem, vurgu, alt çizgi, yazı, çizgi, ok, dikdörtgen, elips ve eklenen notlar için silgi.
- **Geri al / yinele:** Metin, sayfa ve not değişiklikleri için ortak geçmiş.
- **Türkçe / English:** Arayüz ve dosya diyalogları; dil tercihi sonraki açılışta korunur.
- **Yerel taslak:** Notlar, metin değişiklikleri ve sayfa planı bu bilgisayarda tutulur.
- **Güvenli kayıt:** Orijinal dosya korunur; ilk kayıtta farklı bir dosya adı seçilir.
- **Güncellemeler:** GitHub'dan kullanıcı isteğiyle kontrol ve indirme; kurulum için ayrıca “Yeniden başlat ve kur” seçilir.

## Desteklenen metin düzenleme

Doğrudan sayfaya yerleştirilmiş metin nesneleri düzenlenir. Yeni metin Unicode yazı tipiyle orijinal konuma eklenir; orijinal PDF'in yazı tipiyle görünümü aynı olmayabilir. Bu sürüm paragrafları otomatik yeniden yerleştirmez. Çok uzun metinler komşu içerikle çakışabilir; boyutu ve satırları önizlemede kontrol et.

Taranmış PDF'lerde **OCR · Metin tanı** düğmesini kullan. OCR her yazıyı kusursuz tanımaz; düşük çözünürlük, eğiklik, el yazısı ve karmaşık tablolar sonuçları etkileyebilir. Aranabilir PDF oluştururken taramadaki görünen yazı değiştirilmez; düzeltilen metin arama/kopyalama katmanına uygulanır. Görünen yazıyı düzenlemek için düzenlenebilir metin PDF'i seç; bu seçenek orijinal sayfa görsellerini kaldırır. Orijinal dosya korunur.

Metin katmanı bulunan sayfalar varsayılan olarak atlanır. Kısmen taranmış bir sayfada gerekirse “Metin içeren sayfaları da tara” seçeneğini kullan; aranabilir çıktıda mevcut metinle çift katman oluşabilir. OCR mevcut sayfa dönüşünü kullanır, otomatik eğiklik/yön düzeltme yapmaz; yan duran taramayı önce Sayfalar ile döndür. Form XObject içine gömülü, çarpık veya dikey metin nesneleri için doğrudan metin düzenleme desteklenmez. Şifreli PDF'ler desteklenmez.

Taslak, PDF dosyasına kaydetmenin yerine geçmez. Dışa aktarılan notlar PDF'e kalıcı işlenir. Düzenlemeye devam etmek için orijinal PDF'i aynı bilgisayarda aç veya çıktıdaki yeni metni tekrar “Metni düzenle” ile seç.

## Gizlilik

PDF'ler, taslaklar ve düzenleme işlemleri bilgisayarında kalır. Uygulama PDF'lerini bir sunucuya yüklemez. Güncelleme kontrolü GitHub'a bağlanır. Destek bağlantılarını açtığında ilgili site varsayılan tarayıcında açılır.

## Geliştirme

Node.js 22 veya üzeri:

```powershell
npm ci
npm start
npm test
npm run dist
npm run dist:portable
```

Çıktılar `dist/` klasöründedir. `Baslat.bat`, bağımlılıklar kurulduktan sonra uygulamayı açar; PDF dosyasını bu dosyanın üzerine sürükleyebilirsin.

`npm test`, gerçek Electron uygulamasında PDF düzenleme ve **HTTP/HTTPS istekleri engellenmişken gerçek TR/EN OCR** akışını doğrular: tanıma, iptal, toplu tarama, sonuç düzeltme, aranabilir metin katmanı ve düzenlenebilir OCR PDF'i. GitHub Actions aynı kontrolleri çalıştırır.

## Yeni sürüm yayınlama

```powershell
npm test
npm version patch
git push origin main --follow-tags
```

GitHub Actions sürüm etiketinden kurulum ve taşınabilir dosyaları üretip GitHub Releases'e ekler. `latest.yml` ve `.blockmap` dosyaları uygulama içi güncelleme için aynı sürümde tutulmalıdır. Detaylar: [CONTRIBUTING.md](CONTRIBUTING.md).

## Gönüllü destek

Uygulamayı faydalı bulduysan GitHub'da yıldız verebilir veya Instagram hesaplarımızı takip edebilirsin. Destek tamamen isteğe bağlıdır; tüm araçlar ücretsizdir.

- [GitHub'da yıldız ver](https://github.com/AlgoWolfx/EPDF)
- [EGORA DIGITAL Instagram](https://www.instagram.com/egora.digital/)
- [Yiğit Osman Bayrak Instagram](https://www.instagram.com/yigitx.x/)
- [EGORA DIGITAL web sitesi](https://egoradigital.com/)

Bağlantılar `renderer/brand.js` içinden yönetilir.

## Lisanslar

Üçüncü taraf bileşenlerin lisansları [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) ve `licenses/` içindedir. EPDF kaynak kodu için ayrı bir lisans henüz belirlenmedi; uygulama ücretsiz dağıtılmak üzere hazırlanmıştır.
