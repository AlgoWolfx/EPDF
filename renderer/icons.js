// A single stroke icon family, local assets with no network/font dependency.
const paths = {
  open:'M3 7h7l2 2h9l-3 11H3zM3 7V4h7l2 3',
  save:'M4 3h14l3 3v15H3V3zM7 3v6h10V3M7 21v-8h10v8',
  undo:'M8 5 3 10l5 5M3 10h11a6 6 0 0 1 0 12',
  redo:'m16 5 5 5-5 5M21 10H10a6 6 0 0 0 0 12',
  select:'m5 3 14 10-7 1-3 7z',hand:'M8 12V6a2 2 0 0 1 4 0v5-7V4a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v9c0 5-3 7-7 7-3 0-5-2-7-6l-2-4a2 2 0 0 1 3-2z',
  edit:'M3 20h6l11-11-6-6L3 14zM12 5l6 6M3 20l3-6 6 3',
  text:'M4 4h16M12 4v16M8 20h8',pen:'m4 20 2-6L17 3l4 4L10 18zM14 6l4 4',
  image:'M3 4h18v16H3zM3 17l6-7 4 4 3-3 5 6M17 8h.01',
  highlight:'m7 16 9-12 5 4-9 12zM7 16l5 4M3 21h8',
  hlrect:'M3 7h18v10H3zM6 20h12',underline:'M6 3v9a6 6 0 0 0 12 0V3M4 21h16',
  line:'M4 20 20 4',arrow:'M4 20 20 4M10 4h10v10',rect:'M3 5h18v14H3z',ellipse:'M21 12a9 7 0 1 1-18 0 9 7 0 1 1 18 0',
  eraser:'m3 14 10-11 8 7-10 11H9zM8 9l8 7M11 21h10',
  ocr:'M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M7 9h10M7 13h10M7 17h6',
  search:'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 1 1 16 0',
  close:'m6 6 12 12M6 18 18 6',theme:'M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9',
  up:'m6 15 6-6 6 6',down:'m6 9 6 6 6-6',minus:'M5 12h14',plus:'M5 12h14M12 5v14',
  fitwidth:'M3 4v16M21 4v16M5 12h14M8 9l-3 3 3 3M16 9l3 3-3 3',
  fitpage:'M7 3h10v18H7zM2 6v12M22 6v12'
};
export function installIcons(root = document) {
  for(const button of root.querySelectorAll('[data-close-dialog],#btnCloseOCR')){button.dataset.icon='close';button.textContent='';}
  for (const button of root.querySelectorAll('[data-icon]')) {
    if(button.dataset.tool)button.setAttribute('aria-pressed',String(button.classList.contains('active')));
    if (button.querySelector('svg')) continue;
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('class','icon'); svg.setAttribute('aria-hidden','true');
    const path = document.createElementNS(svg.namespaceURI,'path'); path.setAttribute('d',paths[button.dataset.icon] || paths.text);
    svg.append(path); button.prepend(svg);
    if (!button.textContent.trim()) button.setAttribute('aria-label',button.title);
  }
}
