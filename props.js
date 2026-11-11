'use strict';
/* ===== Panneau de propriétés ===== */
const KIND_NAMES = { rep: 'Groupe de répétition', fonc: 'Groupe fonctionnel', ref: 'Système de référence' };
const fRow = (label, inner) => `<div class="row"><label>${label}</label>${inner}</div>`;
const fText = (k, v, ph = '') => `<input type="text" data-k="${k}" value="${esc(v)}" placeholder="${esc(ph)}">`;
const fArea = (k, v, ph = '', rows = 2) => `<textarea data-k="${k}" rows="${rows}" style="width:100%;resize:vertical" placeholder="${esc(ph)}">${esc(v)}</textarea>`;
const fNum = (k, v, min = 0, step = 1) => `<input type="number" data-k="${k}" data-num value="${r1(v)}" min="${min}" step="${step}">`;
const fColor = k => `<input type="color" data-k="${k}"><button data-eye="${k}" title="Pipette écran">🎯</button><button data-cur="${k}" title="Appliquer la couleur courante">🎨</button>`;
const fCheck = (k, v, label) => `<label><input type="checkbox" data-k="${k}" data-bool ${v ? 'checked' : ''}> ${label}</label>`;
const fSel = (k, v, opts) => `<select data-k="${k}">${opts.map(([val, lab]) => `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lab)}</option>`).join('')}</select>`;

function renderProps() {
  const box = $('#props'); pruneSel();
  const ids = [...sel];
  let target = null, html = '';
  if (tool === 'cycle') html = cyclesPanel();
  else if (tool === 'cfg') html = cfListPanel();
  else if (!ids.length) html = emptyPanel();
  else if (ids.length > 1) html = multiPanel(ids);
  else {
    target = obj(ids[0]);
    const k = kindOf(ids[0]);
    html = k === 'piece' ? piecePanel(target) : k === 'surface' ? surfPanel(target) : k === 'liaison' ? linkPanel(target) : k === 'group' ? groupPanel(target) : k === 'cycle' ? cyclesPanel() : k === 'note' ? notePanel(target) : k === 'isoRef' ? isoRefPanel(target) : k === 'isoSpec' ? isoSpecPanel(target) : cfgPanel(target);
  }
  box.innerHTML = html;
  if (target) $$('input[type=color][data-k]', box).forEach(i => i.value = rgbToHex(target[i.dataset.k]) || '#000000');
  wireProps(box, target);
  if (target && kindOf(target.id) === 'isoSpec') wireSpecEditor(box, target, null);
}

function emptyPanel() {
  const s = S(), k = x => `<span class="kbd">${x}</span>`;
  return `<h3>📄 ${esc(s.name)}</h3>
    <div class="muted">${s.pieces.length} pièce(s) · ${s.surfaces.length} surface(s) · ${s.liaisons.length} liaison(s) · ${s.groups.length} groupe(s) · ${s.cfgs.length} CF · ${s.cycles.length} cycle(s)</div>
    <h4>Démarrage rapide</h4>
    <ol class="help-list">
      <li>${k('P')} <b>Nouvelle pièce</b> (ou double-clic sur le fond avec Déplacer)</li>
      <li>${k('L')} <b>Nouvelle liaison</b> : ${k('Ctrl')}+clic sur 2 pièces (les surfaces sont créées avec la liaison)</li>
      <li>${k('R')} / ${k('G')} / ${k('T')} : ${k('Ctrl')}+clic sur les pièces (ou surfaces) puis ${k('Entrée')}</li>
      <li>${k('C')} : créer une CF entre deux pièces (surfaces existantes ou nouvelles, point et normale facultatifs)</li>
      <li>${k('Y')} : créer et afficher / cacher les cycles, ou les extraire en feuilles</li>
      <li><b>Nominal 0</b> : afficher / cacher les bulles n° de pièce . 0 reliées à toutes les surfaces</li>
    </ol>
    <div class="btns"><button data-pa="cfs">Gérer les CF</button><button data-pa="cycles">Gérer les cycles</button><button data-pa="loopcalc">Calculer les cycles</button></div>
    <h4>Navigation</h4>
    <div class="muted">${k('V')} / ${k('H')} Déplacer (par défaut) : glisser un élément pour le déplacer, glisser sur le fond vide pour déplacer la vue · ${k('Ctrl')}+clic : sélection multiple · ${k('Maj')}+glisser sur le fond : rectangle de sélection · Molette : zoom · Clic droit ou ${k('Espace')}+glisser : déplacer la vue même au-dessus d’un élément · ${k('0')} : tout afficher</div>
    <h4>Licence</h4><div class="license-note"><b>PolyForm Noncommercial 1.0.0</b><br>Usage personnel et non commercial autorisé.<br><b>Usage commercial : autorisation écrite préalable obligatoire.</b></div>`;
}
function notePanel(n) { return `<h3>🗒 Note</h3><div class="row"><label>Texte</label></div><textarea data-k="text" rows="6" style="width:100%;resize:vertical">${esc(n.text)}</textarea>${fRow('Fond', fColor('color'))}<p class="muted">Glisser la note pour la déplacer ; double-clic pour la modifier.</p><div class="btns"><button data-pa="del" class="danger">🗑 Supprimer la note</button></div>`; }
function isoRefPanel(r) {
  const type = isoType(r), tip = ['triangle', 'arrow'].includes(r.tip) ? r.tip : ISO_STYLE.tipStyle;
  return `<h3>${ISO_REF_ICON} Réf. ISO</h3>
    ${fRow('Symbole', fSel('type', type, ISO_REFERENCE_TYPES))}
    ${type === 'partial'
      ? `${fRow('Texte haut', fText('text', r.text || '', 'vide'))}
        ${fRow('Texte bas', fText('textBottom', r.textBottom || '', 'vide'))}
        ${fRow('Italique haut', fCheck('italic', !!r.italic, 'Écrire en italique'))}
        ${fRow('Italique bas', fCheck('italicBottom', !!r.italicBottom, 'Écrire en italique'))}`
      : fRow('Identifiant', fText('text', r.text || 'A', 'A'))}
    ${fRow('Extrémité du rappel', fSel('tip', tip, [['triangle', 'Triangle plein (équilatéral)'], ['arrow', 'Flèche']]))}
    ${fRow('Marqueur du coude', `<div class="corner-mark-buttons">${[['','Aucun'],['circle','○'],['concentric','◎']].map(([value,label]) => `<button type="button" data-ref-corner="${value}" title="${value === '' ? 'Aucun marqueur' : value === 'circle' ? 'Cercle autour du coude' : 'Deux cercles concentriques'}" class="${(r.cornerMark || '') === value ? 'active' : ''}">${label}</button>`).join('')}</div>`)}
    <p class="muted">L’indicateur est attaché à la surface ou au groupe de surfaces choisi et suit sa pièce. Rappel à deux segments : glissez le coude bleu. Pour la référence partielle, chaque demi-cercle a son texte et son italique.</p>
    <div class="btns"><button data-pa="del" class="danger">🗑 Supprimer</button></div>`;
}
function isoSpecPanel(sp) {
  return `<h3>${ISO_SPEC_ICON} Spécification</h3>` + specEditorHTML(sp) +
    `<p class="muted">Glissez le cadre pour le déplacer ; les poignées bleues déplacent le coude de chaque lien. Le cadre peut être libre ou lié à des surfaces et groupes d’une seule pièce, qu’il suit. Copier-coller une spécification crée un cadre libre sans pièce, surface ni lien. Chaque lien se règle en flèche, triangle plein ou trait simple. Double-clic sur le cadre pour l’éditer dans une fenêtre.</p>
    <div class="btns"><button data-pa="del" class="danger">🗑 Supprimer</button></div>`;
}
function piecePanel(p) {
  const surfs = S().surfaces.filter(s => s.pieceId === p.id);
  return `<h3><span class="chip" style="background:${p.color};color:${textOn(p.color)}">◯</span> Pièce</h3>
    ${fRow('Nom', fArea('name', p.name, 'ex. Arbre, Carter… (Entrée = nouvelle ligne)'))}<div class="err" id="ppErr"></div>
    ${fRow('Numéro', fNum('num', p.num))}
    ${fRow('Couleur', fColor('color'))}
    ${fRow('Contour', fColor('stroke'))}
    <div class="muted">Taille : poignées bleues (Maj = garder les proportions)</div>
    <div class="btns"><button data-pa="circle" title="Rendre la pièce circulaire en un clic (même rayon en largeur et hauteur)">◯ Cercle parfait</button>${p.lab ? '<button data-pa="labauto" title="Remettre le nom à sa place automatique, centrée dans la pièce">↺ Recentre le nom</button>' : ''}${p.nominal ? '<button data-pa="nominalauto">Réinitialiser la position du nominal 0</button>' : ''}</div>
    <p class="muted">Glisser le nom pour le déplacer ; double-clic sur le nom pour le recentrer.</p>
    <h4>Surfaces (${surfs.length})</h4>
    <div>${surfs.map(s => `<button data-goto="${s.id}" style="margin:2px">${esc(sname(s))}</button>`).join('') || '<span class="muted">aucune</span>'}</div>
    <div class="btns"><button data-pa="linkfrom">⟷ Lier à une autre pièce…</button>
    <button data-pa="dup">⧉ Dupliquer</button><button data-pa="del" class="danger">🗑 Supprimer</button></div>`;
}
function surfPanel(s) {
  const p = P(s.pieceId), ls = S().liaisons.filter(l => l.a === s.id || l.b === s.id);
  const cf = cfOfSurface(s.id);
  return `<h3>◦ Surface <b>${esc(sname(s))}</b></h3>
    ${fRow('Pièce', `<button data-goto="${p.id}">${esc(p.name)} (${p.num})</button>`)}
    ${fRow('Type', fSel('type', s.type, doc.settings.surfaceTypes.map(t => [t.code, t.code + ' — ' + t.label])))}
    ${fRow('N° surface', fNum('idx', s.idx, 1))}
    ${fRow('Répétitions', fNum('count', s.count || 1, 1))}
    ${fRow('Nom libre', fText('name', s.name, `${s.type}.${p.num}.${s.idx} (auto)`))}
    ${fRow('Couleur', fColor('color'))}
    ${fRow('Contour', fColor('stroke'))}
    ${fRow('Placement', fCheck('auto', !s.pinned, 'Automatique (suit les liaisons)'))}
    ${cf ? `<h4>Surface de ${esc(cfDisplayName(cf))}</h4><button data-goto="${cf.id}">Modifier ${esc(cfDisplayName(cf))}</button><p class="muted">Supprimer cette surface supprime ses liaisons et sa CF, ainsi que les cycles associés ; l’autre surface de la CF est supprimée seulement si elle devient inutile.</p>` : ''}
    <h4>Liaisons (${ls.length})</h4>
    <div>${ls.map(l => `<button data-goto="${l.id}" style="margin:2px">${esc(liaisonLabel(l))}</button>`).join('') || '<span class="muted">aucune</span>'}</div>
    <div class="btns">${s.name ? '<button data-pa="nameauto" title="Effacer le nom libre et revenir au nom automatique">↺ Nom automatique</button>' : ''}<button data-pa="del" class="danger" title="Supprime aussi les liens et les cycles qui dépendent de cette surface">🗑 Supprimer ${cf ? '(avec sa CF)' : '(avec ses liaisons)'}</button></div>`;
}
function linkPanel(l) {
  const sa = SF(l.a), sb = SF(l.b), pa = P(sa.pieceId), pb = P(sb.pieceId), t = ltype(l.type);
  return `<h3>⟷ Liaison ${esc(l.type)}</h3>
    <div style="display:flex;gap:10px;align-items:center"><div class="ld-schema">${symbolSVG(l.type, l.details, pa.color, pb.color, 110)}</div>
    <div><b>${esc(t.label)}</b><br>${l.count > 1 ? l.count + ' × ' : ''}${vecHTML(detailText(l.type, l.details))}<br><span class="muted">${esc(sname(sa))} ⟷ ${esc(sname(sb))}</span></div></div>
    <div class="btns"><button data-pa="editlink" class="primary">✎ Modifier la liaison…</button></div>
    ${fRow('Répétition', fNum('count', l.count, 1))}
    ${fRow('Libellé', fText('label', l.label, liaisonLabel(Object.assign({}, l, { label: '' })) + ' (auto)'))}
    ${fRow('Position libellé', `<input type="range" min="0.1" max="0.9" step="0.05" data-k="t" data-num value="${l.t ?? 0.5}">`)}
    ${fRow('Couleur trait', fColor('color'))}
    ${curveFields(l)}
    ${torseurFields(l)}
    <div class="btns"><button data-goto="${sa.id}">${esc(sname(sa))}</button><button data-goto="${sb.id}">${esc(sname(sb))}</button><button data-pa="del" class="danger" title="Supprime la liaison et ses 2 surfaces">🗑 Supprimer (avec ses surfaces)</button></div>`;
}
function torseurFields(l) {
  const v = torseurValues(l);
  return `<h4>Torseur <span class="muted">{T_${esc(torseurTitle(l))}}_{${esc(torseurPoint(l))}}</span></h4>
    ${fRow('Point', fText('point', (l.details && l.details.point) || '', 'A (défaut)'))}
    <div class="torsor-grid">${[['X', 'L'], ['Y', 'M'], ['Z', 'N']].map(([a, b]) =>
      `<label>${esc(torseurLetter(a))}</label><input type="text" data-torsor="${a}" value="${esc(v[a])}" aria-label="Composante ${esc(torseurLetter(a))}">` +
      `<label>${esc(torseurLetter(b))}</label><input type="text" data-torsor="${b}" value="${esc(v[b])}" aria-label="Composante ${esc(torseurLetter(b))}">`).join('')}</div>
    <div class="btns"><button data-pa="torsorreset">↺ Valeurs par défaut</button></div>
    <p class="muted">S’affiche sous la liaison avec le bouton <b>Torseurs</b>. Lignes = axes x, y, z ; colonne 1 = efforts / translations, colonne 2 = moments / rotations — la notation (par défaut u v w / α β γ) se change dans <b>Paramètres</b>. Le point ci-dessus est le point d’application (A par défaut). Les valeurs par défaut suivent le type de liaison et son axe / normale ; chaque valeur est modifiable ici.</p>`;
}
function groupPanel(g) {
  const memb = g.members.map(id => g.kind === 'ref' ? (SF(id) ? sname(SF(id)) : null) : (P(id) ? P(id).name : null)).filter(Boolean);
  return `<h3>▣ ${KIND_NAMES[g.kind]}</h3>
    ${g.kind === 'fonc' ? `<div class="btns" style="margin:0 0 8px"><button data-pa="collapse" class="primary" title="Double-clic sur le groupe ou bouton ${g.collapsed ? '+' : '−'} en haut du groupe">${g.collapsed ? '⊞ Développer le groupe' : '⊟ Réduire en une seule ellipse'}</button></div>` +
      (g.collapsed ? '<div class="muted" style="margin-bottom:6px">Les pièces et les liaisons internes sont masquées ; seules les surfaces en contact avec l\'extérieur sont affichées. Sélectionnez l’ellipse pour afficher ses poignées bleues : droite = largeur, bas = hauteur, coin = les deux (Maj au glisser pour conserver les proportions).</div>' : '') : ''}
    ${g.kind === 'rep' ? fRow('Répétitions', `<span class="spin"><button data-pa="cnt-1">−</button>${fNum('count', g.count, 2)}<button data-pa="cnt+1">＋</button></span>`) : ''}
    ${g.kind === 'rep' ? `<h4>CF incluses (${(g.cfIds || []).length})</h4><div class="muted">${(g.cfIds || []).map(C).filter(Boolean).map(c => esc(cfDisplayName(c))).join(', ') || 'Aucune'}</div><p class="muted">« Modifier les membres », puis cliquer sur une surface de CF pour inclure / retirer la CF entière.</p>` : ''}
    ${g.kind === 'fonc' ? `<h4>Titres de répétition inclus (${(g.repLabelIds || []).length})</h4><div class="muted">${(g.repLabelIds || []).map(G).filter(Boolean).map(g => esc(repText(g))).join(', ') || 'Aucun'}</div><p class="muted">« Modifier les membres », puis cliquer sur un titre visible pour l’inclure au contour. Ses pièces ne deviennent pas membres automatiquement.</p>` : ''}
    ${g.lab ? '<div class="btns" style="margin:0 0 6px"><button data-pa="labauto">↺ Position automatique du nom</button></div>' : ''}
    ${fRow('Nom', fText('name', g.name, g.kind === 'rep' ? 'affiché après ×N' : 'nom déplaçable sur le graphe'))}
    ${g.kind === 'fonc' && g.collapsed ? '' : '<p class="muted">Glisser le nom pour le déplacer et adapter la forme du groupe ; double-clic pour réinitialiser.</p>'}
    ${fRow('Couleur fond', fColor('color'))}
    ${fRow('Opacité fond', `<input type="range" min="0" max="1" step="0.05" data-k="opacity" data-num value="${g.opacity}">`)}
    ${fRow('Contour', fColor('stroke'))}
    <h4>Membres (${memb.length})</h4><div class="muted">${memb.map(esc).join(', ') || 'aucun'}</div>
    <div class="btns"><button data-pa="editmembers" class="primary" title="Ctrl+clic pour ajouter / retirer, puis Entrée">✎ Modifier les membres</button>
      <button data-pa="front">⬆ Premier plan</button><button data-pa="back">⬇ Arrière-plan</button>
      <button data-pa="del" class="danger">🗑 Supprimer</button></div>`;
}
function curveFields(l) {
  return fRow('Tracé', fCheck('curved', !!l.curved, 'Courbe (poignée avec Déplacer)')) +
    (l.curved ? '<div class="btns"><button data-pa="straight">Remettre droit</button></div>' : '');
}
function cfgPanel(c) {
  return `<h3 style="color:${cfRenderColor(c)}">${esc(cfDisplayName(c))}</h3>
    ${fRow('Nom', fText('name', cfName(c), 'Texte, nombre ou vide'))}<div class="err" id="cfFieldErr"></div>
    ${fRow('Couleur', fColor('color'))}
    ${fRow('Affichage', fCheck('inColor', c.inColor !== false, 'Dans sa couleur (sinon noir)'))}
    ${curveFields(c)}
    ${fRow('Libellé', fCheck('labelBox', !!c.labelBox, 'Encadrer le texte sur le trait'))}
    <p class="muted">Deux surfaces de cette CF (existantes ou nouvelles), sans surlignage automatique des liaisons. Point et normale facultatifs dans « Modifier les surfaces… ».</p>
    <div class="btns"><button data-goto="${c.a}">${esc(endName(c.a))}</button><button data-goto="${c.b}">${esc(endName(c.b))}</button></div>
    <div class="btns"><button data-pa="editcf">Modifier les surfaces…</button><button data-pa="cfs">Gérer toutes les CF</button><button data-pa="cycles">Gérer les cycles</button><button data-pa="del" class="danger">Supprimer la CF et ses surfaces</button></div>`;
}
function multiPanel(ids) {
  const np = ids.filter(id => kindOf(id) === 'piece').length;
  return `<h3>${ids.length} éléments sélectionnés</h3><div class="muted">${np} pièce(s)</div>
    ${fRow('Couleur', `<input type="color" id="multiColor" value="${$('#curColor').value}"><button data-pa="multicolor">Appliquer</button>`)}
    <div class="btns">
      <button data-pa="dup">⧉ Dupliquer (Ctrl+D)</button>
      <button data-pa="extract" title="Copie la zone sélectionnée dans une nouvelle feuille">📄 Extraire vers une feuille</button>
      <button data-pa="mkfonc">▣ Groupe fonctionnel</button><button data-pa="mkrep">▣ Répétition (×2)</button>
      ${np === 2 ? '<button data-pa="link2" class="primary">⟷ Lier ces 2 pièces</button><button data-pa="cf2">Créer une CF</button>' : ''}
      <button data-pa="invert">⇋ Inverser la sélection</button>
      <button data-pa="del" class="danger">🗑 Supprimer</button></div>`;
}

function applyField(target, inp) {
  const k = inp.dataset.k; let v;
  if ('bool' in inp.dataset) v = inp.checked;
  else if ('num' in inp.dataset) {
    v = parseFloat(inp.value);
    if (!Number.isFinite(v)) { inp.classList.add('invalid'); inp.setCustomValidity('Nombre obligatoire.'); return false; }
    inp.classList.remove('invalid'); inp.setCustomValidity('');
  }
  else v = inp.value;
  const kd = kindOf(target.id);
  if (kd === 'isoRef' && k === 'type') {
    target.type = v;
    if (v === 'partial' && (target.text === 'A' || !target.text)) target.text = '⌀';
    else if (v !== 'partial' && target.text === '⌀') target.text = 'A';
    const elbow = isoDefaultElbow(target); target.elbowX = elbow.x; target.elbowY = elbow.y; return true;
  }
  if ((kd === 'liaison' || kd === 'cfg') && k === 'curved') { target.curved = v; target.bend = v ? (target.bend || 80) : 0; return true; }
  if (kd === 'cfg' && k === 'name') {
    v = v.trim();
    const err = cfNameError(v, S().cfgs, target.id);
    $('#cfFieldErr').textContent = err; inp.classList.toggle('invalid', !!err);
    if (err) return false;
  }
  if (kd === 'cfg' && k === 'color') { setCFColor(target, v); return true; }
  if (kd === 'surface' && k === 'count') {
    if (!Number.isSafeInteger(v) || v < 1) { inp.classList.add('invalid'); toast('Le nombre de répétitions doit être un entier positif.'); return false; }
    inp.classList.remove('invalid');
  }
  if (kd === 'piece') {
    if (k === 'name') { if (!v.trim() || nameUsed(v, target.id)) { inp.classList.add('invalid'); $('#ppErr').textContent = v.trim() ? 'Nom déjà utilisé' : 'Nom obligatoire'; return false; } inp.classList.remove('invalid'); $('#ppErr').textContent = ''; }
    if (k === 'num') { v = Math.round(v); if (numUsed(v, target.id)) { inp.classList.add('invalid'); $('#ppErr').textContent = 'Numéro déjà utilisé'; return false; } inp.classList.remove('invalid'); $('#ppErr').textContent = ''; }
  }
  if (kd === 'surface' && k === 'idx') v = Math.max(1, Math.round(v));
  if (kd === 'liaison' && k === 'point') { target.details = Object.assign({}, target.details, { point: v.trim() }); return true; }
  if (kd === 'surface' && k === 'auto') { target.pinned = !v; return true; }
  if (kd === 'liaison' && k === 'count') v = Math.max(1, Math.round(v));
  if (kd === 'group' && k === 'count') v = Math.max(2, Math.round(v));
  target[k] = v;
  return true;
}

function wireProps(box, target) {
  $$('[data-cfa]', box).forEach(b => b.onclick = () => cfListAction(b.dataset.cfa, b.dataset.cfid));
  $$('[data-cf-display]', box).forEach(inp => inp.onchange = () => {
    const c = C(inp.dataset.cfDisplay);
    if (c) { checkpoint(); c.inColor = inp.value === 'color'; changed(); }
  });
  $$('[data-cf-color]', box).forEach(inp => inp.onchange = () => {
    const c = C(inp.dataset.cfColor);
    if (c) { checkpoint(); setCFColor(c, inp.value); changed(); }
  });
  $$('[data-cycle-color]', box).forEach(inp => inp.onchange = () => {
    const c = CY(inp.dataset.cycleColor);
    if (c) { checkpoint(); c.color = inp.value; changed(); }
  });
  $$('[data-ca]', box).forEach(b => b.onclick = () => cycleAction(b.dataset.ca, b.dataset.cid));
  $$('[data-cycle-visible]', box).forEach(inp => inp.onchange = () => {
    const c = CY(inp.dataset.cycleVisible);
    if (c) { checkpoint(); setCycleVisible(c, inp.checked); changed(); }
  });
  let cp = false;
  $$('[data-k]', box).forEach(inp => {
    inp.addEventListener('focus', () => cp = false);
    inp.addEventListener('change', () => { cp = false; if (target && ['type', 'auto', 'count', 'curved', 'inColor', 'point'].includes(inp.dataset.k)) renderProps(); });
    inp.addEventListener('input', () => {
      if (!target) return;
      if (!cp) { checkpoint(); cp = true; }
      if (applyField(target, inp)) {
        render(); autosave();
        if (kindOf(target.id) === 'cfg' && inp.dataset.k === 'name') $('h3', box).textContent = cfDisplayName(target);
        if (kindOf(target.id) === 'cfg') $('h3', box).style.color = cfRenderColor(target);
      }
    });
  });
  const setColor = (k, c) => {
    if (!target || !c) return; checkpoint();
    if (kindOf(target.id) === 'cfg' && k === 'color') setCFColor(target, c); else target[k] = c;
    changed();
  };
  let tcp = false;
  $$('[data-torsor]', box).forEach(inp => {
    inp.addEventListener('focus', () => tcp = false);
    inp.addEventListener('input', () => {
      if (!target || kindOf(target.id) !== 'liaison') return;
      if (!tcp) { checkpoint(); tcp = true; }
      target.torsor = Object.assign({}, target.torsor, { [inp.dataset.torsor]: inp.value });
      render(); autosave();
    });
  });
  $$('[data-eye]', box).forEach(b => b.onclick = async () => setColor(b.dataset.eye, await eyeDrop()));
  $$('[data-cur]', box).forEach(b => b.onclick = () => setColor(b.dataset.cur, $('#curColor').value));
  $$('[data-goto]', box).forEach(b => b.onclick = () => { sel.clear(); sel.add(b.dataset.goto); changed(); });
  $$('[data-ref-corner]', box).forEach(b => b.onclick = () => {
    if (!target || kindOf(target.id) !== 'isoRef') return;
    checkpoint(); target.cornerMark = b.dataset.refCorner; changed();
  });
  $$('[data-pa]', box).forEach(b => b.onclick = () => propAction(b.dataset.pa, target, b));
}

function propAction(a, t, btn) {
  const ids = [...sel];
  switch (a) {
    case 'del': doDelete(); break;
    case 'dup': duplicateSel(); break;
    case 'linkfrom': setTool('liaison'); pick = [t.id]; render(); updateTip(); break;
    case 'editlink': { const sa = SF(t.a), sb = SF(t.b); liaisonDialog(sa.pieceId, sb.pieceId, t.id); break; }
    case 'editmembers': startGroupTool(t.kind, t.members, t.id, t.cfIds || [], t.repLabelIds || []); break;
    case 'collapse': toggleCollapse(t); break;
    case 'labauto': checkpoint(); t.lab = null; changed(); break;
    case 'cnt-1': case 'cnt+1': checkpoint(); t.count = Math.max(2, t.count + (a === 'cnt+1' ? 1 : -1)); changed(); break;
    case 'front': { checkpoint(); const gs = S().groups; gs.splice(gs.indexOf(t), 1); gs.unshift(t); changed(); break; }
    case 'back': { checkpoint(); const gs = S().groups; gs.splice(gs.indexOf(t), 1); gs.push(t); changed(); break; }
    case 'editcf': cfDialog(SF(t.a).pieceId, SF(t.b).pieceId, t.id); break;
    case 'loopcalc': closedLoopsDialog(); break;
    case 'cycles': setTool('cycle'); break;
    case 'cfs': setTool('cfg'); break;
    case 'straight': checkpoint(); t.curved = false; t.bend = 0; changed(); break;
    case 'circle': checkpoint(); { const r = Math.round((t.rx + t.ry) / 2); t.rx = r; t.ry = r; } changed(); break;
    case 'torsorreset': checkpoint(); delete t.torsor; changed(); break;
    case 'nameauto': checkpoint(); t.name = ''; changed(); break;
    case 'nominalauto': checkpoint(); delete t.nominal; changed(); break;
    case 'multicolor': {
      const c = $('#multiColor').value; checkpoint();
      ids.forEach(id => { const o = obj(id); if (o) { if (kindOf(id) === 'cfg') setCFColor(o, c); else o.color = c; } }); changed(); break;
    }
    case 'extract': extractToSheet(); break;
    case 'mkfonc': case 'mkrep': {
      const pids = ids.filter(id => kindOf(id) === 'piece'); if (!pids.length) return toast('Sélectionnez des pièces');
      checkpoint(); const g = createGroup(a === 'mkfonc' ? 'fonc' : 'rep', pids);
      sel.clear(); sel.add(g.id); changed(); break;
    }
    case 'link2': { const pids = ids.filter(id => kindOf(id) === 'piece'); liaisonDialog(pids[0], pids[1]); break; }
    case 'cf2': { const pids = ids.filter(id => kindOf(id) === 'piece'); cfDialog(pids[0], pids[1]); break; }
    case 'invert': invertSel(); break;
  }
}
