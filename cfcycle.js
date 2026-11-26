'use strict';

const cfName = c => typeof c.name === 'string' ? c.name : 'CF' + c.num;
const cfDisplayName = c => cfName(c) || 'CF sans nom';
const cfRenderColor = c => c.inColor === false ? '#000000' : c.color;
const DEFAULT_CYCLE_COLOR = '#e87900';
const cycleName = c => 'cycle ' + c.num;
const nextCFNum = (s = S()) => Math.max(0, ...s.cfgs.map(c => c.num || 0)) + 1;
const nextCycleNum = (s = S()) => Math.max(0, ...s.cycles.map(c => c.num || 0)) + 1;
const cfOfSurfaceList = (id, s = S()) => s.cfgs.filter(c => c.a === id || c.b === id);
const cfOfSurface = (id, s = S()) => cfOfSurfaceList(id, s)[0];
function setCFColor(c, color) {
  const previous = c.color; c.color = color;
  for (const id of [c.a, c.b]) { const s = SF(id); if (s && s.stroke === previous) s.stroke = color; }
}
function cycleDisplayOrder(s = S()) {
  return s.cycles.map((c, i) => ({ c, order: c.displayOrder ?? i + 1 }))
    .sort((a, b) => a.order - b.order).map(x => x.c);
}
const nextCycleDisplayOrder = (s = S()) => Math.max(0, ...s.cycles.map((c, i) => c.displayOrder ?? i + 1)) + 1;
function setCycleVisible(c, visible) {
  c.visible = visible;
  if (visible) c.displayOrder = nextCycleDisplayOrder();
}
const cfNameKey = name => String(name).trim().toLowerCase();
function cfNameError(name, list = S().cfgs, exceptId) {
  if (typeof name !== 'string') return 'Le nom de la CF doit être un texte.';
  if (list.some(c => c.id !== exceptId && cfNameKey(cfName(c)) === cfNameKey(name)))
    return name.trim() ? 'Ce nom de CF est déjà utilisé.' : 'Une CF sans nom existe déjà.';
  return '';
}
function nextCFName(s = S()) {
  let num = nextCFNum(s);
  while (cfNameError('CF' + num, s.cfgs)) num++;
  return 'CF' + num;
}
function copiedCFName(name, s = S()) {
  if (!cfNameError(name, s.cfgs)) return name;
  if (!name) return nextCFName(s);
  let num = 2;
  while (cfNameError(name + ' (' + num + ')', s.cfgs)) num++;
  return name + ' (' + num + ')';
}
function numberError(num, list, exceptId) {
  if (!Number.isSafeInteger(num) || num < 1) return 'Choisissez un numéro entier positif.';
  if (list.some(c => c.id !== exceptId && c.num === num)) return 'Ce numéro est déjà utilisé.';
  return '';
}

function migrateCFs(s) {
  const taken = new Set(), names = new Set();
  for (const c of s.cfgs) {
    if (c.dedicated) {
      const pieceOf = id => {
        const f = s.surfaces.find(x => x.id === id); if (f) return f.pieceId;
        const g = s.groups.find(x => x.id === id && x.kind === 'ref');
        if (g) { const m = g.members.map(mid => s.surfaces.find(x => x.id === mid)).find(Boolean); return m ? m.pieceId : null; }
        return null;
      };
      const pa = pieceOf(c.a), pb = pieceOf(c.b);
      if (!pa || !pb) throw new Error('Une CF doit relier deux surfaces ou groupes de référence existants.');
      if (pa === pb) throw new Error('Une CF doit relier deux pièces différentes.');
    }
    if (c.name != null && typeof c.name !== 'string') throw new Error('Le nom de la CF doit être un texte.');
    const inferred = Number(String(c.name || '').match(/\d+/)?.[0]);
    let num = Number.isSafeInteger(c.num) && c.num > 0 ? c.num : Number.isSafeInteger(inferred) && inferred > 0 ? inferred : 1;
    while (taken.has(num)) num++;
    taken.add(num); c.num = num;
    if (c.name == null || (!c.dedicated && /^CFG(?:\s*\d+)?$/i.test(c.name.trim()))) c.name = 'CF' + num;
    c.name = c.name.trim();
    const key = cfNameKey(c.name);
    if (names.has(key)) throw new Error(c.name ? 'Nom de CF déjà utilisé : ' + c.name : 'Plusieurs CF sans nom.');
    names.add(key);
    if (!c.dedicated) {
      for (const side of ['a', 'b']) {
        const old = s.surfaces.find(f => f.id === c[side]);
        const p = s.pieces.find(p => p.id === (old ? old.pieceId : c[side]));
        if (!p) throw new Error('CF invalide : pièce ou surface introuvable.');
        const idx = Math.max(0, ...s.surfaces.filter(f => f.pieceId === p.id).map(f => f.idx)) + 1;
        const other = s.surfaces.find(f => f.id === c[side === 'a' ? 'b' : 'a']);
        const q = s.pieces.find(p => p.id === (other ? other.pieceId : c[side === 'a' ? 'b' : 'a']));
        const f = { id: uid(), pieceId: p.id, type: old ? old.type : 'PL', idx, dx: 0, dy: 0, r: 24,
          color: '#ffffff', stroke: c.color || '#b42318', sw: SURF_SW, name: '', pinned: false,
          ang: old ? old.ang : Math.atan2((q ? q.y : p.y) - p.y, (q ? q.x : p.x + 1) - p.x) };
        s.surfaces.push(f); c[side] = f.id;
      }
      if (s.surfaces.find(f => f.id === c.a).pieceId === s.surfaces.find(f => f.id === c.b).pieceId)
        throw new Error('Ancienne CFG sur une seule pièce : choisissez deux pièces différentes pour créer la CF.');
    }
    c.dedicated = true; c.color = c.color || '#b42318';
    if (c.inColor == null) c.inColor = true;
    if (typeof c.inColor !== 'boolean') throw new Error('Mode de couleur de CF invalide.');
    const det = (c.details && typeof c.details === 'object') ? c.details : {};
    if (det.point != null && typeof det.point !== 'string') throw new Error('Point de CF invalide.');
    if (det.normale != null && typeof det.normale !== 'string') throw new Error('Normale de CF invalide.');
    c.details = { point: det.point || '', normale: det.normale || '' };
    for (const key of ['loop', 'pathIdx', 'nPaths', 'showLoop']) delete c[key];
  }
}

const cfEndValid = id => !!(SF(id) || refGroupOf(id));
function createCF(aId, bId, name = nextCFName(), details = {}) {
  if (!cfEndValid(aId) || !cfEndValid(bId) || endPiece(aId) === endPiece(bId))
    throw new Error('Une CF nécessite deux extrémités (surface ou groupe de référence) sur deux pièces différentes.');
  name = String(name).trim();
  const err = cfNameError(name);
  if (err) throw new Error(err);
  const c = { id: uid(), a: aId, b: bId, num: nextCFNum(), name, color: '#b42318', inColor: true, dedicated: true, labelBox: false,
    details: { point: String(details.point || '').trim(), normale: String(details.normale || '').trim() } };
  [aId, bId].forEach(id => { const s = SF(id); if (s) s.stroke = c.color; });
  S().cfgs.push(c);
  return c;
}
/* Détails de la CF affichés sur le graphe : point et/ou normale, comme les liaisons. */
function cfDetailText(c) {
  const d = c.details || {}, parts = [];
  if (d.point) parts.push(`(${d.point})`);
  if (d.normale) parts.push(`n(${vec(d.normale)})`);
  return parts.join(' ');
}

function cfDialog(pidA, pidB, editId, pre = {}) {
  const c = editId ? C(editId) : null, A = P(pidA), B = P(pidB);
  if (!A || !B || A.id === B.id) return toast('Choisissez deux pièces différentes pour la CF.');
  const sa = c && SF(c.a), sb = c && SF(c.b);
  /* Extrémité déjà fixée : surface existante, groupe de référence (référence ISO)
     ou surface cliquée sur le graphe. */
  const preEnd = (id, piece) => {
    if (!id) return null;
    const s = SF(id); if (s && s.pieceId === piece.id) return { kind: 'ex', id: s.id, count: s.count || 1 };
    const g = refGroupOf(id); if (g && endPiece(g.id) === piece.id) return { kind: 'grp', id: g.id, count: 1 };
    return null;
  };
  const endA = c ? preEnd(c.a, A) : preEnd(pre.a, A);
  const endB = c ? preEnd(c.b, B) : preEnd(pre.b, B);
  const det = Object.assign({ point: '', normale: '' }, c && c.details ? clone(c.details) : {});
  const normMode = ['x', 'y', 'z'].includes(det.normale) ? det.normale : det.normale ? 'custom' : 'none';
  const state = {
    sa: endA ? endA.kind + ':' + endA.id : 'new:PL', sb: endB ? endB.kind + ':' + endB.id : 'new:PL',
    countA: endA ? endA.count : 1, countB: endB ? endB.count : 1,
    nameA: '', nameB: ''
  };
  const surfOptions = (p, val) => {
    const news = doc.settings.surfaceTypes.map(t => `<option value="new:${esc(t.code)}" ${val === 'new:' + t.code ? 'selected' : ''}>${esc(t.code)} — ${esc(t.label)}</option>`).join('');
    const ex = S().surfaces.filter(s => s.pieceId === p.id)
      .map(s => {
        const others = cfOfSurfaceList(s.id).filter(f => f.id !== c?.id).map(f => cfDisplayName(f));
        return `<option value="ex:${s.id}" ${val === 'ex:' + s.id ? 'selected' : ''}>${esc(sname(s))}${others.length ? ' — ' + esc(others.join(', ')) : ''}</option>`;
      }).join('');
    const grps = S().groups.filter(g => g.kind === 'ref' && endPiece(g.id) === p.id)
      .map(g => `<option value="grp:${g.id}" ${val === 'grp:' + g.id ? 'selected' : ''}>${esc(g.name || 'Référence')} — groupe de ${g.members.length} surface(s)</option>`).join('');
    return `<optgroup label="Nouvelle surface">${news}</optgroup>${ex ? `<optgroup label="Surfaces existantes">${ex}</optgroup>` : ''}${grps ? `<optgroup label="Groupes de référence">${grps}</optgroup>` : ''}`;
  };
  const pieceBox = (p, id) => { const d = $(id, body); d.style.background = p.color; d.style.color = textOn(p.color); d.innerHTML = esc(p.name).replace(/\n/g, '<br>'); };
  const body = el(`<div style="width:560px">
    <div class="ld-head"><div class="ld-piece" id="cfA"></div><div class="ld-piece" id="cfB"></div></div>
    <div class="row"><label>Nom de la CF</label><input id="cfName" type="text" value="${esc(c ? cfName(c) : nextCFName())}" autofocus placeholder="Texte, nombre ou vide"></div>
    <div class="ld-grid">
      <label><span class="chip" id="cfChipA"></span></label>
      <div class="surface-choice"><select data-side="sa">${surfOptions(A, state.sa)}</select><label class="surface-repeat" title="Répétitions de la surface A" ${state.sa.startsWith('grp:') ? 'style="display:none"' : ''}>× <input aria-label="Répétitions surface A" type="number" min="1" step="1" data-scount="countA" value="${state.countA}"></label><input type="text" class="surface-name" data-sname="nameA" value="${esc(state.nameA)}" placeholder="Nom libre (facultatif)" title="Texte libre affiché sur la bulle à la place de la nomenclature automatique ; vide = nom automatique" aria-label="Nom libre de la surface A" ${state.sa.startsWith('new:') ? '' : 'hidden'}></div>
      <label><span class="chip" id="cfChipB"></span></label>
      <div class="surface-choice"><select data-side="sb">${surfOptions(B, state.sb)}</select><label class="surface-repeat" title="Répétitions de la surface B" ${state.sb.startsWith('grp:') ? 'style="display:none"' : ''}>× <input aria-label="Répétitions surface B" type="number" min="1" step="1" data-scount="countB" value="${state.countB}"></label><input type="text" class="surface-name" data-sname="nameB" value="${esc(state.nameB)}" placeholder="Nom libre (facultatif)" title="Texte libre affiché sur la bulle à la place de la nomenclature automatique ; vide = nom automatique" aria-label="Nom libre de la surface B" ${state.sb.startsWith('new:') ? '' : 'hidden'}></div>
      <label>Détails <span class="muted">(facultatif)</span></label>
      <div class="dets">
        <label title="Point / centre">pt</label><input type="text" data-det="point" value="${esc(det.point)}" placeholder="—" title="Point / centre (facultatif), ex. A, O">
        <label title="Normale">n</label><span class="vector-editor"><select id="cfNormMode" aria-label="Normale">${[['none', 'Aucune'], ['x', 'x'], ['y', 'y'], ['z', 'z'], ['custom', 'Personnalisé…']].map(([v, lab]) => `<option value="${v}" ${normMode === v ? 'selected' : ''}>${lab}</option>`).join('')}</select><input type="text" id="cfNormCustom" value="${esc(normMode === 'custom' ? det.normale : '')}" placeholder="ex. u_123, -x…" title="Un _ suivi d'un suffixe affiche ce suffixe en indice (ex. u_123)." aria-label="Normale personnalisée" ${normMode === 'custom' ? '' : 'hidden'}></span>
      </div>
    </div>
    <label><input id="cfLabelBox" type="checkbox" ${c?.labelBox ? 'checked' : ''}> Encadrer le libellé sur le trait</label>
    <p class="muted">Deux extrémités entre les deux pièces : surface existante, nouvelle surface ou groupe de référence (référence ISO), dont le lien s'accroche au contour du groupe. Une surface existante peut servir à plusieurs CF ; son nom affiche alors les autres CF déjà reliées. Le nom est libre et unique dans la feuille, y compris le nom vide (une seule CF sans nom). Point et normale sont affichés avec le détail des liaisons.</p>
    <div class="err" id="cfErr"></div></div>`);
  pieceBox(A, '#cfA'); pieceBox(B, '#cfB');
  $('#cfChipA', body).style.background = A.color; $('#cfChipA', body).style.color = textOn(A.color); $('#cfChipA', body).innerHTML = esc(A.name).replace(/\n/g, '<br>');
  $('#cfChipB', body).style.background = B.color; $('#cfChipB', body).style.color = textOn(B.color); $('#cfChipB', body).innerHTML = esc(B.name).replace(/\n/g, '<br>');
  body.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.sname) { state[t.dataset.sname] = t.value; return; }
    if (t.dataset.side) {
      state[t.dataset.side] = t.value;
      const key = t.dataset.side === 'sa' ? 'countA' : 'countB';
      state[key] = t.value.startsWith('ex:') ? SF(t.value.slice(3)).count || 1 : 1;
      $(`[data-scount="${key}"]`, body).value = state[key];
      const rep = $(`[data-scount="${key}"]`, body)?.closest('.surface-repeat');
      if (rep) rep.style.display = t.value.startsWith('grp:') ? 'none' : '';
      const nameInp = $(`[data-sname="${t.dataset.side === 'sa' ? 'nameA' : 'nameB'}"]`, body);
      if (nameInp) nameInp.hidden = !t.value.startsWith('new:');
    }
    if (t.dataset.scount) state[t.dataset.scount] = Number(t.value);
    if (t.id === 'cfNormMode') { const inp = $('#cfNormCustom', body); inp.hidden = t.value !== 'custom'; if (!inp.hidden) inp.focus(); }
  });
  openModal({
    title: c ? 'Modifier ' + cfDisplayName(c) : 'Nouvelle CF', body, okText: c ? 'Valider' : 'Créer la CF', wide: 610,
    onOk: () => {
      const name = $('#cfName', body).value.trim(), err = cfNameError(name, S().cfgs, c && c.id);
      if (err) { $('#cfErr', body).textContent = err; return false; }
      const countA = Number($('[data-scount="countA"]', body).value), countB = Number($('[data-scount="countB"]', body).value);
      if (![countA, countB].every(n => Number.isSafeInteger(n) && n > 0)) { $('#cfErr', body).textContent = 'Les répétitions doivent être des entiers positifs.'; return false; }
      const mode = $('#cfNormMode', body).value;
      let normale = '';
      if (mode === 'custom') {
        normale = $('#cfNormCustom', body).value.trim();
        if (!normale) { $('#cfNormCustom', body).classList.add('invalid'); $('#cfErr', body).textContent = 'Précisez la direction personnalisée ou choisissez x, y ou z.'; return false; }
      } else if (mode !== 'none') normale = mode;
      const point = $('[data-det="point"]', body).value.trim();
      if (state.sa === state.sb && !state.sa.startsWith('new:')) { $('#cfErr', body).textContent = 'Les deux extrémités ne peuvent pas être identiques.'; return false; }
      const plannedSurfaces = [];
      const endId = (val, p) => {
        if (val.startsWith('ex:') || val.startsWith('grp:')) return val.slice(val.indexOf(':') + 1);
        const f = { id: uid(), pieceId: p.id }; plannedSurfaces.push(f); return f.id;
      };
      const plannedLinks = [{ id: c ? c.id : uid(), kind: 'cfg', a: endId(state.sa, A), b: endId(state.sb, B) }];
      const layoutError = referenceCreationError(plannedSurfaces, plannedLinks, c ? [c.id] : []);
      if (layoutError) { $('#cfErr', body).textContent = layoutError; return false; }
      checkpoint();
      const angAB = Math.atan2(B.y - A.y, B.x - A.x);
      const resolve = (val, p, ang, custom) => {
        if (val.startsWith('ex:') || val.startsWith('grp:')) return val.slice(val.indexOf(':') + 1);
        const id = createSurface(p.id, val.slice(4), null, ang).id;
        const nm = String(custom || '').trim();
        if (nm) SF(id).name = nm;
        return id;
      };
      const aId = resolve(state.sa, A, angAB, state.nameA), bId = resolve(state.sb, B, angAB + Math.PI, state.nameB);
      if (SF(aId)) SF(aId).count = countA;
      if (SF(bId)) SF(bId).count = countB;
      let cf = c;
      if (cf) Object.assign(cf, { a: aId, b: bId, name, details: { point, normale } });
      else cf = createCF(aId, bId, name, { point, normale });
      cf.labelBox = $('#cfLabelBox', body).checked;
      cleanupOrphans();
      setTool('select'); sel.clear(); sel.add(cf.id); changed(); updateTip();
    }
  });
}
function cfListPanel() {
  const cs = S().cfgs;
  return `<h3>CF</h3><p class="muted">Cliquer sur deux pièces, deux surfaces ou deux groupes de référence (une extrémité par pièce) pour créer une CF : chaque extrémité est alors l'élément cliqué ou une nouvelle surface. Les modes noir / couleur ne changent pas sa couleur enregistrée.</p>
    ${pick.length === 1 && (SF(pick[0]) || P(pick[0]) || G(pick[0])) ? `<p>Première extrémité : <b>${esc(endName(pick[0]))}</b>. Choisir la deuxième sur une autre pièce.</p>` : ''}
    <h4>CF existantes (${cs.length})</h4>
    <div class="btns"><button data-cfa="blackall" ${cs.length ? '' : 'disabled'}>Toutes en noir</button><button data-cfa="colorall" ${cs.length ? '' : 'disabled'}>Toutes en couleur</button></div>
    ${cs.map(c => `<div class="cycle-card" data-cf="${c.id}">
      <h4 style="color:${cfRenderColor(c)}">${esc(cfDisplayName(c))}</h4>
      <div class="row"><label>Affichage</label><select data-cf-display="${c.id}" aria-label="Affichage de ${esc(cfDisplayName(c))}"><option value="color" ${c.inColor !== false ? 'selected' : ''}>Couleur</option><option value="black" ${c.inColor === false ? 'selected' : ''}>Noir</option></select>
        <input type="color" data-cf-color="${c.id}" value="${rgbToHex(c.color)}" aria-label="Couleur de ${esc(cfDisplayName(c))}" title="Couleur enregistrée de la CF"></div>
      <div class="muted">${esc(endName(c.a))} ⟷ ${esc(endName(c.b))}</div>
      <div class="btns"><button data-cfa="properties" data-cfid="${c.id}">Propriétés</button><button data-cfa="edit" data-cfid="${c.id}">Modifier…</button><button data-cfa="delete" data-cfid="${c.id}" class="danger">Supprimer</button></div>
    </div>`).join('') || '<p class="muted">Aucune CF. Cliquer sur deux pièces pour en créer une.</p>'}`;
}
function cfListAction(action, id) {
  const c = C(id);
  if (action === 'blackall' || action === 'colorall') {
    checkpoint(); S().cfgs.forEach(c => c.inColor = action === 'colorall'); changed(); return;
  }
  if (action === 'properties' && c) { setTool('select'); sel.clear(); sel.add(c.id); changed(); return; }
  if (action === 'edit' && c) return cfDialog(endPiece(c.a), endPiece(c.b), c.id);
  if (action === 'delete' && c) return askConfirm('Supprimer la CF', `Supprimer « ${esc(cfDisplayName(c))} », ses surfaces devenues inutiles et les cycles associés ?`, () => {
    checkpoint(); deleteIds([c.id]); sel.clear(); changed();
  });
}

/* A reference is one node; its contacts towards the adjacent piece travel together. */
function nodeSurfaces(id, s = S()) {
  const f = s.surfaces.find(f => f.id === id);
  if (f) return [f];
  const g = s.groups.find(g => g.id === id && g.kind === 'ref');
  return g ? g.members.map(id => s.surfaces.find(f => f.id === id)).filter(Boolean) : [];
}
function cycleEdges(from, to, s = S()) {
  if (from === to) return [];
  const result = [], as = nodeSurfaces(from, s), bs = nodeSurfaces(to, s);
  const ga = s.groups.some(g => g.id === from && g.kind === 'ref'), gb = s.groups.some(g => g.id === to && g.kind === 'ref');
  for (const a of as) for (const b of bs) {
    if (a.pieceId === b.pieceId) result.push({ kind: 'internal', from, to, sa: a.id, sb: b.id });
  }
  for (const l of s.liaisons) for (const [sa, sb] of [[l.a, l.b], [l.b, l.a]]) {
    const a = s.surfaces.find(f => f.id === sa), b = s.surfaces.find(f => f.id === sb);
    if (!a || !b || a.pieceId === b.pieceId) continue;
    const exactA = as.some(f => f.id === sa), exactB = bs.some(f => f.id === sb);
    const onA = exactA || (gb && as.some(f => f.pieceId === a.pieceId));
    const onB = exactB || (ga && bs.some(f => f.pieceId === b.pieceId));
    if (onA && onB && (!ga && !gb || exactA || exactB)) result.push({ kind: 'contact', from, to, sa, sb, linkId: l.id });
  }
  return result;
}
function referenceStepLinks(from, to, s = S()) {
  const links = new Set();
  for (const [refId, nextId] of [[from, to], [to, from]]) {
    const ref = s.groups.find(g => g.id === refId && g.kind === 'ref');
    if (!ref) continue;
    const nextPieces = new Set(nodeSurfaces(nextId, s).map(f => f.pieceId));
    for (const l of s.liaisons) for (const [a, b] of [[l.a, l.b], [l.b, l.a]]) {
      const sa = s.surfaces.find(f => f.id === a), sb = s.surfaces.find(f => f.id === b);
      if (ref.members.includes(a) && sa && sb && sa.pieceId !== sb.pieceId && nextPieces.has(sb.pieceId)) links.add(l.id);
    }
  }
  return links;
}
function cycleContents(c, s = S()) {
  const surfaces = new Set(), references = new Set(), links = new Set(), covered = new Set(), cfs = new Set();
  for (const id of c.nodes) {
    const ref = s.groups.find(g => g.id === id && g.kind === 'ref');
    if (ref) {
      references.add(ref.id);
      ref.members.forEach(id => { surfaces.add(id); covered.add(id); });
    } else if (s.surfaces.some(f => f.id === id)) surfaces.add(id);
  }
  for (const e of c.edges) {
    surfaces.add(e.sa); surfaces.add(e.sb);
    if (e.linkId) links.add(e.linkId);
    referenceStepLinks(e.from, e.to, s).forEach(id => links.add(id));
  }
  for (const l of s.liaisons.filter(l => links.has(l.id))) { surfaces.add(l.a); surfaces.add(l.b); }
  const cf = s.cfgs.find(cf => cf.id === c.cfId);
  if (cf) {
    cfs.add(cf.id);
    for (const id of [cf.a, cf.b]) {
      if (s.surfaces.some(f => f.id === id)) surfaces.add(id);
      else {
        const g = s.groups.find(x => x.id === id && x.kind === 'ref');
        if (g) { references.add(g.id); g.members.forEach(m => { surfaces.add(m); covered.add(m); }); }
      }
    }
  }
  return { surfaces, references, links, covered, cfs };
}
function visibleCycleContents(cycles, s = S()) {
  const result = { surfaces: new Set(), references: new Set(), links: new Set(), covered: new Set(), cfs: new Set(),
    colors: { surfaces: new Map(), references: new Map(), links: new Map() }, linksBy: new Map() };
  for (const c of cycles) {
    const contents = cycleContents(c, s);
    for (const key of ['surfaces', 'references', 'links', 'cfs']) contents[key].forEach(id => result[key].add(id));
    for (const key of ['surfaces', 'references', 'links']) contents[key].forEach(id => result.colors[key].set(id, c.color || DEFAULT_CYCLE_COLOR));
    contents.links.forEach(id => {
      const list = result.linksBy.get(id) || (result.linksBy.set(id, []), result.linksBy.get(id));
      if (!list.includes(c)) list.push(c);
    });
    contents.surfaces.forEach(id => { if (contents.covered.has(id)) result.covered.add(id); else result.covered.delete(id); });
  }
  return result;
}
/* Connexions internes d'un cycle : le parcours est suivi pas à pas et, sur
   chaque hôte (pièce, ou ensemble des pièces d'un groupe fonctionnel réduit),
   les points d'attache successifs sont reliés deux à deux dans l'ordre du
   parcours. Un groupe de surfaces est traversé par ses membres ; une excursion
   hors de l'hôte (aller-retour par une autre pièce) coupe la chaîne, pour ne
   pas relier deux visites distinctes. La fermeture par la CF est suivie en
   dernier : la boucle reste fermée même quand la CF et ses surfaces sont
   masquées dans un groupe fonctionnel réduit. */
function cycleInternalConnections(c, s = S()) {
  const surface = id => s.surfaces.find(f => f.id === id);
  const runs = new Map();     // hostId -> [course, …]
  const openRun = new Map();  // hostId -> course en cours
  const touch = f => {
    if (!f) return;
    const hid = hostIdOf(f.pieceId);
    let run = openRun.get(hid);
    if (!run) { run = []; (runs.get(hid) || runs.set(hid, []).get(hid)).push(run); openRun.set(hid, run); }
    if (run[run.length - 1] !== f.id) run.push(f.id);
  };
  /* Une étape pose ses surfaces dans l'ordre du parcours ; la chaîne d'un hôte
     reste ouverte tant que l'étape touche cet hôte. */
  const walk = fs => {
    const touched = new Set();
    for (const f of fs) { if (!f) continue; touch(f); touched.add(hostIdOf(f.pieceId)); }
    for (const hid of [...openRun.keys()]) if (!touched.has(hid)) openRun.delete(hid);
  };
  for (const e of c.edges || []) {
    if (!e) continue;
    const fs = [surface(e.sa), surface(e.sb)];
    if (e.kind !== 'internal') {
      /* Contact : la liaison pose ses deux surfaces dans l'ordre du parcours ;
         les contacts d'une référence vers la pièce suivante sont tous inclus. */
      const links = referenceStepLinks(e.from, e.to, s);
      if (e.linkId) links.delete(e.linkId);
      for (const id of links) {
        const l = s.liaisons.find(x => x.id === id);
        if (l) { fs.push(surface(l.a), surface(l.b)); }
      }
    }
    walk(fs);
  }
  /* Fermeture du cycle par sa CF : la dernière étape rejoint la première. Un
     parcours en cours de création n'est pas encore fermé. */
  const ns = c.nodes || [], cf = s.cfgs.find(f => f.id === c.cfId);
  const endOn = (id, end) => id === end || (G(id)?.kind === 'ref' && G(id).members.includes(end));
  if (cf && ns.length >= 2 &&
      ((endOn(ns[0], cf.a) && endOn(ns[ns.length - 1], cf.b)) || (endOn(ns[0], cf.b) && endOn(ns[ns.length - 1], cf.a))))
    walk([...nodeSurfaces(ns[ns.length - 1], s), ...nodeSurfaces(ns[0], s)]);
  const result = [];
  for (const [hid, list] of runs) {
    for (const ids of list) {
      for (let i = 0; i + 1 < ids.length; i++) {
        if (ids[i] === ids[i + 1]) continue;
        const pair = [ids[i], ids[i + 1]].sort();
        /* Clé identique à l'ancien format (préfixe = pièce du premier nœud du
           parcours) : les déformations manuelles des cycles restent valables. */
        const key = (surface(ids[i])?.pieceId || hid) + ':' + pair.join(':');
        if (result.some(x => x.key === key)) continue;
        result.push({ key, pieceId: surface(ids[i])?.pieceId || hid, hostId: hid, host: hostOf((surface(ids[i]) || surface(ids[i + 1]))?.pieceId) || P(hid), a: pair[0], b: pair[1] });
      }
    }
  }
  return elideHiddenSteps(result, s);
}
/* Groupe fonctionnel réduit : les surfaces masquées (sans contact avec
   l'extérieur) sont enjambées — deux surfaces visibles qui se suivent à travers
   elles sont reliées directement, en couleur de cycle, sur l'ellipse du groupe.
   Une suite entièrement masquée est conservée telle quelle, tracée à l'intérieur
   de l'ellipse. */
function elideHiddenSteps(pairs, s = S()) {
  const sf = id => s.surfaces.find(f => f.id === id);
  const hidden = id => { const f = sf(id); return !!f && !surfVisible(f); };
  const visible = id => { const f = sf(id); return !!f && surfVisible(f); };
  for (let again = true; again;) {
    again = false;
    for (const h of new Set(pairs.flatMap(p => [p.a, p.b]))) {
      if (!hidden(h)) continue;
      const mine = pairs.filter(p => p.a === h || p.b === h);
      const nbrs = [...new Set(mine.map(p => (p.a === h ? p.b : p.a)))];
      if (mine.length !== 2 || nbrs.length !== 2 || !nbrs.some(visible)) continue;
      const [n1, n2] = nbrs;
      pairs = pairs.filter(p => !(p.a === h || p.b === h));
      if (n1 === n2) { again = true; break; }
      const pair = [n1, n2].sort();
      if (pairs.some(p => p.a === pair[0] && p.b === pair[1])) { again = true; break; }
      const src = mine[0];
      pairs.push({ key: (sf(pair[0])?.pieceId || src.hostId) + ':' + pair.join(':'),
        pieceId: src.pieceId, hostId: src.hostId, host: src.host, a: pair[0], b: pair[1] });
      again = true;
      break;
    }
  }
  return pairs;
}
/* Liaison directe du cycle : utilisée quand l'utilisateur enchaîne deux surfaces
   qu'aucune liaison ne relie. Elle est tracée en courbe et se déforme au glisser. */
function freeCycleEdge(from, to, s = S()) {
  if (!from || !to || from === to) return null;
  const a = nodeSurfaces(from, s).find(f => surfVisible(f)) || nodeSurfaces(from, s)[0];
  const b = nodeSurfaces(to, s).find(f => surfVisible(f)) || nodeSurfaces(to, s)[0];
  if (!a || !b || a.id === b.id) return null;
  return { kind: 'free', from, to, sa: a.id, sb: b.id, bend: null };
}
function cycleError(c, s = S()) {
  if (!c || typeof c !== 'object') return 'Cycle invalide.';
  if (c.num != null) { const err = numberError(c.num, s.cycles, c.id); if (err) return err; }
  const cf = s.cfgs.find(f => f.id === c.cfId);
  if (!cf) return 'La CF du cycle a été supprimée.';
  if (!Array.isArray(c.nodes) || c.nodes.length < 3 || !Array.isArray(c.edges) || c.edges.length !== c.nodes.length - 1) return 'Parcours incomplet.';
  const first = c.nodes[0], last = c.nodes[c.nodes.length - 1];
  /* Une extrémité peut être la surface de CF elle-même, ou le groupe de
     surfaces qui la contient (le cycle se ferme alors sur le groupe). */
  const endOn = (id, cfEnd) => {
    if (id === cfEnd) return true;
    const g = s.groups.find(g => g.id === id && g.kind === 'ref');
    return !!g && g.members.includes(cfEnd);
  };
  if (!((endOn(first, cf.a) && endOn(last, cf.b)) || (endOn(first, cf.b) && endOn(last, cf.a)))) return 'Le cycle doit relier les deux surfaces de sa CF.';
  if (new Set(c.nodes).size !== c.nodes.length) return 'Un nœud ne peut pas être traversé deux fois.';
  for (let i = 0; i < c.nodes.length; i++) {
    const id = c.nodes[i], surfaces = nodeSurfaces(id, s);
    if (!surfaces.length) return 'Une surface ou une référence du cycle a été supprimée.';
    if (i > 0 && i < c.nodes.length - 1 && surfaces.some(f => f.id === cf.a || f.id === cf.b)) return 'Un cycle contient exactement une CF, à ses extrémités.';
  }
  for (let i = 0; i < c.edges.length; i++) {
    const e = c.edges[i];
    if (!e || e.from !== c.nodes[i] || e.to !== c.nodes[i + 1]) return 'Une liaison ou une référence du parcours a changé.';
    if (e.kind === 'free') {
      /* Trait direct : seules les deux surfaces doivent encore exister. */
      if (!s.surfaces.some(f => f.id === e.sa) || !s.surfaces.some(f => f.id === e.sb)) return 'Une surface du parcours a été supprimée.';
      continue;
    }
    if (!cycleEdges(c.nodes[i], c.nodes[i + 1], s).some(q => q.kind === e.kind && q.sa === e.sa && q.sb === e.sb && q.linkId === e.linkId))
      return 'Une liaison ou une référence du parcours a changé.';
  }
  return '';
}
function cleanupCycles(s = S()) {
  const before = s.cycles.length;
  s.cycles = s.cycles.filter(c => !cycleError(c, s));
  const removed = before - s.cycles.length;
  if (removed) toast(`${removed} cycle(s) supprimé(s) : leur parcours n'existe plus.`);
  return removed;
}

let cycleDraft = null;
const cycleNodeName = id => SF(id) ? sname(SF(id)) : (G(id)?.name || 'Référence');
/* Un nœud ferme le cycle s'il est l'autre surface de la CF, ou le groupe de
   surfaces qui la contient. */
function cycleNodeCloses(id, other) {
  if (id === other) return true;
  const g = G(id);
  return !!g && g.kind === 'ref' && g.members.includes(other);
}
function cycleDraftComplete() {
  if (!cycleDraft) return false;
  const cf = C(cycleDraft.cfId), ns = cycleDraft.nodes;
  if (!cf || ns.length < 2) return false;
  return cycleNodeCloses(ns[ns.length - 1], ns[0] === cf.a ? cf.b : cf.a);
}
/* Étape entre deux nœuds : liaisons existantes, sinon trait direct avec
   avertissement ; si plusieurs passages, une boîte de choix. */
function chooseStepEdge(from, to, done) {
  let edges = cycleEdges(from, to), warning = '';
  if (!edges.length) {
    /* Aucune liaison entre les deux nœuds : on ne bloque plus, on prévient. */
    const free = freeCycleEdge(from, to);
    if (!free) return toast('Choisissez une autre surface : ce nœud touche déjà l’étape précédente.');
    const fa = SF(free.sa), fb = SF(free.sb);
    warning = fa && fb && fa.pieceId === fb.pieceId
      ? `Attention : aucune liaison de contact ne relie ${sname(fa)} et ${sname(fb)} dans cette pièce — le cycle trace un trait direct. Vérifiez que c’est bien voulu.`
      : `Attention : aucune liaison ne relie ${sname(fa)} et ${sname(fb)} — le cycle trace un trait direct entre les deux surfaces. Vérifiez que c’est bien voulu.`;
    edges = [free];
  }
  const finish = edge => { done(edge); if (warning) toast(warning); };
  if (edges.length === 1 || edges.every(e => e.kind === edges[0].kind)) return finish(edges[0]);
  const body = el(`<div><p>Plusieurs passages sont possibles par cette référence :</p>
    <select id="cyclePass" style="width:100%">${edges.map((e, i) => `<option value="${i}">${esc(sname(SF(e.sa)))} ⟷ ${esc(sname(SF(e.sb)))} — ${e.kind === 'internal' ? 'dans la pièce' : esc(liaisonLabel(L(e.linkId)))}</option>`).join('')}</select></div>`);
  openModal({ title: 'Choisir le passage', body, onOk: () => {
    const edge = edges[Number($('#cyclePass', body).value)];
    closeModal(); finish(edge); return false;
  } });
}
function pickCycleNode(id, ctrl = false) {
  if (ctrl && cycleDraft?.nodes[cycleDraft.nodes.length - 1] === id) return cycleAction('back');
  if (!cycleDraft) {
    const cfs = cfOfSurfaceList(id);
    if (!cfs.length) return toast('Commencez par une surface de CF.');
    const start = cf => { cycleDraft = { cfId: cf.id, nodes: [id], edges: [], color: DEFAULT_CYCLE_COLOR }; render(); renderProps(); updateTip(); };
    if (cfs.length === 1) return start(cfs[0]);
    const body = el(`<div><p>Cette surface appartient à plusieurs CF. Le cycle porte sur une seule d'entre elles :</p>
      <select id="cycleCF" style="width:100%">${cfs.map(cf => `<option value="${cf.id}">${esc(cfDisplayName(cf))} — ${esc(endName(cf.a))} ⟷ ${esc(endName(cf.b))}</option>`).join('')}</select></div>`);
    openModal({ title: 'Choisir la CF du cycle', body, okText: 'Commencer', onOk: () => {
      const cf = cfs.find(x => x.id === $('#cycleCF', body).value);
      closeModal(); if (cf) start(cf); return false;
    } });
    return;
  }
  const cf = C(cycleDraft.cfId);
  if (!cf) { cycleDraft = null; return toast('La CF de départ a été supprimée. Recommencez le cycle.'); }
  const other = cycleDraft.nodes[0] === cf.a ? cf.b : cf.a;
  const closes = cycleNodeCloses(id, other);
  if (cycleDraft.nodes.includes(id)) return toast('Ce nœud est déjà dans le cycle. Utilisez « Retirer la dernière étape ».');
  const surfaces = nodeSurfaces(id);
  if (!surfaces.length) return toast('Choisissez une surface ou un groupe de références.');
  if (!closes && surfaces.some(f => f.id === cf.a || f.id === cf.b)) return toast('Une seule CF par cycle : terminez sur son autre surface.');
  /* Insertion à une position choisie dans l'arborescence du panneau. */
  if (cycleDraft.insertAt != null) {
    const k = cycleDraft.insertAt; cycleDraft.insertAt = null;
    return insertDraftNodeAt(id, k);
  }
  const append = edge => {
    cycleDraft.nodes.push(id); cycleDraft.edges.push(edge);
    render(); renderProps(); updateTip();
    if (closes) saveCycleDialog();
  };
  if (!cycleDraftComplete()) return chooseStepEdge(cycleDraft.nodes[cycleDraft.nodes.length - 1], id, append);
  /* Parcours déjà complet : la nouvelle surface est insérée juste avant la
     fermeture, et les deux étapes sont recalculées. */
  return insertDraftNodeAt(id, cycleDraft.nodes.length - 1);
}
/* Inserte une étape à la position k du parcours (k = nombre d'étapes = ajout). */
function insertDraftNodeAt(id, k) {
  const d = cycleDraft; if (!d) return;
  const n = d.nodes.length;
  if (k <= 0) return toast('La première étape est la surface de départ de la CF.');
  const finish = () => { render(); renderProps(); updateTip(); toast('Étape insérée à cette position.'); };
  if (k >= n) return chooseStepEdge(d.nodes[n - 1], id, e => { d.nodes.push(id); d.edges.push(e); finish(); });
  chooseStepEdge(d.nodes[k - 1], id, e1 => chooseStepEdge(id, d.nodes[k], e2 => {
    d.nodes.splice(k, 0, id);
    d.edges.splice(k - 1, 1, e1, e2);
    finish();
  }));
}
/* Recalcule les étapes du parcours pour les paires de nœuds lo…hi. */
function reconnectDraftEdges(lo, hi, done) {
  const d = cycleDraft; if (!d) return done && done();
  const step = j => {
    if (j > hi || j > d.nodes.length - 2) return done && done();
    chooseStepEdge(d.nodes[j], d.nodes[j + 1], e => { d.edges[j] = e; step(j + 1); });
  };
  step(Math.max(0, lo));
}
/* Déplace une étape (↑ ↓) ; les liaisons concernées sont recalculées. */
function moveDraftNode(i, dir) {
  const d = cycleDraft; if (!d) return;
  const j = i + dir, n = d.nodes.length;
  if (i <= 0 || j <= 0 || i >= n || j >= n) return;
  moveDraftNodeTo(i, j);
}
/* Déplace une étape de la position `from` vers `to` (glisser-déposer dans
   l'arborescence) ; les liaisons de la zone traversée sont recalculées. */
function moveDraftNodeTo(from, to) {
  const d = cycleDraft; if (!d) return;
  const n = d.nodes.length;
  if (from === to || from < 0 || to < 0 || from >= n) return;
  const nodes = d.nodes.slice();
  const [m] = nodes.splice(from, 1);
  const at = Math.max(0, Math.min(to, nodes.length));
  nodes.splice(at, 0, m);
  const cf = C(d.cfId);
  const startOk = cf && (cycleNodeCloses(nodes[0], cf.a) || cycleNodeCloses(nodes[0], cf.b));
  if (!startOk) return toast('La première étape doit être une surface de la CF de départ.');
  d.nodes = nodes;
  reconnectDraftEdges(Math.max(0, Math.min(from, at) - 1), Math.min(n - 2, Math.max(from, at) + 1), () => {
    render(); renderProps(); updateTip();
  });
}
/* Clic sur une liaison pendant la création : ajoute automatiquement la
   surface concernée (celle qui prolonge le parcours). */
function pickCycleLink(l) {
  if (!l) return;
  if (!cycleDraft) return toast('Commencez par une surface de CF.');
  const last = cycleDraft.nodes[cycleDraft.nodes.length - 1];
  const lastSurfaces = nodeSurfaces(last).map(f => f.id);
  let target = null;
  if (lastSurfaces.includes(l.a)) target = l.b;
  else if (lastSurfaces.includes(l.b)) target = l.a;
  else {
    const candidates = [l.a, l.b].filter(id => !cycleDraft.nodes.includes(id));
    if (!candidates.length) return toast('Les deux surfaces de cette liaison sont déjà dans le cycle.');
    if (candidates.length === 1) target = candidates[0];
    else {
      const lp = endPos(last) || { x: 0, y: 0 };
      const dist = id => { const p = endPos(id); return p ? Math.hypot(p.x - lp.x, p.y - lp.y) : Infinity; };
      target = candidates.sort((a, b) => dist(a) - dist(b))[0];
    }
  }
  pickCycleNode(target);
}
/* Retire une étape du parcours (sauf la première) ; les voisins sont
   reconnectés automatiquement. */
function cycleDraftRemove(i) {
  const d = cycleDraft; if (!d) return;
  const n = d.nodes.length;
  if (i <= 0) return toast('La première étape est la surface de départ de la CF.');
  if (i >= n) return;
  if (i === n - 1) { d.nodes.pop(); d.edges.pop(); render(); renderProps(); updateTip(); return; }
  chooseStepEdge(d.nodes[i - 1], d.nodes[i + 1], edge => {
    d.nodes.splice(i, 1);
    d.edges.splice(i - 1, 2, edge);
    render(); renderProps(); updateTip();
  });
}
function saveCycleDialog() {
  if (!cycleDraftComplete()) return toast('Terminez sur l’autre surface de la CF de départ.');
  const draft = cycleDraft, edit = draft.editId ? CY(draft.editId) : null;
  const err = cycleError({ id: edit ? edit.id : undefined, num: edit ? edit.num : undefined, cfId: draft.cfId, nodes: draft.nodes, edges: draft.edges });
  if (err) return toast(err);
  const body = el(`<div><div class="row"><label>Numéro du cycle</label><input id="cycleNum" type="number" min="1" step="1" value="${edit ? edit.num : nextCycleNum()}" autofocus></div>
    <div class="row"><label>Couleur du cycle</label><input id="cycleColor" type="color" value="${draft.color || DEFAULT_CYCLE_COLOR}"></div><div class="err" id="cycleErr"></div></div>`);
  openModal({
    title: (edit ? 'Modifier ' : 'Créer le cycle — ') + cfDisplayName(C(draft.cfId)), body, okText: edit ? 'Enregistrer le parcours' : 'Créer le cycle',
    onOk: () => {
      const num = Number($('#cycleNum', body).value), err = numberError(num, S().cycles, edit ? edit.id : null);
      if (err) { $('#cycleErr', body).textContent = err; return false; }
      const color = $('#cycleColor', body).value;
      checkpoint();
      const record = { num, color, cfId: draft.cfId, nodes: clone(draft.nodes), edges: clone(draft.edges) };
      if (draft.bends && Object.keys(draft.bends).length) record.bends = clone(draft.bends);
      if (draft.cps && Object.keys(draft.cps).length) record.cps = clone(draft.cps);
      if (edit) Object.assign(edit, record);
      else S().cycles.push({ id: uid(), visible: true, displayOrder: nextCycleDisplayOrder(), ...record });
      const done = edit ? 'Parcours du cycle mis à jour' : 'cycle ' + num + ' créé';
      cycleDraft = null; pick = []; sel.clear();
      changed(); updateTip(); toast(done);
    }
  });
}
function startCycleEdit(c) {
  const err = cycleError(c);
  if (err) return toast('Modification impossible : ' + err);
  setTool('cycle');
  cycleDraft = { cfId: c.cfId, nodes: clone(c.nodes), edges: clone(c.edges), color: c.color || DEFAULT_CYCLE_COLOR, editId: c.id };
  if (c.bends) cycleDraft.bends = clone(c.bends);
  if (c.cps) cycleDraft.cps = clone(c.cps);
  render(); renderProps(); updateTip();
  toast('Parcours en modification : cliquer pour insérer une étape, ✕ pour en retirer une, puis valider.');
}
function renameCycle(c) {
  const body = el(`<div><div class="row"><label>Numéro du cycle</label><input id="cycleNum" type="number" min="1" step="1" value="${c.num}" autofocus></div><div class="err" id="cycleErr"></div></div>`);
  openModal({ title: 'Renommer ' + cycleName(c), body, onOk: () => {
    const num = Number($('#cycleNum', body).value), err = numberError(num, S().cycles, c.id);
    if (err) { $('#cycleErr', body).textContent = err; return false; }
    checkpoint(); c.num = num; changed();
  } });
}
function cyclesPanel() {
  const cs = S().cycles;
  const priority = cycleDisplayOrder().filter(c => c.visible !== false).reverse();
  return `<h3 style="color:#c65e00">Cycles</h3>
    <p class="muted">Une CF par cycle : partir d’une de ses surfaces et finir sur l’autre (ou sur le groupe de surfaces qui la contient).</p>
    <ul class="help-list cycle-tips"><li><b>Clic ou Ctrl+clic</b> : ajouter une surface ou une référence ; <b>cliquer sur une liaison</b> ajoute directement la surface concernée ; le parcours en cours est tracé <b>en gras</b>.</li><li><b>✕</b> sur une étape, <b>Ctrl+clic sur la dernière étape</b>, <b>Retour arrière</b> ou <b>Ctrl+Z</b> : la retirer ; <b>Échap</b> : annuler. Les étapes se réordonnent au <b>glisser-déposer</b> ou avec ↑ ↓, et s’insèrent n’importe où avec ＋.</li><li>Les contacts d’une référence vers la pièce suivante sont tous inclus, même si une seule surface est cliquée.</li><li>Le cycle a sa propre couleur (choisie dès le début) pour les pointillés, surfaces, références et courbes internes. La CF garde son affichage noir / couleur.</li><li><b>Glisser le fond</b> déplace la vue pendant la création.</li></ul>
    ${S().groups.some(g => g.kind === 'fonc' && g.collapsed) ? '<button data-ca="expand">Développer les groupes pour voir toutes les surfaces</button>' : ''}
    ${cycleDraft ? `<h4>${cycleDraft.editId ? 'Modification du parcours' : 'Parcours'} — ${esc(cfDisplayName(C(cycleDraft.cfId)))}</h4>
      <div class="row"><label>Couleur</label><input type="color" data-cycle-draft-color value="${cycleDraft.color || DEFAULT_CYCLE_COLOR}" aria-label="Couleur du cycle en cours"></div>
      <div class="cycle-tree">${cycleDraft.nodes.map((id, i) => {
        const n = cycleDraft.nodes.length;
        return `<div class="ct-row${i === 0 ? ' ct-first' : ''}${cycleDraft.insertAt === i + 1 ? ' ct-insert' : ''}" draggable="true" data-i="${i}" title="Glisser pour changer l’ordre">
          <span class="ct-idx">${i + 1}.</span>
          <span class="ct-name" title="${esc(cycleNodeName(id))}">${esc(cycleNodeName(id))}</span>
          <span class="ct-acts">
            ${i > 0 ? `<button data-ca="up" data-i="${i}" title="Monter cette étape dans le parcours">↑</button>` : ''}
            ${i < n - 1 ? `<button data-ca="down" data-i="${i}" title="Descendre cette étape dans le parcours">↓</button>` : ''}
            ${(i < n - 1 || !cycleDraftComplete()) ? `<button data-ca="insafter" data-i="${i}" title="Insérer une étape ici : choisir sa position, puis cliquer la surface sur le graphe">＋</button>` : ''}
            ${i ? `<button data-ca="rmnode" data-i="${i}" class="danger" title="Supprimer cette étape (les voisins sont reconnectés)">✕</button>` : '<span class="muted" style="font-size:10px">départ</span>'}
          </span></div>`;
      }).join('')}
      ${cycleDraft.insertAt != null ? `<div class="ct-note">Insertion avant l’étape ${cycleDraft.insertAt + 1} : <b>cliquez sur une surface</b> du graphe — <button data-ca="cancelinsert">Annuler l’insertion</button></div>` : ''}
      </div>
      <div class="btns"><button data-ca="back">↶ Retirer la dernière étape</button><button data-ca="cancel">Annuler le parcours</button>${cycleDraftComplete() ? `<button data-ca="finish" class="primary">${cycleDraft.editId ? '✔ Enregistrer le parcours' : '✔ Valider le cycle'}</button>` : ''}</div>` : ''}
    <h4>Cycles existants (${cs.length})</h4>
    <p class="muted">Sur un élément commun, le dernier cycle affiché est prioritaire ; les cycles multiples sur un même lien sont tracés côte à côte.</p>
    <div class="btns"><button data-ca="hideall" ${cs.length ? '' : 'disabled'}>Tout cacher</button><button data-ca="showall" ${cs.length ? '' : 'disabled'}>Tout afficher en couleur</button>
      <button data-ca="extractall" ${cs.length ? '' : 'disabled'}>Une feuille par cycle</button></div>
    ${cs.map(c => `<div class="cycle-card" data-cycle="${c.id}">
      <label><input type="checkbox" data-cycle-visible="${c.id}" ${c.visible !== false ? 'checked' : ''}> <b>${esc(cycleName(c))}</b> — ${esc(cfDisplayName(C(c.cfId)))}</label>
      <div class="row"><label>Couleur</label><input type="color" data-cycle-color="${c.id}" value="${c.color || DEFAULT_CYCLE_COLOR}" aria-label="Couleur de ${cycleName(c)}"><span class="muted">${c.visible !== false ? 'Priorité ' + (priority.indexOf(c) + 1) : 'Masqué'}</span></div>
      <div class="muted">${c.nodes.length} nœuds · ${cycleContents(c).links.size} contact(s)</div>
      <div class="btns"><button data-ca="show" data-cid="${c.id}">Afficher en couleur</button><button data-ca="edit" data-cid="${c.id}" title="Retirer, insérer ou remplacer des étapes du parcours">✎ Modifier le parcours…</button><button data-ca="rename" data-cid="${c.id}">Numéro…</button><button data-ca="extract" data-cid="${c.id}">Extraire en feuille</button><button data-ca="delete" data-cid="${c.id}" class="danger">Supprimer</button></div></div>`).join('') || '<p class="muted">Aucun cycle. Créez d’abord une CF et les contacts nécessaires.</p>'}`;
}
function cycleAction(action, id, btn) {
  const c = CY(id);
  const di = () => Number(btn?.dataset?.i);
  if (action === 'rmnode') return cycleDraftRemove(di());
  if (action === 'insafter') {
    if (!cycleDraft) return;
    const k = di() + 1;
    cycleDraft.insertAt = cycleDraft.insertAt === k ? null : k;
    render(); renderProps(); updateTip();
    return;
  }
  if (action === 'cancelinsert') { if (cycleDraft) cycleDraft.insertAt = null; render(); renderProps(); updateTip(); return; }
  if (action === 'up') return moveDraftNode(di(), -1);
  if (action === 'down') return moveDraftNode(di(), 1);
  if (action === 'back') {
    if (cycleDraft) { cycleDraft.nodes.pop(); cycleDraft.edges.pop(); if (!cycleDraft.nodes.length) cycleDraft = null; }
    render(); renderProps(); updateTip(); return;
  }
  if (action === 'cancel') { cycleDraft = null; render(); renderProps(); updateTip(); return; }
  if (action === 'finish') return saveCycleDialog();
  if (action === 'expand') { checkpoint(); S().groups.filter(g => g.kind === 'fonc').forEach(g => g.collapsed = false); changed(); return; }
  if (action === 'edit' && c) return startCycleEdit(c);
  if (action === 'rename' && c) return renameCycle(c);
  if (action === 'extract' && c) return extractCycles([c]);
  if (action === 'extractall') return extractCycles(S().cycles);
  if (action === 'show' && c) { checkpoint(); setCycleVisible(c, true); changed(); return; }
  if (action === 'hideall' || action === 'showall') {
    checkpoint(); S().cycles.forEach(c => setCycleVisible(c, action === 'showall')); changed(); return;
  }
  if (action === 'delete' && c) { checkpoint(); S().cycles = S().cycles.filter(x => x.id !== c.id); changed(); }
}

function cycleSnapshotSheet(source, c) {
  const contents = cycleContents(c, source), sids = contents.surfaces, gids = contents.references;
  const cf = source.cfgs.find(f => f.id === c.cfId);
  if (!cf) throw new Error('La CF du cycle a été supprimée.');
  for (const id of [cf.a, cf.b]) {
    if (source.surfaces.some(f => f.id === id)) sids.add(id);
    else {
      const g = source.groups.find(x => x.id === id && x.kind === 'ref');
      if (g) { gids.add(g.id); g.members.forEach(m => sids.add(m)); }
    }
  }
  const surfaces = source.surfaces.filter(f => sids.has(f.id)), pids = new Set(surfaces.map(f => f.pieceId));
  const sh = newSheet(source.name + ' — ' + cycleName(c));
  Object.assign(sh, clone({ pieces: source.pieces.filter(p => pids.has(p.id)), surfaces,
    liaisons: source.liaisons.filter(l => contents.links.has(l.id)), cfgs: [cf],
    groups: source.groups.filter(g => g.kind === 'ref' && gids.has(g.id)).map(g => ({ ...g, members: g.members.filter(id => sids.has(id)) })),
    cycles: [{ ...c, visible: true }], showNominalZero: false, cycleSnapshot: true }));
  // Keep only the chosen surfaces, at their original positions after expanding pieces.
  sh.surfaces.forEach(f => f.pinned = true);
  return sh;
}

function extractCycles(cycles) {
  if (!cycles.length) return toast('Aucun cycle à extraire.');
  for (const c of cycles) { const err = cycleError(c); if (err) return toast('Extraction impossible : ' + err); }
  checkpoint();
  const source = S(), sheets = cycles.map(c => cycleSnapshotSheet(source, c));
  doc.sheets.splice(doc.sheets.indexOf(source) + 1, 0, ...sheets); doc.active = sheets[0].id;
  sel.clear(); setTool('select'); changed(); fitView();
  toast(`${sheets.length} feuille(s) de cycle créée(s), prêtes à exporter en PNG / SVG.`);
}
