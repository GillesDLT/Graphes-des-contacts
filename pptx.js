'use strict';
/* Export PowerPoint Open XML sans dépendance externe : chaque élément reste une forme native éditable. */
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const PPTX_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const DRAW_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const EMU_PER_IN = 914400, PPT_W = 12192000, PPT_H = 6858000, PPT_MARGIN = 457200;
const xmlSafe = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const pptColor = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c.slice(1).toUpperCase() : 'FFFFFF';
function pptShapeText(lines, options = {}) {
  const arr = Array.isArray(lines) ? lines : String(lines ?? '').split('\n');
  const points = (options.fontSize || 14) * (options.scale || 1) * 72 / EMU_PER_IN;
  const size = Math.max(600, Math.min(3600, Math.round(points * 100)));
  const color = pptColor(options.textColor || '#1f2430');
  const bold = options.bold ? ' b="1"' : '';
  const align = options.align || 'ctr';
  const paras = (arr.length ? arr : ['']).map(line => `<a:p><a:pPr algn="${align}"/><a:r><a:rPr lang="fr-FR" sz="${size}"${bold}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t xml:space="preserve">${xmlSafe(line)}</a:t></a:r><a:endParaRPr lang="fr-FR" sz="${size}"/></a:p>`).join('');
  return `<p:txBody><a:bodyPr wrap="square" lIns="45720" rIns="45720" tIns="22860" bIns="22860" anchor="ctr"/><a:lstStyle/>${paras}</p:txBody>`;
}
function makePptxBlob() {
  const sheet = S();
  if (!sheet.pieces.length && !(sheet.notes || []).length) { toast('Graphe vide'); return null; }
  // autoLayout() is run by render; force it before measuring and serializing.
  autoLayout();
  const box = $('#content').getBBox();
  if (!Number.isFinite(box.x) || !Number.isFinite(box.width) || box.width <= 0 || box.height <= 0) { toast('Aucun élément à exporter'); return null; }
  const worldW = box.width + 80, worldH = box.height + 80;
  const scale = Math.min((PPT_W - 2 * PPT_MARGIN) / worldW, (PPT_H - 2 * PPT_MARGIN) / worldH);
  const shiftX = (PPT_W - worldW * scale) / 2 + (40 - box.x) * scale;
  const shiftY = (PPT_H - worldH * scale) / 2 + (40 - box.y) * scale;
  const X = x => Math.round(x * scale + shiftX), Y = y => Math.round(y * scale + shiftY);
  const D = x => Math.max(1, Math.round(x * scale));
  let nextId = 2, shapes = '';
  const pieceChildren = new Map();
  let connectorLayer = '';
  const captureShapes = make => { const parent = shapes; shapes = ''; make(); const children = shapes; shapes = parent; return children; };
  const addShape = ({ name, x, y, w, h, geom = 'rect', fill = null, line = '#1f2430', lineWidth = 1.2, dash = false, text = null, textColor = '#1f2430', fontSize = 14, bold = false, align = 'ctr', opacity = 1 }) => {
    const id = nextId++;
    const fillXml = fill ? `<a:solidFill><a:srgbClr val="${pptColor(fill)}">${opacity < 1 ? `<a:alpha val="${Math.round(opacity * 100000)}"/>` : ''}</a:srgbClr></a:solidFill>` : '<a:noFill/>';
    const lineXml = line ? `<a:ln w="${Math.max(5000, Math.round(Math.max(0.6, lineWidth * scale * 72) * 10000))}"><a:solidFill><a:srgbClr val="${pptColor(line)}"/></a:solidFill>${dash ? '<a:prstDash val="dash"/>' : ''}<a:round/></a:ln>` : '<a:ln><a:noFill/></a:ln>';
    const tx = text === null ? '' : pptShapeText(text, { textColor, fontSize, bold, align, scale });
    shapes += `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xmlSafe(name || `Forme ${id}`)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(x)}" y="${Math.round(y)}"/><a:ext cx="${Math.max(1, Math.round(w))}" cy="${Math.max(1, Math.round(h))}"/></a:xfrm><a:prstGeom prst="${geom}"><a:avLst/></a:prstGeom>${fillXml}${lineXml}</p:spPr>${tx}</p:sp>`;
  };
  const addText = (name, text, x, y, opts = {}) => {
    const w = D(opts.w || 180), h = D(opts.h || 26);
    addShape({ name, x: X(x) - w / 2, y: Y(y) - h / 2, w, h, geom: 'rect', fill: null, line: null, text: String(text ?? '').split('\n'), textColor: opts.color || '#1f2430', fontSize: opts.fontSize || 12, bold: !!opts.bold, align: opts.align || 'ctr' });
  };
  const addLine = (name, x1, y1, x2, y2, color, width = 1.5, dash = false) => {
    let left = X(x1), right = X(x2), top = Y(y1), bottom = Y(y2);
    const flipH = right < left, flipV = bottom < top;
    if (flipH) [left, right] = [right, left];
    if (flipV) [top, bottom] = [bottom, top];
    const id = nextId++;
    const lineW = Math.max(5000, Math.round(Math.max(0.6, width * scale * 72) * 10000));
    shapes += `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xmlSafe(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm${flipH ? ' flipH="1"' : ''}${flipV ? ' flipV="1"' : ''}><a:off x="${left}" y="${top}"/><a:ext cx="${Math.max(1, right-left)}" cy="${Math.max(1, bottom-top)}"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="${lineW}"><a:solidFill><a:srgbClr val="${pptColor(color)}"/></a:solidFill>${dash ? '<a:prstDash val="dash"/>' : ''}<a:round/></a:ln></p:spPr></p:sp>`;
  };
  // Fond blanc. Les cercles, ellipses, traits et zones de texte sont des objets PowerPoint séparés.
  addShape({ name: 'Fond blanc', x: 0, y: 0, w: PPT_W, h: PPT_H, fill: '#ffffff', line: null });
  // Contours de groupes fonctionnels / répétitions / références (ellipse éditable, enveloppe approximative).
  for (const g of sheet.groups.slice().reverse()) {
    const pts = groupPoints(g); if (!pts.length) continue;
    const bb = bboxPts(pts), cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
    const cycleColor = cycleMarks.colors.references.get(g.id);
    addShape({ name: `${g.kind === 'ref' ? 'Référence' : g.kind === 'rep' ? 'Répétition' : 'Groupe fonctionnel'} — ${groupText(g) || 'sans nom'}`, x: X(bb.x0), y: Y(bb.y0), w: D(bb.x1 - bb.x0), h: D(bb.y1 - bb.y0), geom: 'ellipse', fill: g.kind === 'ref' ? (g.color || '#eaf1ff') : (g.color || '#f5f5f5'), opacity: g.opacity ?? 0.18, line: cycleColor || g.stroke || '#8a90a0', lineWidth: g.sw || 1.5, dash: true });
    if (groupText(g)) addText(`Nom du groupe ${groupText(g)}`, groupText(g), cx, bb.y0 - 7, { w: Math.max(100, textW(groupText(g), '14px Arial') + 16), h: 22, color: cycleColor || g.stroke || '#4b5563', fontSize: 13, bold: true });
  }
  // Préparer les bulles de pièces et leurs libellés comme enfants de sous-groupes PowerPoint.
  for (const p of sheet.pieces) {
    if (isHiddenPiece(p.id)) continue;
    const children = captureShapes(() => {
      addShape({ name: `Pièce ${p.num} — ${p.name}`, x: X(p.x - p.rx), y: Y(p.y - p.ry), w: D(p.rx * 2), h: D(p.ry * 2), geom: 'ellipse', fill: p.color, line: p.stroke || '#1a1a1a', lineWidth: 2 });
      const fs = clampN(Math.min(p.rx, p.ry) / 4, 13, 24), na = namePos(p, fs);
      const nameLinesCount = nameLines(p.name).length;
      addText(`Nom pièce ${p.num}`, p.name, na.x, na.y, { w: Math.max(60, nameWidth(p.name, `${fs}px Arial`) + 14), h: nameLinesCount * fs * 1.45 + 6, color: textOn(p.color), fontSize: fs, bold: true });
    });
    pieceChildren.set(p.id, children);
  }
  // Traits de liaisons et CF : traits PowerPoint éditables placés au premier plan, sous les bulles.
  connectorLayer += captureShapes(() => {
    for (const l of sheet.liaisons.filter(liaisonVisible)) {
      const g = linkGeom(l); if (!g) continue;
      const color = cycleMarks.links.has(l.id) ? (cycleMarks.colors.links.get(l.id) || l.color) : l.color;
      const count = l.curved ? 18 : 1;
      let prev = g.point(g.t0);
      for (let i = 1; i <= count; i++) {
        const t = g.t0 + (g.t1 - g.t0) * i / count, point = g.point(t);
        addLine(`Liaison ${liaisonLabel(l)} — segment ${i}`, prev.x, prev.y, point.x, point.y, color || '#333333', l.w || 1.4, cycleMarks.links.has(l.id)); prev = point;
      }
      const lab = g.point(l.t ?? 0.5);
      addText(`Libellé liaison ${liaisonLabel(l)}`, liaisonLabel(l), lab.x, lab.y, { w: Math.max(50, richTextWidth(liaisonLabel(l), 12) + 16), h: 23, color, fontSize: 11 });
    }
    for (const c of sheet.cfgs) {
      const g = linkGeom(c); if (!g) continue;
      const color = c.inColor === false ? '#000000' : (c.color || '#c62828');
      const n = c.curved ? 18 : 1; let prev = g.point(g.t0);
      for (let i = 1; i <= n; i++) { const pt = g.point(g.t0 + (g.t1 - g.t0) * i / n); addLine(`CF ${cfDisplayName(c)} — segment ${i}`, prev.x, prev.y, pt.x, pt.y, color, 2.5, false); prev = pt; }
      if (cfName(c)) { const q = g.point(0.5); addText(`Nom CF ${cfDisplayName(c)}`, cfName(c), q.x, q.y - 9, { w: Math.max(50, textW(cfName(c), '700 13px Arial') + 16), h: 24, color, fontSize: 12, bold: true }); }
    }
  });
  // Surfaces / bulles de CF : formes rondes natives avec texte PowerPoint éditable.
  for (const s of sheet.surfaces.filter(surfVisible)) {
    const c = spos(s); const cf = cfOfSurface(s.id);
    const color = cf?.inColor === false ? '#000000' : (cycleMarks.surfaces.has(s.id) && !cycleMarks.covered.has(s.id) ? (cycleMarks.colors.surfaces.get(s.id) || s.stroke) : s.stroke);
    const textColor = cf?.inColor === false ? '#000000' : (lum(s.color) < 0.2 ? '#ffffff' : '#1f3b70');
    const lines = s.count > 1 ? [`${s.count}x`, sname(s)] : [sname(s)];
    const bubble = captureShapes(() => addShape({ name: `Surface ${sname(s)}`, x: X(c.x - s.r), y: Y(c.y - s.r), w: D(s.r * 2), h: D(s.r * 2), geom: 'ellipse', fill: s.color, line: color || '#1a1a1a', lineWidth: 1.6, text: lines, textColor, fontSize: 10 }));
    if (pieceChildren.has(s.pieceId)) pieceChildren.set(s.pieceId, pieceChildren.get(s.pieceId) + bubble);
    else shapes += bubble;
  }
  // Bulles nominales, comme sur le graphe.
  if (sheet.showNominalZero ?? doc.settings.showNominalZero) {
    for (const p of sheet.pieces.filter(p => !isHiddenPiece(p.id))) {
      const n = nominalGeometry(p);
      const bubble = captureShapes(() => addShape({ name: `Nominal ${p.num}.0`, x: X(n.x-n.r), y: Y(n.y-n.r), w: D(n.r*2), h: D(n.r*2), geom: 'ellipse', fill: '#ffffff', line: '#64748b', lineWidth: 1.4, text: [n.name], textColor: '#334155', fontSize: 10 }));
      if (pieceChildren.has(p.id)) pieceChildren.set(p.id, pieceChildren.get(p.id) + bubble);
      else shapes += bubble;
    }
  }
  // Chaque pièce devient un groupe PowerPoint sélectionnable avec son ellipse, son nom et ses surfaces.
  for (const p of sheet.pieces) {
    const children = pieceChildren.get(p.id); if (!children) continue;
    const pts = [[p.x-p.rx,p.y-p.ry],[p.x+p.rx,p.y+p.ry]];
    for (const sf of sheet.surfaces.filter(sf => sf.pieceId === p.id && surfVisible(sf))) { const c=spos(sf); pts.push([c.x-sf.r,c.y-sf.r],[c.x+sf.r,c.y+sf.r]); }
    if (sheet.showNominalZero ?? doc.settings.showNominalZero) { const n=nominalGeometry(p); pts.push([n.x-n.r,n.y-n.r],[n.x+n.r,n.y+n.r]); }
    const bb=bboxPts(pts), gx=X(bb.x0), gy=Y(bb.y0), gw=D(bb.x1-bb.x0), gh=D(bb.y1-bb.y0), id=nextId++;
    shapes += `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id}" name="Ensemble pièce ${p.num} — ${xmlSafe(p.name)}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${gx}" y="${gy}"/><a:ext cx="${gw}" cy="${gh}"/><a:chOff x="${gx}" y="${gy}"/><a:chExt cx="${gw}" cy="${gh}"/></a:xfrm></p:grpSpPr>${children}</p:grpSp>`;
  }
  // Dessiner les liaisons au-dessus des ellipses de pièces pour qu’aucun fond opaque ne les masque.
  // linkGeom les termine au bord des bulles de surface ; les textes de liaison restent éditables.
  shapes += connectorLayer;
  // Notes de l’utilisateur : rectangles et textes éditables indépendamment dans PowerPoint.
  for (const n of sheet.notes || []) {
    const lines = noteLines(n), fs = 14, pad = 10, lineH = 19;
    const width = Math.max(90, Math.min(340, Math.max(...lines.map(line => textW(line, `${fs}px Arial`) + pad * 2))));
    const height = lines.length * lineH + pad * 2;
    addShape({ name: `Note — ${String(n.text).slice(0, 35)}`, x: X(n.x), y: Y(n.y), w: D(width), h: D(height), geom: 'roundRect', fill: n.color || '#fff4c2', line: '#b59b47', lineWidth: 1.4, text: lines, textColor: '#332d1d', fontSize: fs, align: 'l' });
  }
  return makePptxZip(shapes, sheet.name);
}
function makePptxZip(shapes, sheetName) {
  const escTitle = xmlSafe(sheetName || 'Graphe des contacts');
  const slide = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="${DRAW_NS}" xmlns:r="${REL_NS}" xmlns:p="${PPTX_NS}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    'ppt/presentation.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="${DRAW_NS}" xmlns:r="${REL_NS}" xmlns:p="${PPTX_NS}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId2"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="${PPT_W}" cy="${PPT_H}" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:defPPr><a:defRPr lang="fr-FR"/></a:defPPr></p:defaultTextStyle></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/></Relationships>`,
    'ppt/slides/slide1.xml': slide,
    'ppt/slides/_rels/slide1.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`,
    'ppt/slideLayouts/slideLayout1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="${DRAW_NS}" xmlns:r="${REL_NS}" xmlns:p="${PPTX_NS}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`,
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`,
    'ppt/slideMasters/slideMaster1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="${DRAW_NS}" xmlns:r="${REL_NS}" xmlns:p="${PPTX_NS}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`,
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`,
    'ppt/theme/theme1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="${DRAW_NS}" name="Graphe des contacts"><a:themeElements><a:clrScheme name="Graphe"><a:dk1><a:srgbClr val="1F2430"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="2B5FD9"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Arial"><a:majorFont><a:latin typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="Graphe"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`,
    'docProps/core.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escTitle}</dc:title><dc:creator>Graphe des contacts</dc:creator></cp:coreProperties>`,
    'docProps/app.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Graphe des contacts</Application><PresentationFormat>On-screen Show (16:9)</PresentationFormat><Slides>1</Slides></Properties>`
  };
  return zipStore(files);
}
function zipStore(files) {
  const enc = new TextEncoder(), local = [], central = []; let offset = 0;
  const u16 = n => [n & 255, (n >>> 8) & 255], u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  const crcTable = (() => { const t = new Uint32Array(256); for (let n=0;n<256;n++) { let c=n; for(let k=0;k<8;k++) c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1); t[n]=c>>>0; } return t; })();
  const crc32 = data => { let c=0xffffffff; for(const b of data) c=crcTable[(c^b)&255]^(c>>>8); return (c^0xffffffff)>>>0; };
  const join = arrays => { const size=arrays.reduce((n,a)=>n+a.length,0), out=new Uint8Array(size); let p=0; for(const a of arrays){out.set(a,p);p+=a.length;} return out; };
  for (const [path, content] of Object.entries(files)) {
    const name=enc.encode(path), data=enc.encode(content), crc=crc32(data);
    const head=Uint8Array.from([...u32(0x04034b50),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0)]);
    local.push(head,name,data);
    const cent=Uint8Array.from([...u32(0x02014b50),...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset)]);
    central.push(cent,name); offset+=head.length+name.length+data.length;
  }
  const centralDir=join(central), centralOffset=offset;
  const end=Uint8Array.from([...u32(0x06054b50),...u16(0),...u16(0),...u16(Object.keys(files).length),...u16(Object.keys(files).length),...u32(centralDir.length),...u32(centralOffset),...u16(0)]);
  const blob=new Blob([...local,centralDir,end],{type:PPTX_MIME});
  return blob;
}
