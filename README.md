# EPDF · Ders PDF Editor

**EGORA DIGITAL ve Yiğit Osman Bayrak tarafından geliştirilen ücretsiz, çevrimdışı PDF düzenleyicisi.**

PDF'inin mevcut metnini değiştir, not ekle, sayfaları düzenle ve bir kopya kaydet. Hesap gerekmez; PDF'ler bilgisayarında işlenir. Türkçe ve İngilizce arayüz bulunur.

## İndir

[GitHub Releases](https://github.com/AlgoWolfx/EPDF/releases/latest) üzerinden Windows x64 sürümünü indir:

- **Setup.exe:** Windows'a kurulum; uygulama içinden güncelleme kontrolü ve kurulum.
- **Portable.exe:** Kurulumsuz kullanım; yeni sürümü Releases sayfasından indir.

## Özellikler

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

Taranmış PDF'ler resimden oluşur ve metin düzenlemek için OCR gerekir; bu sürüm OCR içermez. Form XObject içine gömülü, çarpık veya dikey metin nesneleri için doğrudan metin düzenleme desteklenmez. Şifreli PDF'ler desteklenmez. Not ekleme araçları taranmış PDF'lerde de kullanılabilir.

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

`npm test`, gerçek Electron uygulamasında mevcut metnin değiştirilip eski metnin PDF'den çıkarıldığını, Türkçe karakterleri, sayfa düzenlemelerini, dosya korumasını, çevirileri ve güncelleme arayüzünü doğrular. GitHub Actions her değişiklikte aynı kontrolleri çalıştırır.

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
