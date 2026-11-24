'use strict';
/* ===== Torseurs des liaisons =====
   Sous chaque liaison, le torseur des actions transmissibles
   {T_{n1/n2}}_{A} = { X L / Y M / Z N }_{A}
   Lignes = axes x, y, z ; colonne 1 = efforts (X, Y, Z), colonne 2 = moments (L, M, N).
   Les valeurs par défaut découlent du type de liaison et de son axe / normale choisis ;
   chaque valeur reste modifiable dans le panneau de la liaison. */
const TORSEUR_KEYS = ['X', 'L', 'Y', 'M', 'Z', 'N'];
const FORCE_KEY = { x: 'X', y: 'Y', z: 'Z' };
const MOMENT_KEY = { x: 'L', y: 'M', z: 'N' };
const TORSEUR_AXES = ['x', 'y', 'z'];
/* Lettres affichées dans le torseur : configurables dans Paramètres (défaut u v w pour les
   efforts / translations, α β γ pour les moments / rotations). Les clés X,L,Y,M,Z,N désignent
   les emplacements fixes (effort x, moment x, effort y, …) et restent stables si la notation change. */
function torseurLetter(slot) {
  const v = doc.settings.torseurLetters && doc.settings.torseurLetters[slot];
  return (typeof v === 'string' && v.trim()) ? v.trim() : DEFAULT_SETTINGS.torseurLetters[slot] || slot;
}

/* 'x', '-x' et 'y_12' donnent l'axe x, x et y ; 'u_123' ou vide donne null. */
function dirAxis(v) {
  let s = String(v || '').trim().toLowerCase();
  if (s.startsWith('-')) s = s.slice(1);
  s = s.split('_')[0];
  return TORSEUR_AXES.includes(s) ? s : null;
}

/* Composantes nulles : un mouvement libre interdit l'action correspondante.
   D'après le tableau classique des liaisons usuelles (torseur des actions transmissibles). */
/* Une CF n'impose aucune liaison : son torseur est complet (6 composantes, aucune nulle). */
function isCFTorseur(l) { return !!l && S().cfgs.includes(l); }
function torseurDefaults(l) {
  const v = { X: torseurLetter('X'), L: torseurLetter('L'), Y: torseurLetter('Y'), M: torseurLetter('M'), Z: torseurLetter('Z'), N: torseurLetter('N') };
  if (isCFTorseur(l)) return v;
  const sym = ltype(l.type).symbol || 'GEN';
  const d = l.details || {};
  const axis = dirAxis(d.axe), norm = dirAxis(d.normale);
  const zeroForce = a => { if (a) v[FORCE_KEY[a]] = '0'; };
  const zeroMoment = a => { if (a) v[MOMENT_KEY[a]] = '0'; };
  switch (sym) {
    case 'PV': zeroMoment(axis); break;                                   // rotation libre autour de l'axe
    case 'GL': zeroForce(axis); break;                                    // translation libre selon l'axe
    case 'PG': zeroForce(axis); zeroMoment(axis); break;
    case 'HE':                                                            // vis : L = -p/2π·X selon l'axe
      if (axis) v[MOMENT_KEY[axis]] = `-p/2π·${torseurLetter(FORCE_KEY[axis])}`;
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
  const p1 = P(endPiece(l.a)), p2 = P(endPiece(l.b));
  const n1 = p1 ? p1.num : '?', n2 = p2 ? p2.num : '?';
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
/* Bloc centré sous le point (x, y) : accolade, grille 3×2, accolade, indice A (le résultat seul, sans {T…} =).
   Valeurs et point passent par le rendu indicé : u_123 → u avec 123 en indice. */
function torseurSVG(l, x, y) {
  const v = torseurValues(l), sub = torseurPoint(l);
  const fs = 12, sfs = 8, rh = 13;
  const cells = [[v.X, v.L], [v.Y, v.M], [v.Z, v.N]];
  const cw1 = Math.max(...cells.map(row => richTextWidth(row[0], fs))) + 16, cw2 = Math.max(...cells.map(row => richTextWidth(row[1], fs))) + 16;
  const gw = cw1 + cw2, gh = 3 * rh, brW = 7;
  const wSub = richTextWidth(sub, sfs);
  const total = brW + gw + brW + 8 + wSub;
  const left = x - total / 2, top = y, gy = top + 4;
  const gx = left + brW, colX = [gx + cw1 / 2, gx + cw1 + cw2 / 2], rowY = [gy + 10, gy + 10 + rh, gy + 10 + 2 * rh];
  const cellsSVG = cells.map((row, j) => row.map((val, i) =>
    richTextSVG(val, colX[i], rowY[j], fs, '', '#1f1f1f', true)
  ).join('')).join('');
  const suffix = richTextSVG(sub, gx + gw + brW + 8, gy + gh - 1, sfs, '', '#1f1f1f', true, { anchor: 'start' });
  const label = isCFTorseur(l) ? 'CF ' + cfDisplayName(l) : liaisonLabel(l);
  return `<g data-id="${l.id}" data-kind="torseur"><title>Torseur de ${esc(label)} — valeurs modifiables dans le panneau</title>` +
    `<path d="${bracePath(gx - 4, gy, gh, 1)}" fill="none" stroke="#1f1f1f" stroke-width="1.3"/>` +
    `<path d="${bracePath(gx + gw + 4, gy, gh, -1)}" fill="none" stroke="#1f1f1f" stroke-width="1.3"/>` +
    cellsSVG + suffix + '</g>';
}
