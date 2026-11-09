'use strict';
/* ===== Torseurs des liaisons =====
   Sous chaque liaison, le torseur des actions transmissibles
   {T_{n1/n2}}_{A/R} = { X L / Y M / Z N }_{A/R}
   Lignes = axes x, y, z ; colonne 1 = efforts (X, Y, Z), colonne 2 = moments (L, M, N).
   Les valeurs par défaut découlent du type de liaison et de son axe / normale choisis ;
   chaque valeur reste modifiable dans le panneau de la liaison. */
const TORSEUR_KEYS = ['X', 'L', 'Y', 'M', 'Z', 'N'];
const FORCE_KEY = { x: 'X', y: 'Y', z: 'Z' };
const MOMENT_KEY = { x: 'L', y: 'M', z: 'N' };
const TORSEUR_AXES = ['x', 'y', 'z'];

/* 'x', '-x' et 'y_12' donnent l'axe x, x et y ; 'u_123' ou vide donne null. */
function dirAxis(v) {
  let s = String(v || '').trim().toLowerCase();
  if (s.startsWith('-')) s = s.slice(1);
  s = s.split('_')[0];
  return TORSEUR_AXES.includes(s) ? s : null;
}

/* Composantes nulles : un mouvement libre interdit l'action correspondante.
   D'après le tableau classique des liaisons usuelles (torseur des actions transmissibles). */
function torseurDefaults(l) {
  const sym = ltype(l.type).symbol || 'GEN';
  const d = l.details || {};
  const axis = dirAxis(d.axe), norm = dirAxis(d.normale);
  const v = { X: 'X', L: 'L', Y: 'Y', M: 'M', Z: 'Z', N: 'N' };
  const zeroForce = a => { if (a) v[FORCE_KEY[a]] = '0'; };
  const zeroMoment = a => { if (a) v[MOMENT_KEY[a]] = '0'; };
  switch (sym) {
    case 'PV': zeroMoment(axis); break;                                   // rotation libre autour de l'axe
    case 'GL': zeroForce(axis); break;                                    // translation libre selon l'axe
    case 'PG': zeroForce(axis); zeroMoment(axis); break;
    case 'HE':                                                            // vis : L = -p/2π·X selon l'axe
      if (axis) v[MOMENT_KEY[axis]] = `-p/2π·${FORCE_KEY[axis]}`;
      break;
    case 'ROT': v.L = v.M = v.N = '0'; break;                             // 3 rotations libres
    case 'RD': {                                                          // doigt = normale : seule sa rotation est bloquée
      const keep = norm || axis;
      if (keep) TORSEUR_AXES.forEach(a => { if (a !== keep) zeroMoment(a); });
      break;
    }
    case 'AP':                                                            // glisse dans le plan + tourne autour de la normale
      if (norm) { zeroMoment(norm); TORSEUR_AXES.forEach(a => { if (a !== norm) zeroForce(a); }); }
      break;
    case 'LA': zeroForce(axis); v.L = v.M = v.N = '0'; break;             // sphère dans un cylindre
    case 'LR': {                                                          // ligne de contact = axe, plan de normale n
      const third = axis && norm && axis !== norm ? TORSEUR_AXES.find(a => a !== axis && a !== norm) : null;
      if (third) { zeroForce(axis); zeroForce(third); zeroMoment(axis); zeroMoment(norm); }
      break;
    }
    case 'PO':                                                            // contact ponctuel : seule l'effort normal passe
      if (norm) { TORSEUR_AXES.forEach(a => { if (a !== norm) zeroForce(a); }); v.L = v.M = v.N = '0'; }
      break;
  }
  return v;
}
function torseurValues(l) {
  const v = torseurDefaults(l), custom = l.torsor;
  if (custom && typeof custom === 'object') for (const k of TORSEUR_KEYS) if (typeof custom[k] === 'string') v[k] = custom[k];
  return v;
}
const torseurPoint = l => (l.details && String(l.details.point || '').trim()) || 'A';
function torseurTitle(l) {
  const sa = SF(l.a), sb = SF(l.b);
  const n1 = sa && P(sa.pieceId) ? P(sa.pieceId).num : '?', n2 = sb && P(sb.pieceId) ? P(sb.pieceId).num : '?';
  return `${n1}/${n2}`;
}

/* ===== Rendu SVG ===== */
const bracePath = (x, y0, h, dir) => {
  const f = v => r1(v), dx = d => r1(x + d * dir);
  return `M${dx(5)},${f(y0)}C${dx(1)},${f(y0)} ${dx(0)},${f(y0 + h * 0.16)} ${dx(0)},${f(y0 + h * 0.4)}` +
    `C${dx(0)},${f(y0 + h * 0.47)} ${dx(-1)},${f(y0 + h * 0.49)} ${dx(-2.5)},${f(y0 + h * 0.5)}` +
    `C${dx(-1)},${f(y0 + h * 0.51)} ${dx(0)},${f(y0 + h * 0.53)} ${dx(0)},${f(y0 + h * 0.6)}` +
    `C${dx(0)},${f(y0 + h * 0.84)} ${dx(1)},${f(y0 + h)} ${dx(5)},${f(y0 + h)}`;
};
/* Bloc centré sous le point (x, y) : préfixe {T_{n1/n2}}_{A/R} =, accolade, grille 3×2, accolade, indice A/R */
function torseurSVG(l, x, y) {
  const v = torseurValues(l), sub = `${torseurPoint(l)}/R`, title = torseurTitle(l);
  const fs = 12, sfs = 8, rh = 13;
  const F = `${fs}px "Segoe UI", Arial, sans-serif`, FI = `italic ${fs}px "Segoe UI", Arial, sans-serif`, FS = `${sfs}px "Segoe UI", Arial, sans-serif`;
  const cells = [[v.X, v.L], [v.Y, v.M], [v.Z, v.N]];
  const cw1 = Math.max(...cells.map(row => textW(row[0], F))) + 16, cw2 = Math.max(...cells.map(row => textW(row[1], F))) + 16;
  const gw = cw1 + cw2, gh = 3 * rh, gap = 12, brW = 7;
  // préfixe : { T 1/2 } A/R =  (positions explicites pour éviter tout chevauchement)
  const wBrace = textW('{', F), wT = textW('T', FI), wTitle = textW(title, FS), wSub = textW(sub, FS), wEq = textW(' =', F);
  const preW = wBrace + wT + wTitle + wBrace + wSub + wEq;
  const total = preW + gap + brW + gw + brW + 8 + wSub;
  const left = x - total / 2, top = y, gy = top + 4;
  const gx = left + preW + gap + brW, colX = [gx + cw1 / 2, gx + cw1 + cw2 / 2], rowY = [gy + 10, gy + 10 + rh, gy + 10 + 2 * rh];
  const halo = ` stroke="#ffffff" stroke-width="3" stroke-linejoin="round" paint-order="stroke"`;
  const cellsSVG = cells.map((row, j) => row.map((val, i) =>
    `<text x="${r1(colX[i])}" y="${r1(rowY[j])}" text-anchor="middle" font-size="${fs}" fill="#1f1f1f"${halo}>${esc(val)}</text>`
  ).join('')).join('');
  const px = [left, left + wBrace, left + wBrace + wT, left + wBrace + wT + wTitle, left + wBrace + wT + wTitle + wBrace, left + wBrace + wT + wTitle + wBrace + wSub];
  const midY = gy + gh / 2 + 4;
  const prefix = `<text y="${r1(midY)}" font-size="${fs}" fill="#1f1f1f"${halo}>` +
    `<tspan x="${r1(px[0])}">{</tspan><tspan x="${r1(px[1])}" font-style="italic">T</tspan>` +
    `<tspan x="${r1(px[2])}" y="${r1(midY + 4)}" font-size="${sfs}">${esc(title)}</tspan>` +
    `<tspan x="${r1(px[3])}" y="${r1(midY)}">}</tspan>` +
    `<tspan x="${r1(px[4])}" y="${r1(midY + 4)}" font-size="${sfs}">${esc(sub)}</tspan>` +
    `<tspan x="${r1(px[5])}" y="${r1(midY)}"> =</tspan></text>`;
  const suffix = `<text x="${r1(gx + gw + brW + 8)}" y="${r1(gy + gh - 1)}" font-size="${sfs}" fill="#1f1f1f"${halo}>${esc(sub)}</text>`;
  return `<g data-id="${l.id}" data-kind="torseur"><title>Torseur de ${esc(liaisonLabel(l))} — valeurs modifiables dans le panneau</title>` +
    prefix +
    `<path d="${bracePath(gx - 4, gy, gh, 1)}" fill="none" stroke="#1f1f1f" stroke-width="1.3"/>` +
    `<path d="${bracePath(gx + gw + 4, gy, gh, -1)}" fill="none" stroke="#1f1f1f" stroke-width="1.3"/>` +
    cellsSVG + suffix + '</g>';
}