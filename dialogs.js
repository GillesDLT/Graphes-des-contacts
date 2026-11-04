'use strict';
/* ===== Fenêtres modales ===== */
let modalOpen = null;
function openModal({ title, body, okText = 'Valider', onOk, wide, extraLeft, noCancel }) {
  closeModal();
  const bd = document.createElement('div'); bd.className = 'backdrop';
  bd.innerHTML = `<div class="modal" style="${wide ? 'width:' + wide + 'px' : ''}"><header><span>${title}</span><button class="xbtn" title="Fermer (Échap)">✕</button></header><div class="body"></div>
    <footer>${extraLeft ? '<span class="left"></span>' : ''}${noCancel ? '' : '<button class="cancel">Annuler</button>'}${onOk ? `<button class="primary ok">${okText}</button>` : ''}</footer></div>`;
  const b = $('.body', bd); if (typeof body === 'string') b.innerHTML = body; else b.appendChild(body);
  if (extraLeft) $('.left', bd).appendChild(extraLeft);
  const close = () => closeModal();
  $('.xbtn', bd).onclick = close;
  const cb = $('.cancel', bd); if (cb) cb.onclick = close;
  const ok = () => { if (onOk && onOk() !== false) closeModal(); };
  const okb = $('.ok', bd); if (okb) okb.onclick = ok;
  bd._ok = onOk ? ok : null;
  bd._close = close;
  $('#modal-root').appendChild(bd);
  modalOpen = bd;
  setTimeout(() => { const f = $('[autofocus]', bd) || $('input,select', bd); if (f) { f.focus(); if (f.select) f.select(); } }, 30);
  return bd;
}
function closeModal() { if (modalOpen) { modalOpen.remove(); modalOpen = null; } }
document.addEventListener('keydown', e => {
  if (!modalOpen) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); modalOpen._close(); }
  else if (e.key === 'Enter' && modalOpen._ok && e.target.tagName !== 'TEXTAREA' && !(e.target.tagName === 'BUTTON' && !e.target.classList.contains('ok'))) { e.preventDefault(); e.stopImmediatePropagation(); modalOpen._ok(); }
});
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function askText(title, value, onOk) {
  const b = el(`<div><input type="text" style="width:100%" autofocus value="${esc(value)}"></div>`);
  openModal({ title, body: b, onOk: () => onOk($('input', b).value.trim()) });
}
function askConfirm(title, msg, onOk) { openModal({ title, body: `<p>${msg}</p>`, okText: 'Confirmer', onOk }); }

/* Export : nom proposé et choix natif de l’emplacement quand le navigateur le permet. */
function exportFileDialog({ title, extension, mime, makeBlob }) {
  const suggested = (fileBase() || 'graphe') + extension;
  const body = el(`<div><label for="exportName">Nom du fichier</label><input id="exportName" type="text" style="width:100%;margin-top:6px" value="${esc(suggested)}" autofocus><p class="muted">Le navigateur proposera un emplacement d’enregistrement. Si le sélecteur de fichier n’est pas disponible, le fichier sera téléchargé dans le dossier défini par le navigateur.</p></div>`);
  openModal({
    title, body, okText: 'Choisir l’emplacement et exporter',
    onOk: () => {
      let name = $('#exportName', body).value.trim() || suggested;
      if (!name.toLowerCase().endsWith(extension)) name += extension;
      closeModal();
      void saveExportFile({ name, extension, mime, makeBlob });
      return false;
    }
  });
}
async function saveExportFile({ name, extension, mime, makeBlob }) {
  try {
    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: extension.slice(1).toUpperCase(), accept: { [mime]: [extension] } }]
      });
      const blob = await makeBlob();
      if (!blob) return;
      const writable = await handle.createWritable();
      await writable.write(blob); await writable.close();
      toast('Fichier enregistré : ' + name);
    } else {
      const blob = await makeBlob(); if (blob) { download(blob, name); toast('Téléchargement lancé : ' + name); }
    }
  } catch (error) {
    if (error?.name !== 'AbortError') toast('Export impossible : ' + (error?.message || error));
  }
}
/* Comptage des cycles non indépendants par CF et du nombre cyclomatique. */
function closedLoopsDialog() {
  const sheet = S(), MAX_LOOPS = 2000, MAX_VISITS = 200000;
  const adjacency = new Map(sheet.pieces.map(p => [p.id, []]));
  for (const link of sheet.liaisons) {
    const a = SF(link.a), b = SF(link.b);
    if (!a || !b || a.pieceId === b.pieceId || !adjacency.has(a.pieceId) || !adjacency.has(b.pieceId)) continue;
    adjacency.get(a.pieceId).push(b.pieceId);
    adjacency.get(b.pieceId).push(a.pieceId);
  }
  let total = 0, truncatedAny = false;
  const cards = sheet.cfgs.map(cf => {
    const sa = SF(cf.a), sb = SF(cf.b), start = sa && sa.pieceId, target = sb && sb.pieceId;
    if (!start || !target || start === target || !adjacency.has(start) || !adjacency.has(target)) {
      return `<section class="loop-card"><h4>${esc(cfDisplayName(cf))}</h4><p class="muted">Impossible à calculer : cette CF ne relie pas deux pièces distinctes valides.</p></section>`;
    }
    let count = 0, visits = 0, truncated = false;
    const visited = new Set([start]);
    const walk = current => {
      if (truncated) return;
      if (++visits > MAX_VISITS || count >= MAX_LOOPS) { truncated = true; return; }
      if (current === target) { count++; return; }
      for (const next of adjacency.get(current) || []) {
        if (visited.has(next)) continue;
        visited.add(next);
        walk(next);
        visited.delete(next);
        if (truncated) return;
      }
    };
    walk(start); total += count; truncatedAny ||= truncated;
    const countLabel = truncated ? `≥ ${count}` : String(count);
    const plural = count === 1 ? '' : 's';
    return `<section class="loop-card"><h4>${esc(cfDisplayName(cf))} : ${countLabel} cycle${plural} non indépendant${plural}${truncated ? ' (recherche limitée)' : ''}</h4></section>`;
  });

  // Un cycle élémentaire indépendant correspond à un surplus d'arêtes par
  // rapport à une forêt couvrante : mu = E - V + C.
  const pieces = sheet.pieces;
  const graph = new Map(pieces.map(p => [p.id, []]));
  let linkCount = 0;
  const addGraphEdge = (a, b) => {
    if (!graph.has(a) || !graph.has(b) || a === b) return;
    graph.get(a).push(b); graph.get(b).push(a); linkCount++;
  };
  for (const link of sheet.liaisons) {
    const a = SF(link.a), b = SF(link.b);
    if (a && b) addGraphEdge(a.pieceId, b.pieceId);
  }
  // Chaque CF relie elle aussi deux pièces et ferme potentiellement un cycle.
  for (const cf of sheet.cfgs) {
    const a = SF(cf.a), b = SF(cf.b);
    if (a && b) addGraphEdge(a.pieceId, b.pieceId);
  }
  let components = 0;
  const seen = new Set();
  for (const piece of pieces) {
    if (seen.has(piece.id)) continue;
    components++;
    const stack = [piece.id]; seen.add(piece.id);
    while (stack.length) {
      for (const next of graph.get(stack.pop()) || []) {
        if (!seen.has(next)) { seen.add(next); stack.push(next); }
      }
    }
  }
  const pieceCount = pieces.length;
  const independent = Math.max(0, linkCount - pieceCount + components);
  const formula = components === 1
    ? `μ = n<sub>l</sub> − n<sub>p</sub> + 1 = ${linkCount} − ${pieceCount} + 1 = <b>${independent}</b>`
    : `μ = n<sub>l</sub> − n<sub>p</sub> + k = ${linkCount} − ${pieceCount} + ${components} = <b>${independent}</b>`;
  const summary = sheet.cfgs.length
    ? `<p><b>Cycles non indépendants passant par une CF</b> : ${total}${truncatedAny ? ' ou plus' : ''} au total dans « ${esc(sheet.name)} ».</p>`
    : '<p>Aucune CF dans cette feuille : aucun cycle non indépendant ne peut être compté par CF.</p>';
  const loopInfo = sheet.cfgs.length
    ? '<p class="muted">Pour chaque CF : nombre de chemins de liaisons entre ses deux pièces, la CF fermant le parcours. Une pièce ne peut pas être visitée deux fois. Seul le nombre est affiché.</p>'
    : '';
  const independentInfo = '<p><b>Nombre de cycles indépendants (nombre cyclomatique)</b></p>' +
    `<p class="formula">${formula}</p>` +
    `<p class="muted">n<sub>l</sub> = ${linkCount} liaison(s) (liaisons de contact + CF) ; n<sub>p</sub> = ${pieceCount} pièce(s) ; k = ${components} composante(s) connexe(s). Pour un graphe connexe, k = 1 et on retrouve μ = n<sub>l</sub> − n<sub>p</sub> + 1.</p>`;
  openModal({
    title: 'Cycles — comptage', wide: 760,
    body: `${summary}${loopInfo}${cards.join('')}<hr>${independentInfo}`,
    noCancel: true
  });
}

/* Pipette écran (API EyeDropper : Edge / Chrome) */
async function eyeDrop() {
  if (!window.EyeDropper) { toast('Pipette écran non supportée par ce navigateur (utilisez Edge/Chrome)'); return null; }
  try { const r = await new EyeDropper().open(); return r.sRGBHex; } catch (e) { return null; }
}
/* Sélecteur de couleur : palette + input + pipette */
function colorPicker(value, onChange) {
  const w = el(`<div><div class="swatches"></div><div class="row" style="margin-top:6px"><input type="color" value="${value}"><button type="button" title="Pipette écran">🎯 Pipette</button><button type="button" title="Couleur courante de la barre d'outils">Couleur courante</button></div></div>`);
  const inp = $('input', w);
  const set = c => { inp.value = c; $$('.sw', w).forEach(s => s.classList.toggle('sel', s.dataset.c === c)); onChange(c); };
  $('.swatches', w).innerHTML = PALETTE.map(c => `<span class="sw ${c === value ? 'sel' : ''}" data-c="${c}" style="background:${c}" title="${c}"></span>`).join('');
  $('.swatches', w).onclick = e => { const c = e.target.dataset.c; if (c) set(c); };
  inp.oninput = () => set(inp.value);
  const [bEye, bCur] = $$('button', w);
  bEye.onclick = async () => { const c = await eyeDrop(); if (c) set(c); };
  bCur.onclick = () => set($('#curColor').value);
  return w;
}

/* ===== Note libre sur le graphe ===== */
function noteDialog(at, id = null) {
  const note = id ? (S().notes || []).find(n => n.id === id) : null;
  if (id && !note) return;
  const body = el(`<div><label for="noteText">Commentaire</label><textarea id="noteText" autofocus rows="5" style="width:100%;resize:vertical" placeholder="Écrire une note…">${esc(note?.text || '')}</textarea><p class="muted">Les retours à la ligne sont conservés. La note reste déplaçable sur le graphe.</p></div>`);
  openModal({ title: note ? 'Modifier la note' : 'Ajouter une note', body, okText: note ? 'Enregistrer' : 'Ajouter', onOk: () => {
    const text = $('#noteText', body).value.trim();
    if (!text) { $('#noteText', body).focus(); toast('La note ne peut pas être vide.'); return false; }
    checkpoint();
    let target = note;
    if (!target) { target = { id: uid(), x: at.x, y: at.y, text, color: '#fff4c2' }; S().notes.push(target); }
    else target.text = text;
    sel.clear(); sel.add(target.id); setTool('select'); changed();
  }});
}

function specDialog(id) {
  const sp = (S().isoSpecs || []).find(x => x.id === id); if (!sp) return;
  const body = el('<div class="spec-editor"></div>');
  const redraw = () => { body.innerHTML = specEditorHTML(sp); wireSpecEditor(body, sp, redraw); };
  redraw();
  openModal({ title: 'Spécification — cadre de tolérance', body, wide: 560, noCancel: true, okText: 'Fermer', onOk: () => {} });
}

/* ===== Nouvelle pièce ===== */
let lastPieceColor = '#fdb975';
function pieceDialog(at) {
  let color = lastPieceColor;
  const num = nextNum();
  const b = el(`<div style="display:grid;grid-template-columns:1fr 150px;gap:14px">
    <div>
      <div class="row"><label>Nom</label><input type="text" id="pdName" autofocus placeholder="ex. Arbre, Carter…" value="Pièce ${num}"></div>
      <div class="err" id="pdErr"></div>
      <div class="row"><label>Numéro</label><input type="number" id="pdNum" min="0" value="${num}" title="Utilisé dans la nomenclature des surfaces (ex. PL.${num}.1)"></div><div class="muted">Sert à nommer les surfaces : PL.<i>n°</i>.1 (non affiché sur la bulle)</div>
      <h4 style="margin:10px 0 4px;font-size:12px;color:#6b7280">COULEUR</h4>
      <div id="pdColor"></div>
    </div>
    <svg id="pdPrev" width="150" height="150" viewBox="-75 -75 150 150"></svg></div>`);
  const prev = () => {
    const nm = $('#pdName', b).value;
    $('#pdPrev', b).innerHTML = `<ellipse rx="60" ry="60" fill="${color}" stroke="#1a1a1a" stroke-width="2"/><text y="5" text-anchor="middle" font-size="15" font-weight="600" fill="${textOn(color)}">${esc(nm)}</text>`;
  };
  $('#pdColor', b).appendChild(colorPicker(color, c => { color = c; prev(); }));
  b.addEventListener('input', prev);
  prev();
  openModal({
    title: '◯ Nouvelle pièce', body: b, okText: 'Créer la pièce',
    onOk: () => {
      const name = $('#pdName', b).value.trim(), n = parseInt($('#pdNum', b).value, 10);
      const err = m => { $('#pdErr', b).textContent = m; return false; };
      if (!name) return err('Le nom est obligatoire.');
      if (nameUsed(name)) { $('#pdName', b).classList.add('invalid'); return err('Ce nom existe déjà : le nom doit être unique.'); }
      if (isNaN(n)) return err('Numéro invalide.');
      if (numUsed(n)) return err('Ce numéro est déjà utilisé par une autre pièce.');
      checkpoint();
      lastPieceColor = color;
      const p = createPiece({ name, color, num: n, x: at ? at.x : null, y: at ? at.y : null });
      sel.clear(); sel.add(p.id); setTool('select'); changed();
    }
  });
}

/* ===== Popup flottante (réservée) ===== */
let popupEl = null;
function closePopup() { if (popupEl) { popupEl.remove(); popupEl = null; } }

/* ===== Palette ISO GPS : outils Réf. ISO et Spécification, affichage des symboles ===== */
function openIsoPopup() {
  const anchor = $('#toolbar [data-act=isogps]');
  const b = el(`<div class="popup iso-popup">
    <div class="ttl"><b>ISO GPS</b><button class="xbtn" title="Fermer (Échap)">✕</button></div>
    <button data-iso="ref">${ISO_REF_ICON} Réf. ISO</button>
    <button data-iso="spec">${ISO_SPEC_ICON} Spécification</button>
    <div class="muted">Affichage</div>
    <button data-iso="isorefs"></button>
    <button data-iso="isospecs"></button>
    <div class="muted">Réf. ISO : clic sur une surface ou un groupe de références. Carré par défaut ; partielle, textes (⌀ pré-rempli) et extrémité dans le panneau de droite.<br>Spécification : cliquer sur une ou plusieurs surfaces / groupes de références, puis Entrée. Le cadre de tolérance se règle dans le panneau : symboles, indications, indicateurs Ⓜ Ⓔ…, références et extrémité de chaque lien (flèche ou trait simple).</div>
  </div>`);
  const sync = () => {
    for (const [key, label, setting] of [['isorefs', 'Références', 'showIsoRefs'], ['isospecs', 'Spécifications', 'showSpecs']]) {
      const btn = $(`[data-iso=${key}]`, b), on = doc.settings[setting] !== false;
      btn.textContent = (on ? '👁 ' : '🚫 ') + label;
      btn.classList.toggle('active', on); btn.setAttribute('aria-pressed', String(on));
    }
  };
  $('.xbtn', b).onclick = closePopup;
  $('[data-iso=ref]', b).onclick = () => setTool('isoRef');
  $('[data-iso=spec]', b).onclick = () => setTool('spec');
  $('[data-iso=isorefs]', b).onclick = () => { doc.settings.showIsoRefs = doc.settings.showIsoRefs === false; changed(false); sync(); };
  $('[data-iso=isospecs]', b).onclick = () => { doc.settings.showSpecs = doc.settings.showSpecs === false; changed(false); sync(); };
  sync();
  document.body.appendChild(b);
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    b.style.left = Math.max(8, Math.min(window.innerWidth - b.offsetWidth - 8, r.left)) + 'px';
    b.style.top = (r.bottom + 6) + 'px';
  }
  popupEl = b; b._keep = true;
  return b;
}

/* ===== Paramètres ===== */
function settingsDialog() {
  const st = clone(doc.settings);
  const b = el(`<div style="width:760px"></div>`);
  const draw = () => {
    const sOpts = sel => st.surfaceTypes.map(t => `<option ${t.code === sel ? 'selected' : ''}>${esc(t.code)}</option>`).join('');
    b.innerHTML = `<h4>Types de surfaces</h4>
      <table class="set"><tr><th>Code</th><th>Libellé</th><th></th></tr>
      ${st.surfaceTypes.map((t, i) => `<tr><td><input type="text" data-s="${i}" data-f="code" value="${esc(t.code)}" style="width:70px"></td><td><input type="text" data-s="${i}" data-f="label" value="${esc(t.label)}"></td><td><button data-dels="${i}" class="danger">✕</button></td></tr>`).join('')}
      </table><button data-adds>＋ Type de surface</button>
      <h4>Types de liaisons</h4>
      <table class="set"><tr><th>Code</th><th>Libellé</th><th>Schéma</th><th>Point</th><th>Axe</th><th>Normale</th><th>Pas</th><th>Surf. A</th><th>Surf. B</th><th></th></tr>
      ${st.liaisonTypes.map((t, i) => `<tr><td><input type="text" data-l="${i}" data-f="code" value="${esc(t.code)}" style="width:56px"></td>
        <td><input type="text" data-l="${i}" data-f="label" value="${esc(t.label)}"></td>
        <td><select data-l="${i}" data-f="symbol">${SYMBOLS.map(s => `<option ${s === t.symbol ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
        ${['point', 'axe', 'normale', 'pas'].map(f => `<td><input type="checkbox" data-l="${i}" data-fld="${f}" ${t.fields.includes(f) ? 'checked' : ''}></td>`).join('')}
        <td><select data-l="${i}" data-f="sA">${sOpts(t.sA)}</select></td><td><select data-l="${i}" data-f="sB">${sOpts(t.sB)}</select></td>
        <td><button data-dell="${i}" class="danger">✕</button></td></tr>`).join('')}
      </table><button data-addl>＋ Type de liaison</button>
      <h4>Couleurs par défaut</h4>
      <div class="row"><label style="width:220px">Couleur groupe de répétition</label><input type="color" data-gc="rep" value="${st.groupColors.rep}"></div>
      <div class="row"><label style="width:220px">Couleur groupe fonctionnel</label><input type="color" data-gc="fonc" value="${st.groupColors.fonc}"></div>
      <div class="row"><label style="width:220px">Couleur système de référence</label><input type="color" data-gc="ref" value="${st.groupColors.ref}"></div>
      <p class="muted">Les liaisons existantes conservent leur code. Les paramètres sont enregistrés avec le document.</p>`;
  };
  b.addEventListener('input', e => {
    const t = e.target, d = t.dataset;
    if (d.s != null) st.surfaceTypes[d.s][d.f] = t.value.trim();
    if (d.l != null && d.f) st.liaisonTypes[d.l][d.f] = t.value.trim();
    if (d.l != null && d.fld) { const f = st.liaisonTypes[d.l].fields; const i = f.indexOf(d.fld); if (t.checked && i < 0) f.push(d.fld); if (!t.checked && i >= 0) f.splice(i, 1); }
    if (d.gc) st.groupColors[d.gc] = t.value;
  });
  b.addEventListener('click', e => {
    const d = e.target.dataset;
    if (d.dels != null) { st.surfaceTypes.splice(+d.dels, 1); draw(); }
    if (d.dell != null) { st.liaisonTypes.splice(+d.dell, 1); draw(); }
    if ('adds' in d) { st.surfaceTypes.push({ code: 'XX', label: 'Nouveau' }); draw(); }
    if ('addl' in d) { st.liaisonTypes.push({ code: 'XX', label: 'Nouvelle', fields: [], symbol: 'GEN', sA: 'PL', sB: 'PL' }); draw(); }
  });
  draw();
  const reset = el(`<button>Valeurs par défaut</button>`);
  reset.onclick = () => { Object.assign(st, clone(DEFAULT_SETTINGS), { showDetails: st.showDetails, showSurfaces: st.showSurfaces, showIsoRefs: st.showIsoRefs, showSpecs: st.showSpecs, grid: st.grid }); draw(); };
  openModal({
    title: '⚙ Paramètres', body: b, extraLeft: reset, wide: 820,
    onOk: () => { st.surfaceTypes = st.surfaceTypes.filter(t => t.code); st.liaisonTypes = st.liaisonTypes.filter(t => t.code); checkpoint(); doc.settings = st; changed(); }
  });
}

/* ===== Aide ===== */
function helpDialog() {
  const k = s => `<span class="kbd">${s}</span>`;
  openModal({
    title: '? Aide', noCancel: false, wide: 640, body: `
    <h4>Modélisation</h4><ul class="help-list">
      <li>${k('P')} <b>Nouvelle pièce</b> : nom unique, numéro (pour la nomenclature des surfaces), couleur. Avec Déplacer, double-clic sur le fond = pièce à cet endroit. Poignées bleues = étirer horizontalement / verticalement (Maj = proportionnel).</li>
      <li>Les surfaces se placent <b>automatiquement</b> le long du bord, orientées vers la pièce liée, pour limiter les croisements de liaisons. Avec Déplacer, glisser une surface la fait coulisser le long du bord et la fige (point bleu) ; décocher/cocher « Placement automatique » dans le panneau pour la libérer. Le type <b>SC — Surface complexe</b> remplace Came (les anciens types CA sont convertis à l'ouverture).</li>
      <li><b>Surfaces</b> : créées avec une liaison de contact ou une CF. Nomenclature automatique <i>TYPE.n°pièce.n°surface</i> (ex. PL.1.1). Le bouton <b>Surfaces</b> de la barre masque ou réaffiche leurs symboles et noms sans masquer les liaisons ; les marqueurs sont dessinés derrière les liaisons. Supprimer une surface ou son lien supprime le lien <b>et</b> ses deux surfaces (une surface de contact encore utilisée par une autre liaison est conservée).</li>
      <li>${k('L')} <b>Nouvelle liaison</b> : ${k('Ctrl')}+clic sur 2 pièces → fenêtre de création (type, répétition, surfaces, détails, schéma). Si 2 pièces sont déjà sélectionnées, ${k('L')} ouvre directement la fenêtre. Double-clic sur une pièce = démarrer une liaison depuis elle ; double-clic sur une liaison = modifier. Après validation, l'outil revient sur Déplacer.</li>
      <li>${k('R')} <b>Répétition</b> : ${k('Ctrl')}+clic sur les pièces répétées, puis ${k('Entrée')}. La zone est plus proche des pièces qu'un groupe fonctionnel et inclut les contacts extérieurs. Cliquer sur une surface de CF pour inclure / retirer la <b>CF entière et ses deux surfaces</b> ; les CF sont exclues par défaut. « Modifier les membres » permet de changer ce choix. « ×2 » par défaut ; glisser le nom pour le déplacer, double-clic pour revenir au placement automatique.</li>
      <li>Quand un groupe fonctionnel est réduit, les répétitions purement internes sont masquées. Si une répétition a un contact extérieur (ou une CF extérieure incluse), son contour suit seulement les <b>surfaces et les liaisons concernées</b>, y compris leurs arcs : il n'englobe pas la bulle fonctionnelle entière. Développer le groupe restitue la répétition complète.</li>
      <li>${k('G')} <b>Groupe fonctionnel</b> : ${k('Ctrl')}+clic sur les pièces, puis ${k('Entrée')}. Bouton <b>−</b> en haut du groupe (ou double-clic) : le groupe se <b>réduit en une seule ellipse</b> (pièces et liaisons internes masquées, seules les surfaces en contact avec l'extérieur restent) ; bouton <b>+</b> pour le développer. Une fois réduite, sélectionnez l’ellipse et faites glisser ses poignées bleues pour modifier sa largeur / hauteur (Maj au coin pour garder les proportions).</li>
      <li>${k('T')} <b>Système de référence</b> : ${k('Ctrl')}+clic sur les surfaces, puis ${k('Entrée')} (contour + fond réglable). Dans chaque pièce, ses surfaces restent côte à côte sur le bord, sans surface extérieure intercalée. Les références qui se chevauchent sont conservées si elles peuvent toutes rester contiguës ; une combinaison impossible est signalée et refusée.</li>
      <li>Le fond des groupes est dessiné derrière les pièces ; leur contour en pointillés est dessiné au-dessus de tout, pour bien voir les surfaces prises en compte.</li>
      <li>Les pièces déjà sélectionnées sont reprises quand on lance l'outil. Les zones suivent automatiquement les pièces quand on les déplace. « Modifier les membres » dans le panneau d'un groupe pour ajouter/retirer des éléments.</li>
      <li><b>Noms de groupes</b> : glisser le nom d'une répétition, d'un groupe fonctionnel ou d'une référence pour le déplacer. Le metaball s'étend pour l'inclure et le nom suit les membres. Double-clic ou « Position automatique du nom » pour réinitialiser. Dans un groupe fonctionnel réduit, le nom reste à l'intérieur de l'ellipse.</li>
      <li><b>Titres de répétition dans un groupe fonctionnel</b> : avec l'outil Fonctionnel ou « Modifier les membres », choisir les pièces, puis cliquer sur un titre de répétition visible pour l'inclure / le retirer. Le contour s'étend autour du titre, sans ajouter automatiquement les pièces de la répétition aux membres. Le choix est facultatif et conservé dans le JSON. Si la répétition est masquée dans un groupe réduit, son titre n'est pas dessiné.</li>
      <li>${k('N')} <b>Note</b> : choisir l’outil puis cliquer sur le graphe pour ajouter un commentaire. Les notes se déplacent avec Déplacer, se modifient par double-clic et sont conservées dans le JSON.</li>
      <li><b>ISO GPS</b> : le bouton ouvre une boîte flottante avec les outils <b>Réf. ISO</b> et <b>Spécification</b>, et les bascules pour masquer / afficher leurs symboles (utile avant export). <b>Réf. ISO</b> : cliquer sur une surface ou un groupe de références. Le symbole est un cadre carré par défaut ; le panneau de droite permet de le passer en référence partielle (cercle coupé en deux, texte haut pré-rempli « ⌀ » et texte bas, avec italique possible), de choisir l’extrémité du rappel (triangle plein par défaut, ou flèche) et de modifier les textes. Le coude bleu ajuste le rappel à deux segments, qui se branche sur l’arête du symbole la plus proche. Les lettrages utilisent la police technique ISO 3098 (osifont).</li>
      <li><b>Spécification</b> (${k('S')}) : cadre de tolérance ISO 1101. Cliquer sur une ou plusieurs surfaces / groupes de références pour choisir les cibles, puis ${k('Entrée')} crée le cadre. Chaque <b>compartiment</b> reçoit un symbole de caractéristique choisi dans une liste (droiture, planéité, position…), une indication libre (valeur, ⌀, lettre de référence…) et des indicateurs encerclés : Ⓜ maxi matière, Ⓔ gabarit / enveloppe, Ⓛ mini matière, Ⓣ tangence, Ⓕ état libre. Les compartiments se déplacent, se suppriment et s’ajoutent ; « Ajouter / retirer un lien » permet d’ajuster les cibles, et chaque lien se règle en <b>flèche, triangle plein ou trait simple</b>. Les poignées bleues déplacent le coude de chaque lien ; double-clic sur le cadre pour l’éditer dans une fenêtre.</li>
      <li><b>Nominal 0</b> : affiche / cache les bulles <i>n°pièce.0</i> reliées aux surfaces (contacts et CF). Glisser une bulle pour la déplacer à l'intérieur de sa pièce ; elle suit ensuite la pièce. Double-clic sur la bulle, ou bouton de réinitialisation dans le panneau de la pièce, pour revenir à la position initiale. La position reste conservée après enregistrement et copie. Les pièces masquées n'affichent pas de nominal.</li>
      <li>${k('C')} <b>CF</b> : clic sur deux pièces différentes → choisir un nom libre (texte, nombre ou vide) et les types des deux nouvelles surfaces. Le nom doit être unique dans la feuille, sans distinction de casse ou d'espaces extérieurs ; une seule CF sans nom est autorisée. Les anciens noms CF1, CF2… sont conservés à l'ouverture. Les surfaces sont propres à la CF ; supprimer la CF ou une de ses surfaces supprime les deux. L'option <b>Encadrer le libellé sur le trait</b> est disponible à la création et dans le panneau de la CF ; un nom vide n'affiche aucun texte ni cadre.</li>
      <li>Le panneau <b>CF</b> liste toutes les CF de la feuille : leur couleur est réglable et l'affichage peut être basculé individuellement ou toutes ensemble en <b>noir</b> ou dans leur <b>couleur enregistrée</b>. Le mode noir colore le lien, son libellé / cadre et ses surfaces propres, sans effacer les couleurs mémorisées. « Propriétés » ouvre les réglages détaillés.</li>
      <li><b>Cycles</b> : affiche, sans détailler les parcours, le nombre de cycles non indépendants passant par chaque CF et le nombre de cycles indépendants calculé par le nombre cyclomatique.</li>
      <li>${k('Y')} <b>Cycle</b> : partir d'une surface de CF, puis <b>clic ou Ctrl+clic</b> sur les surfaces ou références et terminer sur l'autre surface de <b>la même CF</b>. Une autre CF est refusée. <b>Ctrl+clic sur la dernière étape</b> ou ${k('Retour arrière')} la retire ; ${k('Échap')} annule. Surfaces, contacts, contours de références et courbes internes utilisent la <b>couleur du cycle</b> (orange par défaut), avec des pointillés passant près du centre des pièces. La CF garde son trait continu dans son propre mode noir / couleur, indépendamment du cycle. Aucun libellé « cycle N » n'est ajouté au graphe.</li>
      <li>Une référence est entourée en entier au lieu de surligner séparément ses surfaces. Tous ses contacts vers la pièce suivante sont inclus, même si une seule surface est cliquée. Ces surfaces et contacts sont également inclus dans la feuille exportée.</li>
      <li>Le panneau <b>Cycles</b> liste tous les cycles : numéro et couleur modifiables, visibilité individuelle, tout afficher dans leurs couleurs ou tout cacher, suppression. Changer la couleur d'un cycle masqué ne l'affiche pas. Sur un élément partagé, le <b>dernier cycle affiché</b> est prioritaire (priorité 1 dans le panneau) ; « Afficher en couleur » permet de le remettre au premier plan. Couleurs, visibilité et priorités sont conservées à l'enregistrement et dans les exports. La suppression d'un élément du parcours supprime aussi les cycles invalidés (notification).</li>
      <li><b>Extraire en feuille</b> ou <b>Une feuille par cycle</b> : crée des feuilles indépendantes contenant seulement les pièces, surfaces, contacts et références traversés, et une seule CF. Aucun groupe fonctionnel ou de répétition, aucune surface étrangère au cycle. Les surfaces traversées restent conservées dans ces feuilles même si leur contact avec l'extérieur est exclu. Puis utiliser PNG / SVG. Le graphe source reste intact.</li>
      <li><b>Répétitions de surface</b> : réglables dans la création des liaisons / CF et dans le panneau d'une surface. Au-delà de 1, le nombre apparaît sur une ligne au-dessus du nom (ex. 2x puis CY.1.1). La répétition d'une surface est indépendante de celle de la liaison.</li></ul>
      <p class="muted">Les répétitions uniques des liaisons ne sont pas affichées (LR plutôt que 1x LR). Axes et normales : choix x / y / z ou « Personnalisé… » pour saisir une direction libre.</p>
      <p class="muted">Dans une direction personnalisée, _ introduit un indice : u_123 affiche « u » avec une flèche et « 123 » petit et abaissé. Les indices sont conservés dans les aperçus, le graphe et les exports ; la saisie reste en texte brut. Exemple : y_12 garde l'orientation y.</p>
    <h4>Ergonomie</h4><ul class="help-list">
      <li>${k('V')} / ${k('H')} <b>Déplacer</b> (outil par défaut) : glisser un élément pour le déplacer, ou glisser sur le fond vide pour déplacer la vue. ${k('Échap')} annule l'outil actif, efface la sélection et revient à Déplacer. Après création d'une pièce, d'une liaison, d'un groupe ou d'une CF, l'outil revient à Déplacer ; l'outil Cycle reste actif pour gérer les cycles.</li>
      <li><b>Liaisons et CF courbes</b> : droites par défaut. Sélectionner le lien, cocher « Courbe » puis glisser la poignée bleue avec Déplacer pour le cintrer. « Remettre droit » annule la courbure. La courbure suit les pièces lors de leurs déplacements et reste conservée dans les fichiers et exports.</li>
      <li>Cliquer pour sélectionner ; ${k('Ctrl')}+clic pour ajouter/retirer ; ${k('Maj')}+glisser sur le fond pour ajouter une sélection rectangle. Glisser une pièce déplace ses surfaces et ses liaisons. Glisser un groupe déplace toutes ses pièces. Les raccourcis clavier et le panneau de propriétés restent disponibles dans tous les modes.</li>
      <li>${k('Ctrl+C')} ${k('Ctrl+V')} ${k('Ctrl+D')} copier / coller / dupliquer · ${k('Suppr')} supprimer · ${k('Ctrl+A')} tout · ${k('Ctrl+I')} inverser la sélection (pratique pour trier ce qu'on supprime).</li>
      <li>${k('Ctrl+Z')} / ${k('Ctrl+Y')} annuler / rétablir · flèches = déplacement fin.</li>
      <li>${k('I')} pipette et ${k('B')} pot de peinture · 🎯 pipette écran.</li>
      <li>Molette = zoom · clic droit / clic molette / ${k('Espace')}+glisser = se déplacer · ${k('0')} ajuster.</li>
      <li><b>Image de référence</b> : choisir une image locale (PNG, JPEG, WebP, GIF, BMP ou AVIF). La fenêtre apparaît en haut à droite du tableau : glisser son titre pour la déplacer et son coin inférieur droit pour la redimensionner. Molette ou + / − pour zoomer dans l'image ; glisser l'image pour la parcourir ; « Ajuster » pour la voir entière. Le bouton − du titre la cache, « Image de référence » la réaffiche, ✕ la supprime et « Remplacer » change l'image. Elle est <b>temporaire</b>, commune aux feuilles, non enregistrée dans le JSON et absente des exports PNG / SVG ; recharger la page la supprime.</li>
      <li>Feuilles en bas : ⧉ <b>Dupliquer la feuille</b> pour étudier une fermeture géométrique sans toucher au graphe d'origine. « Extraire vers une feuille » copie une zone sélectionnée.</li>
      <li>Export PNG / SVG / PDF / PowerPoint modifiable / copie d’image. Le PDF ouvre l’aperçu d’impression du navigateur : choisir « Enregistrer au format PDF ». La première page montre le graphe entier ; les pages suivantes reprennent les cycles isolés comme avec « Extraire en feuille ». Sans cycle, le PDF contient seulement la vue d’ensemble.</li>
      <li>Les exports PNG, SVG et PPTX proposent un nom et l’emplacement si le navigateur le permet. Le SVG conserve les libellés en texte ; le PPTX contient des formes et textes éditables, avec un groupe PowerPoint par pièce (bulle, nom et surfaces). Les courbes sont approximées par des segments.</li><li>Enregistrement automatique dans le navigateur + fichier .json.</li></ul>` });
}
