'use strict';
/* ===== Formes « metaball » des groupes =====
   Champ de distance signée = union lissée (smooth-min) des éléments du groupe,
   contour extrait par marching squares. */
const shapeCache = new Map();

function sdEllipse(x, y, e) {
  const dx = x - e.x, dy = y - e.y;
  const k0 = Math.hypot(dx / e.rx, dy / e.ry), k1 = Math.hypot(dx / (e.rx * e.rx), dy / (e.ry * e.ry));
  return k1 < 1e-9 ? -Math.min(e.rx, e.ry) : k0 * (k0 - 1) / k1;
}
function sdSegment(x, y, s) {
  const vx = s.x2 - s.x1, vy = s.y2 - s.y1, L2 = vx * vx + vy * vy || 1;
  const t = clampN(((x - s.x1) * vx + (y - s.y1) * vy) / L2, 0, 1);
  return Math.hypot(x - s.x1 - vx * t, y - s.y1 - vy * t) - s.w;
}
function sdEl(x, y, e) { return e.t === 'e' ? sdEllipse(x, y, e) : e.t === 'c' ? Math.hypot(x - e.x, y - e.y) - e.r : sdSegment(x, y, e); }
function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }

/* arbre couvrant minimal (pour relier des membres disjoints) */
function mstPairs(pts) {
  const n = pts.length, res = []; if (n < 2) return res;
  const inT = new Array(n).fill(false), best = new Array(n).fill(Infinity), from = new Array(n).fill(-1);
  best[0] = 0;
  for (let it = 0; it < n; it++) {
    let u = -1; for (let i = 0; i < n; i++) if (!inT[i] && (u < 0 || best[i] < best[u])) u = i;
    inT[u] = true; if (from[u] >= 0) res.push([pts[from[u]], pts[u]]);
    for (let v = 0; v < n; v++) if (!inT[v]) { const d = Math.hypot(pts[u].x - pts[v].x, pts[u].y - pts[v].y); if (d < best[v]) { best[v] = d; from[v] = u; } }
  }
  return res;
}

/* Éléments constituant la forme d'un groupe (membres = pièces, ou surfaces pour un système de référence) */
function repetitionBase(members, cfIds = []) {
  const repeated = new Set(members.filter(P)), pieces = [...repeated].map(P).filter(p => !isHiddenPiece(p.id));
  const els = pieces.map(p => ({ t: 'e', x: p.x, y: p.y, rx: p.rx, ry: p.ry })), anchors = [];
  const links = [...S().liaisons, ...S().cfgs.filter(c => cfIds.includes(c.id))];
  for (const l of links) {
    if (!liaisonVisible(l)) continue;
    const sa = SF(l.a), sb = SF(l.b), ia = repeated.has(sa.pieceId), ib = repeated.has(sb.pieceId);
    if (!ia && !ib) continue;
    const hidden = isHiddenPiece(sa.pieceId) || isHiddenPiece(sb.pieceId);
    if (ia === ib && !hidden && !cfIds.includes(l.id)) continue;
    for (const s of [sa, sb]) {
      const p = spos(s);
      els.push({ t: 'c', x: p.x, y: p.y, r: s.r });
      anchors.push(p);
    }
    const geom = linkGeom(l), steps = l.curved ? 24 : 1;
    for (let i = 0; i < steps; i++) {
      const a = geom.point(i / steps), b = geom.point((i + 1) / steps);
      els.push({ t: 's', x1: a.x, y1: a.y, x2: b.x, y2: b.y, w: 4 });
    }
  }
  mstPairs(pieces).forEach(([a, b]) => els.push({ t: 's', x1: a.x, y1: a.y, x2: b.x, y2: b.y, w: Math.max(8, Math.min(a.rx, a.ry, b.rx, b.ry) * 0.18) }));
  return { els, anchors: pieces.length ? pieces : anchors };
}
function repetitionTitle(id) {
  const g = G(id);
  if (!g || g.kind !== 'rep') return null;
  const sh = groupShape(g);
  if (!sh.loops.length) return null;
  const pos = groupLabelPosition(g, sh);
  return pos ? { x: pos.x, y: pos.y, r: repLabelR(g) } : null;
}
function groupElements(kind, members, lab, cfIds = [], repLabelIds = []) {
  const els = [];
  if (kind === 'rep') {
    const base = repetitionBase(members, cfIds);
    if (base.els.length) addLabelElements(base.els, base.anchors, lab, 6);
    return { els: base.els, margin: 8, k: 28 };
  }
  if (kind === 'ref') {
    const ss = members.map(SF).filter(s => s && surfVisible(s)), cs = ss.map(s => ({ ...spos(s), r: s.r }));
    cs.forEach(c => els.push({ t: 'c', x: c.x, y: c.y, r: c.r }));
    mstPairs(cs).forEach(([a, b]) => els.push({ t: 's', x1: a.x, y1: a.y, x2: b.x, y2: b.y, w: 6 }));
    addLabelElements(els, cs, lab, 6);
    return { els, margin: 9, k: 22 };
  }
  const hosts = new Map();
  members.forEach(id => { if (P(id)) { const h = hostOf(id); hosts.set(h.id, h); } });
  const ps = [...hosts.values()];
  ps.forEach(p => els.push({ t: 'e', x: p.x, y: p.y, rx: p.rx, ry: p.ry }));
  if (kind === 'fonc') repLabelIds.forEach(id => addLabelElements(els, ps, repetitionTitle(id), 8));
  addLabelElements(els, ps, lab, 8);
  mstPairs(ps).forEach(([a, b]) => els.push({ t: 's', x1: a.x, y1: a.y, x2: b.x, y2: b.y, w: Math.max(14, Math.min(a.rx, a.ry, b.rx, b.ry) * 0.3) }));
  return { els, margin: 20, k: 70 };
}
function addLabelElements(els, points, lab, width) {
  if (!lab || !points.length) return;
  const near = points.reduce((best, p) => Math.hypot(p.x - lab.x, p.y - lab.y) < Math.hypot(best.x - lab.x, best.y - lab.y) ? p : best);
  els.push({ t: 'c', x: lab.x, y: lab.y, r: lab.r });
  els.push({ t: 's', x1: lab.x, y1: lab.y, x2: near.x, y2: near.y, w: width });
}

function computeShape(kind, members, lab, cfIds = [], repLabelIds = []) {
  const { els, margin, k } = groupElements(kind, members, lab, cfIds, repLabelIds);
  if (!els.length) return { loops: [], label: null };
  const key = kind + '|' + els.map(e => Object.values(e).map(v => typeof v === 'number' ? Math.round(v) : v).join(',')).join(';') +
    (kind === 'rep' && !lab ? '|' + S().pieces.map(p => Math.round(p.x) + ',' + Math.round(p.y) + ',' + Math.round(p.rx) + ',' + Math.round(p.ry)).join(';') + '|' +
      connections().filter(liaisonVisible).map(l => { const g = linkGeom(l); return [g.ax, g.ay, g.bx, g.by, g.cx, g.cy].map(Math.round).join(','); }).join(';') : '');
  if (shapeCache.has(key)) return shapeCache.get(key);
  const field = (x, y) => { let d = Infinity; for (const e of els) d = d === Infinity ? sdEl(x, y, e) : smin(d, sdEl(x, y, e), k); return d - margin; };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of els) {
    const bb = e.t === 'e' ? [e.x - e.rx, e.y - e.ry, e.x + e.rx, e.y + e.ry] : e.t === 'c' ? [e.x - e.r, e.y - e.r, e.x + e.r, e.y + e.r]
      : [Math.min(e.x1, e.x2) - e.w, Math.min(e.y1, e.y2) - e.w, Math.max(e.x1, e.x2) + e.w, Math.max(e.y1, e.y2) + e.w];
    x0 = Math.min(x0, bb[0]); y0 = Math.min(y0, bb[1]); x1 = Math.max(x1, bb[2]); y1 = Math.max(y1, bb[3]);
  }
  const pad = margin + k * 0.3 + 12; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const cs = clampN(Math.max(x1 - x0, y1 - y0) / 140, 3, 9);
  const nx = Math.ceil((x1 - x0) / cs), ny = Math.ceil((y1 - y0) / cs);
  const F = new Float64Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) F[j * (nx + 1) + i] = field(x0 + i * cs, y0 + j * cs);
  const loops = marchingLoops(F, nx, ny, x0, y0, cs)
    .map(l => simplify(l, cs * 0.25))
    .filter(l => l.length > 3);
  const outer = loops.filter((l, i) => !loops.some((o, j) => j !== i && pointInPoly(l[0][0], l[0][1], o)));
  const res = { loops: outer, label: kind === 'rep' && !lab ? labelSpot(F, nx, ny, x0, y0, cs, members) : null };
  if (shapeCache.size > 300) shapeCache.clear();
  shapeCache.set(key, res);
  return res;
}

function marchingLoops(F, nx, ny, x0, y0, cs) {
  const V = (i, j) => F[j * (nx + 1) + i];
  const pts = new Map(), adj = new Map();
  const ep = (h, i, j) => {
    const key = (h ? 'h' : 'v') + i + '_' + j;
    if (!pts.has(key)) {
      if (h) { const a = V(i, j), b = V(i + 1, j); pts.set(key, [x0 + (i + a / (a - b)) * cs, y0 + j * cs]); }
      else { const a = V(i, j), b = V(i, j + 1); pts.set(key, [x0 + i * cs, y0 + (j + a / (a - b)) * cs]); }
    }
    return key;
  };
  const link = (a, b) => { if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, []); adj.get(a).push(b); adj.get(b).push(a); };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const code = (V(i, j) < 0 ? 8 : 0) | (V(i + 1, j) < 0 ? 4 : 0) | (V(i + 1, j + 1) < 0 ? 2 : 0) | (V(i, j + 1) < 0 ? 1 : 0);
    if (code === 0 || code === 15) continue;
    const T = () => ep(true, i, j), B = () => ep(true, i, j + 1), Lf = () => ep(false, i, j), R = () => ep(false, i + 1, j);
    switch (code) {
      case 1: case 14: link(Lf(), B()); break;
      case 2: case 13: link(B(), R()); break;
      case 3: case 12: link(Lf(), R()); break;
      case 4: case 11: link(T(), R()); break;
      case 6: case 9: link(T(), B()); break;
      case 7: case 8: link(Lf(), T()); break;
      case 5: case 10: {
        const c = (V(i, j) + V(i + 1, j) + V(i + 1, j + 1) + V(i, j + 1)) / 4 < 0;
        if ((code === 5) === c) { link(T(), Lf()); link(B(), R()); } else { link(T(), R()); link(Lf(), B()); }
      }
    }
  }
  const seen = new Set(), loops = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = []; let cur = start, prev = null;
    while (cur && !seen.has(cur)) {
      seen.add(cur); loop.push(pts.get(cur));
      const nb = adj.get(cur); const nxt = nb[0] !== prev ? nb[0] : nb[1];
      prev = cur; cur = nxt;
    }
    if (loop.length > 2) loops.push(loop);
  }
  return loops;
}

/* Emplacement du « ×N » : dans la zone, loin des pièces, surfaces et liaisons */
function labelSpot(F, nx, ny, x0, y0, cs, members) {
  const sh = S(), segs = connections(sh).filter(liaisonVisible).flatMap(l => {
    const g = linkGeom(l), n = l.curved ? 24 : 1;
    return Array.from({ length: n }, (_, i) => {
      const a = g.point(i / n), b = g.point((i + 1) / n);
      return { ax: a.x, ay: a.y, bx: b.x, by: b.y };
    });
  });
  const blobs = [...new Map(sh.pieces.map(p => { const h = hostOf(p.id); return [h.id, h]; })).values()];
  const surfs = sh.surfaces.filter(surfVisible);
  let best = null, bestScore = -Infinity;
  const step = Math.max(1, Math.round(10 / cs));
  for (let j = 0; j <= ny; j += step) for (let i = 0; i <= nx; i += step) {
    const v = F[j * (nx + 1) + i]; if (v > -12) continue;
    const x = x0 + i * cs, y = y0 + j * cs;
    let d = -v;
    for (const p of blobs) { d = Math.min(d, sdEllipse(x, y, p)); if (d < 10) break; }
    if (d < 10) continue;
    for (const s of surfs) { const c = spos(s); d = Math.min(d, Math.hypot(x - c.x, y - c.y) - s.r); }
    for (const g of segs) d = Math.min(d, sdSegment(x, y, { x1: g.ax, y1: g.ay, x2: g.bx, y2: g.by, w: 0 }));
    if (d > bestScore) { bestScore = d; best = { x, y }; }
  }
  if (best && bestScore >= REP_FS + 2) return best;
  // pas d'espace libre : au-dessus de la zone
  let top = null; for (let j = 0; j <= ny && !top; j++) for (let i = 0; i <= nx; i++) if (F[j * (nx + 1) + i] < 0) { top = { x: x0 + i * cs, y: y0 + j * cs - 10 }; break; }
  return top ? { x: x0 + nx * cs / 2, y: top.y - REP_FS } : null;
}

/* Libellé ×N d'une répétition */
const repText = g => '×' + g.count + (g.name ? ' ' + g.name : '');
const REP_FS = 17;
const groupText = g => g.kind === 'rep' ? repText(g) : g.name || (g.kind === 'fonc' && g.collapsed ? 'Groupe fonctionnel' : '');
const groupFontSize = g => g.kind === 'rep' ? REP_FS : g.kind === 'fonc' && g.collapsed ? 16 : 13;
function repLabelR(g) { return Math.max(15, textW(groupText(g), `700 ${groupFontSize(g)}px "Segoe UI", Arial, sans-serif`) / 2 + 6); }
/* centre de référence des membres (le décalage manuel du libellé y est relatif) */
function membersCenter(g) {
  if (g.kind === 'rep') {
    const { anchors } = repetitionBase(g.members, g.cfIds || []);
    return anchors.length ? { x: anchors.reduce((sum, p) => sum + p.x, 0) / anchors.length, y: anchors.reduce((sum, p) => sum + p.y, 0) / anchors.length } : null;
  }
  if (g.kind === 'fonc' && g.collapsed) {
    const host = groupHost(g); return host ? { x: host.x, y: host.y } : null;
  }
  if (g.kind === 'ref') {
    const points = g.members.map(SF).filter(s => s && surfVisible(s)).map(spos);
    return points.length ? { x: points.reduce((n, p) => n + p.x, 0) / points.length, y: points.reduce((n, p) => n + p.y, 0) / points.length } : null;
  }
  const hs = new Map(); g.members.forEach(id => { if (P(id)) { const h = hostOf(id); hs.set(h.id, h); } });
  if (!hs.size) return null;
  let x = 0, y = 0; hs.forEach(h => { x += h.x; y += h.y; }); return { x: x / hs.size, y: y / hs.size };
}
function manualLab(g) {
  if (!g.lab || !groupText(g)) return null;
  const c = membersCenter(g); if (!c) return null;
  let dx = g.lab.dx, dy = g.lab.dy;
  if (g.kind === 'fonc' && g.collapsed) {
    const h = groupHost(g), halfWidth = textW(groupText(g), '600 16px "Segoe UI", Arial, sans-serif') / 2 + 5;
    const factor = Math.max(0, 1 - Math.hypot(halfWidth / h.rx, 25 / h.ry));
    if (!factor) { dx = 0; dy = 0; }
    else { const norm = Math.max(1, Math.hypot(dx / (h.rx * factor), dy / (h.ry * factor))); dx /= norm; dy /= norm; }
  }
  return { x: c.x + dx, y: c.y + dy, r: repLabelR(g) };
}
function groupShape(g) {
  if (g.kind === 'fonc' && g.collapsed) {
    const h = groupHost(g); if (!h) return { loops: [], label: null };
    const pts = []; for (let i = 0; i < 72; i++) { const a = i / 72 * TAU; pts.push([h.x + h.rx * Math.cos(a), h.y + h.ry * Math.sin(a)]); }
    const lab = manualLab(g);
    return { loops: [pts], label: lab ? { x: lab.x, y: lab.y } : null, host: h };
  }
  const lab = manualLab(g);
  const sh = computeShape(g.kind, g.members, lab, g.cfIds || [], g.repLabelIds || []);
  return lab ? { ...sh, label: { x: lab.x, y: lab.y } } : sh;
}
function groupLabelPosition(g, sh = groupShape(g)) {
  if (sh.label) return sh.label;
  if (!sh.loops.length) return null;
  if (sh.host) return nameAnchor(sh.host, 16, groupText(g));
  const bb = bboxPts(sh.loops.flat());
  return { x: (bb.x0 + bb.x1) / 2, y: bb.y0 - (g.kind === 'fonc' ? 16 : 6) - groupFontSize(g) * 0.35 };
}
function shapePath(sh) { return sh.loops.map(l => smoothClosed(l)).join(''); }
function shapeTop(sh) { let best = null; sh.loops.forEach(l => l.forEach(p => { if (!best || p[1] < best[1]) best = p; })); return best; }
