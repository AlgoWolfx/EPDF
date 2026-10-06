import english from './locales/en.json' with { type: 'json' };

let language = 'tr';
try { language = localStorage.getItem('epdf:language') === 'en' ? 'en' : 'tr'; } catch { /* defaults */ }
const originals = new WeakMap();
const originalAttributes = new WeakMap();
export function t(source, params = {}) {
  let value = language === 'en' ? (english[source] ?? source) : source;
  for (const [key, replacement] of Object.entries(params)) value = value.replaceAll(`{${key}}`, String(replacement));
  return value;
}
export function applyTranslations() {
  document.documentElement.lang = language;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement.closest('script, style, textarea, option:not([data-translate]), #toast, #documentStatus, #appVersion, #updateStatus, #ocrStatus, #pageTotal, #zoomLabel, #pageList, [data-user-content]')) continue;
    if (!originals.has(node)) originals.set(node, node.textContent);
    const source = originals.get(node);
    const clean = source.trim();
    node.textContent = clean ? source.replace(clean, t(clean)) : source;
  }
  for (const element of document.querySelectorAll('[title], [aria-label], [placeholder]')) {
    if (!originalAttributes.has(element)) originalAttributes.set(element, Object.fromEntries(['title', 'aria-label', 'placeholder'].filter(name => element.hasAttribute(name)).map(name => [name, element.getAttribute(name)])));
    for (const [name, source] of Object.entries(originalAttributes.get(element))) element.setAttribute(name, t(source));
  }
  document.getElementById('languageSelect').value = language;
  document.getElementById('viewer').dataset.dropLabel = t("PDF'i bırak");
  window.api.setLanguage(language);
}
export function setLanguage(value) {
  language = value === 'en' ? 'en' : 'tr';
  try { localStorage.setItem('epdf:language', language); } catch { /* unavailable storage */ }
  applyTranslations();
}
