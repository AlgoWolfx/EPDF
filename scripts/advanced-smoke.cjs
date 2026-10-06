const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {PDFDocument,StandardFonts,rgb,degrees}=require('pdf-lib');
const {dialog}=require('electron');

module.exports=async({temp,win,evaluate,waitFor,scanPath,ocrOutput,networkAttempts,setSavePath})=>{
  // Two independent PDF engines read the serialized output.
  const objects=await evaluate(`(async()=>{const engine=await import('./pdf-engine.js');return engine.inspectTextObjects(await window.api.readFile(${JSON.stringify(ocrOutput)}),0);})()`);
  assert.ok(objects.some(item=>item.text.includes('EDITED OCR CONTENT')),'PDFium must reopen the edited OCR content');
  const regionOutput=path.join(temp,'region-edited.pdf');
  const preservation=await evaluate(`(async()=>{
    const pdfjs=await import('../node_modules/pdfjs-dist/build/pdf.min.mjs');
    const {buildPdf}=await import('./export.js');
    const bytes=await window.api.readFile(${JSON.stringify(scanPath)});
    const originalTask=pdfjs.getDocument({data:bytes.slice()}),original=await originalTask.promise;
    const first=await original.getPage(1),vp=first.getViewport({scale:1});
    const edits=JSON.parse(localStorage.getItem('ders-pdf:'+ ${JSON.stringify(scanPath)}));
    const ocr=edits[0].find(item=>item.type==='ocr');ocr.mode='editable';ocr.lines[0].text='NEW';ocr.lines[0].edited=true;
    const output=await buildPdf({bytes,annots:edits,viewports:[vp,(await original.getPage(2)).getViewport({scale:1})],fontBytes:await window.api.loadFont()});
    await window.api.writeFile(${JSON.stringify(regionOutput)},output);
    const editedTask=pdfjs.getDocument({data:output}),edited=await editedTask.promise;
    const render=async page=>{const canvas=document.createElement('canvas');canvas.width=800;canvas.height=450;await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport:page.getViewport({scale:1})}).promise;return canvas.getContext('2d').getImageData(0,0,800,450).data;};
    const a=await render(first),b=await render(await edited.getPage(1));
    let outside=0;
    // The colored illustration and table occupy this unchanged lower region.
    for(let y=240;y<430;y++)for(let x=30;x<780;x++){const i=(y*800+x)*4;for(let c=0;c<3;c++)if(a[i+c]!==b[i+c])outside++;}
    const line=ocr.lines[0];let oldInk=0,newInk=0;
    for(let y=Math.ceil(line.y);y<Math.floor(line.y+line.h);y++)for(let x=Math.ceil(line.x+line.w*.6);x<Math.floor(line.x+line.w);x++){
      const i=(y*800+x)*4;if(a[i]<150)oldInk++;if(b[i]<150)newInk++;
    }
    await originalTask.destroy();await editedTask.destroy();return {outside,oldInk,newInk,words:line.words.length};
  })()`);
  assert.equal(preservation.outside,0,'unchanged illustration/table pixels must survive export');
  assert.ok(preservation.oldInk>10 && preservation.newInk<5,JSON.stringify(preservation));
  assert.ok(preservation.words>=3,'OCR must retain individual spatial words');
  const searchablePath=path.join(temp,'reopened-searchable.pdf');
  const hiddenObjects=await evaluate(`(async()=>{
    const pdfjs=await import('../node_modules/pdfjs-dist/build/pdf.min.mjs');const {buildPdf}=await import('./export.js');const {inspectTextObjects}=await import('./pdf-engine.js');
    const bytes=await window.api.readFile(${JSON.stringify(scanPath)}),task=pdfjs.getDocument({data:bytes.slice()}),pdf=await task.promise;
    const annots=JSON.parse(localStorage.getItem('ders-pdf:'+ ${JSON.stringify(scanPath)})),ocr=annots[0].find(item=>item.type==='ocr');ocr.mode='searchable';ocr.lines[0].text='LEGACY SEARCH LAYER';
    const output=await buildPdf({bytes,annots,viewports:[(await pdf.getPage(1)).getViewport({scale:1}),(await pdf.getPage(2)).getViewport({scale:1})],fontBytes:await window.api.loadFont()});
    await window.api.writeFile(${JSON.stringify(searchablePath)},output);await task.destroy();return inspectTextObjects(output,0);
  })()`);
  assert.ok(hiddenObjects.some(item=>item.text.includes('LEGACY SEARCH LAYER')&&item.opacity===0),'hidden OCR detection must inspect actual PDF alpha');

  const complex=await PDFDocument.create(),sans=await complex.embedFont(StandardFonts.Helvetica),serif=await complex.embedFont(StandardFonts.TimesRoman);
  complex.setAuthor('EPDF validation author');
  const native=complex.addPage([595,842]);
  native.drawText('Left column heading',{x:40,y:790,font:sans,size:22,color:rgb(.1,.35,.65)});
  native.drawText('Right column',{x:330,y:790,font:serif,size:18});
  native.drawText('Small body text',{x:40,y:750,font:serif,size:10});
  native.drawText('Rotated native text',{x:540,y:100,font:sans,size:14,rotate:degrees(90)});
  for(let y=100;y<=300;y+=50)native.drawLine({start:{x:40,y},end:{x:550,y},thickness:1});
  for(let x=40;x<=550;x+=170)native.drawLine({start:{x,y:100},end:{x,y:300},thickness:1});
  native.drawText('Table cell',{x:50,y:270,size:12,font:sans});
  const complexPath=path.join(temp,'columns-tables-fonts.pdf');await fs.writeFile(complexPath,await complex.save());
  const styledPath=path.join(temp,'styled-native.pdf');
  const styled=await evaluate(`(async()=>{
    const {inspectTextObjects}=await import('./pdf-engine.js');const {buildPdf}=await import('./export.js');
    const pdfjs=await import('../node_modules/pdfjs-dist/build/pdf.min.mjs');
    const bytes=await window.api.readFile(${JSON.stringify(complexPath)}),sources=await inspectTextObjects(bytes,0);
    const source=sources.find(item=>item.text.trim()==='Left column heading');
    if(!source)throw new Error('Native fixture text: '+JSON.stringify(sources.map(item=>item.text)));
    if(!source.glyphs.length||!source.fontName)throw new Error('Missing native glyph/font model');
    const task=pdfjs.getDocument({data:bytes.slice()}),pdf=await task.promise,vp=(await pdf.getPage(1)).getViewport({scale:1});
    const points=[[source.bounds[0],source.bounds[1]],[source.bounds[2],source.bounds[3]]].map(point=>vp.convertToViewportPoint(...point));
    source.box={x:Math.min(...points.map(p=>p[0])),y:Math.min(...points.map(p=>p[1])),w:Math.abs(points[1][0]-points[0][0]),h:Math.abs(points[1][1]-points[0][1])};
    const annots={0:[{type:'replaceText',source,text:'Styled Türkçe',font:'Times New Roman',fontStyle:'bolditalic',size:20,color:'#aa2233',align:'right',spacing:1,boxWidth:260,x:45,y:40,moved:true}]};
    const output=await buildPdf({bytes,annots,viewports:[vp],fontBytes:await window.api.loadFont()});
    await window.api.writeFile(${JSON.stringify(styledPath)},output);
    const read=await inspectTextObjects(output,0);await task.destroy();return read;
  })()`);
  assert.ok(styled.some(item=>item.text.includes('Styled Türkçe')&&Math.abs(item.size-20)<.1&&item.color==='#aa2233'));
  assert.ok(styled.some(item=>item.text.includes('Styled Türkçe')&&item.fontStyle==='bolditalic'),'bold/italic font must be embedded in the PDF');
  assert.ok(!styled.some(item=>item.text.trim()==='Left column heading'));
  assert.ok(styled.some(item=>item.text==='Right column'),'editing must preserve the other column');
  assert.equal((await PDFDocument.load(await fs.readFile(styledPath))).getAuthor(),'EPDF validation author');

  const scanBytes=await fs.readFile(scanPath),rotated=await PDFDocument.load(scanBytes);
  rotated.getPage(0).setRotation(degrees(90));const rotatedPath=path.join(temp,'rotated-scan.pdf');await fs.writeFile(rotatedPath,await rotated.save());
  const rotatedModel=await evaluate(`(async()=>{
    const pdfjs=await import('../node_modules/pdfjs-dist/build/pdf.min.mjs');const {linesFromTsv}=await import('./ocr.js');
    const task=pdfjs.getDocument({data:await window.api.readFile(${JSON.stringify(rotatedPath)})}),pdf=await task.promise,page=await pdf.getPage(1);
    const vp=page.getViewport({scale:2}),base=page.getViewport({scale:1});
    const tsv='level\\tpage_num\\tblock_num\\tpar_num\\tline_num\\tword_num\\tleft\\ttop\\twidth\\theight\\tconf\\ttext\\n5\\t1\\t1\\t1\\t1\\t1\\t80\\t120\\t100\\t30\\t92\\tRotated';
    const lines=linesFromTsv(tsv,vp,base);await task.destroy();return lines[0];
  })()`);
  assert.equal(rotatedModel.angle,90);assert.equal(rotatedModel.words[0].confidence,92);assert.ok(rotatedModel.w>0&&rotatedModel.h>0);

  const portuguese=await evaluate(`(async()=>{
    const {createOcrSession}=await import('./ocr.js');
    const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=300;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1600,300);ctx.fillStyle='#000';ctx.font='64px Arial';ctx.fillText('Olá mundo Português ação educação',50,140);
    const worker=createOcrSession('por',()=>{});try{return (await worker.recognize(canvas)).data.text;}finally{await worker.terminate();}
  })()`);
  assert.ok(portuguese.includes('mundo')&&portuguese.includes('ação'),portuguese);
  assert.equal(networkAttempts(),0,'Portuguese OCR must be fully offline');

  const lowResolution=await evaluate(`(()=>{
    const canvas=document.createElement('canvas');canvas.width=480;canvas.height=120;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,480,120);ctx.fillStyle='#000';ctx.font='22px Arial';ctx.fillText('LOW RESOLUTION DOCUMENT',15,60);return canvas.toDataURL('image/png').split(',')[1];
  })()`);
  const low=await PDFDocument.create(),lowImage=await low.embedPng(Buffer.from(lowResolution,'base64'));
  low.addPage([800,200]).drawImage(lowImage,{x:0,y:0,width:800,height:200});
  const lowPath=path.join(temp,'low-resolution.pdf');await fs.writeFile(lowPath,await low.save());
  const scanModels=await evaluate(`(async()=>{
    const pdfjs=await import('../node_modules/pdfjs-dist/build/pdf.min.mjs');
    const {createOcrSession,prepareOcrLines}=await import('./ocr.js');const {buildPdf}=await import('./export.js');
    const session=createOcrSession('eng',()=>{}),results=[];
    try{
      for(const [file,rotation,label] of [[${JSON.stringify(lowPath)},0,'LOWRES'],[${JSON.stringify(rotatedPath)},0,'ROTATED']]){
        const bytes=await window.api.readFile(file),task=pdfjs.getDocument({data:bytes.slice()}),pdf=await task.promise,page=await pdf.getPage(1),base=page.getViewport({scale:1});
        const viewport=page.getViewport({scale:3,rotation}),canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;
        await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport}).promise;
        const {data}=await session.recognize(canvas),lines=await prepareOcrLines(data.tsv,viewport,base,canvas);
        if(!lines.length)throw new Error('No OCR lines for '+label);
        const before=lines.map(line=>line.text).join(' ');
        lines[0].text=label+' REPLACEMENT';lines[0].edited=true;
        const viewports=[base];for(let i=2;i<=pdf.numPages;i++)viewports.push((await pdf.getPage(i)).getViewport({scale:1}));
        const output=await buildPdf({bytes,annots:{0:[{type:'ocr',mode:'editable',lines}]},viewports,fontBytes:await window.api.loadFont()});
        const editedTask=pdfjs.getDocument({data:output}),edited=await editedTask.promise,editedPage=await edited.getPage(1);
        const text=(await editedPage.getTextContent()).items.map(item=>item.str).join(' ');
        const pixelCanvas=document.createElement('canvas');pixelCanvas.width=base.width;pixelCanvas.height=base.height;
        await editedPage.render({canvas:pixelCanvas,canvasContext:pixelCanvas.getContext('2d'),viewport:base}).promise;
        const pixel=label==='ROTATED'?[...pixelCanvas.getContext('2d').getImageData(90,725,1,1).data]:null;
        results.push({label,before,text,pixel});await task.destroy();await editedTask.destroy();
      }
    }finally{await session.terminate();}
    return results;
  })()`);
  assert.ok(scanModels[0].before.includes('LOW RESOLUTION'),JSON.stringify(scanModels[0]));
  assert.ok(scanModels.every(model=>model.text.includes(model.label+' REPLACEMENT')),JSON.stringify(scanModels));
  assert.deepEqual(scanModels[1].pixel,[36,112,194,255],'rotated scan export must preserve the illustration');
  const mixed=await PDFDocument.load(scanBytes);mixed.getPage(0).drawText('Native header with enough text to test mixed page classification and avoid blind recognition.',{x:40,y:410,size:10});
  const mixedPath=path.join(temp,'mixed-native-scan.pdf');await fs.writeFile(mixedPath,await mixed.save());
  const classification=await evaluate(`(async()=>{const pdfjs=await import('../node_modules/pdfjs-dist/build/pdf.min.mjs');const {classifyPage}=await import('./ocr.js');const task=pdfjs.getDocument({data:await window.api.readFile(${JSON.stringify(mixedPath)})}),pdf=await task.promise;const a=await classifyPage(await pdf.getPage(1)),b=await classifyPage(await pdf.getPage(2));await task.destroy();return {mixed:a.needsOcr,native:b.needsOcr,coverage:a.imageCoverage};})()`);
  assert.ok(classification.mixed&&!classification.native&&classification.coverage>.9,JSON.stringify(classification));

  const large=await PDFDocument.create();for(let i=0;i<125;i++)large.addPage(i%5===1?[842,595]:[595,842]).drawText('PAGE '+(i+1)+' searchable content',{x:40,y:500,size:16});
  const largePath=path.join(temp,'125-pages.pdf');await fs.writeFile(largePath,await large.save());
  await evaluate(`(async()=>{
    const pdfjs=await import('../node_modules/pdfjs-dist/build/pdf.min.mjs');const task=pdfjs.getDocument({data:await window.api.readFile(${JSON.stringify(largePath)})});const pdf=await task.promise;
    const proto=Object.getPrototypeOf(pdf),original=proto.getPage;window.epdfPageRequests=0;
    proto.getPage=function(...args){window.epdfPageRequests++;return original.apply(this,args);};await task.destroy();
  })()`);
  const start=Date.now();win.webContents.send('open-file',largePath);
  await waitFor(()=>evaluate("document.title.startsWith('125-pages')&&document.querySelector('.overlay')?.width>0"),'125-page document opening');
  const performance=await evaluate("({requests:window.epdfPageRequests,canvases:[...document.querySelectorAll('canvas.pdf')].filter(canvas=>canvas.width>0).length})");
  const openingMs=Date.now()-start;
  assert.ok(performance.requests<35,JSON.stringify(performance));assert.ok(performance.canvases<10,JSON.stringify(performance));
  await evaluate("document.getElementById('pageNum').value='100';document.getElementById('pageNum').dispatchEvent(new Event('change'))");
  await waitFor(()=>evaluate("document.querySelector('.page[data-i=\"99\"] .overlay').width>0"),'lazy page 100 rendering');
  await evaluate("document.getElementById('btnSearch').click();document.getElementById('searchInput').value='PAGE 100';document.getElementById('searchInput').dispatchEvent(new Event('input'))");
  await waitFor(()=>evaluate("document.getElementById('searchStatus').textContent==='1 sonuç'"),'native text search across 125 pages');
  await evaluate("document.querySelector('.search-result').click()");
  await waitFor(()=>evaluate("Number(document.getElementById('pageNum').value)===100"),'search navigation to page 100').catch(async error=>{console.error(await evaluate("JSON.stringify({input:document.getElementById('pageNum').value,scroll:document.getElementById('viewer').scrollTop,results:document.getElementById('searchResults').textContent,rect:document.querySelector('.page[data-i=\"99\"]').getBoundingClientRect().toJSON()})"));throw error;});
  const navigationMs=Date.now()-start;
  await evaluate("document.getElementById('btnCloseSearch').click();document.querySelector('[data-tool=select]').click()");
  const nativePoint=await evaluate("(()=>{const r=document.querySelector('.page[data-i=\"99\"] .overlay').getBoundingClientRect();return {x:Math.round(r.left+110*r.width/595),y:Math.round(r.top+336*r.height/842)};})()");
  for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'left',clickCount:1,...nativePoint});
  await waitFor(()=>evaluate("document.getElementById('propertyHint').textContent.includes('Seçili metin')"),'native single click selection');
  await evaluate("document.getElementById('viewer').focus();window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,bubbles:true}))");
  const nativeDraft=await evaluate(`JSON.parse(localStorage.getItem('ders-pdf:'+ ${JSON.stringify(largePath)}))[99][0]`);
  assert.ok(nativeDraft.moved&&nativeDraft.x>=49,'arrow keys must move native text through document history');
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'c',ctrlKey:true,bubbles:true}));window.dispatchEvent(new KeyboardEvent('keydown',{key:'v',ctrlKey:true,bubbles:true}))");
  assert.ok(await evaluate(`JSON.parse(localStorage.getItem('ders-pdf:'+ ${JSON.stringify(largePath)}))[99].some(item=>item.type==='text')`),'native copy/paste should create editable text');
  await evaluate("document.getElementById('btnUndo').click();document.getElementById('btnUndo').click()");
  assert.ok(!await evaluate("document.getElementById('documentStatus').textContent.includes('Taslak')"));

  const imagePath=path.join(temp,'insert-image.png');
  const imageData=await evaluate("(()=>{const c=document.createElement('canvas');c.width=200;c.height=100;const ctx=c.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,100,100);ctx.fillStyle='#0000ff';ctx.fillRect(100,0,100,100);return c.toDataURL('image/png').split(',')[1];})()");
  await fs.writeFile(imagePath,Buffer.from(imageData,'base64'));
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[imagePath]});
  await evaluate("document.getElementById('btnImage').click()");
  await waitFor(()=>evaluate("document.querySelector('[data-tool=image]').classList.contains('active')"),'local image selection');
  const imagePoint=await evaluate("(()=>{const r=document.querySelector('.page[data-i=\"99\"] .overlay').getBoundingClientRect();return {x:Math.round(r.left+80),y:Math.round(r.top+70)};})()");
  for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'left',clickCount:1,...imagePoint});
  await waitFor(()=>evaluate("!document.getElementById('imageProperties').hidden"),'image properties');
  await evaluate("document.getElementById('imageCropLeft').value='50';document.getElementById('imageCropLeft').dispatchEvent(new Event('change'));document.getElementById('imageWidth').value='100';document.getElementById('imageWidth').dispatchEvent(new Event('change'));document.getElementById('imageHeight').value='50';document.getElementById('imageHeight').dispatchEvent(new Event('change'))");
  const imageOutput=path.join(temp,'image-edited.pdf');setSavePath(imageOutput);
  await evaluate("document.getElementById('btnSave').click()");
  await waitFor(()=>evaluate("document.getElementById('documentStatus').textContent.includes('PDF kaydedildi')"),'cropped image PDF export');
  assert.equal((await PDFDocument.load(await fs.readFile(imageOutput))).getPageCount(),125);
  const imagePixel=await evaluate(`(async()=>{
    const pdfjs=await import('../node_modules/pdfjs-dist/build/pdf.min.mjs');const task=pdfjs.getDocument({data:await window.api.readFile(${JSON.stringify(imageOutput)})}),pdf=await task.promise,page=await pdf.getPage(100);
    const vp=page.getViewport({scale:1}),canvas=document.createElement('canvas');canvas.width=vp.width;canvas.height=vp.height;
    await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
    const image=JSON.parse(localStorage.getItem('ders-pdf:'+ ${JSON.stringify(largePath)}))[99].find(item=>item.type==='image');
    const pixel=[...canvas.getContext('2d').getImageData(Math.round(image.x+50),Math.round(image.y+25),1,1).data];
    await task.destroy();return pixel;
  })()`);
  assert.ok(imagePixel[2]>240&&imagePixel[0]<20,JSON.stringify(imagePixel));
  await evaluate("document.getElementById('btnUndo').click();document.getElementById('btnRedo').click()");
  assert.ok(await evaluate("!document.getElementById('imageProperties').hidden || document.getElementById('documentStatus').textContent.includes('PDF kaydedildi')"));
  const automaticPath=path.join(temp,'automatic-scan.pdf');await fs.copyFile(scanPath,automaticPath);
  win.webContents.send('open-file',automaticPath);
  await waitFor(()=>evaluate("document.title.startsWith('automatic-scan')&&document.querySelector('.overlay')?.width>0"),'automatic OCR document');
  await evaluate("document.querySelector('[data-tool=editText]').click()");
  const scanPoint=await evaluate("(()=>{const r=document.querySelector('.overlay').getBoundingClientRect();return {x:Math.round(r.left+180*r.width/800),y:Math.round(r.top+93*r.height/450)};})()");
  for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'left',clickCount:1,...scanPoint});
  await waitFor(()=>evaluate(`JSON.parse(localStorage.getItem('ders-pdf:'+ ${JSON.stringify(automaticPath)}))?.[0]?.some(item=>item.type==='ocr'&&item.mode==='editable')`),'automatic scan recognition',90000);
  assert.equal(await evaluate("document.getElementById('ocrDialog').open"),false);
  assert.equal(networkAttempts(),0);
  setSavePath(path.join(temp,'automatic-edited.pdf'));
  await evaluate("document.getElementById('btnSave').click()");
  await waitFor(()=>evaluate("document.getElementById('documentStatus').textContent.includes('PDF kaydedildi')"),'automatic OCR save');
  const backgroundPath=path.join(temp,'background-ocr.pdf');await fs.copyFile(scanPath,backgroundPath);
  win.webContents.send('open-file',backgroundPath);
  await waitFor(()=>evaluate("document.title.startsWith('background-ocr')&&document.querySelector('.overlay')?.width>0"),'background OCR document');
  await evaluate("document.getElementById('btnOCR').click();document.getElementById('ocrScope').value='all';document.getElementById('ocrForce').checked=true;document.getElementById('btnRunOCR').click();document.getElementById('pageNum').value='2';document.getElementById('pageNum').dispatchEvent(new Event('change'))");
  await waitFor(()=>evaluate("document.querySelector('.page[data-i=\"1\"] .overlay').width>0"),'edit another page during OCR');
  const backgroundPoint=await evaluate("(()=>{const r=document.querySelector('.page[data-i=\"1\"] .overlay').getBoundingClientRect();return {x:Math.round(r.left+160*r.width/800),y:Math.round(r.top+92*r.height/450)};})()");
  for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'left',clickCount:1,...backgroundPoint});
  await waitFor(()=>evaluate("!!document.querySelector('.inline-existing')"),'nonmodal editing while OCR is running');
  await evaluate("document.querySelector('.inline-existing').value='BACKGROUND EDIT';document.getElementById('btnCommitText').click();document.getElementById('btnCancelOCR').click()");
  await waitFor(()=>evaluate("!document.getElementById('btnRunOCR').disabled"),'background cancellation');
  assert.ok(await evaluate(`JSON.parse(localStorage.getItem('ders-pdf:'+ ${JSON.stringify(backgroundPath)}))[1].some(item=>item.text==='BACKGROUND EDIT')`),'OCR cancellation must preserve independent document edits');
  setSavePath(path.join(temp,'background-edited.pdf'));
  await evaluate("document.getElementById('btnSave').click()");
  await waitFor(()=>evaluate("document.getElementById('documentStatus').textContent.includes('PDF kaydedildi')"),'background native edit save');
  win.webContents.send('open-file',searchablePath);
  await waitFor(()=>evaluate("document.title.startsWith('reopened-searchable')&&document.querySelector('.overlay')?.width>0"),'reopened searchable PDF');
  assert.equal(await evaluate("document.getElementById('ocrDialog').open"),false,'OCR review must reset when switching documents');
  const hiddenPoint=await evaluate("(()=>{const r=document.querySelector('.overlay').getBoundingClientRect();return {x:Math.round(r.left+180*r.width/800),y:Math.round(r.top+93*r.height/450)};})()");
  for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'left',clickCount:1,...hiddenPoint});
  await waitFor(()=>evaluate(`JSON.parse(localStorage.getItem('ders-pdf:'+ ${JSON.stringify(searchablePath)}))?.[0]?.some(item=>item.type==='ocr')`),'recognizing a reopened invisible OCR layer',90000);
  const reopenedOutput=path.join(temp,'reopened-edited.pdf');setSavePath(reopenedOutput);
  await evaluate("document.getElementById('btnSave').click()");
  await waitFor(()=>evaluate("document.getElementById('documentStatus').textContent.includes('PDF kaydedildi')"),'reopened OCR serialization');
  const refreshed=await evaluate(`(async()=>{const {inspectTextObjects}=await import('./pdf-engine.js');return inspectTextObjects(await window.api.readFile(${JSON.stringify(reopenedOutput)}),0);})()`);
  assert.ok(!refreshed.some(item=>item.text.includes('LEGACY SEARCH LAYER')),'old invisible text must be removed before the new layer is added');
  assert.equal(refreshed.filter(item=>item.text.includes('HELLO OFFLINE OCR')).length,1,'one OCR layer per recognized line');
  console.log('PASS: low-resolution and rotated scan recognition/export, mixed-page classification, editing another page while OCR runs, cancellation preserving edits.');
  console.log('PASS: native selection/nudge/copy-paste/history, cropped PNG export in a 125-page PDF, automatic scan OCR.');
  console.log('PASS: regional pixel preservation, PDFium/PDF.js reopening, spatial OCR, columns/tables/fonts/colors, rotated coordinates, offline Portuguese, 125-page lazy rendering/search.');
  console.log('Large document: '+openingMs+'ms first render; '+navigationMs+'ms opening/navigation/search; '+performance.requests+' initial page requests.');
};
