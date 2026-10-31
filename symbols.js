'use strict';
/* ===== Schémas cinématiques normalisés (2D, axe principal = X local) ===== */
const ARROW = '\u20D7';
function vec(v) { v = (v || '').trim(); return v ? v + ARROW : '?'; }
/* Les champs vectoriels indexés restent en texte brut ; l'indice est interprété au rendu. */
function parseVec(str) {
  const segs = [], ch = [...String(str ?? '')];
  const indexed = /^([^\s(),_\u20D7]+)_([^\s(),\u20D7]+)\u20D7/u;
  const plain = text => {
    const last = segs[segs.length - 1];
    if (last && !last.v) last.t += text; else segs.push({ t: text, v: false });
  };
  for (let i = 0; i < ch.length; i++) {
    const match = ch.slice(i).join('').match(indexed);
    if (match) {
      const sign = match[1].match(/^[+-]/)?.[0] || '';
      if (sign && match[1].length === 1) { plain(ch[i]); continue; }
      if (sign) plain(sign);
      segs.push({ t: match[1].slice(sign.length), v: true, sub: match[2] });
      i += [...match[0]].length - 1; continue;
    }
    if (ch[i] === ARROW) continue;
    if (ch[i + 1] === ARROW) { segs.push({ t: ch[i], v: true }); i++; continue; }
    plain(ch[i]);
  }
  return segs;
}
/* HTML : lettre en italique surmontée d'une vraie flèche (CSS) */
function vecHTML(s) {
  return parseVec(s).map(g => {
    if (!g.v) return esc(g.t);
    const base = `<span class="vec">${esc(g.t)}</span>`;
    return g.sub ? `<span class="vec-indexed">${base}<sub class="vec-sub">${esc(g.sub)}</sub></span>` : base;
  }).join('');
}
const VECTOR_SUB_SCALE = 0.7, VECTOR_SUB_DROP = 0.25;
function richSegmentMetrics(g, fs) {
  const font = size => `${size}px "Segoe UI", Arial, sans-serif`;
  const base = textW(g.t, (g.v ? 'italic ' : '') + font(fs));
  const sub = g.sub ? textW(g.sub, font(fs * VECTOR_SUB_SCALE)) : 0;
  return { base, width: base + sub + (g.v ? fs * 0.18 : 0) };
}
/* SVG : texte centré en (x, y = ligne de base) ; les vecteurs sont en italique avec une flèche dessinée au-dessus */
function richTextWidth(str, fs) {
  return parseVec(str).reduce((width, g) => width + richSegmentMetrics(g, fs).width, 0);
}
function richTextSVG(str, x, y, fs, attrs = '', color = '#1f1f1f', halo = true) {
  const segs = parseVec(str), pad = fs * 0.09;
  const metrics = segs.map(g => richSegmentMetrics(g, fs));
  let cx = x - metrics.reduce((width, m) => width + m.width, 0) / 2;
  const x0 = cx; let arrows = '';
  const body = segs.map((g, i) => {
    const sx = cx; cx += metrics[i].width;
    if (!g.v) return `<tspan x="${r1(sx)}" y="${r1(y)}">${esc(g.t)}</tspan>`;
    const bx = sx + pad, ay = y - fs * 0.86, a0 = bx + fs * 0.12, a1 = bx + metrics[i].base + fs * 0.1, h = fs * 0.15;
    arrows += `M${r1(a0)},${r1(ay)}H${r1(a1)}M${r1(a1 - h * 1.3)},${r1(ay - h)}L${r1(a1)},${r1(ay)}L${r1(a1 - h * 1.3)},${r1(ay + h)}`;
    return `<tspan x="${r1(bx)}" y="${r1(y)}" font-style="italic">${esc(g.t)}</tspan>` +
      (g.sub ? `<tspan x="${r1(bx + metrics[i].base)}" y="${r1(y + fs * VECTOR_SUB_DROP)}" font-size="${fs * VECTOR_SUB_SCALE}" font-style="normal" data-vector-sub="1">${esc(g.sub)}</tspan>` : '');
  }).join('');
  const haloAttr = halo ? ` stroke="#ffffff" stroke-width="4" stroke-linejoin="round" paint-order="stroke"` : '';
  let out = `<text x="${r1(x0)}" y="${r1(y)}" font-size="${fs}" fill="${color}"${haloAttr} ${attrs}>${body}</text>`;
  if (arrows) out += `<path d="${arrows}" fill="none" stroke="${color}" stroke-width="${r1(Math.max(0.9, fs / 13))}" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>`;
  return out;
}
function detailText(type, d = {}) {
  const f = ltype(type).fields, parts = [];
  const pt = d.point || 'A';
  if (f.includes('axe') && f.includes('point')) parts.push(`(${pt},${vec(d.axe)})`);
  else if (f.includes('axe')) parts.push(`(${vec(d.axe)})`);
  else if (f.includes('point')) parts.push(`(${pt})`);
  if (f.includes('normale')) parts.push(`n(${vec(d.normale)})`);
  if (f.includes('pas') && d.pas) parts.push(`p=${d.pas}`);
  return parts.join(' ');
}
function liaisonLabel(l) {
  if (l.label) return l.label;
  let s = repetitionText(l.count) + l.type;
  if (doc.settings.showDetails) { const d = detailText(l.type, l.details); if (d) s += ' ' + d; }
  return s;
}
const repetitionText = count => count > 1 ? count + 'x ' : '';
function dirAngle(v) {
  v = (v || '').trim().toLowerCase().split('_')[0]; let a = 0, sign = 1;
  if (v.startsWith('-')) { sign = -1; v = v.slice(1); }
  if (v === 'x') a = 0; else if (v === 'y') a = -90; else if (v === 'z') a = 135; else a = 0;
  return sign < 0 ? a + 180 : a;
}
const ORIENT = { PV: 'axe', PG: 'axe', HE: 'axe', GL: 'axe', LA: 'axe', AP: 'normale', PO: 'normale', LR: 'normale', RD: 'normale' };

function symbolBody(sym, A, B) {
  const ln = (x1, y1, x2, y2, c) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}"/>`;
  const rc = (x, y, w, h, c, rx = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="#fff" stroke="${c}"/>`;
  const ci = (x, y, r, c) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="${c}"/>`;
  const base = (x, y, c) => ln(x, y, x, y - 26, c) + ln(x - 12, y - 26, x + 12, y - 26, c);
  const arc = (r, a0, a1, c) => { const p = a => [r1(r * Math.cos(a * Math.PI / 180)), r1(r * Math.sin(a * Math.PI / 180))]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `<path d="M${x0},${y0} A${r},${r} 0 1 1 ${x1},${y1}" fill="none" stroke="${c}"/>`; };
  switch (sym) {
    case 'EN': return ln(-50, 0, -9, 0, A) + ln(9, 0, 50, 0, B) + `<rect x="-9" y="-14" width="18" height="28" fill="#333" stroke="#333"/>`;
    case 'PV': return base(0, -11, A) + rc(-17, -11, 34, 22, A) + ln(-50, 0, 50, 0, B) + ln(-24, -9, -24, 9, B) + ln(24, -9, 24, 9, B);
    case 'PG': return base(0, -11, A) + rc(-18, -11, 36, 22, A) + ln(-50, 0, 50, 0, B);
    case 'HE': return base(0, -12, A) + rc(-20, -12, 40, 24, A) + ln(-50, 0, 50, 0, B) + ln(-16, 12, -8, -12, A) + ln(-4, 12, 4, -12, A) + ln(8, 12, 16, -12, A);
    case 'GL': return base(0, -14, A) + `<rect x="-50" y="-5" width="100" height="10" fill="#fff" stroke="${B}"/>` + `<rect x="-19" y="-14" width="38" height="28" fill="none" stroke="${A}"/>`;
    case 'ROT': return ln(-12, 0, -50, 0, B) + ci(0, 0, 12, B) + arc(19, -125, 125, A) + ln(19, 0, 50, 0, A);
    case 'RD': return ln(-12, 0, -50, 0, B) + ci(0, 0, 12, B) + arc(19, -125, 125, A) + ln(19, 0, 50, 0, A) + ln(0, 12, 0, 30, B);
    case 'AP': return ln(-5, -28, -5, 28, A) + ln(-5, 0, -45, 0, A) + ln(5, -28, 5, 28, B) + ln(5, 0, 45, 0, B);
    case 'PO': return ci(0, 0, 13, A) + ln(-13, 0, -48, 0, A) + ln(13, -28, 13, 28, B) + ln(13, 0, 48, 0, B);
    case 'LR': return `<path d="M13,0 L-13,-18 L-13,18 Z" fill="#fff" stroke="${A}"/>` + ln(-13, 0, -48, 0, A) + ln(13, -28, 13, 28, B) + ln(13, 0, 48, 0, B);
    case 'LA': return ln(-32, -15, 32, -15, B) + ln(-32, 15, 32, 15, B) + ln(0, -15, 0, -38, B) + ln(-12, -38, 12, -38, B) + ln(-13, 0, -55, 0, A) + ci(0, 0, 13, A);
    default: return ci(0, 0, 22, A);
  }
}
function trihedron(x, y) {
  const g = '#9aa1ad';
  const ar = (dx, dy, t) => `<line x1="${x}" y1="${y}" x2="${x + dx}" y2="${y + dy}" stroke="${g}" stroke-width="1.2" marker-end="url(#triA)"/><text x="${x + dx * 1.35}" y="${y + dy * 1.35 + 4}" font-size="11" font-style="italic" fill="${g}" text-anchor="middle">${t}</text>`;
  return `<defs><marker id="triA" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="${g}"/></marker></defs>` +
    ar(16, 0, 'x') + ar(0, -16, 'y') + ar(-11, 11, 'z');
}
/* Retourne un SVG complet du schéma de liaison orienté */
function symbolSVG(type, details, colA, colB, size = 150, withTri = true) {
  const t = ltype(type), sym = t.symbol || 'GEN';
  const of = ORIENT[sym]; const ang = of ? dirAngle((details || {})[of] || (of === 'axe' ? 'x' : 'z')) : 0;
  const A = inkOf(colA || '#2b5fd9'), B = inkOf(colB || '#d97706');
  let body = symbolBody(sym, A, B);
  if (sym === 'GEN') body += `<text x="0" y="5" text-anchor="middle" font-size="14" font-weight="700" fill="#333">${esc(t.code)}</text>`;
  const pt = (details && details.point) || '';
  const ptTxt = pt && t.fields.includes('point') ? `<circle cx="0" cy="0" r="2.2" fill="#111"/><text x="7" y="-6" font-size="12" font-style="italic" fill="#111">${esc(pt)}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-75 -75 150 150" font-family="Segoe UI, Arial">` +
    (withTri ? trihedron(-58, 58) : '') +
    `<g transform="rotate(${ang})" stroke-width="3" stroke-linecap="round" fill="none">${body}</g>${ptTxt}</svg>`;
}
