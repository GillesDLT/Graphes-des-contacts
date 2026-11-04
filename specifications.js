'use strict';
/* Symboles et annotations de spécification — tracés vectoriels à lettrage technique sans empattement. */

/* ============================================================
   Réglages des symboles « Réf. ISO » — TOUT SE MODIFIE ICI.
   Unités en pixels ; 4 px ≈ 1 mm (lettre h = 14 px ≈ 3,5 mm).
   Proportions ISO 129-1 / ISO 1101 / ISO 5459 :
   - h = hauteur de lettre (hauteur des capitales, série ISO 3098)
   - cadre de hauteur 2h, section carrée 2h × 2h
   - rappel à deux segments en trait mince (≈ 0,3 mm)
   - extrémité : triangle équilatéral plein posé par sa base sur la
     surface (symbole de base ISO 5459), ou flèche pleine
   - référence partielle : cercle coupé en deux par son diamètre
     horizontal, un lettrage par demi-cercle (italique possible)
   Chaque valeur est indépendante ; `scale` agrandit tout d'un bloc.
   ============================================================ */
const ISO_STYLE = {
  fontFamily: "'osifont', 'Liberation Sans', Arial, sans-serif", // police technique ISO 3098 ; mettre "'Arial', sans-serif" pour la police classique
  scale: 1,              // échelle globale de tous les symboles
  letter: 14,            // h : hauteur de lettre (capitale), ≈ 3,5 mm
  capRatio: 0.72,        // hauteur de capitale / taille de police (Arial ≈ 0,72)
  frameHFactor: 2,       // hauteur du cadre = frameHFactor × h (ISO : 2h)
  frameWFactor: 2,       // largeur mini du cadre = frameWFactor × h (ISO : 2h, donc carré)
  framePadFactor: 0.5,   // marge horizontale autour du texte = framePadFactor × h
  circleFactor: 3.2,     // diamètre mini du cercle partiel = circleFactor × h
  circlePadFactor: 0.4,  // marge latérale des textes dans le cercle = circlePadFactor × h
  circleEdgeGapFactor: 0.25, // marge entre les textes et la bordure du cercle = circleEdgeGapFactor × h
  splitGapFactor: 0.35,  // demi-jeu entre les textes et le trait médian = splitGapFactor × h
  strokeFrame: 1.25,     // trait des cadres et du cercle (mince, ≈ 0,3 mm)
  strokeSplit: 1,        // trait médian du cercle partiel
  strokeLeader: 1.25,    // trait du rappel à deux segments
  tipStyle: 'triangle',  // extrémité par défaut : 'triangle' (équilatéral plein) | 'arrow'
  tipTriangleFactor: 0.8,   // côté du triangle équilatéral = tipTriangleFactor × h
  tipArrowLenFactor: 0.65,  // longueur de la flèche = tipArrowLenFactor × h
  tipArrowWidthFactor: 0.8  // largeur de base de la flèche = tipArrowWidthFactor × h
};
/* Police des lettrages ISO (cadres de tolérance, textes de la référence partielle). */
const ISO_FONT = ISO_STYLE.fontFamily;
/* Petit symbole « A encadré » pour l'interface (panneau de propriétés, palette ISO GPS). */
const ISO_REF_ICON = `<svg class="tool-icon iso-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="4.5" width="18" height="15" fill="none" stroke="currentColor" stroke-width="1.8"/><text x="12" y="15.8" text-anchor="middle" fill="currentColor" font-family="${ISO_FONT}" font-size="11">A</text></svg>`;
/* Petit symbole « cadre de tolérance » pour l'interface. */
const ISO_SPEC_ICON = `<svg class="tool-icon iso-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="2" y="3" width="14" height="8" fill="none" stroke="currentColor" stroke-width="1.6"/><line x1="7" y1="3" x2="7" y2="11" stroke="currentColor" stroke-width="1.2"/><line x1="12" y1="3" x2="12" y2="11" stroke="currentColor" stroke-width="1.2"/><line x1="9" y1="11" x2="16" y2="19" stroke="currentColor" stroke-width="1.4"/><polygon points="16.5,18.2 21,20.5 15.2,21.6" fill="currentColor"/></svg>`;

const ISO_REFERENCE_TYPES = [
  ['element', 'Élément de référence (cadre carré)'],
  ['partial', 'Référence partielle (cercle coupé en deux)']
];
const ISO_REFERENCE_TYPE_IDS = new Set(ISO_REFERENCE_TYPES.map(([id]) => id));
/* Anciens symboles (avant réduction à carré / partielle) : convertis à l'affichage. */
const ISO_LEGACY_TYPES = {
  identifier: 'element',
  'partial-frame': 'partial', 'partial-mobile-frame': 'partial',
  'partial-indicator': 'partial', 'partial-mobile-indicator': 'partial',
  'partial-point': 'partial', 'partial-closed-line': 'partial'
};
function isoType(ref) {
  if (ISO_REFERENCE_TYPE_IDS.has(ref.type)) return ref.type;
  return ISO_LEGACY_TYPES[ref.type] || (ref.partial ? 'partial' : 'element');
}
function isoTypeHasLeader(type) {
  return ISO_REFERENCE_TYPE_IDS.has(type);
}
/* Métriques dérivées des réglages : hauteur de lettre, taille de police. */
function isoMetrics() {
  const s = ISO_STYLE.scale || 1, letter = ISO_STYLE.letter * s;
  const fontPx = letter / (ISO_STYLE.capRatio || 0.72);
  return { s, letter, fontPx, font: `${r1(fontPx)}px ${ISO_FONT}` };
}
function isoTargetCenter(ref) {
  if (ref.targetKind === 'piece') { const p = P(ref.targetId); return p ? { x: p.x, y: p.y } : null; }
  if (ref.targetKind === 'surface') {
    const s = SF(ref.targetId); return s ? spos(s) : null;
  }
  const g = G(ref.targetId), pts = g ? groupPoints(g) : [];
  if (!pts.length) return null;
  const b = bboxPts(pts); return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
}
function isoTargetOwner(target) {
  if (!target) return null;
  if (target.targetKind === 'piece') return P(target.targetId) ? target.targetId : null;
  if (target.targetKind === 'surface') return SF(target.targetId)?.pieceId || null;
  if (target.targetKind === 'group') {
    const group = G(target.targetId);
    if (!group || group.kind !== 'ref') return null;
    const members = group.members || [];
    if (!members.length || members.some(id => !SF(id))) return null;
    const owners = new Set(members.map(id => SF(id).pieceId));
    return owners.size === 1 ? [...owners][0] : null;
  }
  return null;
}
function isoComponentFromId(id) {
  if (SF(id)) return { targetKind: 'surface', targetId: id };
  const group = G(id);
  return group?.kind === 'ref' ? { targetKind: 'group', targetId: id } : null;
}
function isoComponentFromHit(hit) {
  if (hit?.kind === 'surface') return isoComponentFromId(hit.id);
  if (['group', 'glabel'].includes(hit?.kind) && G(hit.id)?.kind === 'ref') return isoComponentFromId(hit.id);
  return null;
}
function isoInsideLoops(point, loops) {
  for (const loop of loops || []) {
    let inside=false;
    for(let i=0,j=loop.length-1;i<loop.length;j=i++){
      const [xi,yi]=loop[i],[xj,yj]=loop[j];
      if(((yi>point.y)!==(yj>point.y))&&(point.x<(xj-xi)*(point.y-yi)/(yj-yi)+xi)) inside=!inside;
    }
    if(inside)return true;
  }
  return false;
}
function isoTargetShape(ref) {
  if (ref.targetKind === 'piece') {
    const p = P(ref.targetId);
    return p ? { center: { x: p.x, y: p.y }, radius: 0, rx: p.rx, ry: p.ry, loops: [], bounds: { x0: p.x - p.rx, y0: p.y - p.ry, x1: p.x + p.rx, y1: p.y + p.ry } } : null;
  }
  if (ref.targetKind === 'surface') {
    const s = SF(ref.targetId), c = s && spos(s);
    return s && c ? { center: c, radius: Math.max(1, s.r + (s.sw || 1.5)/2), loops: [], bounds: null } : null;
  }
  const g = G(ref.targetId), shape = g && groupShape(g);
  if (!shape?.loops?.length) return null;
  const bounds = bboxPts(shape.loops.flat());
  let center={x:(bounds.x0+bounds.x1)/2,y:(bounds.y0+bounds.y1)/2};
  const memberCenters=(g.members||[]).map(id=>SF(id)).filter(Boolean).map(spos);
  if(memberCenters.length){
    const average={x:memberCenters.reduce((sum,p)=>sum+p.x,0)/memberCenters.length,y:memberCenters.reduce((sum,p)=>sum+p.y,0)/memberCenters.length};
    if(isoInsideLoops(average,shape.loops))center=average;
    else {const inside=memberCenters.find(p=>isoInsideLoops(p,shape.loops));if(inside)center=inside;}
  }
  if(!isoInsideLoops(center,shape.loops)){const candidate=shape.loops[0]?.[0];if(candidate)center={x:candidate[0],y:candidate[1]};}
  return { center, radius: 0, loops: shape.loops, bounds };
}
function isoRayBoundary(origin, direction, loops) {
  let best = 0;
  const cross = (ax, ay, bx, by) => ax * by - ay * bx;
  for (const loop of loops || []) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      const sx = b[0] - a[0], sy = b[1] - a[1];
      const den = cross(direction.x, direction.y, sx, sy);
      if (Math.abs(den) < 1e-9) continue;
      const qx = a[0] - origin.x, qy = a[1] - origin.y;
      const t = cross(qx, qy, sx, sy) / den;
      const u = cross(qx, qy, direction.x, direction.y) / den;
      if (t >= 0 && u >= -1e-7 && u <= 1 + 1e-7) best = Math.max(best, t);
    }
  }
  return best;
}
function isoTargetBoundary(ref, toward) {
  const shape = isoTargetShape(ref); if (!shape) return null;
  const dx = toward.x - shape.center.x, dy = toward.y - shape.center.y;
  const len = Math.hypot(dx, dy) || 1, direction = { x: dx / len, y: dy / len };
  if (shape.rx > 0 && shape.ry > 0) {
    const denom = Math.sqrt((direction.x / shape.rx) ** 2 + (direction.y / shape.ry) ** 2) || 1;
    const distance = 1 / denom;
    return { x: shape.center.x + direction.x * distance, y: shape.center.y + direction.y * distance };
  }
  const distance = shape.radius || isoRayBoundary(shape.center, direction, shape.loops);
  if (!distance) return shape.center;
  return { x: shape.center.x + direction.x * distance, y: shape.center.y + direction.y * distance };
}
function isoFrameSize(ref) {
  const m = isoMetrics(), type = isoType(ref);
  if (type === 'partial') {
    const pad = ISO_STYLE.circlePadFactor * m.letter;
    const edge = ISO_STYLE.circleEdgeGapFactor * m.letter;
    const gap = ISO_STYLE.splitGapFactor * m.letter;
    const topW = textW(String(ref.text || ''), ref.italic ? `italic ${m.font}` : m.font);
    const botW = textW(String(ref.textBottom || ''), ref.italicBottom ? `italic ${m.font}` : m.font);
    const maxW = Math.max(topW, botW);
    /* Le diamètre doit laisser une marge `edge` entre les coins des textes
       et la bordure du cercle (contrainte du coin du lettrage). */
    const d = Math.max(ISO_STYLE.circleFactor * m.letter, maxW + 2 * pad, 2 * (Math.hypot(maxW / 2, gap + m.letter) + edge));
    return { w: d, h: d, r: d / 2 };
  }
  const w = Math.max(ISO_STYLE.frameWFactor * m.letter, textW(String(ref.text || 'A'), m.font) + 2 * ISO_STYLE.framePadFactor * m.letter);
  return { w, h: ISO_STYLE.frameHFactor * m.letter };
}
/* Point du bord d'un rectangle (x, y, w, h) le long du segment centre ← from. */
function rectEdgePoint(x, y, w, h, fx, fy) {
  const cx = x + w / 2, cy = y + h / 2;
  const dx = cx - fx, dy = cy - fy;
  if (!dx && !dy) return { x: cx, y: y + h };
  let t = 0;
  if (dx) t = Math.max(t, Math.min((x - fx) / dx, (x + w - fx) / dx));
  if (dy) t = Math.max(t, Math.min((y - fy) / dy, (y + h - fy) / dy));
  t = Math.min(t, 1);
  return { x: fx + dx * t, y: fy + dy * t };
}
/* Point de branchement du rappel sur le symbole : l'arête la plus proche
   du coude. Pour le cadre carré, intersection du segment coude→centre avec
   le cadre (l'arête suivie change donc avec le coude) ; pour le cercle
   partiel, le point du cercle le plus proche du coude. */
function isoLeaderAnchor(ref, type, from) {
  const m = isoFrameSize(ref), cx = ref.x + m.w / 2, cy = ref.y + m.h / 2;
  const fx = Number.isFinite(from?.x) ? from.x : cx;
  const fy = Number.isFinite(from?.y) ? from.y : cy + m.h;
  if (type === 'partial') {
    const dx = cx - fx, dy = cy - fy, d = Math.hypot(dx, dy) || 1;
    return { x: cx - dx / d * m.r, y: cy - dy / d * m.r };
  }
  return rectEdgePoint(ref.x, ref.y, m.w, m.h, fx, fy);
}
function isoDefaultElbow(ref) {
  const target = isoTargetCenter(ref), m = isoFrameSize(ref);
  return { x: ref.x + m.w / 2, y: target?.y ?? ref.y + m.h };
}
/* Extrémités de rappel : flèche pleine (sommet sur la surface) ou triangle
   équilatéral plein posé par sa base sur l'extrémité, sommet vers le coude. */
function isoTipArrow(x, y, towardX, towardY, length, width) {
  const dx = towardX - x, dy = towardY - y, d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d, nx = -uy, ny = ux, half = width / 2;
  return `${r1(x)},${r1(y)} ${r1(x + ux * length + nx * half)},${r1(y + uy * length + ny * half)} ${r1(x + ux * length - nx * half)},${r1(y + uy * length - ny * half)}`;
}
function isoTipTriangle(x, y, towardX, towardY, side) {
  const dx = towardX - x, dy = towardY - y, d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d, nx = -uy, ny = ux, half = side / 2, height = side * Math.sqrt(3) / 2;
  return `${r1(x + nx * half)},${r1(y + ny * half)} ${r1(x - nx * half)},${r1(y - ny * half)} ${r1(x + ux * height)},${r1(y + uy * height)}`;
}
function isoTextAttrs(m, italic) {
  return `font-family="${ISO_FONT}" font-size="${r1(m.fontPx)}"${italic ? ' font-style="italic"' : ''}`;
}
function isoFrameSVG(ref) {
  const m = isoMetrics(), { w, h } = isoFrameSize(ref), line = '#17191d';
  return `<rect x="${r1(ref.x)}" y="${r1(ref.y)}" width="${r1(w)}" height="${r1(h)}" fill="#fff" stroke="${line}" stroke-width="${ISO_STYLE.strokeFrame}"/>` +
    `<text x="${r1(ref.x + w / 2)}" y="${r1(ref.y + h / 2 + m.letter / 2)}" text-anchor="middle" ${isoTextAttrs(m, false)} fill="${line}">${esc(ref.text || 'A')}</text>`;
}
function isoPartialSVG(ref) {
  const m = isoMetrics(), { w, h, r } = isoFrameSize(ref), cx = ref.x + w / 2, cy = ref.y + h / 2;
  const gap = ISO_STYLE.splitGapFactor * m.letter, line = '#17191d';
  let s = `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}" fill="#fff" stroke="${line}" stroke-width="${ISO_STYLE.strokeFrame}"/>` +
    `<path d="M${r1(cx - r)} ${r1(cy)}H${r1(cx + r)}" stroke="${line}" stroke-width="${ISO_STYLE.strokeSplit}"/>`;
  s += `<text x="${r1(cx)}" y="${r1(cy - gap)}" text-anchor="middle" ${isoTextAttrs(m, !!ref.italic)} fill="${line}">${esc(ref.text || '')}</text>`;
  s += `<text x="${r1(cx)}" y="${r1(cy + gap + m.letter)}" text-anchor="middle" ${isoTextAttrs(m, !!ref.italicBottom)} fill="${line}">${esc(ref.textBottom || '')}</text>`;
  return s;
}
function isoCornerMarkSVG(mode, x, y) {
  if (!['circle', 'concentric'].includes(mode)) return '';
  const r = ISO_STYLE.letter * ISO_STYLE.scale * 0.48;
  const circle = radius => `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(radius)}" fill="none" stroke="#17191d" stroke-width="${ISO_STYLE.strokeFrame}"/>`;
  return mode === 'concentric' ? circle(r) + circle(r * 0.52) : circle(r);
}
function isoRefSVG(ref) {
  const type = isoType(ref), shape = isoTargetShape(ref);
  if (!shape) return '';
  const center = shape.center, defaultElbow=isoDefaultElbow(ref), elbow = {
    x: Number.isFinite(ref.elbowX) ? ref.elbowX : defaultElbow.x,
    y: Number.isFinite(ref.elbowY) ? ref.elbowY : defaultElbow.y
  };
  const line = '#17191d', m = isoMetrics();
  const tip = ['triangle', 'arrow'].includes(ref.tip) ? ref.tip : ISO_STYLE.tipStyle;
  const target = isoTargetBoundary(ref, elbow) || center;
  const anchor = isoLeaderAnchor(ref, type, elbow);
  let drawing = `<path d="M${r1(target.x)} ${r1(target.y)} L${r1(elbow.x)} ${r1(elbow.y)} L${r1(anchor.x)} ${r1(anchor.y)}" fill="none" stroke="${line}" stroke-width="${ISO_STYLE.strokeLeader}"/>`;
  drawing += isoCornerMarkSVG(ref.cornerMark, elbow.x, elbow.y);
  if (tip === 'arrow') drawing += `<polygon points="${isoTipArrow(target.x, target.y, elbow.x, elbow.y, ISO_STYLE.tipArrowLenFactor * m.letter, ISO_STYLE.tipArrowWidthFactor * m.letter)}" fill="${line}"/>`;
  else drawing += `<polygon points="${isoTipTriangle(target.x, target.y, elbow.x, elbow.y, ISO_STYLE.tipTriangleFactor * m.letter)}" fill="${line}"/>`;
  drawing += type === 'partial' ? isoPartialSVG(ref) : isoFrameSVG(ref);
  const label = ISO_REFERENCE_TYPES.find(([id]) => id === type)?.[1] || 'Référence ISO';
  return `<g data-id="${ref.id}" data-kind="isoRef" style="cursor:move"><title>${esc(label)} — déplacer pour repositionner</title>${drawing}</g>`;
}
function createIsoReference(targetKind, targetId) {
  const target = { targetKind, targetId }, ownerPieceId = isoTargetOwner(target), center = isoTargetCenter(target);
  if (!ownerPieceId || !center) return toast('Choisissez une surface ou un groupe de surfaces appartenant à une seule pièce.');
  checkpoint();
  const ref = { id: uid(), ...target, ownerPieceId, x: center.x + 110, y: center.y - 70, elbowY: center.y, text: 'A', textBottom: '', type: 'element', tip: ISO_STYLE.tipStyle };
  ref.elbowX = isoDefaultElbow(ref).x;
  if (!S().isoRefs) S().isoRefs = [];
  S().isoRefs.push(ref);
  setTool('select'); sel.clear(); sel.add(ref.id); changed(); toast('Indicateur ISO ajouté à la surface / au groupe de la pièce.');
}

/* ============================================================
   Spécifications — cadres de tolérance ISO 1101 (feature control frames).
   Un cadre = une suite de sections [symbole | indication | références].
   Chaque section porte un symbole de caractéristique choisi dans une
   liste, un texte libre (valeur, diamètre, lettre de référence…) et des
   indicateurs encerclés (Ⓜ maxi matière, Ⓔ gabarit / enveloppe, Ⓛ, Ⓣ, Ⓕ).
   Chaque spécification est liée à une pièce unique ; son lien a un coude
   bleu et une extrémité réglable : flèche, triangle plein ou trait simple.
   Symboles dessinés avec la police technique osifont (couverture GPS
   vérifiée : ⏤ ⏥ ○ ⌭ ⌒ ⌓ ⟂ ∠ ∥ ⌖ ◎ ⌯ ↗ ⌰ ⌀ ± et Ⓜ Ⓛ Ⓔ Ⓣ Ⓕ).
   ============================================================ */
const SPEC_SYMBOLS = [
  ['straight', '\u23E4', 'Droiture'],
  ['flat', '\u23E5', 'Planéité'],
  ['circ', '\u25CB', 'Circularité'],
  ['cyl', '\u232D', 'Cylindricité'],
  ['pline', '\u2312', 'Profil d’une ligne'],
  ['psurf', '\u2313', 'Profil d’une surface'],
  ['perp', '\u27C2', 'Perpendicularité'],
  ['angularity', '\u2220', 'Angulosité'],
  ['parallel', '\u2225', 'Parallélisme'],
  ['position', '\u2316', 'Position'],
  ['coax', '\u25CE', 'Coaxialité / concentricité'],
  ['symmetry', '\u232F', 'Symétrie'],
  ['runout', '\u2197', 'Battement circulaire'],
  ['trunout', '\u2330', 'Battement total'],
  ['diameter', '\u2300', 'Diamètre (indication)'],
  ['plusminus', '\u00B1', 'Plus / moins']
];
const SPEC_SYMBOL_CHARS = new Map(SPEC_SYMBOLS.map(([id, ch]) => [id, ch]));
const SPEC_MODIFIERS = [
  ['M', '\u24C2', 'Condition de plus grande matière (maxi matière)'],
  ['L', '\u24C1', 'Condition de plus petite matière (mini matière)'],
  ['E', '\u24BA', 'Principe d’enveloppe (gabarit)'],
  ['T', '\u24C9', 'Exigence de tangence'],
  ['F', '\u24BB', 'État libre (condition libre)']
];
const SPEC_MODIFIER_CHARS = new Map(SPEC_MODIFIERS.map(([id, ch]) => [id, ch]));
const SPEC_TIPS = [['arrow', 'Flèche'], ['triangle', 'Triangle plein'], ['line', 'Trait simple']];
const SPEC_TIP_IDS = new Set(SPEC_TIPS.map(([id]) => id));
function specTip(t) { return SPEC_TIP_IDS.has(t.tip) ? t.tip : 'arrow'; }
/* Contenu textuel d'une section : symbole + indication + indicateurs. */
function specCellText(cell) {
  const parts = [];
  if (cell.sym && SPEC_SYMBOL_CHARS.has(cell.sym)) parts.push(SPEC_SYMBOL_CHARS.get(cell.sym));
  if (cell.text) parts.push(cell.text);
  for (const m of cell.mods || []) if (SPEC_MODIFIER_CHARS.has(m)) parts.push(SPEC_MODIFIER_CHARS.get(m));
  return parts.join('');
}
/* Métriques du cadre : largeur de chaque section, largeur et hauteur totales. */
function specFrameLayout(spec) {
  const m = isoMetrics(), h = m.letter, pad = ISO_STYLE.framePadFactor * h, minW = ISO_STYLE.frameWFactor * h;
  const cells = (spec.cells || []).map(cell => {
    const text = specCellText(cell);
    return { text, w: Math.max(minW, text ? textW(text, m.font) + 2 * pad : minW) };
  });
  if (!cells.length) cells.push({ text: '', w: minW });
  return { cells, w: cells.reduce((a, c) => a + c.w, 0), h: ISO_STYLE.frameHFactor * h, letter: h, fontPx: m.fontPx };
}
function specFrameSVG(spec) {
  const lay = specFrameLayout(spec), m = { fontPx: lay.fontPx }, line = '#17191d';
  let s = `<rect x="${r1(spec.x)}" y="${r1(spec.y)}" width="${r1(lay.w)}" height="${r1(lay.h)}" fill="#fff" stroke="${line}" stroke-width="${ISO_STYLE.strokeFrame}"/>`;
  let x = spec.x;
  lay.cells.forEach((cell, i) => {
    if (i) s += `<line x1="${r1(x)}" y1="${r1(spec.y)}" x2="${r1(x)}" y2="${r1(spec.y + lay.h)}" stroke="${line}" stroke-width="${ISO_STYLE.strokeFrame}"/>`;
    if (cell.text) s += `<text x="${r1(x + cell.w / 2)}" y="${r1(spec.y + lay.h / 2 + lay.letter / 2)}" text-anchor="middle" ${isoTextAttrs(m, false)} fill="${line}">${esc(cell.text)}</text>`;
    x += cell.w;
  });
  return s;
}
function specTargetCenter(t) { return isoTargetCenter(t); }
function specDefaultElbow(spec, target) {
  const lay = specFrameLayout(spec), c = specTargetCenter(target);
  return { x: spec.x + lay.w / 2, y: c ? c.y : spec.y + lay.h };
}
function specTargetElbow(spec, target) {
  const de = specDefaultElbow(spec, target);
  return { x: Number.isFinite(target.elbowX) ? target.elbowX : de.x, y: Number.isFinite(target.elbowY) ? target.elbowY : de.y };
}
/* Lien d'un cadre vers une cible : rappel à deux segments + extrémité. */
function specTargetSVG(spec, target) {
  const shape = isoTargetShape(target);
  if (!shape) return '';
  const lay = specFrameLayout(spec), m = isoMetrics(), line = '#17191d';
  const elbow = specTargetElbow(spec, target);
  const tip = specTip(target);
  const targetPt = isoTargetBoundary(target, elbow) || shape.center;
  const anchor = rectEdgePoint(spec.x, spec.y, lay.w, lay.h, elbow.x, elbow.y);
  let s = `<path d="M${r1(targetPt.x)} ${r1(targetPt.y)} L${r1(elbow.x)} ${r1(elbow.y)} L${r1(anchor.x)} ${r1(anchor.y)}" fill="none" stroke="${line}" stroke-width="${ISO_STYLE.strokeLeader}"/>`;
  s += isoCornerMarkSVG(target.cornerMark, elbow.x, elbow.y);
  if (tip === 'arrow') s += `<polygon points="${isoTipArrow(targetPt.x, targetPt.y, elbow.x, elbow.y, ISO_STYLE.tipArrowLenFactor * m.letter, ISO_STYLE.tipArrowWidthFactor * m.letter)}" fill="${line}"/>`;
  else if (tip === 'triangle') s += `<polygon points="${isoTipTriangle(targetPt.x, targetPt.y, elbow.x, elbow.y, ISO_STYLE.tipTriangleFactor * m.letter)}" fill="${line}"/>`;
  return s;
}
function specAnnotationText(spec) {
  const a = spec.annotation || {}; if (!a.enabled) return '';
  const repeat = Math.max(1, Math.floor(Number(a.repeat) || 1));
  const base = `${repeat > 1 ? `${repeat}x ` : ''}${a.diameter || ''}${a.value || ''}`;
  if (a.toleranceMode === 'symmetric' && a.toleranceUpper) return `${base}±${a.toleranceUpper}`;
  if (a.toleranceMode === 'asymmetric') return `${base}+${a.toleranceUpper || ''}-${a.toleranceLower || ''}`;
  if (a.toleranceMode === 'class') return `${base}${a.toleranceClass || ''}`;
  return base;
}
function specAnnotationSVG(spec) {
  const a = spec.annotation || {}; if (!a.enabled) return '';
  const repeat = Math.max(1, Math.floor(Number(a.repeat) || 1));
  const base = `${repeat > 1 ? `${repeat}x ` : ''}${a.diameter || ''}${a.value || ''}`;
  const upper = String(a.toleranceUpper || ''), lower = String(a.toleranceLower || '');
  const suffix = a.toleranceMode === 'symmetric' && upper ? `±${upper}` : a.toleranceMode === 'class' ? String(a.toleranceClass || '') : '';
  const approxW = richTextWidth(base + suffix + upper + lower, 12);
  const baseX = spec.x + 1, baselineY = spec.y - 4;
  let content = esc(base);
  if (a.toleranceMode === 'symmetric' && upper) content += `±${esc(upper)}`;
  else if (a.toleranceMode === 'asymmetric' && (upper || lower)) {
    const toleranceX = r1(baseX + textW(base, '12px Arial, sans-serif'));
    content += `<tspan x="${toleranceX}" baseline-shift="super" font-size="8">+${esc(upper)}</tspan><tspan x="${toleranceX}" baseline-shift="sub" font-size="8">−${esc(lower)}</tspan>`;
  }
  else if (a.toleranceMode === 'class' && a.toleranceClass) content += esc(a.toleranceClass);
  return `<text x="${r1(baseX)}" y="${r1(baselineY)}" font-family="Arial, sans-serif" font-size="12" fill="#17191d" text-anchor="start" data-width="${r1(approxW)}">${content}</text>`;
}
const SPEC_COMPLEMENT_SYMBOLS = [
  ['sym', '\u232F', 'Symétrie'], ['para', '\u2225', 'Parallélisme'],
  ['perpen', '\u27C2', 'Perpendicularité'], ['angle', '\u2220', 'Angulosité']
];
const SPEC_COMPLEMENT_CHARS = new Map(SPEC_COMPLEMENT_SYMBOLS.map(([id, ch]) => [id, ch]));
function specComplementaryCellSVG(spec, id, x) {
  const a = spec.annotation || {}, data = a.complementaryData?.[id] || {};
  const m = isoMetrics(), h = ISO_STYLE.frameHFactor * m.letter;
  const symbol = SPEC_COMPLEMENT_CHARS.get(data.sym) || SPEC_COMPLEMENT_CHARS.get('sym');
  const text = String(data.text || ''), pad = ISO_STYLE.framePadFactor * m.letter;
  const symW = Math.max(ISO_STYLE.frameWFactor * m.letter, textW(symbol, m.font) + 2 * pad);
  const textWpx = text ? textW(text, m.font) + 2 * pad : ISO_STYLE.frameWFactor * m.letter;
  const w = symW + textWpx, y = spec.y, line = '#17191d';
  let out = `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" fill="#fff" stroke="${line}" stroke-width="${ISO_STYLE.strokeFrame}"/><line x1="${r1(x + symW)}" y1="${r1(y)}" x2="${r1(x + symW)}" y2="${r1(y + h)}" stroke="${line}" stroke-width="${ISO_STYLE.strokeFrame}"/>`;
  out += `<text x="${r1(x + symW / 2)}" y="${r1(y + h / 2 + m.letter / 2)}" text-anchor="middle" ${isoTextAttrs(m, false)} fill="${line}">${esc(symbol)}</text>`;
  if (text) out += `<text x="${r1(x + symW + textWpx / 2)}" y="${r1(y + h / 2 + m.letter / 2)}" text-anchor="middle" ${isoTextAttrs(m, false)} fill="${line}">${esc(text)}</text>`;
  return { svg: out, w };
}
function specSupplementarySVG(spec) {
  const ids = spec.annotation?.supplementary || [];
  if (!ids.length) return '';
  const lay = specFrameLayout(spec), h = isoMetrics().letter, gapW = h * 0.72, cy = spec.y + lay.h / 2;
  let x = spec.x + lay.w, out = '';
  const marker = (kind, atX, pointRight = false) => {
    const size = gapW * 0.82, left = atX, right = atX + gapW;
    if (kind === 'intersection' || kind === 'orientation') {
      const top = spec.y, bottom = spec.y + lay.h;
      const points = pointRight
        ? `${r1(left)},${r1(top)} ${r1(right)},${r1(cy)} ${r1(left)},${r1(bottom)}`
        : `${r1(right)},${r1(top)} ${r1(left)},${r1(cy)} ${r1(right)},${r1(bottom)}`;
      return `<polygon points="${points}" fill="#fff" stroke="#17191d" stroke-width="${ISO_STYLE.strokeFrame}"/>`;
    }
    if (kind === 'direction') return `<path d="M${r1(right)} ${r1(cy)}H${r1(left)} M${r1(left)} ${r1(cy)}l${r1(size*0.42)} ${r1(-size*0.35)} M${r1(left)} ${r1(cy)}l${r1(size*0.42)} ${r1(size*0.35)}" fill="none" stroke="#17191d" stroke-width="${ISO_STYLE.strokeFrame}"/>`;
    const r = size / 2;
    return `<circle cx="${r1((left+right)/2)}" cy="${r1(cy)}" r="${r1(r)}" fill="#fff" stroke="#17191d" stroke-width="${ISO_STYLE.strokeFrame}"/>`;
  };
  for (const id of ids) {
    if (!SPEC_COMPLEMENTARY_INDICATORS.some(([known]) => known === id)) continue;
    out += marker(id, x); x += gapW;
    const cell = specComplementaryCellSVG(spec, id, x); out += cell.svg; x += cell.w;
    if (id === 'orientation') { out += marker(id, x, true); x += gapW; }
  }
  return out;
}
function specSupplementaryWidth(spec) {
  const gapW = isoMetrics().letter * 0.72;
  return (spec.annotation?.supplementary || []).reduce((width, id) => {
    if (!SPEC_COMPLEMENTARY_INDICATORS.some(([known]) => known === id)) return width;
    const cell = specComplementaryCellSVG(spec, id, 0);
    return width + gapW + cell.w + (id === 'orientation' ? gapW : 0);
  }, 0);
}
function specSVG(spec) {
  const leaders = (spec.targets || []).map(t => specTargetSVG(spec, t)).join('');
  return `<g data-id="${spec.id}" data-kind="isoSpec" style="cursor:move"><title>Cadre de tolérance — glisser pour déplacer, double-clic pour modifier</title>${leaders}${specFrameSVG(spec)}${specAnnotationSVG(spec)}${specSupplementarySVG(spec)}</g>`;
}
/* Une spécification est rattachée à une seule pièce. */
function createSpec(targetIds) {
  const targets = [...new Set(targetIds)].map(isoComponentFromId).filter(Boolean);
  if (!targets.length) return null;
  const ownerPieceId = isoTargetOwner(targets[0]);
  if (!ownerPieceId || targets.some(target => isoTargetOwner(target) !== ownerPieceId)) return null;
  const centers = targets.map(isoTargetCenter).filter(Boolean);
  if (!centers.length) return null;
  const x0 = Math.min(...centers.map(point => point.x)), y0 = Math.min(...centers.map(point => point.y));
  checkpoint();
  const spec = {
    id: uid(), ownerPieceId, x: x0 + 110, y: y0 - 70,
    cells: [{ sym: 'position', text: '', mods: [] }, { sym: '', text: '0,05', mods: [] }],
    annotation: { enabled: false, repeat: 1, diameter: '', value: '', toleranceMode: 'none', toleranceUpper: '', toleranceLower: '', toleranceClass: '', supplementary: [], complementaryData: {} },
    targets: targets.map(target => ({ ...target, tip: 'arrow' }))
  };
  spec.targets.forEach(target => {
    const elbow = specDefaultElbow(spec, target);
    target.elbowX = elbow.x; target.elbowY = elbow.y;
  });
  if (!S().isoSpecs) S().isoSpecs = [];
  S().isoSpecs.push(spec);
  return spec;
}
/* ===== Éditeur des cadres de tolérance (panneau de droite et fenêtre) ===== */
function specPreviewHTML(spec) {
  const lay = specFrameLayout(spec), supplementary = specSupplementarySVG(spec);
  const extra = specSupplementaryWidth(spec);
  return `<div class="spec-preview"><svg viewBox="${r1(spec.x - 8)} ${r1(spec.y - 24)} ${r1(lay.w + extra + 16)} ${r1(lay.h + 32)}">${specFrameSVG(spec)}${specAnnotationSVG(spec)}${supplementary}</svg></div>`;
}
const SPEC_COMPLEMENTARY_INDICATORS = [
  ['intersection', 'Indicateur de plan d’intersection'],
  ['orientation', 'Indicateur de plan d’orientation'],
  ['direction', 'Indicateur d’élément de direction'],
  ['collection', 'Indicateur de plan de collection']
];
function specComplementaryHTML(spec) {
  const selected = new Set(spec.annotation?.supplementary || []);
  const buttons = SPEC_COMPLEMENTARY_INDICATORS.map(([id, label]) =>
    `<button type="button" data-spec-complementary="${id}" class="${selected.has(id) ? 'active' : ''}">${esc(label)}</button>`).join('');
  const fields = SPEC_COMPLEMENTARY_INDICATORS.filter(([id]) => selected.has(id)).map(([id, label]) => {
    const data = spec.annotation?.complementaryData?.[id] || {};
    return `<div class="spec-comp-field"><b>${esc(label)}</b><div class="spec-cell-row">
      <select data-spec-comp="${id}" data-f="sym" aria-label="Symbole">${SPEC_COMPLEMENT_SYMBOLS.map(([sym, ch, name]) => `<option value="${sym}" ${(data.sym || 'sym') === sym ? 'selected' : ''}>${ch} ${esc(name)}</option>`).join('')}</select>
      <input type="text" data-spec-comp="${id}" data-f="text" value="${esc(data.text || '')}" placeholder="texte" aria-label="Texte">
    </div></div>`;
  }).join('');
  return `<div class="spec-complementary">${buttons}</div>${fields ? `<div class="spec-complement-fields">${fields}</div>` : ''}`;
}
function specTargetLabel(t) {
  if (t.targetKind === 'piece') { const p = P(t.targetId); return p ? `${p.name} (${p.num})` : 'pièce supprimée'; }
  if (t.targetKind === 'surface') { const s = SF(t.targetId); return s ? sname(s) : 'cible supprimée'; }
  const g = G(t.targetId); return g ? (g.name || 'Référence') : 'cible supprimée';
}
function specEditorHTML(spec) {
  const cells = (spec.cells || []).map((c, i) => `
    <div class="spec-cell">
      <div class="spec-cell-row">
        <select data-spec-cell="${i}" data-f="sym" title="Symbole de caractéristique">
          <option value="" ${c.sym ? '' : 'selected'}>— sans symbole —</option>
          ${SPEC_SYMBOLS.map(([id, ch, lab]) => `<option value="${id}" ${c.sym === id ? 'selected' : ''}>${ch} ${esc(lab)}</option>`).join('')}
        </select>
        <input type="text" data-spec-cell="${i}" data-f="text" value="${esc(c.text || '')}" placeholder="indication" title="Texte : valeur, référence, mesure…">
      </div>
      <div class="spec-mods">
        ${SPEC_MODIFIERS.map(([id, ch, lab]) => `<button type="button" data-spec-mod="${i}" data-mod="${id}" class="${(c.mods || []).includes(id) ? 'active' : ''}" title="${esc(lab)}">${ch}</button>`).join('')}
        <span class="spec-cell-acts">
          <button type="button" data-spec-cell-act="left" data-i="${i}" title="Déplacer la section à gauche"${i ? '' : ' disabled'}>◀</button>
          <button type="button" data-spec-cell-act="right" data-i="${i}" title="Déplacer la section à droite"${i < spec.cells.length - 1 ? '' : ' disabled'}>▶</button>
          <button type="button" data-spec-cell-act="del" data-i="${i}" class="danger" title="Supprimer la section">✕</button>
        </span>
      </div>
    </div>`).join('');
  const targets = (spec.targets || []).map((t, i) => `
    <div class="spec-target">
      <button data-goto="${t.targetId}" title="Aller au composant lié">${esc(specTargetLabel(t))}</button>
      <select data-spec-tip="${i}" title="Extrémité du lien vers ce composant">${SPEC_TIPS.map(([id, lab]) => `<option value="${id}" ${specTip(t) === id ? 'selected' : ''}>${esc(lab)}</option>`).join('')}</select>
    </div><div class="corner-mark-buttons" aria-label="Marqueur au coude">
      ${[['','Aucun'],['circle','○'],['concentric','◎']].map(([value,label]) => `<button type="button" data-spec-corner="${i}" data-value="${value}" title="${value === '' ? 'Aucun marqueur' : value === 'circle' ? 'Cercle autour du coude' : 'Deux cercles concentriques'}" class="${(t.cornerMark || '') === value ? 'active' : ''}">${label}</button>`).join('')}
    </div>`).join('');
  const ann = spec.annotation || { enabled: false, repeat: 1, diameter: '', value: '', toleranceMode: 'none', toleranceUpper: '', toleranceLower: '', toleranceClass: '', supplementary: [], complementaryData: {} };
  const toleranceMode = ann.toleranceMode || 'none';
  const annotationEditor = `
    <h4>Spécification adjacente</h4>
    <label class="spec-ann-enable"><input type="checkbox" data-spec-ann="enabled" ${ann.enabled ? 'checked' : ''}> Afficher la spécification adjacente</label>
    <div class="spec-ann-fields">
      <label>Répétitions <input type="number" min="1" step="1" data-spec-ann="repeat" value="${Math.max(1, Number(ann.repeat) || 1)}"></label>
      <label>Diamètre <select data-spec-ann="diameter" aria-label="Symbole de diamètre">${[['','Aucun'],['Ø','Ø']].map(([v,l])=>`<option value="${esc(v)}" ${ann.diameter===v?'selected':''}>${l}</option>`).join('')}</select></label>
      <label>Texte <input type="text" data-spec-ann="value" value="${esc(ann.value || '')}" placeholder="ex. 5" aria-label="Texte de spécification"></label>
      <label>Tolérance <select data-spec-ann="toleranceMode" aria-label="Type de tolérance">${[['none','Aucune'],['symmetric','± même valeur'],['asymmetric','+ / − valeurs différentes'],['class','Classe (ex. E6)']].map(([v,l])=>`<option value="${v}" ${toleranceMode===v?'selected':''}>${l}</option>`).join('')}</select></label>
      ${toleranceMode === 'symmetric' ? `<label>± <input type="text" data-spec-ann="toleranceUpper" value="${esc(ann.toleranceUpper || '')}" placeholder="0,1"></label>` : ''}
      ${toleranceMode === 'asymmetric' ? `<label>Exposant (+) <input type="text" data-spec-ann="toleranceUpper" value="${esc(ann.toleranceUpper || '')}" placeholder="0,1"></label><label>Indice (−) <input type="text" data-spec-ann="toleranceLower" value="${esc(ann.toleranceLower || '')}" placeholder="0,0"></label>` : ''}
      ${toleranceMode === 'class' ? `<label>Classe <input type="text" data-spec-ann="toleranceClass" value="${esc(ann.toleranceClass || '')}" placeholder="E6"></label>` : ''}
    </div>`;
  return `
    ${specPreviewHTML(spec)}
    ${annotationEditor}
    <h4>Sections</h4>
    ${cells}
    <div class="btns"><button type="button" data-spec-cell-act="add">＋ Section</button></div>
    <h4>Indications complémentaires</h4>
    ${specComplementaryHTML(spec)}
    <h4>Composants liés</h4>
    ${targets || '<div class="muted">Aucun composant lié</div>'}
    <div class="btns"><button type="button" data-spec-addlink class="primary">✎ Ajouter / retirer des composants…</button></div>`;
}
function wireSpecEditor(root, spec, redraw) {
  const structural = fn => { checkpoint(); fn(); changed(); if (redraw) redraw(); };
  const redrawPreview = () => {
    const wrap = $('.spec-preview', root); if (!wrap) return;
    wrap.innerHTML = specPreviewHTML(spec).replace(/^<div class="spec-preview">/, '').replace(/<\/div>$/, '');
  };
  $$('[data-spec-cell][data-f="text"]', root).forEach(inp => {
    let cp = false;
    inp.addEventListener('focus', () => cp = false);
    inp.addEventListener('input', () => {
      if (!cp) { checkpoint(); cp = true; }
      const c = spec.cells[+inp.dataset.specCell]; if (!c) return;
      c.text = inp.value;
      render(); autosave(); redrawPreview();
    });
  });
  $$('[data-spec-cell][data-f="sym"]', root).forEach(selInp => selInp.addEventListener('change', () => structural(() => {
    const c = spec.cells[+selInp.dataset.specCell]; if (c) c.sym = selInp.value;
  })));
  $$('[data-spec-tip]', root).forEach(selInp => selInp.addEventListener('change', () => structural(() => {
    const t = spec.targets[+selInp.dataset.specTip]; if (t) t.tip = selInp.value;
  })));
  $$('[data-spec-corner]', root).forEach(btn => btn.addEventListener('click', () => structural(() => {
    const t = spec.targets[+btn.dataset.specCorner]; if (t) t.cornerMark = btn.dataset.value;
  })));
  $$('[data-spec-ann]', root).forEach(inp => {
    let cp = false;
    inp.addEventListener('focus', () => cp = false);
    const update = () => {
      if (!cp) { checkpoint(); cp = true; }
      spec.annotation = spec.annotation || { enabled: false, repeat: 1, diameter: '', value: '', toleranceMode: 'none', toleranceUpper: '', toleranceLower: '', toleranceClass: '', supplementary: [], complementaryData: {} };
      const key = inp.dataset.specAnn;
      spec.annotation[key] = key === 'enabled' ? inp.checked : key === 'repeat' ? Math.max(1, Math.floor(Number(inp.value) || 1)) : inp.value;
      if (key === 'repeat') inp.value = spec.annotation.repeat;
      if (key === 'toleranceMode') { changed(); if (redraw) redraw(); return; }
      render(); autosave(); redrawPreview();
    };
    inp.addEventListener(inp.type === 'checkbox' || inp.tagName === 'SELECT' ? 'change' : 'input', update);
  });
  $$('[data-spec-comp]', root).forEach(inp => {
    let cp = false;
    inp.addEventListener('focus', () => cp = false);
    const update = () => {
      if (!cp) { checkpoint(); cp = true; }
      spec.annotation = spec.annotation || { enabled: false, supplementary: [], complementaryData: {} };
      spec.annotation.complementaryData = spec.annotation.complementaryData || {};
      const data = spec.annotation.complementaryData[inp.dataset.specComp] || (spec.annotation.complementaryData[inp.dataset.specComp] = { sym: 'sym', text: '' });
      data[inp.dataset.f] = inp.value;
      render(); autosave(); redrawPreview();
    };
    inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', update);
  });
  $$('[data-spec-complementary]', root).forEach(btn => btn.addEventListener('click', () => structural(() => {
    spec.annotation = spec.annotation || { enabled: false, repeat: 1, diameter: '', value: '', toleranceMode: 'none', toleranceUpper: '', toleranceLower: '', toleranceClass: '', supplementary: [], complementaryData: {} };
    spec.annotation.supplementary = spec.annotation.supplementary || [];
    const id = btn.dataset.specComplementary, index = spec.annotation.supplementary.indexOf(id);
    if (index >= 0) spec.annotation.supplementary.splice(index, 1);
    else {
      spec.annotation.supplementary.push(id);
      spec.annotation.complementaryData = spec.annotation.complementaryData || {};
      spec.annotation.complementaryData[id] = spec.annotation.complementaryData[id] || { sym: 'sym', text: '' };
    }
  })));
  $$('[data-spec-mod]', root).forEach(btn => btn.addEventListener('click', () => structural(() => {
    const c = spec.cells[+btn.dataset.specMod]; if (!c) return;
    c.mods = c.mods || [];
    const i = c.mods.indexOf(btn.dataset.mod);
    if (i >= 0) c.mods.splice(i, 1); else c.mods.push(btn.dataset.mod);
  })));
  $$('[data-spec-cell-act]', root).forEach(btn => btn.addEventListener('click', () => {
    const a = btn.dataset.specCellAct, i = +btn.dataset.i;
    structural(() => {
      if (a === 'add') spec.cells.push({ sym: '', text: '', mods: [] });
      else if (a === 'del') spec.cells.splice(i, 1);
      else if (a === 'left' && i > 0) { const c = spec.cells.splice(i, 1)[0]; spec.cells.splice(i - 1, 0, c); }
      else if (a === 'right' && i < spec.cells.length - 1) { const c = spec.cells.splice(i, 1)[0]; spec.cells.splice(i + 1, 0, c); }
    });
  }));
  $$('[data-spec-target-act]', root).forEach(btn => btn.addEventListener('click', () => structural(() => {
    spec.targets.splice(+btn.dataset.i, 1);
  })));
  $$('[data-spec-addlink]', root).forEach(btn => btn.addEventListener('click', () => {
    setTool('spec'); editSpecId = spec.id; render(); updateTip();
  }));
}
