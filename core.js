'use strict';
/* ===== Utilitaires ===== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r1 = v => Math.round(v * 10) / 10;
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

function hexToRgb(h) {
  h = (h || '#000000').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lum(h) {
  const [r, g, b] = hexToRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const textOn = h => lum(h) < 0.2 ? '#ffffff' : '#1b1b1b';
const subOn = h => lum(h) < 0.2 ? '#c9d7ff' : '#2a5db0';
const inkOf = h => lum(h) > 0.72 ? '#6b7280' : h;
function shade(h, f) {
  const m = v => clampN(Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f), 0, 255);
  return '#' + hexToRgb(h).map(m).map(v => v.toString(16).padStart(2, '0')).join('');
}
function rgbToHex(c) {
  if (!c) return null;
  if (c.startsWith('#')) return c.length === 4 ? '#' + c.slice(1).split('').map(x => x + x).join('') : c.slice(0, 7);
  const m = c.match(/\d+/g); if (!m) return null;
  return '#' + m.slice(0, 3).map(v => (+v).toString(16).padStart(2, '0')).join('');
}

const PALETTE = ['#f4f5f9', '#ffffff', '#fdb975', '#ffd966', '#b6e3a8', '#8fd3c8', '#9cc3f0', '#b9a7e8', '#f4a7b9', '#ef6c57',
  '#5b9bd5', '#2b7de9', '#3fa34d', '#c0392b', '#7f8c8d', '#3a4150', '#1f2430'];

/* ===== Paramètres par défaut ===== */
const DEFAULT_SETTINGS = {
  surfaceTypes: [
    { code: 'PL', label: 'Plan' }, { code: 'CY', label: 'Cylindre' }, { code: 'SP', label: 'Sphère' },
    { code: 'CO', label: 'Cône' }, { code: 'TO', label: 'Tore' }, { code: 'HE', label: 'Hélicoïde' },
    { code: 'VÉ', label: 'Vé' }, { code: 'SC', label: 'Surface complexe' }, { code: 'AU', label: 'Autre' }
  ],
  liaisonTypes: [
    { code: 'EN', label: 'Encastrement', fields: [], symbol: 'EN', sA: 'PL', sB: 'PL' },
    { code: 'PV', label: 'Pivot', fields: ['point', 'axe'], symbol: 'PV', sA: 'CY', sB: 'CY' },
    { code: 'GL', label: 'Glissière', fields: ['axe'], symbol: 'GL', sA: 'PL', sB: 'PL' },
    { code: 'PG', label: 'Pivot glissant', fields: ['point', 'axe'], symbol: 'PG', sA: 'CY', sB: 'CY' },
    { code: 'HE', label: 'Hélicoïdale', fields: ['point', 'axe', 'pas'], symbol: 'HE', sA: 'HE', sB: 'HE' },
    { code: 'ROT', label: 'Rotule (sphérique)', fields: ['point'], symbol: 'ROT', sA: 'SP', sB: 'SP' },
    { code: 'RD', label: 'Rotule à doigt', fields: ['point', 'normale'], symbol: 'RD', sA: 'SP', sB: 'SP' },
    { code: 'AP', label: 'Appui plan', fields: ['normale'], symbol: 'AP', sA: 'PL', sB: 'PL' },
    { code: 'LA', label: 'Linéaire annulaire (sphère-cylindre)', fields: ['point', 'axe'], symbol: 'LA', sA: 'SP', sB: 'CY' },
    { code: 'LR', label: 'Linéaire rectiligne (cylindre-plan)', fields: ['point', 'axe', 'normale'], symbol: 'LR', sA: 'CY', sB: 'PL' },
    { code: 'PO', label: 'Ponctuelle (sphère-plan)', fields: ['point', 'normale'], symbol: 'PO', sA: 'SP', sB: 'PL' }
  ],
  showDetails: false,
  showSurfaces: true,
  showTorseurs: false,
  showIsoRefs: true,
  showSpecs: true,
  showNominalZero: false,
  grid: true,
  torseurLetters: { X: 'u', L: 'α', Y: 'v', M: 'β', Z: 'w', N: 'γ' },
  groupColors: { rep: '#e9edf6', fonc: '#fde7c4', ref: '#2b7de9' }
};
const SYMBOLS = ['EN', 'PV', 'GL', 'PG', 'HE', 'ROT', 'RD', 'AP', 'LA', 'LR', 'PO', 'GEN'];
const FIELD_LABELS = { point: 'Point / centre', axe: 'Axe / direction', normale: 'Normale', pas: 'Pas' };

/* ===== Document ===== */
function newSheet(name) { return { id: uid(), name, pieces: [], surfaces: [], liaisons: [], groups: [], cfgs: [], cycles: [], notes: [], isoRefs: [], isoSpecs: [], view: { x: 0, y: 0, k: 1 } }; }
function newDoc() { const s = newSheet('Graphe 1'); return { version: 2, sheets: [s], active: s.id, settings: clone(DEFAULT_SETTINGS) }; }
let doc = newDoc();

const S = () => doc.sheets.find(s => s.id === doc.active) || doc.sheets[0];
const P = id => S().pieces.find(o => o.id === id);
const SF = id => S().surfaces.find(o => o.id === id);
const L = id => S().liaisons.find(o => o.id === id);
const G = id => S().groups.find(o => o.id === id);
const C = id => S().cfgs.find(o => o.id === id);
const CY = id => S().cycles.find(o => o.id === id);
const connections = (s = S()) => [...s.liaisons, ...s.cfgs];
function kindOf(id) {
  const s = S();
  if (s.pieces.some(o => o.id === id)) return 'piece';
  if (s.surfaces.some(o => o.id === id)) return 'surface';
  if (s.liaisons.some(o => o.id === id)) return 'liaison';
  if (s.groups.some(o => o.id === id)) return 'group';
  if (s.cfgs.some(o => o.id === id)) return 'cfg';
  if (s.cycles.some(o => o.id === id)) return 'cycle';
  if ((s.notes || []).some(o => o.id === id)) return 'note';
  if ((s.isoRefs || []).some(o => o.id === id)) return 'isoRef';
  if ((s.isoSpecs || []).some(o => o.id === id)) return 'isoSpec';
  return null;
}
const obj = id => P(id) || SF(id) || L(id) || G(id) || C(id) || CY(id) || (S().notes || []).find(o => o.id === id) || (S().isoRefs || []).find(o => o.id === id) || (S().isoSpecs || []).find(o => o.id === id);

function ltype(code) {
  return doc.settings.liaisonTypes.find(t => t.code === code) || { code, label: code, fields: [], symbol: 'GEN', sA: 'PL', sB: 'PL' };
}
function stypeLabel(code) { const t = doc.settings.surfaceTypes.find(t => t.code === code); return t ? t.label : code; }

/* ===== Historique (annuler / rétablir) ===== */
const history = { undo: [], redo: [] };
const snapshot = () => JSON.stringify({ sheets: doc.sheets, active: doc.active, settings: doc.settings });
function checkpoint(snap) {
  history.undo.push(snap || snapshot());
  if (history.undo.length > 200) history.undo.shift();
  history.redo = [];
}
function restore(str) { const o = JSON.parse(str); doc.sheets = o.sheets; doc.active = o.active; doc.settings = o.settings; }
function undo() { if (!history.undo.length) return; history.redo.push(snapshot()); restore(history.undo.pop()); afterHistory(); }
function redo() { if (!history.redo.length) return; history.undo.push(snapshot()); restore(history.redo.pop()); afterHistory(); }
function afterHistory() { cycleDraft = null; pick = []; pickCFs = []; pickRepLabels = []; editGroupId = null; sel.clear(); pruneSel(); changed(true); updateTip(); }

/* ===== Persistance locale ===== */
// Un sandbox nommé permet des essais isolés, même si un autre onglet utilise ?sandbox.
const sandboxName = new URLSearchParams(location.search).get('sandbox');
const LS_KEY = 'grapheLiaisons.v1' + (sandboxName === null ? '' : '.sandbox' + (sandboxName ? '.' + encodeURIComponent(sandboxName) : ''));
let saveTimer = null;
let storageBlocked = false;
function autosave() {
  clearTimeout(saveTimer);
  if (storageBlocked) return;
  saveTimer = setTimeout(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(doc)); } catch (e) { toast('Enregistrement local impossible : ' + e.message); } }, 300);
}
function loadDoc(o) {
  if (!o || !Array.isArray(o.sheets) || !o.sheets.length) throw new Error('Fichier invalide');
  const base = clone(DEFAULT_SETTINGS);
  o.settings = Object.assign(base, o.settings || {});
  const tl = (o.settings.torseurLetters && typeof o.settings.torseurLetters === 'object') ? o.settings.torseurLetters : {};
  o.settings.torseurLetters = Object.assign({}, DEFAULT_SETTINGS.torseurLetters,
    Object.fromEntries(Object.entries(tl).filter(([, v]) => typeof v === 'string' && v.trim())));
  const oldCame = o.settings.surfaceTypes.some(t => t.code === 'CA') ||
    o.sheets.some(s => Array.isArray(s.surfaces) && s.surfaces.some(f => f.type === 'CA'));
  o.settings.surfaceTypes = o.settings.surfaceTypes.filter(t => t.code !== 'CA');
  if (oldCame && !o.settings.surfaceTypes.some(t => t.code === 'SC')) o.settings.surfaceTypes.push({ code: 'SC', label: 'Surface complexe' });
  o.settings.liaisonTypes.forEach(t => { if (t.sA === 'CA') t.sA = 'SC'; if (t.sB === 'CA') t.sB = 'SC'; });
  o.sheets.forEach(s => {
    ['pieces', 'surfaces', 'liaisons', 'groups', 'cfgs', 'cycles', 'notes', 'isoRefs', 'isoSpecs'].forEach(k => {
      if (s[k] == null) s[k] = [];
      if (!Array.isArray(s[k])) throw new Error('Liste invalide : ' + k);
    }); s.view = s.view || { x: 0, y: 0, k: 1 };
    delete s.cartouches; // l'outil cartouche a été supprimé : anciennes données ignorées
    s.isoSpecs.forEach(sp => {
      if (!Array.isArray(sp.cells) || !sp.cells.length) sp.cells = [{ sym: '', text: '', mods: [] }];
      sp.cells.forEach(c => { if (c.text == null) c.text = ''; if (!Array.isArray(c.mods)) c.mods = []; });
      if (!Array.isArray(sp.targets)) sp.targets = [];
      sp.annotation = sp.annotation || {};
      const ann = sp.annotation;
      if (ann.diameter === '⌀' || ann.diameter === 'φ') ann.diameter = 'Ø';
      if (ann.diameter == null) ann.diameter = '';
      if (!ann.toleranceMode) ann.toleranceMode = 'none';
      if (ann.toleranceUpper == null) ann.toleranceUpper = '';
      if (ann.toleranceLower == null) ann.toleranceLower = '';
      if (ann.toleranceClass == null) ann.toleranceClass = '';
      if (!Array.isArray(ann.supplementary)) ann.supplementary = [];
      if (!ann.complementaryData || typeof ann.complementaryData !== 'object') ann.complementaryData = {};
    });
    migrateCFs(s);
    s.pieces.forEach(p => {
      delete p.shape;
      if (p.nominal && (!Number.isFinite(p.nominal.dx) || !Number.isFinite(p.nominal.dy))) throw new Error('Position du nominal invalide.');
      if (p.lab && (!Number.isFinite(p.lab.dx) || !Number.isFinite(p.lab.dy))) throw new Error('Position du nom de pièce invalide.');
    });
    s.surfaces.forEach(f => {
      if (f.type === 'CA') f.type = 'SC';
      if (f.count == null) f.count = 1;
      if (!Number.isSafeInteger(f.count) || f.count < 1) throw new Error('Répétition de surface invalide.');
      if (f.ang == null) { const p = s.pieces.find(p => p.id === f.pieceId); f.ang = p ? Math.atan2(f.dy / p.ry, f.dx / p.rx) : 0; }
    });
    connections(s).forEach(l => {
      if (l.curved && (!Number.isFinite(l.bend))) throw new Error('Courbure de lien invalide.');
    });
    s.cycles.forEach((c, i) => {
      if (!c || !Number.isSafeInteger(c.num) || c.num < 1) throw new Error('Numéro de cycle invalide.');
      if (c.color == null) c.color = DEFAULT_CYCLE_COLOR;
      if (!/^#[0-9a-f]{6}$/i.test(c.color)) throw new Error('Couleur de cycle invalide.');
      if (c.displayOrder == null) c.displayOrder = i + 1;
      if (!Number.isSafeInteger(c.displayOrder) || c.displayOrder < 1) throw new Error('Priorité de cycle invalide.');
    });
    s.groups.forEach(g => {
      delete g.pts; delete g.auto; delete g.n; delete g.dash;
      if (g.lab && (!Number.isFinite(g.lab.dx) || !Number.isFinite(g.lab.dy))) throw new Error('Position du nom de groupe invalide.');
      if (g.kind === 'rep' && !(g.count > 1)) g.count = 2;
      if (g.kind === 'rep') {
        if (g.cfIds == null) g.cfIds = [];
        if (!Array.isArray(g.cfIds) || g.cfIds.some(id => typeof id !== 'string')) throw new Error('Liste des CF de répétition invalide.');
      }
      if (g.kind === 'fonc') {
        if (g.repLabelIds == null) g.repLabelIds = [];
        if (!Array.isArray(g.repLabelIds) || g.repLabelIds.some(id => typeof id !== 'string')) throw new Error('Liste des titres de répétition invalide.');
      }
      if (g.kind === 'ref' && g.stroke === '#8a90a0') { g.stroke = g.color; g.opacity = 0.15; }
    });
    cleanupOrphans(s);
    const layoutError = referenceConfigurationError(s);
    if (layoutError) throw new Error(layoutError);
  });
  if (!o.sheets.some(s => s.id === o.active)) o.active = o.sheets[0].id;
  doc = o;
  doc.version = 2;
}

/* ===== Géométrie ===== */
/* Hôte d'affichage d'une pièce : elle-même, ou l'ellipse du groupe fonctionnel réduit qui la contient */
let hostMap = new Map();
function rebuildHosts() {
  hostMap = new Map();
  for (const g of S().groups) {
    if (g.kind !== 'fonc' || !g.collapsed) continue;
    const h = groupHost(g); if (!h) continue;
    g.members.forEach(m => { if (P(m) && !hostMap.has(m)) hostMap.set(m, h); });
  }
}
function groupHost(g) {
  const ps = g.members.map(P).filter(Boolean); if (!ps.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  ps.forEach(p => { x0 = Math.min(x0, p.x - p.rx); y0 = Math.min(y0, p.y - p.ry); x1 = Math.max(x1, p.x + p.rx); y1 = Math.max(y1, p.y + p.ry); });
  if (!g.crx) g.crx = g.cry = Math.round(PIECE_R * Math.min(1.8, 1 + 0.15 * (ps.length - 1)));
  // l'ellipse doit pouvoir contenir le nom entre les surfaces du bord
  const minRx = textW(g.name || 'Groupe fonctionnel', '600 16px "Segoe UI", Arial, sans-serif') / 2 + 66;
  if (g.crx < minRx) { g.cry = g.cry * minRx / g.crx; g.crx = minRx; }
  return { id: g.id, group: g, x: (x0 + x1) / 2, y: (y0 + y1) / 2, rx: g.crx, ry: g.cry, name: g.name || 'Groupe fonctionnel', color: g.color, stroke: g.stroke };
}
const hostOf = pid => hostMap.get(pid) || P(pid);
const hostIdOf = pid => { const h = hostMap.get(pid); return h ? h.id : pid; };
const isHiddenPiece = pid => hostMap.has(pid);
function surfVisible(s) {
  if (!hostMap.has(s.pieceId)) return true;
  const hid = hostIdOf(s.pieceId);
  return connections().some(l => (l.a === s.id || l.b === s.id) && hostIdOf(SF(l.a === s.id ? l.b : l.a)?.pieceId) !== hid);
}
function liaisonVisible(l) { const a = SF(l.a), b = SF(l.b); return !!(a && b) && hostIdOf(a.pieceId) !== hostIdOf(b.pieceId); }
function soff(s) { return hostMap.has(s.pieceId) ? { dx: s.cdx || 0, dy: s.cdy || 0 } : { dx: s.dx, dy: s.dy }; }
function referenceConfigurationError(s = S(), groups = s.groups, surfaces = s.surfaces, links = connections(s)) {
  const physical = referenceLayoutError(groups, surfaces);
  if (physical) return physical;
  const hosts = new Map(), byId = new Map(surfaces.map(f => [f.id, f]));
  groups.filter(g => g.kind === 'fonc' && g.collapsed).forEach(g => g.members.forEach(id => { if (!hosts.has(id)) hosts.set(id, g.id); }));
  if (!hosts.size) return '';
  const host = id => hosts.get(id) || id;
  const projected = surfaces.filter(f => !hosts.has(f.pieceId) || links.some(l => {
    const other = l.a === f.id ? l.b : l.b === f.id ? l.a : null;
    return other && byId.has(other) && host(byId.get(other).pieceId) !== host(f.pieceId);
  })).map(f => ({ id: f.id, pieceId: host(f.pieceId) }));
  return referenceLayoutError(groups, projected);
}
function referenceCreationError(addedSurfaces, nextLinks, replacedIds = [], s = S()) {
  const replaced = new Set(replacedIds);
  const future = { ...s, surfaces: [...s.surfaces, ...addedSurfaces],
    liaisons: [...s.liaisons.filter(l => !replaced.has(l.id)), ...nextLinks.filter(l => l.kind !== 'cfg')],
    cfgs: [...s.cfgs.filter(c => !replaced.has(c.id)), ...nextLinks.filter(l => l.kind === 'cfg')] };
  const used = new Set(connections(future).flatMap(l => [l.a, l.b]));
  if (future.cycleSnapshot) future.cycles.filter(c => !cycleError(c, future)).forEach(c => cycleContents(c, future).surfaces.forEach(id => used.add(id)));
  const surfaces = future.surfaces.filter(f => used.has(f.id)), alive = new Set([...s.pieces.map(p => p.id), ...surfaces.map(f => f.id)]);
  const groups = s.groups.map(g => ({ ...g, members: g.members.filter(id => alive.has(id)) }));
  return referenceConfigurationError(future, groups, surfaces, connections(future));
}
function spos(s) { const p = hostOf(s.pieceId), o = soff(s); return p ? { x: p.x + o.dx, y: p.y + o.dy } : { x: o.dx, y: o.dy }; }
function sname(s) { if (s.name) return s.name; const p = P(s.pieceId); return `${s.type}.${p ? p.num : '?'}.${s.idx}`; }
function endPos(id) { const s = SF(id); if (s) return spos(s); const p = P(id); return p ? { x: p.x, y: p.y } : null; }
function endName(id) { const s = SF(id); if (s) return sname(s); const p = P(id); return p ? p.name : '?'; }
function endPiece(id) { const s = SF(id); return s ? s.pieceId : id; }
/* ===== Placement organique des surfaces =====
   Chaque surface est sur une « piste » elliptique à distance constante du bord de sa pièce.
   Elle s'oriente vers la (les) surface(s) liée(s) ; l'ordre le long du bord est conservé et
   l'espacement minimal est imposé (régression isotone), ce qui évite les croisements de liaisons. */
const SURF_FONT = 12, SURF_GAP = 7, SURF_SPACING = 5, TAU = 2 * Math.PI;
const PIECE_R = 95;
let _mctx = null;
function textW(t, font) {
  if (!_mctx) _mctx = document.createElement('canvas').getContext('2d');
  _mctx.font = font || `${SURF_FONT}px "Segoe UI", Arial, sans-serif`;
  return _mctx.measureText(t).width;
}
function nominalGeometry(p, offset = p.nominal) {
  const name = p.num + '.0', width = textW(name, '12px Arial'), minAxis = Math.min(p.rx, p.ry);
  const r = Math.min(Math.max(19, width / 2 + 5), Math.max(1, minAxis - 2));
  // Uniformly erode the ellipse so the whole circular bubble remains inside it.
  const factor = Math.max(0, 1 - (r + 2) / minAxis), rx = p.rx * factor, ry = p.ry * factor;
  let dx = offset ? offset.dx : 0, dy = offset ? offset.dy : p.ry * 0.55;
  if (!rx || !ry) { dx = 0; dy = 0; }
  else {
    const norm = Math.max(1, Math.hypot(dx / rx, dy / ry));
    dx /= norm; dy /= norm;
  }
  return { x: p.x + dx, y: p.y + dy, dx, dy, r, name, fs: Math.max(1, Math.min(12, 12 * (r - 3) * 2 / Math.max(1, width))) };
}
/* Position du nom d'une pièce (ou d'un groupe réduit) : au centre, ou décalé à l'opposé des surfaces s'il y a chevauchement */
function nameLines(name) { return String(name ?? '').split('\n'); }
function nameWidth(name, font) { return Math.max(0, ...nameLines(name).map(line => textW(line, font))); }
/* Nom déplaçable : p.lab = décalage manuel depuis le centre ; sinon placement automatique */
function namePos(p, fs) { return p.lab ? { x: p.x + p.lab.dx, y: p.y + p.lab.dy } : nameAnchor(p, fs); }
function nameAnchor(p, fs, name = p.name) {
  const w = nameWidth(name, `600 ${fs}px "Segoe UI", Arial, sans-serif`) / 2 + 3, h = fs * 0.62;
  const surfs = S().surfaces.filter(s => hostIdOf(s.pieceId) === p.id && surfVisible(s)).map(s => ({ ...soff(s), r: s.r }));
  const hits = (x, y) => surfs.some(s => {
    const cx = clampN(s.dx, x - w, x + w), cy = clampN(s.dy, y - h, y + h);
    return Math.hypot(s.dx - cx, s.dy - cy) < s.r + 2;
  });
  if (!hits(0, 0)) return { x: p.x, y: p.y };
  let vx = 0, vy = 0; surfs.forEach(s => { const L = Math.hypot(s.dx, s.dy) || 1; vx += s.dx / L; vy += s.dy / L; });
  const base = Math.atan2(-vy, -vx), lim = Math.min(p.rx, p.ry);
  for (let dist = 4; dist < lim; dist += 4) {
    for (const da of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.57, -1.57]) {
      const x = Math.cos(base + da) * dist, y = Math.sin(base + da) * dist;
      if (((Math.abs(x) + w) / p.rx) ** 2 + ((Math.abs(y) + h) / p.ry) ** 2 > 1) continue;
      if (!hits(x, y)) return { x: p.x + x, y: p.y + y };
    }
  }
  return { x: p.x, y: p.y };
}
function surfRadius(s) {
  const width = Math.max(textW(sname(s)), s.count > 1 ? textW(s.count + 'x') : 0);
  return Math.max(24, Math.ceil(width / 2) + 7, s.count > 1 ? Math.ceil(Math.hypot(width / 2, SURF_FONT + 2)) + 4 : 0);
}
const modP = (v, m) => ((v % m) + m) % m;

function trackOf(p, d) {
  const a = Math.max(4, p.rx - d), b = Math.max(4, p.ry - d), N = 240, Ls = [0];
  let L = 0, px = a, py = 0;
  for (let k = 1; k <= N; k++) { const t = TAU * k / N, x = a * Math.cos(t), y = b * Math.sin(t); L += Math.hypot(x - px, y - py); Ls.push(L); px = x; py = y; }
  return { a, b, N, Ls, P: L };
}
function tToS(tr, t) { const f = modP(t, TAU) / TAU * tr.N, i = Math.min(tr.N - 1, Math.floor(f)); return tr.Ls[i] + (tr.Ls[i + 1] - tr.Ls[i]) * (f - i); }
function sToT(tr, s) {
  s = modP(s, tr.P); let lo = 0, hi = tr.N;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tr.Ls[m] <= s) lo = m; else hi = m; }
  const seg = tr.Ls[lo + 1] - tr.Ls[lo] || 1;
  return TAU * (lo + (s - tr.Ls[lo]) / seg) / tr.N;
}
function pav(v, w) {
  const bl = [];
  for (let i = 0; i < v.length; i++) {
    bl.push({ sw: v[i] * w[i], w: w[i], n: 1 });
    while (bl.length > 1 && bl[bl.length - 2].sw / bl[bl.length - 2].w > bl[bl.length - 1].sw / bl[bl.length - 1].w) {
      const b = bl.pop(), a = bl[bl.length - 1]; a.sw += b.sw; a.w += b.w; a.n += b.n;
    }
  }
  const out = []; bl.forEach(b => { for (let i = 0; i < b.n; i++) out.push(b.sw / b.w); }); return out;
}
/* items : {sd (abscisse curviligne désirée), cur, w, r} -> renseigne item.x */
function spreadOnLoop(items, P) {
  const n = items.length; if (!n) return;
  if (n === 1) { items[0].x = items[0].sd; return; }
  items.forEach(it => it.sd = modP(it.sd, P));
  items.sort((a, b) => a.sd - b.sd || a.cur - b.cur);
  let need = items.map((it, i) => it.r + items[(i + 1) % n].r + SURF_SPACING);
  const tot = need.reduce((a, b) => a + b, 0);
  if (tot > P) need = need.map(g => g * P / tot);
  let cut = 0, best = -Infinity;
  for (let i = 0; i < n; i++) { const free = modP(items[(i + 1) % n].sd - items[i].sd, P) - need[i]; if (free > best) { best = free; cut = i; } }
  const ord = [], gaps = [];
  for (let k = 0; k < n; k++) { const i = (cut + 1 + k) % n; ord.push(items[i]); gaps.push(need[i]); }
  const d = [ord[0].sd]; for (let k = 1; k < n; k++) d.push(d[k - 1] + modP(ord[k].sd - ord[k - 1].sd, P));
  const off = [0]; for (let k = 1; k < n; k++) off.push(off[k - 1] + gaps[k - 1]);
  const y = pav(d.map((v, k) => v - off[k]), ord.map(it => it.w));
  let x = y.map((v, k) => v + off[k]);
  if (x[n - 1] + gaps[n - 1] > x[0] + P + 0.01) {
    const f = P / (off[n - 1] + gaps[n - 1]);
    let sw = 0, ws = 0; ord.forEach((it, k) => { sw += (d[k] - off[k] * f) * it.w; ws += it.w; });
    x = off.map(o => sw / ws + o * f);
  }
  ord.forEach((it, k) => it.x = x[k]);
}
function autoLayout(iter = 4) {
  const sh = S();
  const layoutError = referenceConfigurationError(sh);
  if (layoutError) throw new Error(layoutError);
  rebuildHosts();
  if (!sh.surfaces.length) return;
  const partners = new Map(), byHost = new Map();
  for (const s of sh.surfaces) { s.r = surfRadius(s); if (s.ang == null) s.ang = Math.atan2(s.dy || -1, s.dx || 1); }
  for (const l of connections(sh)) {
    if (!partners.has(l.a)) partners.set(l.a, []); if (!partners.has(l.b)) partners.set(l.b, []);
    partners.get(l.a).push(l.b); partners.get(l.b).push(l.a);
  }
  for (const s of sh.surfaces) {
    if (!surfVisible(s)) continue;
    const h = hostOf(s.pieceId); if (!h) continue;
    if (!byHost.has(h.id)) byHost.set(h.id, { h, surfs: [] });
    byHost.get(h.id).surfs.push(s);
  }
  for (let it = 0; it < iter; it++) {
    for (const { h: p, surfs } of byHost.values()) {
      const grp = !!p.group, kA = grp ? 'cang' : 'ang', kX = grp ? 'cdx' : 'dx', kY = grp ? 'cdy' : 'dy';
      const d = Math.max(...surfs.map(s => s.r)) + SURF_GAP;
      let tr = trackOf(p, d);
      const needed = surfs.reduce((a, s) => a + 2 * s.r + SURF_SPACING, 0);
      while (needed > tr.P * 0.9) { p.rx *= 1.06; p.ry *= 1.06; tr = trackOf(p, d); }
      if (grp) { p.group.crx = p.rx; p.group.cry = p.ry; }
      const items = surfs.map(s => {
        if (s[kA] == null) s[kA] = s.ang;
        let t = s[kA], w = 0.3;
        const pinned = s.pinned && !grp;
        const ps = !pinned && (partners.get(s.id) || []).filter(q => { const o = SF(q); return o && hostIdOf(o.pieceId) !== p.id; });
        if (pinned) w = 1000;
        else if (ps && ps.length) {
          let vx = 0, vy = 0;
          for (const q of ps) { const c = spos(SF(q)), dx = c.x - p.x, dy = c.y - p.y, L = Math.hypot(dx, dy) || 1; vx += dx / L; vy += dy / L; }
          if (vx || vy) { t = Math.atan2(vy / tr.b, vx / tr.a); w = 1; }
        }
        return { s, sd: tToS(tr, t), cur: tToS(tr, s[kA]), w, r: s.r };
      });
      const error = spreadReferenceItems(items, tr.P, sh.groups);
      if (error) throw new Error(error);
      for (const o of items) { const t = sToT(tr, o.x); o.s[kA] = t; o.s[kX] = tr.a * Math.cos(t); o.s[kY] = tr.b * Math.sin(t); }
    }
  }
}
/* angle paramétrique de la piste pour un point du monde */
function angleOnPiece(p, x, y) { return Math.atan2((y - p.y) / p.ry, (x - p.x) / p.rx); }
function pointInPoly(x, y, pts) {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) ins = !ins;
  }
  return ins;
}
function convexHull(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop(); return lo.concat(up);
}
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const d2 = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const L2 = dx * dx + dy * dy || 1; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2; t = clampN(t, 0, 1); const x = a[0] + t * dx - p[0], y = a[1] + t * dy - p[1]; return x * x + y * y; };
  const rec = (a, b) => { let mi = -1, md = 0; for (let i = a + 1; i < b; i++) { const d = d2(pts[i], pts[a], pts[b]); if (d > md) { md = d; mi = i; } } if (md > eps * eps) return rec(a, mi).slice(0, -1).concat(rec(mi, b)); return [pts[a], pts[b]]; };
  return rec(0, pts.length - 1);
}
function smoothClosed(pts) {
  const n = pts.length; if (n < 3) return '';
  const f = v => r1(v);
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d + 'Z';
}
const polyPath = pts => 'M' + pts.map(p => r1(p[0]) + ',' + r1(p[1])).join('L') + 'Z';

function groupPoints(g) { return groupShape(g).loops.flat(); }
function bboxPts(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}
function contentBBox(sheet = S()) {
  const pts = [];
  sheet.pieces.forEach(p => { pts.push([p.x - p.rx, p.y - p.ry], [p.x + p.rx, p.y + p.ry]); });
  sheet.groups.forEach(g => groupPoints(g).forEach(p => pts.push(p)));
  if (doc.settings.showSpecs !== false) (sheet.isoSpecs || []).forEach(sp => {
    const lay = specFrameLayout(sp);
    pts.push([sp.x, sp.y], [sp.x + lay.w, sp.y + lay.h]);
    (sp.targets || []).forEach(t => {
      const c = isoTargetCenter(t); if (!c) return;
      pts.push([c.x, c.y]);
      const elbow = specTargetElbow(sp, t); pts.push([elbow.x, elbow.y]);
      const edge = isoTargetBoundary(t, elbow); if (edge) pts.push([edge.x, edge.y]);
    });
  });
  if (doc.settings.showIsoRefs !== false) (sheet.isoRefs || []).forEach(ref => {
    const z=isoFrameSize(ref), t=isoTargetCenter(ref);
    pts.push([ref.x,ref.y],[ref.x+z.w,ref.y+z.h]);
    if(t){
      pts.push([t.x,t.y]);
      const elbow={x:ref.elbowX,y:ref.elbowY},edge=isoTargetBoundary(ref,elbow);
      if(edge)pts.push([edge.x,edge.y]);
      if(Number.isFinite(elbow.x)&&Number.isFinite(elbow.y))pts.push([elbow.x,elbow.y]);
    }
  });
  (sheet.notes || []).forEach(n => { const lines = noteLines(n); const w = Math.max(90, Math.min(340, Math.max(...lines.map(line => textW(line, '14px "Segoe UI", Arial, sans-serif') + 20)))); const h = lines.length * 19 + 20; pts.push([n.x, n.y], [n.x + w, n.y + h]); });
  sheet.surfaces.filter(surfVisible).forEach(s => { const p = spos(s); pts.push([p.x - s.r, p.y - s.r], [p.x + s.r, p.y + s.r]); });
  if (!pts.length) return null;
  return bboxPts(pts);
}

/* ===== Création ===== */
function nextNum() { return Math.max(0, ...S().pieces.map(p => p.num)) + 1; }
function nextSurfIdx(pid) { return Math.max(0, ...S().surfaces.filter(s => s.pieceId === pid).map(s => s.idx)) + 1; }
function nameUsed(name, exceptId) { const n = name.trim().toLowerCase(); return S().pieces.some(p => p.id !== exceptId && p.name.trim().toLowerCase() === n); }
function numUsed(num, exceptId) { return S().pieces.some(p => p.id !== exceptId && p.num === num); }

function freeSpot(cx, cy, rx, ry) {
  const ps = S().pieces, R = Math.max(rx, ry);
  const ok = (x, y) => ps.every(p => Math.hypot(p.x - x, p.y - y) > Math.max(p.rx, p.ry) + R + 30);
  if (ok(cx, cy)) return { x: cx, y: cy };
  for (let ring = 1; ring < 80; ring++) {
    const rad = ring * 40, n = Math.max(8, Math.round(2 * Math.PI * rad / 60));
    for (let i = 0; i < n; i++) { const a = i / n * 2 * Math.PI; const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad; if (ok(x, y)) return { x, y }; }
  }
  return { x: cx, y: cy };
}
function createPiece({ name, color, num, x, y }) {
  const pos = (x == null) ? freeSpot(...viewCenter(), PIECE_R, PIECE_R) : { x, y };
  const p = { id: uid(), num, name, color, stroke: '#1a1a1a', x: pos.x, y: pos.y, rx: PIECE_R, ry: PIECE_R };
  S().pieces.push(p); return p;
}
function createSurface(pid, type, at, angle = -Math.PI / 4) {
  const p = P(pid);
  const s = { id: uid(), pieceId: pid, type, idx: nextSurfIdx(pid), count: 1, dx: 0, dy: 0, r: 24, color: '#ffffff', stroke: '#1a1a1a', sw: 1.5, name: '', pinned: false };
  s.ang = at ? angleOnPiece(p, at.x, at.y) : Math.atan2(Math.sin(angle) / p.ry, Math.cos(angle) / p.rx);
  S().surfaces.push(s); return s;
}
function createLiaison(a, b, type, count, details) {
  const l = { id: uid(), a, b, type, count, details: details || {}, color: '#333333', w: 1.4, label: '', t: 0.5 };
  S().liaisons.push(l); return l;
}
function createGroup(kind, members, cfIds = [], repLabelIds = []) {
  const col = doc.settings.groupColors[kind];
  const g = { id: uid(), kind, members, name: '', count: kind === 'rep' ? 2 : 1, color: col, stroke: kind === 'ref' ? col : '#8a90a0', opacity: kind === 'ref' ? 0.15 : 0.85, sw: kind === 'ref' ? 2.2 : 1.6, collapsed: false, lab: null };
  if (kind === 'rep') g.cfIds = cfIds.slice();
  if (kind === 'fonc') g.repLabelIds = repLabelIds.slice();
  S().groups.unshift(g); return g;
}
/* ===== Suppression =====
   Une surface n'existe que par une liaison : supprimer une surface supprime ses liaisons,
   supprimer une liaison supprime les surfaces devenues orphelines. */
function deleteIds(ids) {
  const s = S(); const del = new Set(ids);
  s.surfaces.forEach(x => { if (del.has(x.pieceId)) del.add(x.id); });
  connections(s).forEach(x => { if (del.has(x.a) || del.has(x.b)) del.add(x.id); });
  s.pieces = s.pieces.filter(x => !del.has(x.id));
  s.surfaces = s.surfaces.filter(x => !del.has(x.id));
  s.liaisons = s.liaisons.filter(x => !del.has(x.id));
  s.cfgs = s.cfgs.filter(x => !del.has(x.id));
  s.groups = s.groups.filter(x => !del.has(x.id));
  s.cycles = s.cycles.filter(x => !del.has(x.id));
  s.notes = (s.notes || []).filter(x => !del.has(x.id));
  s.isoRefs = (s.isoRefs || []).filter(x => !del.has(x.id) && !del.has(x.targetId) && (x.targetKind !== 'group' || s.groups.some(g => g.id === x.targetId)));
  s.isoSpecs = (s.isoSpecs || []).filter(x => !del.has(x.id));
  s.isoSpecs.forEach(sp => sp.targets = (sp.targets || []).filter(t => !del.has(t.targetId)));
  s.isoSpecs = s.isoSpecs.filter(sp => sp.targets.length);
  cleanupOrphans(s);
}
function cleanupOrphans(s = S()) {
  for (let again = true; again;) {
    again = false;
    const pids = new Set(s.pieces.map(p => p.id));
    s.surfaces = s.surfaces.filter(x => pids.has(x.pieceId));
    const sids = new Set(s.surfaces.map(x => x.id));
    const nl = s.liaisons.filter(l => sids.has(l.a) && sids.has(l.b));
    if (nl.length !== s.liaisons.length) { s.liaisons = nl; again = true; }
    const nc = s.cfgs.filter(c => sids.has(c.a) && sids.has(c.b));
    if (nc.length !== s.cfgs.length) { s.cfgs = nc; again = true; }
    const used = new Set(); connections(s).forEach(l => { used.add(l.a); used.add(l.b); });
    if (s.cycleSnapshot) s.cycles.forEach(c => cycleContents(c, s).surfaces.forEach(id => used.add(id)));
    const ns = s.surfaces.filter(x => used.has(x.id));
    if (ns.length !== s.surfaces.length) { s.surfaces = ns; again = true; }
  }
  const alive = new Set([...s.pieces.map(p => p.id), ...s.surfaces.map(x => x.id)]);
  s.groups.forEach(g => g.members = g.members.filter(m => alive.has(m)));
  s.groups.filter(g => g.kind === 'rep').forEach(g => g.cfIds = [...new Set(g.cfIds || [])].filter(id => {
    const cf = s.cfgs.find(c => c.id === id);
    return cf && s.surfaces.some(f => (cf.a === f.id || cf.b === f.id) && g.members.includes(f.pieceId));
  }));
  s.groups = s.groups.filter(g => g.members.length);
  const pieceIds = new Set(s.pieces.map(piece => piece.id));
  const surfaceById = new Map(s.surfaces.map(surface => [surface.id, surface]));
  const componentForPiece = pieceId => {
    const surface = s.surfaces.find(item => item.pieceId === pieceId);
    return surface ? { targetKind: 'surface', targetId: surface.id } : null;
  };
  const normalizeComponentTarget = target => {
    if (!target) return null;
    if (target.targetKind === 'piece') {
      const component = componentForPiece(target.targetId);
      return component ? { ...target, ...component } : null;
    }
    if (target.targetKind === 'surface') {
      return surfaceById.has(target.targetId) ? target : null;
    }
    if (target.targetKind === 'group') {
      const group = s.groups.find(item => item.id === target.targetId && item.kind === 'ref');
      const members = group?.members || [];
      if (!group || !members.length || members.some(id => !surfaceById.has(id))) return null;
      const owners = new Set(members.map(id => surfaceById.get(id).pieceId));
      return owners.size === 1 ? target : null;
    }
    return null;
  };
  const componentOwner = target => {
    if (target?.targetKind === 'surface') return surfaceById.get(target.targetId)?.pieceId || null;
    if (target?.targetKind === 'group') {
      const group = s.groups.find(item => item.id === target.targetId && item.kind === 'ref');
      const members = group?.members || [];
      if (!group || !members.length || members.some(id => !surfaceById.has(id))) return null;
      const owners = new Set(members.map(id => surfaceById.get(id).pieceId));
      return owners.size === 1 ? [...owners][0] : null;
    }
    return null;
  };
  s.isoRefs = (s.isoRefs || []).filter(ref => {
    const target = normalizeComponentTarget(ref);
    const owner = componentOwner(target);
    if (!target || !owner) return false;
    Object.assign(ref, target, { ownerPieceId: owner });
    return true;
  });
  s.isoSpecs = (s.isoSpecs || []).filter(spec => {
    let targets = (spec.targets || []).map(normalizeComponentTarget).filter(Boolean);
    let owner = pieceIds.has(spec.ownerPieceId) ? spec.ownerPieceId : (targets.length ? componentOwner(targets[0]) : null);
    if (!owner) return false;
    targets = targets.filter(target => componentOwner(target) === owner);
    const unique = new Map(targets.map(target => [target.targetKind + ':' + target.targetId, target]));
    targets = [...unique.values()];
    if (!targets.length) {
      const fallback = componentForPiece(owner);
      if (fallback) targets = [fallback];
    }
    if (!targets.length) return false;
    spec.ownerPieceId = owner;
    spec.targets = targets;
    return true;
  });
  const repetitions = new Set(s.groups.filter(g => g.kind === 'rep').map(g => g.id));
  s.groups.filter(g => g.kind === 'fonc').forEach(g => g.repLabelIds = [...new Set(g.repLabelIds || [])].filter(id => repetitions.has(id)));
  if (cleanupCycles(s)) cleanupOrphans(s);
}

/* ===== Copier / coller / dupliquer ===== */
function collect(ids) {
  const s = S(); const pids = new Set(), groupIds = new Set(ids.filter(id => G(id))), noteIds = new Set(ids.filter(id => kindOf(id) === 'note')), isoRefIds = new Set(ids.filter(id => kindOf(id) === 'isoRef')), isoSpecIds = new Set(ids.filter(id => kindOf(id) === 'isoSpec'));
  for (const id of ids) {
    const k = kindOf(id);
    if (k === 'piece') pids.add(id);
    if (k === 'isoRef') { const ref = (s.isoRefs || []).find(x => x.id === id); if (ref?.ownerPieceId) pids.add(ref.ownerPieceId); }
    if (k === 'isoSpec') { const spec = (s.isoSpecs || []).find(x => x.id === id); if (spec?.ownerPieceId) pids.add(spec.ownerPieceId); }
    if (k === 'cfg') { const c = C(id); pids.add(SF(c.a).pieceId); pids.add(SF(c.b).pieceId); }
    if (k === 'group') {
      const g = G(id);
      if (g.kind !== 'ref') g.members.forEach(m => pids.add(m)); else g.members.forEach(m => { const sf = SF(m); if (sf) pids.add(sf.pieceId); });
      if (g.kind === 'rep') (g.cfIds || []).forEach(id => { const cf = C(id); if (cf) { pids.add(SF(cf.a).pieceId); pids.add(SF(cf.b).pieceId); } });
      if (g.kind === 'fonc') (g.repLabelIds || []).map(G).filter(g => g && g.kind === 'rep').forEach(rep => {
        groupIds.add(rep.id); rep.members.forEach(id => pids.add(id));
        (rep.cfIds || []).map(C).filter(Boolean).forEach(cf => { pids.add(SF(cf.a).pieceId); pids.add(SF(cf.b).pieceId); });
      });
    }
  }
  const pieces = s.pieces.filter(p => pids.has(p.id));
  const surfaces = s.surfaces.filter(x => pids.has(x.pieceId));
  const sids = new Set(surfaces.map(x => x.id));
  const liaisons = s.liaisons.filter(l => sids.has(l.a) && sids.has(l.b));
  const inside = id => pids.has(id) || sids.has(id);
  const groups = s.groups.filter(g => groupIds.has(g.id) || (g.members.length && g.members.every(inside)));
  const cfgs = s.cfgs.filter(c => inside(c.a) && inside(c.b));
  const included = new Set([...surfaces, ...groups, ...cfgs, ...liaisons].map(o => o.id));
  const cycles = s.cycles.filter(c => {
    const contents = cycleContents(c, s);
    return included.has(c.cfId) && [...contents.surfaces, ...contents.references, ...contents.links].every(id => included.has(id));
  });
  const notes = (s.notes || []).filter(n => noteIds.has(n.id));
  const isoRefs = (s.isoRefs || []).filter(r => isoRefIds.has(r.id) || pids.has(r.ownerPieceId));
  const isoSpecs = (s.isoSpecs || []).filter(x => isoSpecIds.has(x.id) || pids.has(x.ownerPieceId));
  return clone({ pieces, surfaces, liaisons, groups, cfgs, cycles, notes, isoRefs, isoSpecs, cycleSnapshot: !!s.cycleSnapshot, from: s.id });
}
function pasteData(data, offset) {
  const s = S(); const map = new Map(); const nid = id => { if (!map.has(id)) map.set(id, uid()); return map.get(id); };
  const d = clone(data); let num = nextNum();
  if (d.cycleSnapshot) s.cycleSnapshot = true;
  for (const p of d.pieces) {
    p.id = nid(p.id);
    if (numUsed(p.num)) p.num = num++;
    let base = p.name, k = 2; while (nameUsed(p.name)) p.name = `${base} (${k++})`;
    p.x += offset; p.y += offset; s.pieces.push(p);
  }
  for (const x of d.surfaces) { x.id = nid(x.id); x.pieceId = nid(x.pieceId); s.surfaces.push(x); }
  for (const l of d.liaisons) { l.id = nid(l.id); l.a = nid(l.a); l.b = nid(l.b); s.liaisons.push(l); }
  const copiedGroups = new Set(d.groups.map(g => g.id));
  for (const g of d.groups) {
    g.id = nid(g.id); g.members = g.members.map(nid);
    if (g.kind === 'rep') g.cfIds = (g.cfIds || []).map(nid);
    if (g.kind === 'fonc') g.repLabelIds = (g.repLabelIds || []).filter(id => copiedGroups.has(id)).map(nid);
    s.groups.unshift(g);
  }
  for (const c of d.cfgs) {
    c.id = nid(c.id); c.a = nid(c.a); c.b = nid(c.b);
    c.name = copiedCFName(cfName(c), s);
    if (s.cfgs.some(x => x.num === c.num)) c.num = nextCFNum();
    s.cfgs.push(c);
  }
  for (const n of d.notes || []) { n.id = nid(n.id); n.x += offset; n.y += offset; s.notes.push(n); }
  for (const r of d.isoRefs || []) { r.id=nid(r.id); r.ownerPieceId=map.get(r.ownerPieceId)||r.ownerPieceId; r.targetId=map.get(r.targetId)||r.targetId; r.x+=offset; r.y+=offset; if(Number.isFinite(r.elbowX))r.elbowX+=offset; if(Number.isFinite(r.elbowY))r.elbowY+=offset; s.isoRefs.push(r); }
  for (const sp of d.isoSpecs || []) {
    sp.id = nid(sp.id);
    sp.ownerPieceId = map.get(sp.ownerPieceId) || sp.ownerPieceId;
    (sp.targets || []).forEach(t => {
      t.targetId = map.get(t.targetId) || t.targetId;
      if (Number.isFinite(t.elbowX)) t.elbowX += offset;
      if (Number.isFinite(t.elbowY)) t.elbowY += offset;
    });
    if (!sp.ownerPieceId) sp.ownerPieceId = (sp.targets || []).find(t => t.targetKind === 'piece')?.targetId;
    sp.x += offset; sp.y += offset;
    s.isoSpecs.push(sp);
  }
  for (const c of d.cycles || []) {
    c.id = nid(c.id); c.cfId = nid(c.cfId); c.nodes = c.nodes.map(nid);
    c.edges.forEach(e => { e.from = nid(e.from); e.to = nid(e.to); e.sa = nid(e.sa); e.sb = nid(e.sb); if (e.linkId) e.linkId = nid(e.linkId); });
    if (s.cycles.some(x => x.num === c.num)) c.num = nextCycleNum();
    c.displayOrder = nextCycleDisplayOrder();
    s.cycles.push(c);
  }
  cleanupOrphans(s);
  return [...d.pieces.map(p => p.id), ...d.groups.map(g => g.id), ...d.cfgs.map(c => c.id), ...(d.notes || []).map(n => n.id), ...(d.isoRefs || []).map(r=>r.id), ...(d.isoSpecs || []).map(x=>x.id)];
}
