'use strict';

const cfName = c => typeof c.name === 'string' ? c.name : 'CF' + c.num;
const cfDisplayName = c => cfName(c) || 'CF sans nom';
const cfRenderColor = c => c.inColor === false ? '#000000' : c.color;
const DEFAULT_CYCLE_COLOR = '#e87900';
const cycleName = c => 'cycle ' + c.num;
const nextCFNum = (s = S()) => Math.max(0, ...s.cfgs.map(c => c.num || 0)) + 1;
const nextCycleNum = (s = S()) => Math.max(0, ...s.cycles.map(c => c.num || 0)) + 1;
const cfOfSurface = (id, s = S()) => s.cfgs.find(c => c.a === id || c.b === id);
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
      const a = s.surfaces.find(f => f.id === c.a), b = s.surfaces.find(f => f.id === c.b);
      if (!a || !b || a.pieceId === b.pieceId) throw new Error('Une CF doit avoir deux surfaces sur deux pièces différentes.');
      if (s.cfgs.some(f => f.id !== c.id && [f.a, f.b].some(id => id === c.a || id === c.b)))
        throw new Error('Une surface de CF ne peut pas être partagée avec une autre CF.');
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
          color: '#ffffff', stroke: c.color || '#b42318', sw: 2, name: '', pinned: false,
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

function createCF(aId, bId, name = nextCFName(), details = {}) {
  const sa = SF(aId), sb = SF(bId);
  if (!sa || !sb || sa.pieceId === sb.pieceId) throw new Error('Une CF nécessite deux surfaces sur deux pièces différentes.');
  name = String(name).trim();
  const err = cfNameError(name);
  if (err) throw new Error(err);
  const c = { id: uid(), a: aId, b: bId, num: nextCFNum(), name, color: '#b42318', inColor: true, dedicated: true, labelBox: false,
    details: { point: String(details.point || '').trim(), normale: String(details.normale || '').trim() } };
  [sa, sb].forEach(s => { s.stroke = c.color; s.sw = 2; });
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

function cfDialog(pidA, pidB, editId) {
  const c = editId ? C(editId) : null, A = P(pidA), B = P(pidB);
  if (!A || !B || A.id === B.id) return toast('Choisissez deux pièces différentes pour la CF.');
  const sa = c && SF(c.a), sb = c && SF(c.b);
  const det = Object.assign({ point: '', normale: '' }, c && c.details ? clone(c.details) : {});
  const normMode = ['x', 'y', 'z'].includes(det.normale) ? det.normale : det.normale ? 'custom' : 'none';
  const state = {
    sa: sa ? 'ex:' + sa.id : 'new:PL', sb: sb ? 'ex:' + sb.id : 'new:PL',
    countA: sa ? sa.count || 1 : 1, countB: sb ? sb.count || 1 : 1,
    nameA: '', nameB: ''
  };
  const surfOptions = (p, val) => {
    const news = doc.settings.surfaceTypes.map(t => `<option value="new:${esc(t.code)}" ${val === 'new:' + t.code ? 'selected' : ''}>${esc(t.code)} — ${esc(t.label)}</option>`).join('');
    const ex = S().surfaces.filter(s => s.pieceId === p.id && (!cfOfSurface(s.id) || cfOfSurface(s.id).id === c?.id))
      .map(s => `<option value="ex:${s.id}" ${val === 'ex:' + s.id ? 'selected' : ''}>${esc(sname(s))}</option>`).join('');
    return `<optgroup label="Nouvelle surface">${news}</optgroup>${ex ? `<optgroup label="Surfaces existantes">${ex}</optgroup>` : ''}`;
  };
  const pieceBox = (p, id) => { const d = $(id, body); d.style.background = p.color; d.style.color = textOn(p.color); d.innerHTML = esc(p.name).replace(/\n/g, '<br>'); };
  const body = el(`<div style="width:560px">
    <div class="ld-head"><div class="ld-piece" id="cfA"></div><div class="ld-piece" id="cfB"></div></div>
    <div class="row"><label>Nom de la CF</label><input id="cfName" type="text" value="${esc(c ? cfName(c) : nextCFName())}" autofocus placeholder="Texte, nombre ou vide"></div>
    <div class="ld-grid">
      <label><span class="chip" id="cfChipA"></span></label>
      <div class="surface-choice"><select data-side="sa">${surfOptions(A, state.sa)}</select><label class="surface-repeat" title="Répétitions de la surface A">× <input aria-label="Répétitions surface A" type="number" min="1" step="1" data-scount="countA" value="${state.countA}"></label><input type="text" class="surface-name" data-sname="nameA" value="${esc(state.nameA)}" placeholder="Nom libre (facultatif)" title="Texte libre affiché sur la bulle à la place de la nomenclature automatique ; vide = nom automatique" aria-label="Nom libre de la surface A" ${state.sa.startsWith('new:') ? '' : 'hidden'}></div>
      <label><span class="chip" id="cfChipB"></span></label>
      <div class="surface-choice"><select data-side="sb">${surfOptions(B, state.sb)}</select><label class="surface-repeat" title="Répétitions de la surface B">× <input aria-label="Répétitions surface B" type="number" min="1" step="1" data-scount="countB" value="${state.countB}"></label><input type="text" class="surface-name" data-sname="nameB" value="${esc(state.nameB)}" placeholder="Nom libre (facultatif)" title="Texte libre affiché sur la bulle à la place de la nomenclature automatique ; vide = nom automatique" aria-label="Nom libre de la surface B" ${state.sb.startsWith('new:') ? '' : 'hidden'}></div>
      <label>Détails <span class="muted">(facultatif)</span></label>
      <div class="dets">
        <label title="Point / centre">pt</label><input type="text" data-det="point" value="${esc(det.point)}" placeholder="—" title="Point / centre (facultatif), ex. A, O">
        <label title="Normale">n</label><span class="vector-editor"><select id="cfNormMode" aria-label="Normale">${[['none', 'Aucune'], ['x', 'x'], ['y', 'y'], ['z', 'z'], ['custom', 'Personnalisé…']].map(([v, lab]) => `<option value="${v}" ${normMode === v ? 'selected' : ''}>${lab}</option>`).join('')}</select><input type="text" id="cfNormCustom" value="${esc(normMode === 'custom' ? det.normale : '')}" placeholder="ex. u_123, -x…" title="Un _ suivi d'un suffixe affiche ce suffixe en indice (ex. u_123)." aria-label="Normale personnalisée" ${normMode === 'custom' ? '' : 'hidden'}></span>
      </div>
    </div>
    <label><input id="cfLabelBox" type="checkbox" ${c?.labelBox ? 'checked' : ''}> Encadrer le libellé sur le trait</label>
    <p class="muted">Deux surfaces entre les deux pièces : surfaces existantes ou nouvelles. Le nom est libre et unique dans la feuille, y compris le nom vide (une seule CF sans nom). Point et normale sont affichés avec le détail des liaisons.</p>
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
      if (state.sa.startsWith('ex:') && state.sa === state.sb) { $('#cfErr', body).textContent = 'Les deux extrémités ne peuvent pas utiliser la même surface.'; return false; }
      const plannedSurfaces = [];
      const surface = (val, p) => {
        if (val.startsWith('ex:')) return val.slice(3);
        const f = { id: uid(), pieceId: p.id }; plannedSurfaces.push(f); return f.id;
      };
      const plannedLinks = [{ id: c ? c.id : uid(), kind: 'cfg', a: surface(state.sa, A), b: surface(state.sb, B) }];
      const layoutError = referenceCreationError(plannedSurfaces, plannedLinks, c ? [c.id] : []);
      if (layoutError) { $('#cfErr', body).textContent = layoutError; return false; }
      checkpoint();
      const angAB = Math.atan2(B.y - A.y, B.x - A.x);
      const resolve = (val, p, ang, custom) => {
        if (val.startsWith('ex:')) return val.slice(3);
        const id = createSurface(p.id, val.slice(4), null, ang).id;
        const nm = String(custom || '').trim();
        if (nm) SF(id).name = nm;
        return id;
      };
      const aId = resolve(state.sa, A, angAB, state.nameA), bId = resolve(state.sb, B, angAB + Math.PI, state.nameB);
      SF(aId).count = countA; SF(bId).count = countB;
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
  return `<h3>CF</h3><p class="muted">Cliquer sur deux pièces pour créer une CF. Les modes noir / couleur ne changent pas sa couleur enregistrée.</p>
    ${pick.length === 1 && P(pick[0]) ? `<p>Première pièce : <b>${esc(P(pick[0]).name)}</b>. Choisir la deuxième pièce.</p>` : ''}
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
  if (action === 'edit' && c) return cfDialog(SF(c.a).pieceId, SF(c.b).pieceId, c.id);
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
  if (cf) { cfs.add(cf.id); surfaces.add(cf.a); surfaces.add(cf.b); }
  return { surfaces, references, links, covered, cfs };
}
function visibleCycleContents(cycles, s = S()) {
  const result = { surfaces: new Set(), references: new Set(), links: new Set(), covered: new Set(), cfs: new Set(),
    colors: { surfaces: new Map(), references: new Map(), links: new Map() } };
  for (const c of cycles) {
    const contents = cycleContents(c, s);
    for (const key of ['surfaces', 'references', 'links', 'cfs']) contents[key].forEach(id => result[key].add(id));
    for (const key of ['surfaces', 'references', 'links']) contents[key].forEach(id => result.colors[key].set(id, c.color || DEFAULT_CYCLE_COLOR));
    contents.surfaces.forEach(id => { if (contents.covered.has(id)) result.covered.add(id); else result.covered.delete(id); });
  }
  return result;
}
function cycleInternalConnections(c, s = S()) {
  const result = new Map(), refs = c.nodes.map(id => s.groups.find(g => g.id === id && g.kind === 'ref')).filter(Boolean);
  const surface = id => s.surfaces.find(f => f.id === id);
  const entity = (id, pieceId) => {
    const f = surface(id);
    if (f) return f.pieceId === pieceId ? refs.find(g => g.members.includes(id))?.id || id : null;
    return nodeSurfaces(id, s).some(f => f.pieceId === pieceId) ? id : null;
  };
  const add = (pieceId, a, b) => {
    a = entity(a, pieceId); b = entity(b, pieceId);
    if (!a || !b || a === b) return;
    const pair = [a, b].sort(), key = pieceId + ':' + pair.join(':');
    result.set(key, { key, pieceId, a: pair[0], b: pair[1] });
  };
  for (const e of c.edges) {
    if (e.kind === 'internal') { const f = surface(e.sa); if (f) add(f.pieceId, e.from, e.to); continue; }
    const links = referenceStepLinks(e.from, e.to, s);
    if (e.linkId) links.add(e.linkId);
    const fromPieces = new Set(nodeSurfaces(e.from, s).map(f => f.pieceId)), toPieces = new Set(nodeSurfaces(e.to, s).map(f => f.pieceId));
    for (const l of s.liaisons.filter(l => links.has(l.id))) for (const [sa, sb] of [[l.a, l.b], [l.b, l.a]]) {
      const a = surface(sa), b = surface(sb);
      if (!a || !b || !fromPieces.has(a.pieceId) || !toPieces.has(b.pieceId)) continue;
      add(a.pieceId, e.from, a.id); add(b.pieceId, b.id, e.to);
    }
  }
  return [...result.values()];
}
function cycleError(c, s = S()) {
  if (!c || typeof c !== 'object') return 'Cycle invalide.';
  if (c.num != null) { const err = numberError(c.num, s.cycles, c.id); if (err) return err; }
  const cf = s.cfgs.find(f => f.id === c.cfId);
  if (!cf) return 'La CF du cycle a été supprimée.';
  if (!Array.isArray(c.nodes) || c.nodes.length < 3 || !Array.isArray(c.edges) || c.edges.length !== c.nodes.length - 1) return 'Parcours incomplet.';
  const first = c.nodes[0], last = c.nodes[c.nodes.length - 1];
  if (!((first === cf.a && last === cf.b) || (first === cf.b && last === cf.a))) return 'Le cycle doit relier les deux surfaces de sa CF.';
  if (new Set(c.nodes).size !== c.nodes.length) return 'Un nœud ne peut pas être traversé deux fois.';
  for (let i = 0; i < c.nodes.length; i++) {
    const id = c.nodes[i], surfaces = nodeSurfaces(id, s);
    if (!surfaces.length) return 'Une surface ou une référence du cycle a été supprimée.';
    if (i > 0 && i < c.nodes.length - 1 && surfaces.some(f => cfOfSurface(f.id, s))) return 'Un cycle contient exactement une CF, à ses extrémités.';
  }
  for (let i = 0; i < c.edges.length; i++) {
    const e = c.edges[i];
    if (!e || e.from !== c.nodes[i] || e.to !== c.nodes[i + 1] ||
      !cycleEdges(c.nodes[i], c.nodes[i + 1], s).some(q => q.kind === e.kind && q.sa === e.sa && q.sb === e.sb && q.linkId === e.linkId))
      return 'Une liaison ou une référence du parcours a changé.';
  }
  return c.edges.some(e => e.kind === 'contact') ? '' : 'Le cycle doit traverser au moins une liaison de contact.';
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
function cycleDraftComplete() {
  if (!cycleDraft) return false;
  const cf = C(cycleDraft.cfId), ns = cycleDraft.nodes;
  return !!cf && ns.length > 1 && ns[ns.length - 1] === (ns[0] === cf.a ? cf.b : cf.a);
}
function pickCycleNode(id, ctrl = false) {
  if (ctrl && cycleDraft?.nodes[cycleDraft.nodes.length - 1] === id) return cycleAction('back');
  if (!cycleDraft) {
    const cf = cfOfSurface(id);
    if (!cf) return toast('Commencez par une surface de CF.');
    cycleDraft = { cfId: cf.id, nodes: [id], edges: [] };
    render(); renderProps(); updateTip(); return;
  }
  if (cycleDraftComplete()) return saveCycleDialog();
  const cf = C(cycleDraft.cfId);
  if (!cf) { cycleDraft = null; return toast('La CF de départ a été supprimée. Recommencez le cycle.'); }
  const other = cycleDraft.nodes[0] === cf.a ? cf.b : cf.a;
  if (cycleDraft.nodes.includes(id)) return toast('Ce nœud est déjà dans le cycle. Utilisez « Retirer la dernière étape ».');
  const surfaces = nodeSurfaces(id);
  if (!surfaces.length) return toast('Choisissez une surface ou un groupe de références.');
  if (id !== other && surfaces.some(f => cfOfSurface(f.id))) return toast('Une seule CF par cycle : terminez sur son autre surface.');
  const from = cycleDraft.nodes[cycleDraft.nodes.length - 1], edges = cycleEdges(from, id);
  if (!edges.length) return toast('Étape impossible : restez dans la même pièce ou traversez une liaison de contact existante.');
  const append = edge => {
    cycleDraft.nodes.push(id); cycleDraft.edges.push(edge);
    render(); renderProps(); updateTip();
    if (id === other) saveCycleDialog();
  };
  if (edges.length === 1 || edges.every(e => e.kind === edges[0].kind)) return append(edges[0]);
  const body = el(`<div><p>Plusieurs passages sont possibles par cette référence :</p>
    <select id="cyclePass" style="width:100%">${edges.map((e, i) => `<option value="${i}">${esc(sname(SF(e.sa)))} ⟷ ${esc(sname(SF(e.sb)))} — ${e.kind === 'internal' ? 'dans la pièce' : esc(liaisonLabel(L(e.linkId)))}</option>`).join('')}</select></div>`);
  openModal({ title: 'Choisir le passage', body, onOk: () => {
    const edge = edges[Number($('#cyclePass', body).value)];
    closeModal(); append(edge); return false;
  } });
}
function saveCycleDialog() {
  if (!cycleDraftComplete()) return toast('Terminez sur l’autre surface de la CF de départ.');
  const err = cycleError(cycleDraft);
  if (err) return toast(err);
  const body = el(`<div><div class="row"><label>Numéro du cycle</label><input id="cycleNum" type="number" min="1" step="1" value="${nextCycleNum()}" autofocus></div>
    <div class="row"><label>Couleur du cycle</label><input id="cycleColor" type="color" value="${DEFAULT_CYCLE_COLOR}"></div><div class="err" id="cycleErr"></div></div>`);
  openModal({ title: 'Créer le cycle — ' + cfDisplayName(C(cycleDraft.cfId)), body, okText: 'Créer le cycle', onOk: () => {
    const num = Number($('#cycleNum', body).value), err = numberError(num, S().cycles);
    if (err) { $('#cycleErr', body).textContent = err; return false; }
    checkpoint();
    const c = { ...clone(cycleDraft), id: uid(), num, visible: true, color: $('#cycleColor', body).value, displayOrder: nextCycleDisplayOrder() };
    S().cycles.push(c); cycleDraft = null; pick = []; sel.clear();
    changed(); updateTip(); toast(cycleName(c) + ' créé');
  } });
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
    <p class="muted">Une CF par cycle : partir d’une de ses surfaces et finir sur l’autre.</p>
    <ul class="help-list cycle-tips"><li><b>Clic ou Ctrl+clic</b> : ajouter une surface ou une référence.</li><li><b>Ctrl+clic sur la dernière étape</b> ou <b>Retour arrière</b> : la retirer ; <b>Échap</b> : annuler.</li><li>Les contacts d’une référence vers la pièce suivante sont tous inclus, même si une seule surface est cliquée.</li><li>Le cycle a sa propre couleur pour les pointillés, surfaces, références et courbes internes. La CF garde son affichage noir / couleur.</li></ul>
    ${S().groups.some(g => g.kind === 'fonc' && g.collapsed) ? '<button data-ca="expand">Développer les groupes pour voir toutes les surfaces</button>' : ''}
    ${cycleDraft ? `<h4>Parcours — ${esc(cfDisplayName(C(cycleDraft.cfId)))}</h4>
      <ol class="help-list">${cycleDraft.nodes.map(id => `<li>${esc(cycleNodeName(id))}</li>`).join('')}</ol>
      <div class="btns"><button data-ca="back">↶ Retirer la dernière étape</button><button data-ca="cancel">Annuler le parcours</button>${cycleDraftComplete() ? '<button data-ca="finish" class="primary">Valider le cycle</button>' : ''}</div>` : ''}
    <h4>Cycles existants (${cs.length})</h4>
    <p class="muted">Sur un élément commun, le dernier cycle affiché est prioritaire. Priorité 1 = le plus récent.</p>
    <div class="btns"><button data-ca="hideall" ${cs.length ? '' : 'disabled'}>Tout cacher</button><button data-ca="showall" ${cs.length ? '' : 'disabled'}>Tout afficher en couleur</button>
      <button data-ca="extractall" ${cs.length ? '' : 'disabled'}>Une feuille par cycle</button></div>
    ${cs.map(c => `<div class="cycle-card" data-cycle="${c.id}">
      <label><input type="checkbox" data-cycle-visible="${c.id}" ${c.visible !== false ? 'checked' : ''}> <b>${esc(cycleName(c))}</b> — ${esc(cfDisplayName(C(c.cfId)))}</label>
      <div class="row"><label>Couleur</label><input type="color" data-cycle-color="${c.id}" value="${c.color || DEFAULT_CYCLE_COLOR}" aria-label="Couleur de ${cycleName(c)}"><span class="muted">${c.visible !== false ? 'Priorité ' + (priority.indexOf(c) + 1) : 'Masqué'}</span></div>
      <div class="muted">${c.nodes.length} nœuds · ${cycleContents(c).links.size} contact(s)</div>
      <div class="btns"><button data-ca="show" data-cid="${c.id}">Afficher en couleur</button><button data-ca="rename" data-cid="${c.id}">Numéro…</button><button data-ca="extract" data-cid="${c.id}">Extraire en feuille</button><button data-ca="delete" data-cid="${c.id}" class="danger">Supprimer</button></div></div>`).join('') || '<p class="muted">Aucun cycle. Créez d’abord une CF et les contacts nécessaires.</p>'}`;
}
function cycleAction(action, id) {
  const c = CY(id);
  if (action === 'back') {
    if (cycleDraft) { cycleDraft.nodes.pop(); cycleDraft.edges.pop(); if (!cycleDraft.nodes.length) cycleDraft = null; }
    render(); renderProps(); updateTip(); return;
  }
  if (action === 'cancel') { cycleDraft = null; render(); renderProps(); updateTip(); return; }
  if (action === 'finish') return saveCycleDialog();
  if (action === 'expand') { checkpoint(); S().groups.filter(g => g.kind === 'fonc').forEach(g => g.collapsed = false); changed(); return; }
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
  sids.add(cf.a); sids.add(cf.b);
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
