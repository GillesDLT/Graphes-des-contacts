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

/* Nom libre d'une surface : texte libre au choix, vide = nomenclature automatique */
function surfaceNameDialog(id) {
  const s = SF(id); if (!s) return;
  const p = P(s.pieceId), auto = `${s.type}.${p ? p.num : '?'}.${s.idx}`;
  const b = el(`<div><label for="surfName">Texte affiché sur la bulle</label>
    <input id="surfName" type="text" style="width:100%;margin-top:6px" autofocus value="${esc(s.name || '')}" placeholder="${esc(auto)} (automatique)">
    <p class="muted">Nom libre, sans contrainte de format. Laisser vide pour conserver le nom automatique ${esc(auto)}.</p></div>`);
  openModal({
    title: 'Nom de la surface ' + esc(auto), body: b, okText: 'Enregistrer',
    onOk: () => {
      const v = $('#surfName', b).value.trim();
      if (v === (s.name || '')) return true;
      checkpoint(); s.name = v; changed();
    }
  });
}

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
    const start = endPiece(cf.a), target = endPiece(cf.b);
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
    const a = endPiece(cf.a), b = endPiece(cf.b);
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
      <div class="row"><label>Nom</label><textarea id="pdName" autofocus rows="2" style="width:100%;resize:vertical" placeholder="ex. Arbre, Carter… (Entrée = nouvelle ligne)">Pièce ${num}</textarea></div>
      <div class="err" id="pdErr"></div>
      <div class="row"><label>Numéro</label><input type="number" id="pdNum" min="0" value="${num}" title="Utilisé dans la nomenclature des surfaces (ex. PL.${num}.1)"></div><div class="muted">Sert à nommer les surfaces : PL.<i>n°</i>.1 (non affiché sur la bulle)</div>
      <h4 style="margin:10px 0 4px;font-size:12px;color:#6b7280">COULEUR</h4>
      <div id="pdColor"></div>
    </div>
    <svg id="pdPrev" width="150" height="150" viewBox="-75 -75 150 150"></svg></div>`);
  const prev = () => {
    const lines = nameLines($('#pdName', b).value).slice(0, 5), fs = 15, lh = fs * 1.15;
    const y0 = 5 - (lines.length - 1) * lh / 2;
    const spans = lines.map((line, i) => `<tspan x="0" y="${r1(y0 + i * lh)}">${esc(line)}</tspan>`).join('');
    $('#pdPrev', b).innerHTML = `<ellipse rx="60" ry="60" fill="${color}" stroke="#1a1a1a" stroke-width="2"/><text text-anchor="middle" font-size="${fs}" font-weight="600" fill="${textOn(color)}">${spans}</text>`;
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
    <button data-iso="spec">${ISO_SPEC_ICON} Spécification liée</button>
    <div class="muted">Affichage</div>
    <button data-iso="isorefs"></button>
    <button data-iso="isospecs"></button>
    <div class="muted">Réf. ISO : cliquer sur une surface ou un groupe de surfaces d’une seule pièce.<br>Spécification : sélectionner des surfaces / groupes de la même pièce, puis Entrée. Copier-coller un cadre crée une copie sans lien, à rattacher ensuite si besoin. Indications dans le panneau de droite.</div>
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
  const initialNominal = !!(S().showNominalZero ?? st.showNominalZero);
  st.showNominalZero = initialNominal;
  st.torseurLetters = Object.assign({}, DEFAULT_SETTINGS.torseurLetters, st.torseurLetters || {});
  const b = el(`<div style="width:760px"></div>`);
  const draw = () => {
    const sOpts = sel => st.surfaceTypes.map(t => `<option ${t.code === sel ? 'selected' : ''}>${esc(t.code)}</option>`).join('');
    b.innerHTML = `<h4>Affichage</h4>
      <div class="settings-display">
        <label><input type="checkbox" data-display="grid" ${st.grid ? 'checked' : ''}> Afficher la grille</label>
        <label><input type="checkbox" data-display="showNominalZero" ${st.showNominalZero ? 'checked' : ''}> Afficher Nominal 0</label>
        <label><input type="checkbox" data-display="showSurfaces" ${st.showSurfaces !== false ? 'checked' : ''}> Afficher les surfaces</label>
        <label><input type="checkbox" data-display="showTorseurs" ${st.showTorseurs ? 'checked' : ''}> Afficher les torseurs</label>
      </div>
      <div class="btns"><button type="button" data-settings-refauto title="Regroupe, pour chaque pièce, les surfaces liées à une même autre pièce (au moins 2) dans un groupe de surfaces">▣ Créer les références automatiques</button><button type="button" data-settings-help>? Aide</button><button type="button" data-settings-github>GitHub ↗</button></div>
      <p class="muted">Les modifications sont appliquées avec « Valider ».</p>
      <h4>Types de surfaces</h4>
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
      <h4>Notation des torseurs</h4>
      <table class="set"><tr><th>Ligne</th><th>Colonne 1 — efforts / translations</th><th>Colonne 2 — moments / rotations</th></tr>
      ${[['x', 'X', 'L'], ['y', 'Y', 'M'], ['z', 'Z', 'N']].map(([row, kf, km]) => `<tr><td>axe ${row}</td><td><input type="text" data-t="${kf}" value="${esc(st.torseurLetters[kf])}" style="width:70px"></td><td><input type="text" data-t="${km}" value="${esc(st.torseurLetters[km])}" style="width:70px"></td></tr>`).join('')}
      </table>
      <p class="muted">Lettres affichées dans les torseurs sous les liaisons. Par défaut u v w et α β γ ; saisir X Y Z et L M N pour la notation classique. Les composantes nulles restent des zéros, et les valeurs déjà modifiées dans le panneau d’une liaison sont conservées.</p>
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
    if (d.t) st.torseurLetters[d.t] = t.value;
    if (d.gc) st.groupColors[d.gc] = t.value;
    if (d.display) st[d.display] = t.checked;
  });
  b.addEventListener('click', e => {
    const d = e.target.dataset;
    if ('settingsHelp' in d) { helpDialog(); return; }
    if ('settingsGithub' in d) { window.open('https://github.com/GillesDLT/Graphes-des-contacts', '_blank', 'noopener'); return; }
    if (d.dels != null) { st.surfaceTypes.splice(+d.dels, 1); draw(); }
    if (d.dell != null) { st.liaisonTypes.splice(+d.dell, 1); draw(); }
    if ('adds' in d) { st.surfaceTypes.push({ code: 'XX', label: 'Nouveau' }); draw(); }
    if ('addl' in d) { st.liaisonTypes.push({ code: 'XX', label: 'Nouvelle', fields: [], symbol: 'GEN', sA: 'PL', sB: 'PL' }); draw(); }
  });
  draw();
  b.addEventListener('click', e => {
    if (e.target.closest('[data-settings-refauto]')) return autoCreateReferences();
    if (e.target.closest('[data-settings-help]')) return helpDialog();
    if (e.target.closest('[data-settings-github]')) return window.open('https://github.com/GillesDLT/Graphes-des-contacts', '_blank', 'noopener');
  });
  const reset = el(`<button>Valeurs par défaut</button>`);
  reset.onclick = () => { Object.assign(st, clone(DEFAULT_SETTINGS), { showDetails: st.showDetails, showSurfaces: st.showSurfaces, showIsoRefs: st.showIsoRefs, showSpecs: st.showSpecs, grid: st.grid }); draw(); };
  openModal({
    title: '⚙ Paramètres', body: b, extraLeft: reset, wide: 820,
    onOk: () => {
      st.surfaceTypes = st.surfaceTypes.filter(t => t.code); st.liaisonTypes = st.liaisonTypes.filter(t => t.code);
      checkpoint();
      if (!!st.showNominalZero !== initialNominal) doc.sheets.forEach(s => delete s.showNominalZero);
      else st.showNominalZero = doc.settings.showNominalZero;
      doc.settings = st; changed();
    }
  });
}

/* ===== Partage par lien : le JSON voyage dans l'URL (compressé) ===== */
function b64urlEncode(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function packShareDoc() {
  const bytes = new TextEncoder().encode(JSON.stringify(doc));
  if (typeof CompressionStream === 'undefined') return 'r' + b64urlEncode(bytes);
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return 'z' + b64urlEncode(new Uint8Array(await new Response(stream).arrayBuffer()));
}
async function unpackShareDoc(payload) {
  const kind = payload[0], bytes = b64urlDecode(payload.slice(1));
  let text;
  if (kind === 'z') {
    if (typeof DecompressionStream === 'undefined') throw new Error('navigateur trop ancien pour décompresser ce lien');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    text = await new Response(stream).text();
  } else text = new TextDecoder().decode(bytes);
  return JSON.parse(text);
}
async function shareLinkDialog() {
  let link;
  try { link = location.href.split('#')[0] + '#d=' + await packShareDoc(); }
  catch (e) { return toast('Lien impossible : ' + (e?.message || e)); }
  const b = el(`<div><p>Le graphe complet est <b>dans le lien</b> : celui qui l’ouvre reçoit une copie dans un nouveau projet, sans serveur.</p>
    <div class="row"><input id="shLink" type="text" readonly value="${esc(link)}" style="width:100%"></div>
    <div class="btns"><button id="shCopy" class="primary">Copier le lien</button></div>
    <p class="muted">${Math.round(link.length / 1024)} Ko de lien${link.length > 30000 ? ' — très long : les messageries peuvent le tronquer, préférez le fichier .json au-delà' : ''}. Il reflète l’état du projet au moment du clic.</p></div>`);
  openModal({ title: '🔗 Partager par lien', body: b, okText: 'Fermer', noCancel: true, onOk: () => {} });
  $('#shLink', b).onclick = e => e.target.select();
  $('#shCopy', b).onclick = async () => {
    const input = $('#shLink', b);
    try { await navigator.clipboard.writeText(input.value); toast('Lien copié dans le presse-papier'); }
    catch (e) { input.select(); toast('Copie impossible : sélection manuelle (Ctrl+C)'); }
  };
}
/* Ouvre le document porté par un lien #d=… dans un nouveau projet. */
async function importSharedDoc() {
  const m = location.hash.match(/^#d=([A-Za-z0-9_-]+)$/);
  if (!m) return false;
  try {
    const o = await unpackShareDoc(m[1]);
    Projects.importDoc(o, (o.sheets && o.sheets[0] && o.sheets[0].name) || 'Graphe partagé');
    renderProjectBadge();
    toast('Graphe importé depuis le lien de partage (nouveau projet).');
    return true;
  } catch (e) {
    toast('Lien de partage illisible : ' + (e?.message || e));
    return false;
  } finally {
    /* window.history : le nom `history` est pris par l’historique annuler. */
    try { window.history.replaceState(null, '', location.pathname + location.search); } catch {}
  }
}

/* ===== Éditeur flottant d'une pièce (double-clic sur la pièce) ===== */
let piecePopupEl = null, piecePopupId = null;
function closePiecePopup() { if (piecePopupEl) { piecePopupEl.remove(); piecePopupEl = null; piecePopupId = null; } }
function pieceEditPopup(p) {
  if (!p) return;
  if (piecePopupEl && piecePopupId === p.id) { piecePopupEl.style.zIndex = '30'; return; }
  closePiecePopup();
  piecePopupId = p.id;
  const w = el(`<div class="popup piece-edit" role="dialog" aria-label="Éditer la pièce">
    <div class="ttl"><b>Éditer la pièce</b><button class="xbtn" title="Fermer (Échap)">✕</button></div>
    <div class="pe-body"></div></div>`);
  const draw = () => {
    const pp = P(piecePopupId);
    if (!pp) return closePiecePopup();
    const body = $('.pe-body', w);
    body.innerHTML = piecePanel(pp);
    wireProps(body, pp);
    $$('input[type=color][data-k]', body).forEach(i => i.value = rgbToHex(pp[i.dataset.k]) || '#000000');
  };
  w._draw = draw;
  draw();
  $('.xbtn', w).onclick = closePiecePopup;
  document.body.appendChild(w);
  piecePopupEl = w; w._keep = true;
  /* Centrée à l'ouverture, comme la fenêtre de création de pièce. */
  w.style.left = '50%';
  w.style.transform = 'translateX(-50%)';
  w.style.top = Math.max(30, Math.round((window.innerHeight - w.offsetHeight) / 2 - 30)) + 'px';
  /* Glisser le titre pour déplacer la fenêtre. */
  $('.ttl', w).addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    const r = w.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
    w.style.transform = 'none';
    w.style.left = r.left + 'px';
    w.style.top = r.top + 'px';
    const move = ev => {
      w.style.left = clampN(ev.clientX - ox, 0, window.innerWidth - r.width) + 'px';
      w.style.top = clampN(ev.clientY - oy, 0, window.innerHeight - r.height) + 'px';
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}
function refreshPiecePopup() { if (piecePopupEl && piecePopupEl._draw) piecePopupEl._draw(); }

/* ===== Aide ===== */
function helpDialog() {
  const k = s => `<span class="kbd">${s}</span>`;
  openModal({
    title: '? Aide', noCancel: false, wide: 640, body: `
    <h4>Modélisation</h4><ul class="help-list">
      <li>${k('P')} <b>Nouvelle pièce</b> : nom unique, numéro (pour la nomenclature des surfaces), couleur. Avec Déplacer, double-clic sur le fond = pièce à cet endroit. Poignées bleues = étirer horizontalement / verticalement (Maj = proportionnel). Le bouton <b>◯ Cercle parfait</b> du panneau de la pièce la rend circulaire en un clic. Le <b>nom accepte les retours à la ligne</b> (champ multi-lignes à la création et dans le panneau) ; il se déplace librement en le <b>glissant</b>, et un <b>double-clic sur le nom</b> ou le bouton <b>Recentre le nom</b> le remet au centre de la pièce.</li>
      <li>Les surfaces se placent <b>automatiquement</b> le long du bord, orientées vers la pièce liée, pour limiter les croisements de liaisons. Avec Déplacer, glisser une surface la fait coulisser le long du bord et la fige ; décocher/cocher « Placement automatique » dans le panneau pour la libérer. Le type <b>SC — Surface complexe</b> remplace Came (les anciens types CA sont convertis à l'ouverture).</li>
      <li><b>Surfaces</b> : créées avec une liaison de contact, une CF, ou seules avec l'outil <b>◦ Surface libre</b> (<b>U</b> : clic sur une pièce) ou le bouton <b>◦ Surface libre</b> du panneau de la pièce — une bulle isolée, sans liaison ni CF, conservée telle quelle. Une surface libre se relie ensuite en la choisissant comme <b>surface existante</b> dans une liaison ou une CF. Nomenclature automatique <i>TYPE.n°pièce.n°surface</i> (ex. PL.1.1). <b>Nom libre</b> : chaque surface peut afficher le texte de votre choix à la place — champ à la création dans les fenêtres de liaison / CF, <b>double-clic sur la bulle</b>, ou champ <b>Nom libre</b> du panneau. Laisser vide conserve la nomenclature automatique ; le bouton <b>↺ Nom automatique</b> du panneau efface le nom libre. L’option <b>Surfaces</b> dans Paramètres masque ou réaffiche leurs symboles et noms sans masquer les liaisons ; les marqueurs sont dessinés derrière les liaisons. Supprimer une surface ou son lien supprime le lien <b>et</b> ses deux surfaces dès qu'elles ne sont plus reliées à rien — y compris une surface libre (une surface encore utilisée par une autre liaison ou une CF est conservée).</li>
      <li>${k('L')} <b>Nouvelle liaison</b> : ${k('Ctrl')}+clic sur 2 pièces → fenêtre de création (type, répétition, surfaces, noms libres facultatifs, détails, schéma). Si 2 pièces sont déjà sélectionnées, ${k('L')} ouvre directement la fenêtre. Double-clic sur une pièce = ouvrir son <b>éditeur flottant</b> ; double-clic sur une liaison = modifier. Après validation, l'outil revient sur Déplacer.</li>
      <li>${k('R')} <b>Répétition</b> : ${k('Ctrl')}+clic sur les pièces répétées, puis ${k('Entrée')}. La zone est plus proche des pièces qu'un groupe fonctionnel et inclut les contacts extérieurs. Cliquer sur une surface de CF pour inclure / retirer la <b>CF entière et ses deux surfaces</b> ; les CF sont exclues par défaut. « Modifier les membres » permet de changer ce choix. « ×2 » par défaut ; glisser le nom pour le déplacer, double-clic pour revenir au placement automatique.</li>
      <li>Quand un groupe fonctionnel est réduit, les répétitions purement internes sont masquées. Si une répétition a un contact extérieur (ou une CF extérieure incluse), son contour suit seulement les <b>surfaces et les liaisons concernées</b>, y compris leurs arcs : il n'englobe pas la bulle fonctionnelle entière. Développer le groupe restitue la répétition complète.</li>
      <li>${k('G')} <b>Groupe fonctionnel</b> : ${k('Ctrl')}+clic sur les pièces, puis ${k('Entrée')}. Bouton <b>−</b> en haut du groupe (ou double-clic) : le groupe se <b>réduit en une seule ellipse</b> (pièces et liaisons internes masquées, seules les surfaces en contact avec l'extérieur restent) ; bouton <b>+</b> pour le développer. Une fois réduite, sélectionnez l’ellipse et faites glisser ses poignées bleues pour modifier sa largeur / hauteur (Maj au coin pour garder les proportions).</li>
      <li>${k('T')} <b>Système de référence</b> : ${k('Ctrl')}+clic sur les surfaces, puis ${k('Entrée')} (contour + fond réglable). Dans chaque pièce, ses surfaces restent côte à côte sur le bord, sans surface extérieure intercalée. Les références qui se chevauchent sont conservées si elles peuvent toutes rester contiguës ; une combinaison impossible est signalée et refusée.</li>
      <li>Le fond des groupes est dessiné derrière les pièces ; leur contour en pointillés est dessiné au-dessus de tout, pour bien voir les surfaces prises en compte.</li>
      <li>Les pièces déjà sélectionnées sont reprises quand on lance l'outil. Les zones suivent automatiquement les pièces quand on les déplace. « Modifier les membres » dans le panneau d'un groupe pour ajouter/retirer des éléments.</li>
      <li><b>Noms de groupes</b> : glisser le nom d'une répétition, d'un groupe fonctionnel ou d'une référence pour le déplacer. Le metaball s'étend pour l'inclure et le nom suit les membres. Double-clic ou « Position automatique du nom » pour réinitialiser. Dans un groupe fonctionnel réduit, le nom reste à l'intérieur de l'ellipse.</li>
      <li><b>Titres de répétition dans un groupe fonctionnel</b> : avec l'outil Fonctionnel ou « Modifier les membres », choisir les pièces, puis cliquer sur un titre de répétition visible pour l'inclure / le retirer. Le contour s'étend autour du titre, sans ajouter automatiquement les pièces de la répétition aux membres. Le choix est facultatif et conservé dans le JSON. Si la répétition est masquée dans un groupe réduit, son titre n'est pas dessiné.</li>
      <li>${k('N')} <b>Note</b> : choisir l’outil puis cliquer sur le graphe pour ajouter un commentaire. Les notes se déplacent avec Déplacer, se modifient par double-clic et sont conservées dans le JSON.</li>
      <li><b>ISO GPS</b> : le bouton ouvre une boîte flottante avec les outils <b>Réf. ISO</b> et <b>Spécification</b>, et les bascules pour masquer / afficher leurs symboles (utile avant export). <b>Réf. ISO</b> : cliquer sur une surface ou un groupe de surfaces d’une seule pièce ; l’indicateur suit la pièce. Le panneau de droite propose l’élément de référence carré ou la référence partielle (cercle coupé en deux), le texte, l’extrémité du rappel et un bouton de marqueur de coude (aucun, cercle ou deux cercles concentriques). Les lettrages utilisent la police technique ISO 3098 (osifont).</li>
      <li><b>Spécification</b> (${k('S')}) : cadre de tolérance ISO 1101. Cliquer sur une ou plusieurs surfaces ou groupes de surfaces appartenant à la même pièce, puis ${k('Entrée')} crée un cadre lié à ces composants. Il suit leur pièce, et les clics sur une autre pièce sont refusés. Chaque <b>section</b> reçoit un symbole de caractéristique choisi dans une liste (rectitude, planéité, position…), une indication adjacente (symbole Ø facultatif, texte, tolérance ± ou +/− en exposant/indice, ou classe comme E6). Les sections se déplacent, se suppriment et s’ajoutent ; les indications adjacentes non encadrées se placent au-dessus à gauche du cadre (une répétition de 1 n’affiche pas « 1x »). Les quatre indications complémentaires ajoutent une cellule avec symbole (symétrie, parallélisme, perpendicularité ou angle), texte, et leur marqueur distinctif (triangle, flèche ou cercle). Chaque coude peut recevoir un cercle ou deux cercles concentriques ; double-clic sur le cadre pour l’éditer. Le texte au-dessus du cadre reçoit aussi des indicateurs ajoutés après la cote : le (E) en un clic et des lettres libres (« SX »…) encadrées d’un oblong, ou d’un cercle pour une lettre unique. Le bouton « 👁 Cacher le cadre », à côté du titre « Sections du cadre », masque le cadre et ses indications complémentaires : le texte reste, souligné, et les liens partent du soulignement. Sur le cadre, chaque lien arrive perpendiculairement à l’arête (vertical depuis le dessous, horizontal depuis le côté).</li>
      <li><b>Nominal 0</b> : affiche / cache les bulles <i>n°pièce.0</i> reliées aux surfaces (contacts et CF). Glisser une bulle pour la déplacer à l'intérieur de sa pièce ; elle suit ensuite la pièce. Double-clic sur la bulle, ou bouton de réinitialisation dans le panneau de la pièce, pour revenir à la position initiale. La position reste conservée après enregistrement et copie. Les pièces masquées n'affichent pas de nominal.</li>
      <li>${k('C')} <b>CF</b> : clic sur deux pièces différentes — ou directement sur deux surfaces ou deux groupes de référence, une extrémité par pièce — puis fenêtre de création comme pour les liaisons : les <b>couleurs des deux pièces</b> sont affichées, un nom libre (texte, nombre ou vide), et pour chaque extrémité une <b>surface existante</b> de la pièce, une nouvelle surface (type + répétitions + nom libre facultatif) ou un <b>groupe de référence</b> dont le trait s'accroche au contour. Un <b>point</b> et une <b>normale</b> facultatifs (x, y, z ou direction personnalisée du type u_123) peuvent être ajoutés ; ils s'affichent avec le détail des liaisons. Le nom doit être unique dans la feuille, sans distinction de casse ou d'espaces extérieurs ; une seule CF sans nom est autorisée. Les anciens noms CF1, CF2… sont conservés à l'ouverture. Une surface existante peut être partagée avec une liaison et avec plusieurs CF (par exemple PL.1.1 — CF1 — PL.2.1 — CF2 — PL.3.1 : une même surface entre deux CF successives, dont l'anneau est alors divisé en autant de couleurs) ; supprimer la CF ou une de ses surfaces supprime aussi ce qui devient inutile. L'option <b>Encadrer le libellé sur le trait</b> est disponible à la création et dans le panneau de la CF ; un nom vide n'affiche aucun texte ni cadre.</li>
      <li><b>Torseurs</b> : l’option <b>Torseurs</b> dans Paramètres affiche / masque, sous chaque liaison, son torseur des actions transmissibles {u α ; v β ; w γ}<sub>A</sub> (sans le préfixe {T<sub>n1/n2</sub>}<sub>A</sub> =). Chaque CF affiche aussi son torseur, complet (six composantes), à côté de ceux des liaisons. Les lignes sont les axes x, y, z ; la colonne 1 donne les efforts / translations et la colonne 2 les moments / rotations. La <b>notation est configurable dans Paramètres</b> (par défaut u v w et α β γ ; saisir X Y Z et L M N pour la notation classique). Les valeurs par défaut suivent le type de liaison et son axe / normale choisis (avec la notation par défaut : Pivot sur x → α = 0, Glissière sur x → u = 0, Appui plan de normale z → w = γ = 0, Rotule → α = β = γ = 0, Ponctuelle → seul l’effort normal subsiste). Chaque valeur se modifie dans le panneau de la liaison ; <b>Valeurs par défaut</b> revient aux valeurs automatiques. Les indices reprennent les numéros des deux pièces et le <b>point d’application</b>, modifiable à côté des valeurs dans le panneau (A par défaut).</li>
      <li>Le panneau <b>CF</b> liste toutes les CF de la feuille : leur couleur est réglable et l'affichage peut être basculé individuellement ou toutes ensemble en <b>noir</b> ou dans leur <b>couleur enregistrée</b>. Le mode noir colore le lien, son libellé / cadre et ses surfaces propres, sans effacer les couleurs mémorisées. « Propriétés » ouvre les réglages détaillés.</li>
      <li><b>Cycles</b> : affiche, sans détailler les parcours, le nombre de cycles non indépendants passant par chaque CF et le nombre de cycles indépendants calculé par le nombre cyclomatique.</li>
      <li>${k('Y')} <b>Cycle</b> : partir d'une surface de CF, puis <b>clic ou Ctrl+clic</b> sur les surfaces ou références dans l'ordre voulu et terminer sur l'autre surface de <b>la même CF</b> — ou sur le <b>groupe de surfaces qui la contient</b>. Le parcours en cours est tracé <b>en gras</b>, ses nœuds sont surlignés, et sa <b>couleur se choisit dès le début</b> (barre du haut ou panneau Cycles). Le panneau de droite affiche le parcours en <b>arborescence</b> : monter / descendre une étape (↑ ↓ ou <b>glisser-déposer</b>, les liaisons sont recalculées), en <b>insérer une à la position voulue</b> (＋ puis cliquer la surface), en supprimer une (✕, les voisins sont reconnectés). Un <b>clic sur une liaison</b> ajoute directement la surface concernée, et <b>Ctrl+Z</b> recule d’une étape. Pendant la création, <b>glisser le fond</b> déplace la vue. Une autre CF du parcours est refusée, mais une surface sans liaison avec la précédente est acceptée : le cycle trace alors un <b>trait direct</b> en affichant un avertissement. Les courbes du cycle se <b>glissent à la souris</b> (zone de clic large, tous outils) et se sculptent avec les <b>poignées carrées Bézier</b> (lignes de conduite pointillées) ; un clic sur une courbe sélectionne le cycle. <b>Ctrl+clic sur la dernière étape</b> ou ${k('Retour arrière')} la retirent ; ${k('Échap')} annule. Dans une pièce, le trajet d'un groupe de surfaces est tracé par ses membres : le cycle reste visiblement fermé. La CF garde son trait continu dans son propre mode noir / couleur.</li>
      <li>Une référence est entourée en entier au lieu de surligner séparément ses surfaces. Tous ses contacts vers la pièce suivante sont inclus, même si une seule surface est cliquée. Ces surfaces et contacts sont également inclus dans la feuille exportée.</li>
      <li>Le panneau <b>Cycles</b> liste tous les cycles : numéro et couleur modifiables, visibilité individuelle, tout afficher dans leurs couleurs ou tout cacher, suppression, et <b>« Modifier le parcours… »</b> pour retirer, insérer ou remplacer des étapes (le cycle en modification est tracé en gras, comme à la création ; la nouvelle étape s'insère avant la fermeture). Changer la couleur d'un cycle masqué ne l'affiche pas. Sur un élément partagé, le <b>dernier cycle affiché</b> est prioritaire (priorité 1 dans le panneau) ; « Afficher en couleur » permet de le remettre au premier plan. Plusieurs cycles sur un même lien sont tracés <b>côte à côte</b> au lieu de se superposer. Couleurs, visibilité et priorités sont conservées à l'enregistrement et dans les exports. La suppression d'un élément du parcours supprime aussi les cycles invalidés (notification).</li>
      <li><b>Extraire en feuille</b> ou <b>Une feuille par cycle</b> : crée des feuilles indépendantes contenant seulement les pièces, surfaces, contacts et références traversés, et une seule CF. Aucun groupe fonctionnel ou de répétition, aucune surface étrangère au cycle. Les surfaces traversées restent conservées dans ces feuilles même si leur contact avec l'extérieur est exclu. Puis utiliser PNG / SVG. Le graphe source reste intact.</li>
      <li><b>Répétitions de surface</b> : réglables dans la création des liaisons / CF et dans le panneau d'une surface. Au-delà de 1, le nombre apparaît sur une ligne au-dessus du nom (ex. 2x puis CY.1.1). La répétition d'une surface est indépendante de celle de la liaison.</li></ul>
      <p class="muted">Les répétitions uniques des liaisons ne sont pas affichées (LR plutôt que 1x LR). Axes et normales : choix x / y / z ou « Personnalisé… » pour saisir une direction libre.</p>
      <p class="muted">Dans une direction personnalisée, _ introduit un indice : u_123 affiche « u » avec une flèche et « 123 » petit et abaissé. Les indices sont conservés dans les aperçus, le graphe et les exports ; la saisie reste en texte brut. Exemple : y_12 garde l'orientation y.</p>
    <h4>Ergonomie</h4><ul class="help-list">
      <li>${k('V')} / ${k('H')} <b>Déplacer</b> (outil par défaut) : glisser un élément pour le déplacer, ou glisser sur le fond vide pour déplacer la vue. ${k('Échap')} annule l'outil actif, efface la sélection et revient à Déplacer. Après création d'une pièce, d'une liaison, d'un groupe ou d'une CF, l'outil revient à Déplacer ; l'outil Cycle reste actif pour gérer les cycles.</li>
      <li><b>Liaisons et CF courbes</b> : droites par défaut. Sélectionner le lien, cocher « Courbe » puis glisser la poignée bleue ronde avec Déplacer pour le cintrer (forme simple) ; les deux <b>poignées carrées</b> déplacent les points de contrôle d'une <b>courbe de Bézier</b> pour sculpter librement la forme. « Remettre droit » annule la courbure, « Forme simple » revient à la courbure sans poignées. La courbe suit les pièces lors de leurs déplacements et reste conservée dans les fichiers et exports.</li>
      <li>Cliquer pour sélectionner ; ${k('Ctrl')}+clic pour ajouter/retirer ; ${k('Maj')}+glisser sur le fond pour ajouter une sélection rectangle. Glisser une pièce déplace ses surfaces et ses liaisons. Glisser un groupe déplace toutes ses pièces. Les raccourcis clavier et le panneau de propriétés restent disponibles dans tous les modes.</li>
      <li>${k('Ctrl+C')} ${k('Ctrl+V')} ${k('Ctrl+D')} copier / coller / dupliquer · ${k('Suppr')} supprimer · ${k('Ctrl+A')} tout · ${k('Ctrl+I')} inverser la sélection (pratique pour trier ce qu'on supprime).</li>
      <li>${k('Ctrl+Z')} / ${k('Ctrl+Y')} annuler / rétablir · flèches = déplacement fin.</li>
      <li>${k('I')} pipette et ${k('B')} pot de peinture ; les couleurs sont aussi modifiables dans le panneau de propriétés.</li>
      <li>Molette = zoom · clic droit / clic molette / ${k('Espace')}+glisser = se déplacer · ${k('0')} ajuster. <b>Tactile / tablette</b> : pincer avec deux doigts pour zoomer, glisser pour déplacer la vue.</li>
      <li><b>Petits écrans</b> : le chevron ${k('⌃')} de la barre du haut réduit la barre d’outils (elle rouvre avec ${k('⌄')}) et le bouton ${k('◧')} affiche / cache le panneau de droite.</li>
      <li><b>Verrouillage</b> (Accueil) : les boutons <b>Pièces</b> et <b>Surfaces</b> verrouillent la position de tous les éléments concernés — plus de déplacement par mégarde (glisser et flèches bloqués) ; les tailles et noms restent modifiables.</li>
      <li><b>Double-clic sur une pièce</b> : son <b>éditeur flottant</b> s’ouvre au milieu de l’écran (nom, numéro, couleurs, surfaces, actions) et reste déplaçable par son titre.</li>
      <li><b>Lien de partage</b> (Fichier) : le graphe complet est compressé <b>dans l’URL</b> ; celui qui l’ouvre reçoit une copie dans un nouveau projet, sans serveur ni fichier à envoyer.</li>
      <li><b>Image de référence</b> : choisir une image locale (PNG, JPEG, WebP, GIF, BMP ou AVIF). La fenêtre apparaît en haut à droite du tableau : glisser son titre pour la déplacer et son coin inférieur droit pour la redimensionner. Molette ou + / − pour zoomer dans l'image ; glisser l'image pour la parcourir ; « Ajuster » pour la voir entière. Le bouton − du titre la cache, « Image de référence » la réaffiche, ✕ la supprime et « Remplacer » change l'image. Elle est <b>temporaire</b>, commune aux feuilles, non enregistrée dans le JSON et absente des exports PNG / SVG ; recharger la page la supprime.</li>
      <li>Feuilles en bas : ⧉ <b>Dupliquer la feuille</b> pour étudier une fermeture géométrique sans toucher au graphe d'origine. « Extraire vers une feuille » copie une zone sélectionnée.</li>
      <li>Export PNG / SVG / PDF / PowerPoint modifiable / copie d’image. Le PDF ouvre l’aperçu d’impression du navigateur : choisir « Enregistrer au format PDF ». La première page montre le graphe entier ; les pages suivantes reprennent les cycles isolés comme avec « Extraire en feuille ». Sans cycle, le PDF contient seulement la vue d’ensemble.</li>
      <li>Les exports PNG, SVG et PPTX proposent un nom et l’emplacement si le navigateur le permet. Le SVG conserve les libellés en texte ; le PPTX contient des formes et textes éditables, avec un groupe PowerPoint par pièce (bulle, nom et surfaces). Les courbes sont approximées par des segments.</li><li>Enregistrement automatique dans le navigateur + fichier .json.</li></ul>` });
}
