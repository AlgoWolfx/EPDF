# EPDF 2.0 validation
The source and packaged application run the same real Electron tests. Test documents and screenshots are generated in a temporary directory; no private document or remote OCR service is used.

| Representative fixture | Validation |
| --- | --- |
| Native digital PDF | Existing text removal, inline editing, Unicode, selection, movement, copy/paste, undo/redo, original-file protection |
| Scan | Actual TR/EN OCR; word geometry/confidence; hidden layer and visible regional replacement |
| Mixed native text and scan | Image coverage classification; native-only pages skipped |
| Rotated scan | Actual OCR at corrected viewing rotation; coordinates exported back to the original rotated PDF; illustration pixels preserved |
| Multiple columns | Other column retained after replacing one text object |
| Table | Rules retained; unchanged table region compared pixel for pixel |
| Different fonts and sizes | Extracted source font/glyph model; Times replacement at requested size |
| Colored text / illustration | Requested text fill serialized; illustration untouched |
| 125-page PDF | Lazy initial page requests/canvases; page 100 navigation; whole-document native search; image corner enlargement/reduction, aspect lock/unlock, rotated opposite-corner anchoring, one-step undo/redo and size buttons; cropped-image export retains all pages |
| Low-resolution scan | Actual recognition, spatial model and editable PDF export |

Additional checks: fully offline Portuguese recognition; automatic OCR from Edit Text; cancel before recognition; edit a native page during recognition of another page; cancellation preserves that edit; support links; TR/EN UI; update UI; light/dark screenshots; OCR search and highlight.

Two readers validate output: PDF.js text/operator/rendering and PDFium native objects/glyphs. Pixel comparisons verify removal of old scan letters after replacement and exact retention of a separate illustration/table region. No whole-page screenshot replacement is used.

Performance assertions bound initial page requests to fewer than 35 and live full-page canvases to fewer than 10 for the 125-page fixture. Measured timings are printed per run and are machine-specific, not general benchmarks. Search indexes remaining pages asynchronously when requested.

Limits: synthetic representative documents cannot cover every PDF content stream or every real scan. Automatic deskew/orientation, handwriting models, encryption, text inside Form XObjects, mirrored/skewed/vertical text and original embedded-image editing remain unsupported. Background reconstruction targets light paper, retaining long horizontal rules; complex textures and vertical rules intersecting letters need visual review. Font substitution may change metrics. Adobe/Foxit are not installed in this test environment; compatibility is checked with the two independent PDF engines above.
