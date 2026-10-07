# EPDF görsel üretim promptları

EPDF, mavi vurgulu, açık ve koyu temalı bir masaüstü PDF düzenleyicisidir. Görsellerin aynı tasarım ailesinde olması için aşağıdaki paleti ve sade belge motifini koruyun. Uygulamanın araç çubuğu zaten SVG ikonlar kullanıyor; bu alan için ayrı resimler üretmeye gerek yok.

## 1. Uygulama ikonu

**Çıktı:** 1024 × 1024 PNG, şeffaf arka plan. Dış kenarlarda yaklaşık %10 boşluk. Küçük boyutta okunabilen tek bir sembol. Üretilen PNG'den Windows için çok boyutlu `.ico` hazırlanabilir; dosya uzantısını değiştirmek yeterli değildir.

```text
Design a polished Windows desktop application icon for EPDF, a free offline PDF editor. A single upright white document with a folded upper-right corner, inside a solid blue rounded-square tile. Integrate a bold geometric capital E into the document using three simple blue horizontal bars. The E is the only letter-like shape; do not add any other text. Use a consistent palette: primary blue #2469B4, light blue #C8DEF5, white #FFFFFF. Flat vector-style geometry, clean edges, carefully balanced spacing, strong silhouette, readable at 16 × 16 pixels. Front view, centered composition, approximately 10 percent transparent padding around the tile. 1024 × 1024 PNG with a genuinely transparent background outside the tile. No mockup, no device, no watermark, no tiny details, no gradients, no glass effect, no 3D rendering, no drop shadow outside the icon. Produce one icon, not a grid of alternatives.
```

## 2. PDF açılış ekranı illüstrasyonu

**Çıktı:** 1024 × 768 PNG, şeffaf arka plan. Uygulamada yaklaşık 144 piksel genişliğinde kullanılacak. Yazılar ve “PDF aç” düğmesi uygulamada gerçek metin olarak kalacak.

```text
Create a small, refined empty-state illustration for EPDF, a professional offline desktop PDF editor. Show one upright white document with a folded upper-right corner, three short blue lines representing editable text, a simple blue pencil resting beside the lower-right edge, and four subtle light-blue corner marks suggesting OCR recognition. Match a flat vector-style icon family with consistent strokes and restrained geometric shapes. Palette: primary blue #2469B4, light blue #C8DEF5, white #FFFFFF. Outline the white paper in blue so the illustration remains legible on both light gray and dark charcoal backgrounds. Calm, balanced, centered composition with generous transparent padding. 1024 × 768 PNG, genuinely transparent background. It must remain clear when displayed at 144 pixels wide. No letters, no words, no numbers, no logo text, no interface screenshot, no people, no mascot, no background scene, no gradients, no 3D, no glossy effects, no watermark. Produce a single illustration.
```

## 3. İsteğe bağlı GitHub tanıtım görseli

**Çıktı:** 1280 × 640 PNG. Bu görsel uygulama içindeki çalışma alanı için değil, GitHub veya tanıtım paylaşımı için hazırlanır. EPDF adı, özellikler ve geliştirici bilgisi sonradan gerçek yazı olarak eklenmeli; görsel üreticisinden metin çizmesi istenmemeli.

```text
Create a clean promotional background for a free offline desktop PDF editor called EPDF. 1280 × 640 landscape composition. Use a very light gray #F5F6F8 background with primary blue #2469B4 and light blue #C8DEF5 accents. Keep the left 55 percent mostly empty for a title and short feature description to be added later. On the right, arrange a white folded-corner document, a blue pencil, and a small OCR corner-frame motif in the same flat vector-style family. Restrained, professional, generous spacing, crisp geometric shapes. No text, no letters, no numbers, no watermark, no people, no stock-photo scenery, no fake application screenshot, no 3D, no glass effect. Do not include a border around the composition.
```

Sonradan eklenecek geliştirici bilgisi: **EGORA DIGITAL · Yiğit Osman Bayrak**. Özellik metni: **Ücretsiz PDF düzenleme · Çevrimdışı OCR**.

## Dosyaları teslim ederken

- İkon: `epdf-icon.png`
- Açılış illüstrasyonu: `epdf-welcome.png`
- İsteğe bağlı tanıtım arka planı: `epdf-social-background.png`
- Gerçek alfa şeffaflığı kullanın; şeffaflığı temsil eden dama desenini görselin içine çizmeyin.
- Modeller gerçek SVG üretmiyorsa PNG yeterlidir. PNG dosyasının uzantısını `.svg` olarak değiştirmeyin.

Bu dosyalar hazır olduğunda ikon boyutları, açık/koyu tema görünümü ve uygulama içindeki ölçekleri kontrol edilerek eklenecek. Mevcut ikon ve açılış sembolü şimdilik kullanılmaya devam ediyor.
