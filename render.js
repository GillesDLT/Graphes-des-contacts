'use strict';
/* ===== État de l'interface ===== */
let tool = 'select';
const sel = new Set();
let drag = null;
let pick = [];
let pickCFs = [];
let pickRepLabels = [];
let marquee = null;
let spaceDown = false;
const stage = $('#stage'), svg = $('#svg'), vp = $('#viewport');
let cycleMarks = visibleCycleContents([]);

function pruneSel() { for (const id of [...sel]) if (!obj(id)) sel.delete(id); }
function viewCenter() {
  const r = stage.getBoundingClientRect(), v = S().view;
  return [(r.width / 2 - v.x) / v.k, (r.height / 2 - v.y) / v.k];
}
function toWorld(e) {
  const r = svg.getBoundingClientRect(), v = S().view;
  return { x: (e.clientX - r.left - v.x) / v.k, y: (e.clientY - r.top - v.y) / v.k };
}
function toScreen(x, y) {
  const r = svg.getBoundingClientRect(), v = S().view;
  return { x: r.left + v.x + x * v.k, y: r.top + v.y + y * v.k };
}

/* changed(): rendu + sauvegarde ; full = reconstruit aussi le panneau et les onglets */
function changed(full = true) {
  render();
  if (full) { renderProps(); renderTabs(); }
  autosave();
}

/* ===== Rendu des éléments ===== */
function pieceSVG(p) {
  return `<g data-id="${p.id}" data-kind="piece"><ellipse cx="${r1(p.x)}" cy="${r1(p.y)}" rx="${r1(p.rx)}" ry="${r1(p.ry)}" fill="${p.color}" stroke="${p.stroke || '#1a1a1a'}" stroke-width="2"/></g>`;
}
function pieceNameSVG(p) {
  const fs = clampN(Math.min(p.rx, p.ry) / 4, 13, 24), na = nameAnchor(p, fs);
  return `<text data-id="${p.id}" data-kind="piece" x="${r1(na.x)}" y="${r1(na.y + fs * 0.35)}" text-anchor="middle" font-size="${r1(fs)}" font-weight="600" fill="${textOn(p.color)}" stroke="${p.color}" stroke-width="3" paint-order="stroke">${esc(p.name)}</text>`;
}
function surfSVG(s) {
  const c = spos(s);
  if (doc.settings.showSurfaces === false) {
    const hitRadius = Math.max(s.r, 8 / S().view.k);
    return `<g data-id="${s.id}" data-kind="surface"><circle cx="${r1(c.x)}" cy="${r1(c.y)}" r="${r1(hitRadius)}" fill="transparent" pointer-events="all"/></g>`;
  }
  const name = sname(s);
  const cf = cfOfSurface(s.id);
  const marked = cycleMarks.surfaces.has(s.id) && !cycleMarks.covered.has(s.id) && cf?.inColor !== false;
  const cycleColor = cycleMarks.colors.surfaces.get(s.id);
  const stroke = cf?.inColor === false ? '#000000' : marked ? cycleColor : s.stroke;
  const tc = cf?.inColor === false ? '#000000' : marked ? cycleColor : lum(s.color) < 0.2 ? '#ffffff' : '#1f3b70';
  return `<g data-id="${s.id}" data-kind="surface">${cf ? `<title>Surface de ${esc(cfDisplayName(cf))}</title>` : ''}<circle cx="${r1(c.x)}" cy="${r1(c.y)}" r="${s.r}" fill="${s.color}" stroke="${stroke}" stroke-width="${marked ? 2.2 : s.sw}"${marked ? ' stroke-dasharray="6 4"' : ''}/>` +
    `<text x="${r1(c.x)}" y="${r1(c.y + (s.count > 1 ? -3 : SURF_FONT * 0.35))}" text-anchor="middle" font-size="${SURF_FONT}" fill="${tc}">${s.count > 1 ? `<tspan x="${r1(c.x)}">${s.count}x</tspan><tspan x="${r1(c.x)}" dy="15">${esc(name)}</tspan>` : esc(name)}</text></g>`;
}
function linkGeom(l) {
  const sa = SF(l.a), sb = SF(l.b); if (!sa || !sb) return null;
  const a = spos(sa), b = spos(sb);
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
  const cx = (a.x + b.x) / 2 - uy * (l.curved ? l.bend || 0 : 0), cy = (a.y + b.y) / 2 + ux * (l.curved ? l.bend || 0 : 0);
  const point = t => ({ x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * cx + t * t * b.x, y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * cy + t * t * b.y });
  const boundary = (center, radius, from, to) => {
    let inside = from, outside = to;
    for (let i = 1; i <= 80; i++) {
      const t = from + (to - from) * i / 80, p = point(t);
      if (Math.hypot(p.x - center.x, p.y - center.y) >= radius) { outside = t; break; }
      inside = t;
    }
    for (let i = 0; i < 28; i++) {
      const t = (inside + outside) / 2, p = point(t);
      if (Math.hypot(p.x - center.x, p.y - center.y) < radius) inside = t; else outside = t;
    }
    return (inside + outside) / 2;
  };
  const t0 = l.curved ? boundary(a, sa.r, 0, 1) : Math.min(1, sa.r / d);
  const t1 = l.curved ? boundary(b, sb.r, 1, 0) : Math.max(0, 1 - sb.r / d);
  const p1 = point(t0), p2 = point(t1);
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, ax: a.x, ay: a.y, bx: b.x, by: b.y, cx, cy, t0, t1, point, curved: !!l.curved };
}
function linkPath(g, start = g.t0, end = g.t1) {
  if (end <= start) return '';
  const a = g.point(start), b = g.point(end);
  if (!g.curved) return `M${r1(a.x)},${r1(a.y)}L${r1(b.x)},${r1(b.y)}`;
  const dx = 2 * ((1 - start) * (g.cx - g.ax) + start * (g.bx - g.cx));
  const dy = 2 * ((1 - start) * (g.cy - g.ay) + start * (g.by - g.cy));
  return `M${r1(a.x)},${r1(a.y)}Q${r1(a.x + dx * (end - start) / 2)},${r1(a.y + dy * (end - start) / 2)} ${r1(b.x)},${r1(b.y)}`;
}
function nearestLinkT(g, pt) {
  let best = 0.5, distance = Infinity;
  const d2 = t => { const p = g.point(t); return (p.x - pt.x) ** 2 + (p.y - pt.y) ** 2; };
  for (let i = 0; i <= 80; i++) { const t = i / 80, d = d2(t); if (d < distance) { distance = d; best = t; } }
  let lo = Math.max(0, best - 1 / 80), hi = Math.min(1, best + 1 / 80);
  for (let i = 0; i < 24; i++) { const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3; if (d2(a) < d2(b)) hi = b; else lo = a; }
  return clampN((lo + hi) / 2, 0.08, 0.92);
}
function linkLineSVG(l) {
  const g = linkGeom(l); if (!g) return '';
  const marked = cycleMarks.links.has(l.id), color = marked ? cycleMarks.colors.links.get(l.id) : l.color, width = marked ? Math.max(2.2, l.w) : l.w;
  const dash = marked ? ' stroke-dasharray="6 4"' : '';
  if (l.curved) {
    const t = l.t ?? 0.5, label = g.point(t), hw = richTextWidth(liaisonLabel(l), 12) / 2 + 3;
    const inLabel = t => { const p = g.point(t); return Math.abs(p.x - label.x) < hw && Math.abs(p.y - label.y) < 10; };
    const edge = end => {
      if (inLabel(end)) return end;
      let a = t, b = end;
      for (let i = 0; i < 28; i++) { const m = (a + b) / 2; if (inLabel(m)) a = m; else b = m; }
      return (a + b) / 2;
    };
    const paths = [linkPath(g, g.t0, Math.max(g.t0, edge(g.t0))), linkPath(g, Math.min(g.t1, edge(g.t1)), g.t1)];
    return `<g data-id="${l.id}" data-kind="liaison">${paths.map(d => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}"${dash}/>`).join('')}<path d="${linkPath(g)}" fill="none" stroke="transparent" stroke-width="10"/></g>`;
  }
  // le trait est interrompu sous le libellé (sinon il apparaît entre les mots)
  const t = l.t ?? 0.5, lx = g.ax + (g.bx - g.ax) * t, ly = g.ay + (g.by - g.ay) * t;
  const L = Math.hypot(g.bx - g.ax, g.by - g.ay) || 1, ux = (g.bx - g.ax) / L, uy = (g.by - g.ay) / L;
  const hw = richTextWidth(liaisonLabel(l), 12) / 2 + 3, hh = 9;
  const half = Math.min(Math.abs(ux) > 1e-6 ? hw / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? hh / Math.abs(uy) : Infinity);
  const seg = (x1, y1, x2, y2) => `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${color}" stroke-width="${width}"${dash}/>`;
  const d1 = Math.hypot(lx - g.x1, ly - g.y1), d2 = Math.hypot(g.x2 - lx, g.y2 - ly);
  let vis = '';
  if (d1 > half) vis += seg(g.x1, g.y1, lx - ux * half, ly - uy * half);
  if (d2 > half) vis += seg(lx + ux * half, ly + uy * half, g.x2, g.y2);
  return `<g data-id="${l.id}" data-kind="liaison">${vis}` +
    `<line x1="${r1(g.x1)}" y1="${r1(g.y1)}" x2="${r1(g.x2)}" y2="${r1(g.y2)}" stroke="transparent" stroke-width="10"/></g>`;
}
function linkLabelSVG(l) {
  const g = linkGeom(l); if (!g) return '';
  const { x, y } = g.point(l.t ?? 0.5);
  const color = cycleMarks.colors.links.get(l.id) || '#1f1f1f';
  return richTextSVG(liaisonLabel(l), x, y + 4, 12, `data-id="${l.id}" data-kind="llabel"`, color);
}
/* Groupe fonctionnel réduit : une seule ellipse portant les surfaces en contact avec l'extérieur */
function collapsedSVG(g) {
  const h = hostMap.get(g.members.find(m => hostMap.has(m))) || groupHost(g); if (!h) return '';
  return `<g data-id="${g.id}" data-kind="group">` +
    `<ellipse cx="${r1(h.x)}" cy="${r1(h.y)}" rx="${r1(h.rx)}" ry="${r1(h.ry)}" fill="${g.color}" stroke="${shade(g.stroke, -0.3)}" stroke-width="2"/></g>`;
}
/* Fond (derrière tout) */
function groupFillSVG(g) {
  if (g.kind === 'fonc' && g.collapsed) return '';
  const sh = groupShape(g); if (!sh.loops.length || !(g.opacity > 0)) return '';
  return `<g data-id="${g.id}" data-kind="group"${g.kind === 'ref' && tool === 'select' ? ' pointer-events="none"' : ''}><path d="${shapePath(sh)}" fill="${g.color}" fill-opacity="${g.opacity}" stroke="none"/></g>`;
}
/* Contour en pointillés (au-dessus de tout) + bouton réduire/développer des groupes fonctionnels */
function groupOutlineSVG(g) {
  const sh = groupShape(g); if (!sh.loops.length) return '';
  const d = shapePath(sh), col = cycleMarks.colors.references.get(g.id) || g.stroke;
  let out = `<g data-id="${g.id}" data-kind="group"><path d="${d}" fill="none" stroke="${col}" stroke-width="${g.sw}" stroke-dasharray="7 5" stroke-linecap="round" pointer-events="none"/>` +
    `<path d="${d}" fill="none" stroke="transparent" stroke-width="6" pointer-events="stroke"/></g>`;
  if (g.kind === 'fonc') {
    const top = sh.host ? [sh.host.x, sh.host.y - sh.host.ry] : shapeTop(sh);
    if (top) {
      const [x, y] = top, c = shade(col, -0.35), sgn = g.collapsed ? '+' : '−';
      out += `<g data-id="${g.id}" data-kind="gtoggle" style="cursor:pointer"><title>${g.collapsed ? 'Développer le groupe fonctionnel' : 'Réduire en une seule ellipse'}</title>` +
        `<circle cx="${r1(x)}" cy="${r1(y)}" r="10" fill="#fff" stroke="${c}" stroke-width="1.5"/>` +
        `<text x="${r1(x)}" y="${r1(y + 5)}" text-anchor="middle" font-size="16" font-weight="700" fill="${c}" pointer-events="none">${sgn}</text></g>`;
    }
  }
  return out;
}
function groupLabelSVG(g) {
  const sh = groupShape(g); if (!sh.loops.length) return '';
  if (g.kind === 'fonc' && g.collapsed) {
    const na = groupLabelPosition(g, sh), n = g.members.filter(P).length;
    return `<g data-id="${g.id}" data-kind="glabel" style="cursor:move"><title>Glisser le nom (double-clic : position automatique)</title>` +
      `<text x="${r1(na.x)}" y="${r1(na.y + 1.6)}" text-anchor="middle" font-size="16" font-weight="600" fill="${textOn(g.color)}">${esc(groupText(g))}</text>` +
      `<text x="${r1(na.x)}" y="${r1(na.y + 16.6)}" text-anchor="middle" font-size="11" fill="${textOn(g.color)}" fill-opacity="0.7">${n} pièce${n > 1 ? 's' : ''}</text></g>`;
  }
  const col = cycleMarks.colors.references.get(g.id) || shade(g.stroke, -0.35);
  const name = groupText(g), pos = groupLabelPosition(g, sh), fs = groupFontSize(g);
  return name && pos ? `<text data-id="${g.id}" data-kind="glabel" x="${r1(pos.x)}" y="${r1(pos.y + fs * 0.35)}" text-anchor="middle" font-size="${fs}" font-weight="${g.kind === 'rep' ? 700 : 600}" fill="${col}" stroke="#fff" stroke-width="3" paint-order="stroke" style="cursor:move"><title>Glisser pour déplacer (double-clic : position automatique)</title>${esc(name)}</text>` : '';
}
function cfgSVG(c) {
  if (!liaisonVisible(c)) return '';
  const g = linkGeom(c); if (!g) return '';
  const label = g.point(0.5), color = cfRenderColor(c);
  const half = textW(cfName(c), '700 13px "Segoe UI", Arial, sans-serif') / 2 + 6;
  return `<g data-id="${c.id}" data-kind="cfg">` +
    `<path d="${linkPath(g)}" fill="none" stroke="${color}" stroke-width="2.5"/>` +
    `<path d="${linkPath(g)}" fill="none" stroke="transparent" stroke-width="12"/>` +
    (cfName(c) ? (c.labelBox ? `<rect data-cf-label-box="${c.id}" x="${r1(label.x - half)}" y="${r1(label.y - 11)}" width="${r1(half * 2)}" height="22" rx="2" fill="white" stroke="${color}" stroke-width="1.3"/>` : '') +
      `<text x="${r1(label.x)}" y="${r1(label.y + (c.labelBox ? 4 : -8))}" text-anchor="middle" font-size="13" font-weight="700" fill="${color}" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(cfName(c))}</text>` : '') +
    (doc.settings.showDetails && cfDetailText(c) ? richTextSVG(cfDetailText(c), label.x, label.y + (c.labelBox ? 21 : 8), 11, `data-id="${c.id}" data-kind="cfg"`, color) : '') + '</g>';
}
/* Torseurs sous les traits de liaisons (bouton « Torseurs » de la barre) */
function torseursSVG(links) {
  if (!doc.settings.showTorseurs) return '';
  return links.map(l => {
    const g = linkGeom(l); if (!g) return '';
    const p = g.point(l.t ?? 0.5);
    return torseurSVG(l, p.x, p.y + 14);
  }).join('');
}
function nominalSVG(bubbles = false) {
  if (!(S().showNominalZero ?? doc.settings.showNominalZero)) return '';
  return S().pieces.filter(p => !isHiddenPiece(p.id)).map(p => {
    const a = nominalGeometry(p), { name, r, fs } = a;
    if (bubbles) return `<g data-nominal-piece="${p.id}" data-id="${p.id}" data-kind="nominal"><title>Glisser dans la pièce ; double-clic pour réinitialiser</title><circle cx="${r1(a.x)}" cy="${r1(a.y)}" r="${r}" fill="white" stroke="#64748b" stroke-width="1.5"/><text x="${r1(a.x)}" y="${r1(a.y + fs * 0.35)}" text-anchor="middle" font-size="${fs}" fill="#334155">${esc(name)}</text></g>`;
    const lines = S().surfaces.filter(s => s.pieceId === p.id && surfVisible(s)).map(s => {
      const b = spos(s), dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      if (d <= r + s.r) return '';
      return `<line data-nominal-surface="${s.id}" x1="${r1(a.x + dx / d * r)}" y1="${r1(a.y + dy / d * r)}" x2="${r1(b.x - dx / d * s.r)}" y2="${r1(b.y - dy / d * s.r)}" stroke="#64748b" stroke-width="1"/>`;
    }).join('');
    return `<g data-nominal-lines="${p.id}" pointer-events="none">${lines}</g>`;
  }).join('');
}
function internalNodePoint(id, piece) {
  const surface = SF(id);
  if (surface) return surfVisible(surface) ? { ...spos(surface), r: surface.r + 2 } : null;
  const group = G(id); if (!group || !nodeSurfaces(id).some(s => s.pieceId === piece.id && surfVisible(s))) return null;
  let best = null, distance = Infinity;
  for (const loop of groupShape(group).loops) for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length], dx = b[0] - a[0], dy = b[1] - a[1];
    const t = clampN(((piece.x - a[0]) * dx + (piece.y - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    const x = a[0] + dx * t, y = a[1] + dy * t, d = Math.hypot(x - piece.x, y - piece.y);
    if (d < distance) { distance = d; best = { x, y, r: 0 }; }
  }
  if (!best) return null;
  const dx = best.x - piece.x, dy = best.y - piece.y;
  const norm = Math.max(1, Math.hypot(dx / Math.max(1, piece.rx - 1), dy / Math.max(1, piece.ry - 1)));
  return { x: piece.x + dx / norm, y: piece.y + dy / norm, r: 0 };
}
function cycleInternalSVG(cycles) {
  const connections = new Map();
  cycles.forEach(c => cycleInternalConnections(c).forEach(e => connections.set(e.key, { ...e, color: c.color || DEFAULT_CYCLE_COLOR })));
  return [...connections.values()].map(e => {
    const p = P(e.pieceId); if (!p || isHiddenPiece(p.id)) return '';
    const a = internalNodePoint(e.a, p), b = internalNodePoint(e.b, p); if (!a || !b) return '';
    const trim = point => {
      const dx = p.x - point.x, dy = p.y - point.y, len = Math.hypot(dx, dy) || 1;
      return { x: point.x + dx / len * point.r, y: point.y + dy / len * point.r };
    };
    const start = trim(a), end = trim(b), dx = end.x - start.x, dy = end.y - start.y, len = Math.hypot(dx, dy);
    const width = Math.min(12, Math.min(p.rx, p.ry) * 0.12), nx = len > 1 ? -dy / len : 0, ny = len > 1 ? dx / len : 1;
    const path = `M${r1(start.x)},${r1(start.y)}C${r1(p.x + nx * width)},${r1(p.y + ny * width)} ${r1(p.x - nx * width)},${r1(p.y - ny * width)} ${r1(end.x)},${r1(end.y)}`;
    return `<path data-cycle-internal="${e.key}" data-piece="${p.id}" d="${path}" fill="none" stroke="${e.color}" stroke-width="2.2" stroke-dasharray="6 4" stroke-linecap="round" pointer-events="none"/>`;
  }).join('');
}

function noteLines(note) {
  const maxW = 320, fs = 14, lines = [];
  for (const raw of String(note.text || '').split('\n')) {
    const words = raw.split(/\s+/); let line = '';
    for (const word of words) {
      const candidate = line ? line + ' ' + word : word;
      if (line && textW(candidate, `${fs}px "Segoe UI", Arial, sans-serif`) > maxW) { lines.push(line); line = word; }
      else line = candidate;
    }
    lines.push(line);
  }
  return lines.length ? lines : [''];
}
function noteSVG(note) {
  const lines = noteLines(note), fs = 14, pad = 10, lineH = 19;
  const width = Math.max(90, Math.min(340, Math.max(...lines.map(line => textW(line, `${fs}px "Segoe UI", Arial, sans-serif`) + pad * 2))));
  const height = lines.length * lineH + pad * 2;
  const text = lines.map((line, i) => `<text x="${r1(pad)}" y="${r1(pad + fs + i * lineH)}" font-size="${fs}" fill="#332d1d">${esc(line)}</text>`).join('');
  return `<g data-id="${note.id}" data-kind="note" style="cursor:move"><title>Note — double-clic pour modifier</title><rect x="${r1(note.x)}" y="${r1(note.y)}" width="${r1(width)}" height="${r1(height)}" rx="5" fill="${note.color || '#fff4c2'}" stroke="#b59b47" stroke-width="1.4"/>` +
    `<g transform="translate(${r1(note.x)},${r1(note.y)})">${text}</g></g>`;
}

function renderView() {
  const v = S().view;
  vp.setAttribute('transform', `translate(${r1(v.x)},${r1(v.y)}) scale(${v.k})`);
  stage.classList.toggle('grid', !!doc.settings.grid);
  stage.style.backgroundSize = `${20 * v.k}px ${20 * v.k}px`;
  stage.style.backgroundPosition = `${v.x}px ${v.y}px`;
  $('#zoomLbl').textContent = Math.round(v.k * 100) + '%';
}
function render() {
  const s = S();
  autoLayout();
  const visibleCycles = [...cycleDisplayOrder(s).filter(c => c.visible !== false), ...(tool === 'cycle' && cycleDraft ? [cycleDraft] : [])];
  cycleMarks = visibleCycleContents(visibleCycles);
  renderView();
  const nonRef = s.groups.filter(g => g.kind !== 'ref').slice().reverse();
  $('#l-groups').innerHTML = nonRef.map(groupFillSVG).join('');
  $('#l-pieces').innerHTML = s.pieces.filter(p => !isHiddenPiece(p.id)).map(pieceSVG).join('') +
    s.groups.filter(g => g.kind === 'fonc' && g.collapsed).map(collapsedSVG).join('');
  $('#l-reffill').innerHTML = s.groups.filter(g => g.kind === 'ref').slice().reverse().map(groupFillSVG).join('');
  $('#l-nominal').innerHTML = nominalSVG();
  $('#l-nominal-labels').innerHTML = nominalSVG(true);
  $('#l-cycle-internal').innerHTML = cycleInternalSVG(visibleCycles);
  const vis = s.liaisons.filter(liaisonVisible);
  $('#l-links').innerHTML = vis.map(linkLineSVG).join('');
  $('#l-torseurs').innerHTML = torseursSVG(vis);
  $('#l-surfaces').innerHTML = s.surfaces.filter(surfVisible).map(surfSVG).join('');
  $('#l-cfg').innerHTML = s.cfgs.map(cfgSVG).join('');
  $('#l-piece-labels').innerHTML = s.pieces.filter(p => !isHiddenPiece(p.id)).map(pieceNameSVG).join('');
  $('#l-labels').innerHTML = vis.map(linkLabelSVG).join('');
  $('#l-outlines').innerHTML = s.groups.slice().reverse().map(groupOutlineSVG).join('');
  $('#l-group-labels').innerHTML = s.groups.slice().reverse().map(groupLabelSVG).join('');
  $('#l-notes').innerHTML = (s.notes || []).map(noteSVG).join('');
  $('#l-iso-specs').innerHTML =
    (doc.settings.showIsoRefs === false ? '' : (s.isoRefs || []).map(isoRefSVG).join('')) +
    (doc.settings.showSpecs === false ? '' : (s.isoSpecs || []).map(specSVG).join(''));
  renderOverlay();
  $$('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  $('[data-act=details]').classList.toggle('active', !!doc.settings.showDetails);
  const surfacesButton = $('[data-act=surfaces]');
  surfacesButton.classList.toggle('active', doc.settings.showSurfaces !== false);
  surfacesButton.setAttribute('aria-pressed', String(doc.settings.showSurfaces !== false));
  $('[data-act=grid]').classList.toggle('active', !!doc.settings.grid);
  $('[data-act=torseurs]').classList.toggle('active', !!doc.settings.showTorseurs);
  $('[data-act=nominal0]').classList.toggle('active', !!(s.showNominalZero ?? doc.settings.showNominalZero));
  stage.className = stage.className.replace(/\bt-\w+/g, '').trim() + ' t-' + tool;
}

function renderOverlay() {
  const k = S().view.k, hs = 5 / k, sw = 1.5 / k;
  let o = '';
  const blue = '#2b5fd9';
  for (const id of sel) {
    const kd = kindOf(id);
    if (kd === 'piece' && isHiddenPiece(id)) continue;
    if (kd === 'surface' && (!surfVisible(SF(id)) || doc.settings.showSurfaces === false)) continue;
    if (kd === 'liaison' && !liaisonVisible(L(id))) continue;
    if (kd === 'piece') {
      const p = P(id);
      o += `<ellipse cx="${p.x}" cy="${p.y}" rx="${p.rx + 6 / k}" ry="${p.ry + 6 / k}" fill="none" stroke="${blue}" stroke-width="${sw}" stroke-dasharray="${5 / k} ${3 / k}"/>`;
    } else if (kd === 'surface') {
      const s = SF(id), c = spos(s);
      o += `<circle cx="${c.x}" cy="${c.y}" r="${s.r + 4 / k}" fill="none" stroke="${blue}" stroke-width="${2 / k}"/>`;
    } else if (kd === 'liaison') {
      const g = linkGeom(L(id)); if (g && liaisonVisible(L(id))) o += `<path d="${linkPath(g)}" fill="none" stroke="${blue}" stroke-opacity="0.45" stroke-width="${7 / k}" stroke-linecap="round" pointer-events="none"/>`;
    } else if (kd === 'group') {
      const g = G(id), sh = groupShape(g);
      if (sh.loops.length) o += `<path d="${shapePath(sh)}" fill="none" stroke="${blue}" stroke-width="${2.5 / k}" stroke-dasharray="${6 / k} ${4 / k}"/>`;
      if (g?.kind === 'fonc' && g.collapsed && sh.host && sel.size === 1 && tool === 'select') {
        const h = sh.host;
        const handle = (x, y, t) => `<rect data-handle="${t}" data-pid="${g.id}" x="${x - hs}" y="${y - hs}" width="${2 * hs}" height="${2 * hs}" fill="#fff" stroke="${blue}" stroke-width="${sw}"><title>Glisser pour modifier la forme de l’ellipse</title></rect>`;
        o += `<rect x="${h.x - h.rx}" y="${h.y - h.ry}" width="${2 * h.rx}" height="${2 * h.ry}" fill="none" stroke="${blue}" stroke-opacity="0.35" stroke-width="${1 / k}" pointer-events="none"/>`;
        o += handle(h.x + h.rx, h.y, 'e') + handle(h.x, h.y + h.ry, 's') + handle(h.x + h.rx, h.y + h.ry, 'se');
      }
    } else if (kd === 'isoRef') {
      const ref=(S().isoRefs||[]).find(x=>x.id===id), t=ref&&isoTargetCenter(ref);
      if(doc.settings.showIsoRefs!==false&&ref&&t&&isoTypeHasLeader(isoType(ref))){ const ex=ref.elbowX,ey=ref.elbowY; o+=`<circle data-spec-bend="${id}" cx="${r1(ex)}" cy="${r1(ey)}" r="${7/k}" fill="white" stroke="${blue}" stroke-width="${2/k}"><title>Glisser pour déplacer le coude de l’indicateur ISO</title></circle>`; }
    } else if (kd === 'isoSpec') {
      const sp = (S().isoSpecs || []).find(x => x.id === id);
      if (doc.settings.showSpecs !== false && sp) {
        const lay = specFrameLayout(sp);
        o += `<rect x="${r1(sp.x)}" y="${r1(sp.y)}" width="${r1(lay.w)}" height="${r1(lay.h)}" fill="none" stroke="${blue}" stroke-width="${sw}" stroke-dasharray="${5 / k} ${3 / k}" pointer-events="none"/>`;
        if (tool === 'select') (sp.targets || []).forEach((t, ti) => {
          const e = specTargetElbow(sp, t);
          o += `<circle data-spec-bend="${sp.id}" data-ti="${ti}" cx="${r1(e.x)}" cy="${r1(e.y)}" r="${7 / k}" fill="white" stroke="${blue}" stroke-width="${2 / k}"><title>Glisser pour déplacer le coude du lien</title></circle>`;
        });
      }
    } else if (kd === 'cfg') {
      const c = C(id), g = linkGeom(c);
      if (g && liaisonVisible(c)) o += `<path d="${linkPath(g)}" fill="none" stroke="${blue}" stroke-opacity="0.4" stroke-width="${8 / k}" stroke-linecap="round" pointer-events="none"/>`;
    }
  }
  // poignées de redimensionnement (une seule pièce sélectionnée)
  if (sel.size === 1 && tool === 'select') {
    const id = [...sel][0], l = L(id) || C(id);
    if (l?.curved && liaisonVisible(l)) {
      const g = linkGeom(l), p = { x: g.cx, y: g.cy };
      o += `<line x1="${r1((g.ax + g.bx) / 2)}" y1="${r1((g.ay + g.by) / 2)}" x2="${r1(p.x)}" y2="${r1(p.y)}" stroke="${blue}" stroke-width="${sw}" stroke-dasharray="4 3" pointer-events="none"/>` +
        `<circle data-bend-id="${id}" cx="${r1(p.x)}" cy="${r1(p.y)}" r="${7 / k}" fill="white" stroke="${blue}" stroke-width="${2 / k}"><title>Glisser pour cintrer le lien</title></circle>`;
    }
    const p = P([...sel][0]);
    if (p && !isHiddenPiece(p.id)) {
      const h = (x, y, t) => `<rect data-handle="${t}" data-pid="${p.id}" x="${x - hs}" y="${y - hs}" width="${2 * hs}" height="${2 * hs}" fill="#fff" stroke="${blue}" stroke-width="${sw}"/>`;
      o += `<rect x="${p.x - p.rx}" y="${p.y - p.ry}" width="${2 * p.rx}" height="${2 * p.ry}" fill="none" stroke="${blue}" stroke-opacity="0.35" stroke-width="${1 / k}"/>`;
      o += h(p.x + p.rx, p.y, 'e') + h(p.x, p.y + p.ry, 's') + h(p.x + p.rx, p.y + p.ry, 'se');
    }
  }
  if (isGroupTool() && pick.length) {
    const sh = computeShape(tool, pick, null, pickCFs, pickRepLabels);
    if (sh.loops.length) o += `<path d="${shapePath(sh)}" fill="${tool === 'ref' ? 'none' : doc.settings.groupColors[tool]}" fill-opacity="0.45" stroke="${tool === 'ref' ? doc.settings.groupColors.ref : '#6b7280'}" stroke-width="${2 / k}" stroke-dasharray="${6 / k} ${4 / k}" pointer-events="none"/>`;
  }
  for (const id of pick) {
    const p = P(id), s = SF(id);
    if (p) o += `<ellipse cx="${p.x}" cy="${p.y}" rx="${p.rx + 5}" ry="${p.ry + 5}" fill="none" stroke="#f59e0b" stroke-width="${4 / k}"/>`;
    if (s) { const c = spos(s); o += `<circle cx="${c.x}" cy="${c.y}" r="${s.r + 5}" fill="none" stroke="#e00000" stroke-width="${3 / k}"/>`; }
  }
  if (tool === 'rep') for (const id of pickCFs) {
    const cf = C(id); if (!cf) continue;
    for (const sid of [cf.a, cf.b]) {
      const s = SF(sid); if (!s || !surfVisible(s)) continue;
      const c = spos(s);
      o += `<circle cx="${c.x}" cy="${c.y}" r="${s.r + 4}" fill="none" stroke="#f59e0b" stroke-width="${3 / k}" pointer-events="none"/>`;
    }
    if (tool === 'fonc') for (const id of pickRepLabels) {
      const title = repetitionTitle(id); if (!title) continue;
      o += `<circle cx="${r1(title.x)}" cy="${r1(title.y)}" r="${title.r}" fill="none" stroke="#f59e0b" stroke-width="${3 / k}" pointer-events="none"/>`;
    }
  }
  if (marquee) {
    const x = Math.min(marquee.x0, marquee.x1), y = Math.min(marquee.y0, marquee.y1);
    o += `<rect x="${x}" y="${y}" width="${Math.abs(marquee.x1 - marquee.x0)}" height="${Math.abs(marquee.y1 - marquee.y0)}" fill="${blue}" fill-opacity="0.07" stroke="${blue}" stroke-width="${1 / k}" stroke-dasharray="${4 / k} ${3 / k}"/>`;
  }
  $('#l-overlay').innerHTML = o;
  renderPickbar();
}
const isGroupTool = () => tool === 'rep' || tool === 'fonc' || tool === 'ref';
const GROUP_TOOL_NAMES = { rep: 'Répétition', fonc: 'Groupe fonctionnel', ref: 'Système de référence' };
let editGroupId = null;
let editSpecId = null;
function renderPickbar() {
  const pb = $('#pickbar');
  if (tool === 'spec') {
    const sp = editSpecId && (S().isoSpecs || []).find(x => x.id === editSpecId);
    const html = sp
      ? `<span><b>Spécification</b> : ${sp.targets.length} composant(s) lié(s) à <span class="cnt">${esc(specTargetLabel(sp.targets[0] || {}))}</span> — clic pour ajouter / retirer un composant de la même pièce</span><button class="primary" data-pb="ok">✔ Terminer <span class="kbd" style="color:#333">Entrée</span></button><button data-pb="cancel">Fermer</button>`
      : `<span><b>Spécification</b> : <span class="cnt">${pick.length} composant(s)</span> — surfaces et groupes d’une seule pièce</span><button class="primary" data-pb="ok" ${pick.length ? '' : 'disabled'}>✔ Créer le cadre <span class="kbd" style="color:#333">Entrée</span></button><button data-pb="cancel">Annuler</button><span id="pickErr" class="err" role="alert"></span>`;
    if (pb.dataset.h !== html) { pb.innerHTML = html; pb.dataset.h = html; }
    pb.classList.add('show');
    return;
  }
  if (!isGroupTool()) { pb.classList.remove('show'); pb.innerHTML = ''; delete pb.dataset.h; return; }
  const unit = tool === 'ref' ? 'surface(s)' : 'pièce(s)';
  const html = `<span><b>${GROUP_TOOL_NAMES[tool]}</b>${editGroupId ? ' (modification)' : ''} : <span class="cnt">${pick.length} ${unit}${tool === 'rep' ? ' · ' + pickCFs.length + ' CF incluse(s)' : tool === 'fonc' ? ' · ' + pickRepLabels.length + ' titre(s) de répétition' : ''}</span></span>
    <button class="primary" data-pb="ok" ${pick.length ? '' : 'disabled'}>✔ ${editGroupId ? 'Mettre à jour' : 'Créer'} <span class="kbd" style="color:#333">Entrée</span></button><button data-pb="cancel">Annuler</button><span id="pickErr" class="err" role="alert"></span>`;
  if (pb.dataset.h !== html) { pb.innerHTML = html; pb.dataset.h = html; }
  pb.classList.add('show');
}

/* ===== Onglets (feuilles) ===== */
function renderTabs() {
  const t = $('#tabs');
  t.innerHTML = doc.sheets.map(s => `<div class="tab ${s.id === doc.active ? 'active' : ''}" data-sheet="${s.id}" title="Double-clic pour renommer">${esc(s.name)}${doc.sheets.length > 1 ? `<span class="x" data-delsheet="${s.id}" title="Supprimer la feuille">✕</span>` : ''}</div>`).join('') +
    `<button data-act="addsheet" title="Nouvelle feuille vide">＋</button><button data-act="dupsheet" title="Dupliquer la feuille">⧉ Dupliquer la feuille</button>`;
}

/* ===== Astuces contextuelles ===== */
const TIPS = {
  select: '',
  piece: '<b>Clic</b> sur le fond pour placer la nouvelle pièce (ou <b>Entrée</b> pour la placer automatiquement)',
  liaison: '<b>Ctrl + clic</b> sur 2 pièces différentes pour créer une liaison — <b>Échap</b> pour annuler',
  rep: '<b>Ctrl + clic</b> sur les pièces répétées ; <b>clic sur une surface de CF</b> pour inclure / retirer sa CF entière — <b>Entrée</b> pour valider',
  fonc: '<b>Ctrl + clic</b> sur les pièces ; <b>clic sur un titre de répétition visible</b> pour l’inclure / le retirer du contour, sans ajouter ses pièces — <b>Entrée</b> pour valider',
  ref: '<b>Ctrl + clic</b> sur les surfaces du système de référence — <b>Entrée</b> pour valider',
  cfg: '<b>Clic</b> sur 2 pièces pour créer une CF avec un nom libre unique ; chaque extrémité utilise une surface existante ou une nouvelle surface, avec un point et une normale facultatifs',
  cycle: '<b>Clic ou Ctrl+clic</b> sur une surface de CF, puis les surfaces ou références — finir sur l’autre surface de la même CF. <b>Ctrl+clic sur la dernière étape</b> : retirer',
  pipette: '<b>Clic</b> sur un élément pour prélever sa couleur',
  paint: '<b>Clic</b> sur un élément pour lui appliquer la couleur courante',
  note: '<b>Clic</b> sur le graphe pour ajouter une note. Elle se déplace ensuite avec l’outil Déplacer — <b>N</b>',
  spec: '<b>Clic</b> sur une surface ou un groupe de surface pour choisir les composants d’une seule pièce, puis <b>Entrée</b>. La spécification est liée à ces composants et suit la pièce. Les sections et indications se règlent dans le panneau de droite.',
  isoRef: '<b>Clic</b> sur une surface ou un groupe de surfaces d’une seule pièce pour y appliquer un indicateur ISO.'
};
function showTip(html) { const t = $('#tip'); t.innerHTML = html || ''; t.classList.toggle('show', !!html); }
function updateTip() {
  if (tool === 'spec' && editSpecId) return showTip('<b>Composants liés</b> : clic sur une surface ou un groupe de la même pièce pour l’ajouter / le retirer — <b>Entrée</b> pour terminer');
  if (tool === 'spec' && pick.length) return showTip(`<b>${pick.length} composant(s) sélectionné(s)</b> — tous doivent appartenir à la même pièce — <b>Entrée</b> pour créer la spécification`);
  if (tool === 'liaison' && pick.length === 1) return showTip(`1<sup>re</sup> pièce : <b>${esc(P(pick[0])?.name)}</b> — <b>Ctrl + clic</b> sur la 2<sup>e</sup> pièce`);
  if (tool === 'cfg' && pick.length === 1) return showTip(`1<sup>re</sup> pièce : <b>${esc(endName(pick[0]))}</b> — clic sur une autre pièce`);
  if (tool === 'cycle' && cycleDraft) return showTip(`<b>${esc(cfDisplayName(C(cycleDraft.cfId)))}</b> : ${cycleDraft.nodes.length} nœud(s) — <b>Clic ou Ctrl+clic</b> sur un contact / une référence — <b>Ctrl+clic sur la dernière étape</b> ou <b>Retour arrière</b> : retirer`);
  showTip(TIPS[tool]);
}
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800); }

/* Le lettrage ISO (osifont) est chargé via CSS : une fois prêt, recalculer les largeurs de texte. */
if (document.fonts?.ready) document.fonts.ready.then(() => render()).catch(() => {});
