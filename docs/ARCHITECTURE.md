# EPDF architecture

Electron owns file dialogs, local assets, system fonts and Windows updates. The isolated renderer uses plain ES modules; no framework migration is needed.

PDF.js renders the original/edited PDF in a worker. PDFium identifies and removes original native text objects in a separate worker; pdf-lib serializes replacement text, regional scan patches, annotations and the page arrangement in the export worker. Tesseract runs recognition with bundled language data. Regional background sampling/PNG creation also runs in a cancellable worker. Original bytes remain immutable.

Dependency flow: app orchestration → desktop shell / inline editor / search / OCR UI → spatial model and history → PDF export → PDFium + pdf-lib. Geometry is shared between annotation drawing, hit testing and export. Styling uses one token system for both themes.

All document changes share EditHistory. OCR is staged until applied, cancellation leaves the document intact, and page results are cached for the open document. Scan editing preserves the original page and overlays only reconstructed regions of changed lines. Unchanged OCR lines are invisible searchable text. Local reconstruction targets bright paper; textured backgrounds require manual review.

Page canvases and thumbnails render lazily. Source viewports load on demand. OCR gives the current page priority, runs sequentially with a pixel limit and can remain open without blocking editing. Search combines native spans, replacements, annotations and OCR lines, using source coordinates across page rotations.

Native fonts embedded in arbitrary PDFs cannot always be reused. EPDF embeds Windows system font substitutions on export and rejects unsupported native transformations. Added PNG/JPEG objects support dimensions, rotation, opacity, replacement and cropping; cropping serializes only the cropped image, never rasterizing its page. Form-XObject text, automatic paragraph reflow, scan deskew, encrypted PDFs, original embedded-image selection and handwriting recognition remain unsupported.
