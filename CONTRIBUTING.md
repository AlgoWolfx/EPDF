# EPDF geliştirme

1. Node.js 22 veya üzerini kurun.
2. `npm ci` ve `npm start` ile uygulamayı başlatın.
3. `npm test` ile gerçek Electron içinde PDF işlemlerini doğrulayın.
4. Değişiklikleri açıklayan bir pull request açın.

## Yeni dil ekleme

Türkçe metinler kaynak dil olarak kullanılır. İngilizce karşılıkları `renderer/locales/en.json` içindedir. Yeni dil için aynı anahtarlarla bir JSON dosyası ekleyip `renderer/i18n.js`, `main.js` dil seçimi ve `languageSelect` seçeneklerini güncelleyin. Kullanıcının PDF metnini çeviri sözlüğüne eklemeyin.

## OCR dili ekleme

`@tesseract.js-data/<dil>` bağımlılığını ekleyin. `renderer/ocr.js` içindeki dil kayıtlarını, `main.js` yerel model protokolü izin listesini, OCR dil seçeneklerini ve `package.json` paketleme dosyalarını güncelleyin. `4.0.0_best_int` modeli ve ilgili üçüncü taraf lisansı pakette bulunmalı. Testi HTTP/HTTPS engelliyken hem kaynak hem paketlenmiş uygulamada çalıştırın.

## Sürüm yayınlama

```powershell
npm test
npm version patch
git push origin main --follow-tags
```

`v*` etiketi, GitHub Actions üzerinden kurulum ve taşınabilir sürümü üretir; EXE dosyalarını, blockmap ve `latest.yml` güncelleme bilgisini GitHub Releases üzerinde yayınlar. Sürüm etiketi `package.json` sürümüyle eşleşmelidir.

Kurulu Windows sürümü güncellemeleri kullanıcının isteğiyle kontrol eder ve indirir. Kurulum için kullanıcının “Yeniden başlat ve kur” düğmesine basması gerekir. Taşınabilir sürüm güncellemeleri sürümler sayfasından alır.
