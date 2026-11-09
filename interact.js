'use strict';
/* ===== Outils ===== */
function setTool(t) {
  if (drag) { drag = null; marquee = null; stage.classList.remove('panning'); autosave(); }
  lastDown.t = 0;
  if (tool !== t) cycleDraft = null;
  if (t === 'cycle') sel.clear();
  tool = t; pick = []; pickCFs = []; pickRepLabels = []; editGroupId = null; editSpecId = null; if (!popupEl?._keep) closePopup();
  render(); renderProps(); updateTip();
}
/* Mode de choix des membres d'un groupe (Ctrl+clic) */
function startGroupTool(kind, preset = [], editId = null, cfIds = [], repLabelIds = []) {
  setTool(kind);
  const ok = id => kind === 'ref' ? !!SF(id) : !!P(id);
  pick = preset.filter(ok); editGroupId = editId;
  if (kind === 'rep') pickCFs = cfIds.filter(id => C(id) && [C(id).a, C(id).b].some(sid => pick.includes(SF(sid).pieceId)));
  if (kind === 'fonc') pickRepLabels = repLabelIds.filter(id => G(id)?.kind === 'rep');
  render(); updateTip();
}
function commitGroup() {
  if (!isGroupTool() || !pick.length) return;
  const existing = editGroupId && G(editGroupId);
  const prospective = { ...existing, id: editGroupId || uid(), kind: tool, members: pick.slice(),
    ...(tool === 'rep' ? { cfIds: pickCFs.slice() } : tool === 'fonc' ? { repLabelIds: pickRepLabels.slice() } : {}) };
  const groups = existing ? S().groups.map(g => g.id === prospective.id ? prospective : g) : [prospective, ...S().groups];
  const error = referenceConfigurationError(S(), groups);
  if (error) { toast(error); $('#pickErr').textContent = error; return; }
  checkpoint();
  let g;
  if (editGroupId && G(editGroupId)) {
    g = G(editGroupId); g.members = pick.slice();
    if (tool === 'rep') g.cfIds = pickCFs.slice();
    if (tool === 'fonc') g.repLabelIds = pickRepLabels.slice();
  }
  else g = createGroup(tool, pick.slice(), pickCFs, pickRepLabels);
  cleanupOrphans();
  setTool('select'); sel.clear(); sel.add(g.id); changed();
}
function togglePick(id) {
  const i = pick.indexOf(id); if (i >= 0) pick.splice(i, 1); else pick.push(id);
  if (tool === 'rep') pickCFs = pickCFs.filter(id => C(id) && [C(id).a, C(id).b].some(sid => pick.includes(SF(sid).pieceId)));
  render();
}
/* ===== Outil Spécification (cadre de tolérance) ===== */
function commitSpec() {
  if (tool !== 'spec' || !pick.length) return toast('Choisissez au moins une surface ou un groupe de surfaces.');
  const ids = pick.slice(); pick = [];
  const sp = createSpec(ids);
  if (!sp) return toast('Les composants sélectionnés doivent appartenir à la même pièce.');
  setTool('select'); sel.clear(); sel.add(sp.id); changed();
  toast('Spécification créée — sections, indications adjacentes et indication complémentaire dans le panneau de droite.');
}
function endSpecEdit() {
  const id = editSpecId;
  setTool('select');
  if (id && (S().isoSpecs || []).some(x => x.id === id)) { sel.clear(); sel.add(id); changed(); }
}
function toggleCollapse(g) {
  if (!g || g.kind !== 'fonc') return;
  const error = referenceConfigurationError(S(), S().groups.map(x => x.id === g.id ? { ...x, collapsed: !x.collapsed } : x));
  if (error) return toast(error);
  checkpoint(); g.collapsed = !g.collapsed;
  sel.clear(); sel.add(g.id); changed();
}
$('#pickbar').addEventListener('click', e => {
  const b = e.target.closest('[data-pb]'); if (!b) return;
  if (b.dataset.pb === 'ok') {
    if (tool === 'spec') { if (editSpecId) endSpecEdit(); else commitSpec(); }
    else commitGroup();
  } else setTool('select');
});

/* ===== Actions d'édition ===== */
let clip = null, pasteN = 0;
function doDelete() { if (!sel.size) return; checkpoint(); deleteIds([...sel]); sel.clear(); changed(); }
function copySel() { if (!sel.size) return; clip = collect([...sel]); pasteN = 0; toast('Copié'); }
function pasteClip() {
  if (!clip) return; checkpoint(); pasteN++;
  const off = clip.from === S().id ? 40 * pasteN : 0;
  const ids = pasteData(clip, off); sel.clear(); ids.forEach(i => sel.add(i)); changed();
}
function duplicateSel() { if (!sel.size) return; const c = clip, n = pasteN; clip = collect([...sel]); pasteN = 0; pasteClip(); clip = c; pasteN = n; }
function invertSel() { const all = S().pieces.map(p => p.id); const cur = new Set(sel); sel.clear(); all.forEach(id => { if (!cur.has(id)) sel.add(id); }); changed(); }
function selectAll() { sel.clear(); S().pieces.forEach(p => sel.add(p.id)); S().groups.forEach(g => sel.add(g.id)); S().cfgs.forEach(c => sel.add(c.id)); (S().notes || []).forEach(n => sel.add(n.id)); (S().isoRefs || []).forEach(r => sel.add(r.id)); (S().isoSpecs || []).forEach(x => sel.add(x.id)); changed(); }
function extractToSheet() {
  if (!sel.size) return;
  const data = collect([...sel]); checkpoint();
  const sh = newSheet(S().name + ' – extrait'); sh.view = clone(S().view);
  doc.sheets.splice(doc.sheets.indexOf(S()) + 1, 0, sh); doc.active = sh.id;
  sel.clear(); pasteData(data, 0); changed(); toast('Zone extraite dans une nouvelle feuille');
}

/* Crée une référence par pièce et pièce partenaire, si au moins deux surfaces
   distinctes de la première pièce sont reliées à cette même partenaire. */
function autoCreateReferences() {
  const sheet = S(), byId = new Map(sheet.surfaces.map(surface => [surface.id, surface]));
  const byPair = new Map();
  for (const link of connections(sheet)) {
    const a = byId.get(link.a), b = byId.get(link.b);
    if (!a || !b || a.pieceId === b.pieceId) continue;
    for (const [surface, other] of [[a, b], [b, a]]) {
      const key = JSON.stringify([surface.pieceId, other.pieceId]);
      if (!byPair.has(key)) byPair.set(key, new Set());
      byPair.get(key).add(surface.id);
    }
  }

  const existing = new Set(sheet.groups.filter(g => g.kind === 'ref')
    .map(g => JSON.stringify([...new Set(g.members)].sort())));
  const seenCandidates = new Set();
  const candidates = [...byPair.values()]
    .map(members => [...members].sort())
    .filter(members => {
      if (members.length < 2) return false;
      const key = JSON.stringify(members);
      if (existing.has(key) || seenCandidates.has(key)) return false;
      seenCandidates.add(key);
      return true;
    });
  if (!candidates.length) {
    toast('Aucune nouvelle référence à créer (il faut au moins 2 surfaces liées à la même pièce).');
    return;
  }

  // Vérifie les références une par une : une configuration incompatible ne bloque
  // pas la création des autres groupes qui, eux, peuvent être ajoutés.
  const groups = sheet.groups.slice(), accepted = [];
  let incompatible = 0;
  for (const members of candidates) {
    const prospective = { id: uid(), kind: 'ref', members };
    if (referenceConfigurationError(sheet, [...groups, prospective])) {
      incompatible++;
      continue;
    }
    groups.push(prospective);
    accepted.push(members);
  }
  if (!accepted.length) {
    toast(`Aucune référence ajoutée : ${incompatible} groupe(s) incompatible(s) avec la disposition des surfaces.`);
    return;
  }

  checkpoint();
  accepted.forEach(members => createGroup('ref', members));
  cleanupCycles();
  changed();
  const result = `${accepted.length} référence${accepted.length > 1 ? 's' : ''} créée${accepted.length > 1 ? 's' : ''}`;
  toast(`${result}${incompatible ? ` ; ${incompatible} incompatible${incompatible > 1 ? 's' : ''} ignorée${incompatible > 1 ? 's' : ''}` : ''}.`);
}

/* ===== Vue ===== */
function zoomAt(f, cx, cy) {
  const v = S().view, k = clampN(v.k * f, 0.08, 6); f = k / v.k;
  v.x = cx - (cx - v.x) * f; v.y = cy - (cy - v.y) * f; v.k = k; renderView(); renderOverlay(); autosave();
}
function fitView() {
  const bb = contentBBox(), r = stage.getBoundingClientRect(), v = S().view;
  if (!bb) { v.x = r.width / 2; v.y = r.height / 2; v.k = 1; renderView(); renderOverlay(); autosave(); return; }
  const w = bb.x1 - bb.x0 + 80, h = bb.y1 - bb.y0 + 80;
  v.k = clampN(Math.min(r.width / w, r.height / h), 0.08, 2);
  v.x = r.width / 2 - (bb.x0 + bb.x1) / 2 * v.k; v.y = r.height / 2 - (bb.y0 + bb.y1) / 2 * v.k;
  renderView(); renderOverlay(); autosave();
}

/* ===== Souris ===== */
function hitOf(e) {
  const specBend = e.target.closest('[data-spec-bend]'); if (specBend) return { kind: 'specBend', id: specBend.dataset.specBend, ti: specBend.dataset.ti };
  const bend = e.target.closest('[data-bend-id]'); if (bend) return { kind: 'bend', id: bend.dataset.bendId };
  const h = e.target.closest('[data-handle]'); if (h) return { kind: 'handle', id: h.dataset.pid, handle: h.dataset.handle };
  const n = e.target.closest('[data-id]'); if (!n) return null;
  return { kind: n.dataset.kind, id: n.dataset.id };
}
function pieceOfHit(h) { if (!h) return null; if (h.kind === 'piece' || h.kind === 'nominal') return h.id; if (h.kind === 'surface') return SF(h.id).pieceId; return null; }
function colorKeyOf(h) { return h && ['piece', 'surface', 'liaison', 'group', 'cfg', 'llabel'].includes(h.kind) ? 'color' : null; }

svg.addEventListener('contextmenu', e => e.preventDefault());
let lastDown = { t: 0, x: 0, y: 0, key: null };
svg.addEventListener('pointerdown', e => {
  if (!popupEl?._keep) closePopup();
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  const pt = toWorld(e), h = hitOf(e);
  if (e.ctrlKey || e.metaKey || e.shiftKey || spaceDown || e.button !== 0) lastDown.t = 0;
  if (e.button === 0 && tool === 'select' && !spaceDown && !e.ctrlKey && !e.metaKey && !e.shiftKey && !(h && ['gtoggle', 'bend', 'specBend', 'handle'].includes(h.kind))) {
    const key = h ? h.kind + ':' + h.id : 'background';
    const now = performance.now(), isDbl = lastDown.t > 0 && key === lastDown.key && now - lastDown.t < 380 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 6;
    lastDown = { t: isDbl ? 0 : now, x: e.clientX, y: e.clientY, key };
    if (isDbl) { drag = null; marquee = null; onDouble(h, pt, e); return; }
  }
  if (e.button === 1 || e.button === 2 || (e.button === 0 && (spaceDown || (tool === 'select' && !h && !e.shiftKey)))) {
    e.preventDefault(); const v = S().view;
    drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y, moved: false,
      clearOnClick: e.button === 0 && !spaceDown && !e.ctrlKey && !e.metaKey }; stage.classList.add('panning');
    svg.setPointerCapture(e.pointerId); return;
  }
  if (e.button !== 0) return;
  svg.setPointerCapture(e.pointerId);

  if (h?.kind === 'specBend') {
    const ref=(S().isoRefs||[]).find(x=>x.id===h.id);
    if(ref) { drag={type:'specBend',ref,start:pt,snap:snapshot(),moved:false}; return; }
    const sp=(S().isoSpecs||[]).find(x=>x.id===h.id), t=sp&&(sp.targets||[])[+h.ti];
    if(sp&&t) drag={type:'specBend',target:t,start:pt,snap:snapshot(),moved:false};
    return;
  }
  if (tool === 'isoRef') {
    const target = isoComponentFromHit(h);
    if (!target) return toast('Cliquez sur une surface ou un groupe de surfaces de référence.');
    if (!isoTargetOwner(target)) return toast('Le groupe doit contenir uniquement des surfaces d’une même pièce.');
    createIsoReference(target.targetKind, target.targetId);
    return;
  }
  if (tool === 'spec') {
    const target = isoComponentFromHit(h);
    if (!target) return toast('Cliquez sur une surface ou un groupe de surfaces.');
    const owner = isoTargetOwner(target);
    if (!owner) return toast('Le groupe doit contenir uniquement des surfaces d’une même pièce.');
    if (editSpecId) {
      const sp = (S().isoSpecs || []).find(x => x.id === editSpecId);
      if (!sp) { setTool('select'); return; }
      if (owner !== sp.ownerPieceId) return toast('Une spécification ne peut viser que des composants de sa pièce.');
      const index = (sp.targets || []).findIndex(t => t.targetKind === target.targetKind && t.targetId === target.targetId);
      if (index >= 0 && sp.targets.length === 1) return toast('La spécification doit rester liée à au moins un composant.');
      checkpoint();
      if (index >= 0) sp.targets.splice(index, 1);
      else {
        const linked = { ...target, tip: 'arrow' };
        const elbow = specDefaultElbow(sp, linked);
        linked.elbowX = elbow.x; linked.elbowY = elbow.y;
        sp.targets.push(linked);
      }
      changed(); updateTip(); return;
    }
    const first = pick.length ? isoComponentFromId(pick[0]) : null;
    if (first && isoTargetOwner(first) !== owner) return toast('Tous les composants d’une spécification doivent appartenir à la même pièce.');
    togglePick(target.targetId); render(); updateTip(); return;
  }
  if (tool === 'cycle') {
    if (h && (h.kind === 'surface' || (['group', 'glabel'].includes(h.kind) && G(h.id)?.kind === 'ref'))) pickCycleNode(h.id, e.ctrlKey || e.metaKey);
    else toast('Choisissez une surface ou un groupe de références (pas une pièce).');
    return;
  }
  if (isGroupTool()) {
    if (tool === 'fonc' && h?.kind === 'glabel' && G(h.id)?.kind === 'rep') {
      if (!pick.length) return toast('Choisissez d’abord au moins une pièce du groupe fonctionnel.');
      const i = pickRepLabels.indexOf(h.id); if (i >= 0) pickRepLabels.splice(i, 1); else pickRepLabels.push(h.id);
      render(); updateTip(); return;
    }
    if (tool === 'rep' && h?.kind === 'surface') {
      const cf = cfOfSurface(h.id);
      if (cf) {
        if (![cf.a, cf.b].some(sid => pick.includes(SF(sid).pieceId))) return toast('Choisissez d’abord une pièce répétée reliée à cette CF.');
        const i = pickCFs.indexOf(cf.id); if (i >= 0) pickCFs.splice(i, 1); else pickCFs.push(cf.id);
        render(); updateTip(); return;
      }
    }
    if (tool === 'ref') { if (h && h.kind === 'surface') togglePick(h.id); }
    else {
      const pid = pieceOfHit(h), cg = h && h.kind === 'group' && G(h.id);
      if (pid) togglePick(pid);
      else if (cg && cg.kind === 'fonc' && cg.collapsed) {
        const ms = cg.members.filter(P), all = ms.every(m => pick.includes(m));
        ms.forEach(m => { const i = pick.indexOf(m); if (all && i >= 0) pick.splice(i, 1); else if (!all && i < 0) pick.push(m); });
        if (tool === 'rep') pickCFs = pickCFs.filter(id => C(id) && [C(id).a, C(id).b].some(sid => pick.includes(SF(sid).pieceId)));
        render();
      }
    }
    return;
  }
  if (tool === 'pipette') {
    const o = h && obj(h.id); if (o && o.color) { $('#curColor').value = rgbToHex(o.color); toast('Couleur prélevée : ' + o.color); setTool('paint'); }
    return;
  }
  if (tool === 'paint') { const o = h && obj(h.id); if (o) { checkpoint(); if (kindOf(o.id) === 'cfg') setCFColor(o, $('#curColor').value); else o.color = $('#curColor').value; changed(); } return; }
  if (tool === 'piece') { if (!h || h.kind === 'group') pieceDialog(pt); else { sel.clear(); sel.add(h.id); changed(); } return; }
  if (tool === 'note') { noteDialog(pt); return; }
  if (tool === 'liaison') {
    const pid = pieceOfHit(h);
    if (!pid && h && h.kind === 'group' && G(h.id)?.collapsed) return toast('Développez le groupe (bouton +) pour créer une liaison avec une de ses pièces');
    if (!pid) { pick = []; render(); updateTip(); return; }
    if (pick[0] === pid) return toast('Choisissez une pièce différente');
    pick.push(pid);
    if (pick.length === 2) { const [a, b] = pick; pick = []; setTool('select'); liaisonDialog(a, b); }
    else { render(); updateTip(); }
    return;
  }
  if (tool === 'cfg') {
    const id = pieceOfHit(h);
    if (!id) return toast('Choisissez deux pièces. Développez les groupes fonctionnels si nécessaire.');
    if (pick[0] === id) return toast('Choisissez une pièce différente pour la CF.');
    pick.push(id);
    if (pick.length === 2) { const [a, b] = pick; setTool('select'); cfDialog(a, b); }
    else { render(); renderProps(); }
    updateTip(); return;
  }

  // ---- outil sélection ----
  if (h && ['isoRef','isoSpec'].includes(h.kind)) {
    if (e.ctrlKey || e.shiftKey || e.metaKey) { if(sel.has(h.id)) sel.delete(h.id); else sel.add(h.id); }
    else if(!sel.has(h.id)){sel.clear();sel.add(h.id);}
    renderProps(); render();
    if(sel.has(h.id)){
      const o=obj(h.id);
      drag={type:'specMove',o,kind:h.kind,start:pt,x:o.x,y:o.y,
        ex:Number.isFinite(o.elbowX)?o.elbowX:null,ey:Number.isFinite(o.elbowY)?o.elbowY:null,
        exs:(o.targets||[]).map(t=>Number.isFinite(t.elbowX)?t.elbowX:null),
        eys:(o.targets||[]).map(t=>Number.isFinite(t.elbowY)?t.elbowY:null),
        snap:snapshot(),moved:false};
    }
    return;
  }
  if (h && h.kind === 'nominal') {
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      if (sel.has(h.id)) sel.delete(h.id); else sel.add(h.id);
      renderProps(); renderOverlay(); return;
    }
    const p = P(h.id), n = nominalGeometry(p);
    sel.clear(); sel.add(p.id); renderProps(); renderOverlay();
    drag = { type: 'nominal', p, start: pt, grab: { x: pt.x - n.x, y: pt.y - n.y }, snap: snapshot(), moved: false };
    return;
  }
  if (h && h.kind === 'bend') {
    drag = { type: 'bend', l: L(h.id) || C(h.id), start: pt, snap: snapshot(), moved: false };
    return;
  }
  if (h && h.kind === 'gtoggle') { toggleCollapse(G(h.id)); return; }
  if (h && h.kind === 'glabel') {
    const g = G(h.id);
    if (!sel.has(g.id)) { sel.clear(); sel.add(g.id); renderProps(); }
    const c = membersCenter(g), lp = groupLabelPosition(g);
    drag = { type: 'glabel', g, c, grab: lp ? { x: pt.x - lp.x, y: pt.y - lp.y } : { x: 0, y: 0 }, snap: snapshot(), moved: false }; render(); return;
  }
  if (h && h.kind === 'handle') {
    const p = P(h.id), g = G(h.id);
    if (p) drag = { type: 'resize', p, handle: h.handle, snap: snapshot(), rx: p.rx, ry: p.ry, moved: false };
    else if (g?.kind === 'fonc' && g.collapsed) {
      const host = groupHost(g);
      if (host) drag = { type: 'resizeGroup', g, handle: h.handle, snap: snapshot(), rx: host.rx, ry: host.ry, x: host.x, y: host.y, moved: false };
    }
    return;
  }
  if (h && h.kind === 'llabel') {
    if (!sel.has(h.id)) { sel.clear(); sel.add(h.id); renderProps(); }
    drag = { type: 'label', l: L(h.id), snap: snapshot(), moved: false }; render(); return;
  }
  if (h) {
    const id = h.id;
    if (e.ctrlKey || e.shiftKey || e.metaKey) { if (sel.has(id)) sel.delete(id); else sel.add(id); }
    else if (!sel.has(id)) { sel.clear(); sel.add(id); }
    renderProps(); render();
    if (['piece', 'surface', 'group', 'note'].includes(h.kind) && sel.has(id)) startMove(pt);
    return;
  }
  if (!(e.ctrlKey || e.shiftKey)) sel.clear();
  marquee = { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y, add: e.ctrlKey || e.shiftKey };
  drag = { type: 'marquee' }; renderProps(); render();
});

function startMove(pt) {
  const s = S(), mp = new Set();
  for (const id of sel) {
    const k = kindOf(id);
    if (k === 'piece') mp.add(id);
    if (k === 'group') { const g = G(id); if (g.kind !== 'ref') g.members.forEach(m => mp.add(m)); }
  }
  const surfs = [...sel].map(SF).filter(x => x && !mp.has(x.pieceId));
  const attached = [
    ...(S().isoRefs || []).filter(x => mp.has(x.ownerPieceId || (x.targetKind === 'piece' ? x.targetId : ''))).map(o => ({ kind: 'isoRef', o, x: o.x, y: o.y, ex: o.elbowX, ey: o.elbowY })),
    ...(S().isoSpecs || []).filter(x => mp.has(x.ownerPieceId || (x.targets || []).find(t => t.targetKind === 'piece')?.targetId)).map(o => ({ kind: 'isoSpec', o, x: o.x, y: o.y, elbows: (o.targets || []).map(t => [t.elbowX, t.elbowY]) }))
  ];
  drag = {
    type: 'move', start: pt, snap: snapshot(), moved: false,
    pieces: [...mp].map(P).filter(Boolean).map(p => [p, p.x, p.y]),
    surfs: surfs.map(x => [x, x.dx, x.dy]),
    notes: [...sel].map(id => (S().notes || []).find(n => n.id === id)).filter(Boolean).map(n => [n, n.x, n.y]),
    attached
  };
}

svg.addEventListener('pointermove', e => {
  if (!drag) return;
  const pt = toWorld(e);
  if (drag.type === 'pan') {
    const v = S().view, dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (Math.hypot(dx, dy) >= 3) { drag.moved = true; lastDown.t = 0; }
    v.x = drag.vx + dx; v.y = drag.vy + dy; renderView(); return;
  }
  if (drag.type === 'specMove') {
    const dx=pt.x-drag.start.x,dy=pt.y-drag.start.y;
    if(!drag.moved && Math.hypot(dx,dy)*S().view.k<3)return;
    if(!drag.moved){checkpoint(drag.snap);drag.moved=true;lastDown.t=0;}
    drag.o.x=drag.x+dx;drag.o.y=drag.y+dy;
    if(drag.kind==='isoRef'){
      if(Number.isFinite(drag.ex))drag.o.elbowX=drag.ex+dx;
      if(Number.isFinite(drag.ey))drag.o.elbowY=drag.ey+dy;
    } else {
      (drag.o.targets||[]).forEach((t,i)=>{
        if(Number.isFinite(drag.exs[i]))t.elbowX=drag.exs[i]+dx;
        if(Number.isFinite(drag.eys[i]))t.elbowY=drag.eys[i]+dy;
      });
    }
    render();return;
  }
  if (drag.type === 'specBend') {
    if(!drag.moved && Math.hypot(pt.x-drag.start.x,pt.y-drag.start.y)*S().view.k<3)return;
    if(!drag.moved){checkpoint(drag.snap);drag.moved=true;lastDown.t=0;}
    const o=drag.ref||drag.target;
    o.elbowX=pt.x;o.elbowY=pt.y;render();return;
  }
  if (drag.type === 'nominal') {
    if (!drag.moved && Math.hypot(pt.x - drag.start.x, pt.y - drag.start.y) * S().view.k < 3) return;
    if (!drag.moved) { checkpoint(drag.snap); drag.moved = true; lastDown.t = 0; }
    const n = nominalGeometry(drag.p, { dx: pt.x - drag.grab.x - drag.p.x, dy: pt.y - drag.grab.y - drag.p.y });
    drag.p.nominal = { dx: n.dx, dy: n.dy };
    $('#l-nominal').innerHTML = nominalSVG(); $('#l-nominal-labels').innerHTML = nominalSVG(true);
    return;
  }
  if (drag.type === 'marquee') { marquee.x1 = pt.x; marquee.y1 = pt.y; renderOverlay(); return; }
  if (drag.type === 'move') {
    const dx = pt.x - drag.start.x, dy = pt.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) * S().view.k < 3) return;
    if (!drag.moved) { checkpoint(drag.snap); drag.moved = true; lastDown.t = 0; }
    drag.pieces.forEach(([p, x, y]) => { p.x = x + dx; p.y = y + dy; });
    drag.surfs.forEach(([s, x, y]) => { const p = P(s.pieceId); s.pinned = true; s.ang = angleOnPiece(p, p.x + x + dx, p.y + y + dy); });
    drag.notes.forEach(([n, x, y]) => { n.x = x + dx; n.y = y + dy; });
    drag.attached.forEach(gps => {
      gps.o.x = gps.x + dx; gps.o.y = gps.y + dy;
      if (gps.kind === 'isoRef') {
        if (Number.isFinite(gps.ex)) gps.o.elbowX = gps.ex + dx;
        if (Number.isFinite(gps.ey)) gps.o.elbowY = gps.ey + dy;
      } else (gps.o.targets || []).forEach((t, i) => {
        if (Number.isFinite(gps.elbows[i]?.[0])) t.elbowX = gps.elbows[i][0] + dx;
        if (Number.isFinite(gps.elbows[i]?.[1])) t.elbowY = gps.elbows[i][1] + dy;
      });
    });
    render(); return;
  }
  if (drag.type === 'resize' || drag.type === 'resizeGroup') {
    const group = drag.type === 'resizeGroup';
    const target = group ? drag.g : drag.p, cx = group ? drag.x : target.x, cy = group ? drag.y : target.y;
    if (!drag.moved) { checkpoint(drag.snap); drag.moved = true; }
    let rx = drag.rx, ry = drag.ry;
    if (drag.handle !== 's') rx = Math.max(30, Math.abs(pt.x - cx));
    if (drag.handle !== 'e') ry = Math.max(30, Math.abs(pt.y - cy));
    if (drag.handle === 'se' && e.shiftKey) { const f = Math.max(rx / drag.rx, ry / drag.ry); rx = drag.rx * f; ry = drag.ry * f; }
    if (group) { target.crx = rx; target.cry = ry; }
    else { target.rx = rx; target.ry = ry; }
    render(); return;
  }
  if (drag.type === 'glabel') {
    if (!drag.c) return;
    if (!drag.moved) { checkpoint(drag.snap); drag.moved = true; }
    drag.g.lab = { dx: pt.x - drag.grab.x - drag.c.x, dy: pt.y - drag.grab.y - drag.c.y };
    if (drag.g.kind === 'fonc' && drag.g.collapsed) {
      const label = manualLab(drag.g);
      drag.g.lab = { dx: label.x - drag.c.x, dy: label.y - drag.c.y };
    }
    render(); return;
  }
  if (drag.type === 'label') {
    const g = linkGeom(drag.l); if (!g) return;
    if (!drag.moved) { checkpoint(drag.snap); drag.moved = true; }
    drag.l.t = nearestLinkT(g, pt); render();
  }
  if (drag.type === 'bend') {
    if (!drag.moved && Math.hypot(pt.x - drag.start.x, pt.y - drag.start.y) * S().view.k < 3) return;
    if (!drag.moved) { checkpoint(drag.snap); drag.moved = true; }
    const g = linkGeom(drag.l), dx = g.bx - g.ax, dy = g.by - g.ay, len = Math.hypot(dx, dy) || 1;
    drag.l.bend = (pt.x - (g.ax + g.bx) / 2) * -dy / len + (pt.y - (g.ay + g.by) / 2) * dx / len;
    render();
  }
});

svg.addEventListener('pointerup', e => {
  if (!drag) return;
  const d = drag; drag = null; stage.classList.remove('panning');
  if (d.type === 'pan') {
    if (!d.moved && d.clearOnClick) { sel.clear(); renderOverlay(); renderProps(); }
    autosave(); return;
  }
  if (d.type === 'marquee') {
    const m = marquee; marquee = null;
    const x0 = Math.min(m.x0, m.x1), x1 = Math.max(m.x0, m.x1), y0 = Math.min(m.y0, m.y1), y1 = Math.max(m.y0, m.y1);
    if (x1 - x0 > 2 || y1 - y0 > 2) {
      const inR = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
      S().pieces.forEach(p => { if (inR(p.x, p.y)) sel.add(p.id); });
      S().groups.forEach(g => { const pts = groupPoints(g); if (pts.length && pts.every(([x, y]) => inR(x, y))) sel.add(g.id); });
      S().cfgs.forEach(c => { const a = endPos(c.a), b = endPos(c.b); if (a && b && inR(a.x, a.y) && inR(b.x, b.y)) sel.add(c.id); });
    }
    changed(); return;
  }
  if (d.moved) changed(); else render();
});
svg.addEventListener('pointercancel', () => {
  const d = drag; drag = null; marquee = null; stage.classList.remove('panning');
  if (d?.type === 'pan') autosave(); else if (d) changed();
});

function onDouble(h, pt, e) {
  render();
  if (h && h.kind === 'note') return noteDialog(null, h.id);
  if (h && h.kind === 'isoRef') {
    const ref=(S().isoRefs||[]).find(x=>x.id===h.id); if(!ref) return;
    if(isoType(ref)!=='partial') return askText('Identifiant de l’indicateur ISO',ref.text||'A',v=>{if(v){checkpoint();ref.text=v;changed();}});
    const b = el(`<div>
      <div class="row"><label>Texte haut</label><input type="text" id="isoTxtTop" value="${esc(ref.text||'')}"></div>
      <div class="row"><label>Texte bas</label><input type="text" id="isoTxtBot" value="${esc(ref.textBottom||'')}"></div>
      <div class="row"><label></label><label><input type="checkbox" id="isoItTop" ${ref.italic?'checked':''}> Italique haut</label> <label><input type="checkbox" id="isoItBot" ${ref.italicBottom?'checked':''}> Italique bas</label></div>
    </div>`);
    return openModal({ title: 'Référence partielle', body: b, onOk: () => {
      checkpoint();
      ref.text = $('#isoTxtTop', b).value.trim();
      ref.textBottom = $('#isoTxtBot', b).value.trim();
      ref.italic = $('#isoItTop', b).checked;
      ref.italicBottom = $('#isoItBot', b).checked;
      changed();
    } });
  }
  if (h && h.kind === 'isoSpec') return specDialog(h.id);
  if (h && h.kind === 'nominal') { checkpoint(); delete P(h.id).nominal; changed(); return; }
  if (h && h.kind === 'glabel') { const g = G(h.id); checkpoint(); g.lab = null; changed(); return; }
  if (h && h.kind === 'group' && G(h.id).kind === 'fonc') return toggleCollapse(G(h.id));
  if (!h || (h.kind === 'group' && G(h.id).kind === 'rep')) return pieceDialog(pt);
  if (h.kind === 'piece') { setTool('liaison'); pick = [h.id]; render(); updateTip(); return; }
  if (h.kind === 'liaison' || h.kind === 'llabel') { const l = L(h.id); return liaisonDialog(SF(l.a).pieceId, SF(l.b).pieceId, l.id); }
  if (h.kind === 'torseur') { const l = L(h.id); return l ? liaisonDialog(SF(l.a).pieceId, SF(l.b).pieceId, l.id) : null; }
  if (h.kind === 'cfg') { const c = C(h.id); return cfDialog(SF(c.a).pieceId, SF(c.b).pieceId, c.id); }
  if (h.kind === 'group' || h.kind === 'cfg' || h.kind === 'surface') { const i = $('#props [data-k=name]'); if (i) { i.focus(); i.select(); } }
}

svg.addEventListener('wheel', e => {
  e.preventDefault(); const r = svg.getBoundingClientRect();
  zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
}, { passive: false });

/* ===== Clavier ===== */
const TOOL_KEYS = { h: 'select', v: 'select', p: 'piece', l: 'liaison', r: 'rep', g: 'fonc', t: 'ref', c: 'cfg', y: 'cycle', n: 'note', i: 'pipette', b: 'paint', s: 'spec' };
document.addEventListener('keydown', e => {
  if (modalOpen) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (['input', 'textarea', 'select'].includes(tag)) return;
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (e.key === ' ') { spaceDown = true; e.preventDefault(); return; }
  if (ctrl) {
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    else if (k === 'c') { e.preventDefault(); copySel(); }
    else if (k === 'v') { e.preventDefault(); pasteClip(); }
    else if (k === 'd') { e.preventDefault(); duplicateSel(); }
    else if (k === 'a') { e.preventDefault(); selectAll(); }
    else if (k === 'i') { e.preventDefault(); invertSel(); }
    else if (k === 's') { e.preventDefault(); saveJSON(); }
    else if (k === 'e') { e.preventDefault(); exportPNG(); }
    return;
  }
  if (e.key === 'Escape') { closePopup(); sel.clear(); setTool('select'); return; }
  if (tool === 'cycle' && e.key === 'Backspace') { e.preventDefault(); cycleAction('back'); return; }
  if (tool === 'cycle' && e.key === 'Enter') { e.preventDefault(); saveCycleDialog(); return; }
  if (tool === 'spec' && e.key === 'Enter') { e.preventDefault(); if (editSpecId) endSpecEdit(); else commitSpec(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); doDelete(); return; }
  if (e.key === 'Enter' && tool === 'piece') { pieceDialog(null); return; }
  if (e.key === 'Enter' && isGroupTool()) { e.preventDefault(); commitGroup(); return; }
  if (e.key === '0') { fitView(); return; }
  if (e.key === '+' || e.key === '=') { const r = stage.getBoundingClientRect(); zoomAt(1.2, r.width / 2, r.height / 2); return; }
  if (e.key === '-') { const r = stage.getBoundingClientRect(); zoomAt(1 / 1.2, r.width / 2, r.height / 2); return; }
  if (e.key.startsWith('Arrow') && sel.size) {
    e.preventDefault(); const st = e.shiftKey ? 10 : 1;
    const dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0;
    checkpoint();
    const movedPieces = new Set([...sel].map(P).filter(Boolean).map(p => p.id));
    [...movedPieces].map(P).filter(Boolean).forEach(p => { p.x += dx; p.y += dy; });
    (S().isoRefs || []).filter(ref => movedPieces.has(ref.ownerPieceId)).forEach(ref => {
      ref.x += dx; ref.y += dy;
      if (Number.isFinite(ref.elbowX)) ref.elbowX += dx;
      if (Number.isFinite(ref.elbowY)) ref.elbowY += dy;
    });
    (S().isoSpecs || []).filter(spec => movedPieces.has(spec.ownerPieceId)).forEach(spec => {
      spec.x += dx; spec.y += dy;
      (spec.targets || []).forEach(target => {
        if (Number.isFinite(target.elbowX)) target.elbowX += dx;
        if (Number.isFinite(target.elbowY)) target.elbowY += dy;
      });
    });
    changed(false); return;
  }
  if (TOOL_KEYS[k]) {
    if (k === 'l') { const ps = [...sel].filter(id => kindOf(id) === 'piece'); if (ps.length === 2) return liaisonDialog(ps[0], ps[1]); setTool('liaison'); return; }
    if (k === 'p') { pieceDialog(null); return; }
    if (['r', 'g', 't'].includes(k)) { startGroupTool(TOOL_KEYS[k], [...sel]); return; }
    setTool(TOOL_KEYS[k]);
  }
});
document.addEventListener('keyup', e => { if (e.key === ' ') spaceDown = false; });
document.addEventListener('pointerdown', e => { if (popupEl && !popupEl._keep && !e.composedPath().some(n => n === popupEl || n === svg)) closePopup(); });

/* ===== Barre d'outils ===== */
$('#toolbar').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.tool) {
    const t = b.dataset.tool;
    if (t === 'piece') { pieceDialog(null); return; }
    if (t === 'liaison') { const ps = [...sel].filter(id => kindOf(id) === 'piece'); if (ps.length === 2) return liaisonDialog(ps[0], ps[1]); setTool('liaison'); return; }
    if (['rep', 'fonc', 'ref'].includes(t)) { if (tool === t) setTool('select'); else startGroupTool(t, [...sel]); return; }
    setTool(tool === t && t !== 'select' ? 'select' : t); return;
  }
  toolbarAction(b.dataset.act);
});
async function toolbarAction(a) {
  const r = stage.getBoundingClientRect();
  switch (a) {
    case 'new': askConfirm('Nouveau document', 'Effacer le document courant ? (pensez à l\'enregistrer avant)', () => { checkpoint(); doc = newDoc(); storageBlocked = false; sel.clear(); setTool('select'); fitView(); changed(); }); break;
    case 'open': $('#fileInput').click(); break;
    case 'save': saveJSON(); break;
    case 'png': exportPNG(); break;
    case 'svgx': exportSVG(); break;
    case 'pptx': exportPPTX(); break;
    case 'pdf': exportPDF(); break;
    case 'cyclo': closedLoopsDialog(); break;
    case 'refauto': autoCreateReferences(); break;
    case 'isogps': if (popupEl) closePopup(); else openIsoPopup(); break;
    case 'copyimg': copyImage(); break;
    case 'undo': undo(); break;
    case 'redo': redo(); break;
    case 'dup': duplicateSel(); break;
    case 'del': doDelete(); break;
    case 'eyedrop': { const c = await eyeDrop(); if (c) { $('#curColor').value = c; setTool('paint'); } break; }
    case 'zoomin': zoomAt(1.2, r.width / 2, r.height / 2); break;
    case 'zoomout': zoomAt(1 / 1.2, r.width / 2, r.height / 2); break;
    case 'fit': fitView(); break;
    case 'grid': doc.settings.grid = !doc.settings.grid; changed(false); break;
    case 'surfaces': doc.settings.showSurfaces = doc.settings.showSurfaces === false; changed(false); break;
    case 'details': checkpoint(); doc.settings.showDetails = !doc.settings.showDetails; changed(); break;
    case 'torseurs': checkpoint(); doc.settings.showTorseurs = !doc.settings.showTorseurs; changed(); break;
    case 'nominal0': {
      checkpoint();
      const visible = !(S().showNominalZero ?? doc.settings.showNominalZero);
      doc.settings.showNominalZero = visible; doc.sheets.forEach(s => delete s.showNominalZero);
      changed(); break;
    }
    case 'settings': settingsDialog(); break;
    case 'github': window.open('https://github.com/GillesDLT/Graphes-des-contacts', '_blank', 'noopener'); break;
    case 'referenceimage': referenceImageAction('open'); break;
    case 'help': helpDialog(); break;
  }
}
$('#fileInput').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const o = JSON.parse(await f.text()); checkpoint(); loadDoc(o); storageBlocked = false; sel.clear(); setTool('select'); changed(); fitView(); toast('Document ouvert'); }
  catch (err) { toast('Erreur : ' + err.message); }
  e.target.value = '';
});

/* ===== Onglets ===== */
$('#tabs').addEventListener('click', e => {
  const del = e.target.closest('[data-delsheet]');
  if (del) { const sh = doc.sheets.find(s => s.id === del.dataset.delsheet); askConfirm('Supprimer la feuille', `Supprimer « ${esc(sh.name)} » ?`, () => { checkpoint(); const i = doc.sheets.indexOf(sh); doc.sheets.splice(i, 1); if (doc.active === sh.id) doc.active = doc.sheets[Math.max(0, i - 1)].id; cycleDraft = null; pick = []; pickCFs = []; pickRepLabels = []; editGroupId = null; sel.clear(); changed(); updateTip(); }); return; }
  const tab = e.target.closest('[data-sheet]');
  if (tab) { if (tab.dataset.sheet === doc.active) return; doc.active = tab.dataset.sheet; cycleDraft = null; sel.clear(); pick = []; pickCFs = []; pickRepLabels = []; editGroupId = null; changed(); updateTip(); return; }
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.act === 'addsheet') { checkpoint(); const sh = newSheet('Graphe ' + (doc.sheets.length + 1)); const r = stage.getBoundingClientRect(); sh.view = { x: r.width / 2, y: r.height / 2, k: 1 }; doc.sheets.push(sh); doc.active = sh.id; cycleDraft = null; pick = []; pickCFs = []; pickRepLabels = []; editGroupId = null; sel.clear(); changed(); updateTip(); }
  if (b.dataset.act === 'dupsheet') { checkpoint(); const sh = clone(S()); sh.id = uid(); sh.name = S().name + ' – copie'; doc.sheets.splice(doc.sheets.indexOf(S()) + 1, 0, sh); doc.active = sh.id; cycleDraft = null; pick = []; pickCFs = []; pickRepLabels = []; editGroupId = null; sel.clear(); changed(); updateTip(); toast('Feuille dupliquée'); }
});
$('#tabs').addEventListener('dblclick', e => {
  const tab = e.target.closest('[data-sheet]'); if (!tab) return;
  const sh = doc.sheets.find(s => s.id === tab.dataset.sheet);
  askText('Renommer la feuille', sh.name, v => { if (v) { checkpoint(); sh.name = v; changed(); } });
});

/* ===== Export ===== */
/* Police ISO embarquée en base64 dans les exports (SVG/PNG/PDF) : les images SVG
   ne chargent pas les polices externes. Si le chargement échoue (ex. file://),
   les textes ISO retombent sur la police de secours de leur pile. */
const isoFontEmbed = { normal: '', italic: '' };
(async () => {
  try {
    for (const [k, url] of [['normal', 'fonts/osifont.woff'], ['italic', 'fonts/osifont-italic.woff']]) {
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      isoFontEmbed[k] = btoa(bin);
    }
  } catch (e) { /* police non chargeable : exports avec police de secours */ }
})();
function isoFontStyle() {
  if (!isoFontEmbed.normal) return '';
  const face = (style, data) => `@font-face{font-family:'osifont';src:url(data:font/woff;base64,${data}) format('woff');font-weight:normal;font-style:${style}}`;
  return `<style>${face('normal', isoFontEmbed.normal)}${isoFontEmbed.italic ? face('italic', isoFontEmbed.italic) : ''}</style>`;
}
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
const fileBase = () => S().name.replace(/[^\w\-À-ÿ ]+/g, '_').trim() || 'graphe';
function saveJSON() { exportFileDialog({ title: 'Enregistrer le graphe JSON', extension: '.json', mime: 'application/json', makeBlob: () => new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' }) }); }
function buildExportSVG({ transparentBackground = false } = {}) {
  if (!S().pieces.length && !(S().notes || []).length && !(S().isoRefs || []).length && !(S().isoSpecs || []).length) { toast('Graphe vide'); return null; }
  const box = $('#content').getBBox(), bb = { x0: box.x, y0: box.y, x1: box.x + box.width, y1: box.y + box.height };
  const m = 40, x = bb.x0 - m, y = bb.y0 - m, w = bb.x1 - bb.x0 + 2 * m, h = bb.y1 - bb.y0 + 2 * m;
  // Sérialiser le DOM SVG plutôt que de recopier innerHTML : les <text>/<tspan>
  // restent de vrais nœuds SVG dans le fichier exporté (notamment dans PowerPoint).
  const exported = $('#content').cloneNode(true);
  exported.removeAttribute('id');
  exported.querySelectorAll('[data-kind="gtoggle"], title').forEach(n => n.remove());
  exported.querySelectorAll('[data-id], [data-kind]').forEach(n => { n.removeAttribute('data-id'); n.removeAttribute('data-kind'); });
  exported.querySelectorAll('text').forEach(t => {
    const ff = t.getAttribute('font-family') || '';
    t.setAttribute('font-family', ff.includes('osifont') ? ISO_FONT : 'Arial, Liberation Sans, sans-serif');
    t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
  });
  const inner = new XMLSerializer().serializeToString(exported);
  return { w, h, str: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${r1(w)}" height="${r1(h)}" viewBox="${r1(x)} ${r1(y)} ${r1(w)} ${r1(h)}" font-family="Arial, Liberation Sans, sans-serif" shape-rendering="geometricPrecision" text-rendering="geometricPrecision"><title>${esc(S().name)} — Graphe des contacts</title><desc>Graphe vectoriel comprenant pièces, surfaces, liaisons, groupes et notes.</desc>${isoFontStyle()}${transparentBackground ? '' : `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" fill="#ffffff"/>`}${inner}</svg>` };
}
function exportSVG() { exportFileDialog({ title: 'Exporter en SVG vectoriel', extension: '.svg', mime: 'image/svg+xml', makeBlob: () => { const s = buildExportSVG(); return s ? new Blob([s.str], { type: 'image/svg+xml;charset=utf-8' }) : null; } }); }
function renderPNG(scale = 3) {
  const s = buildExportSVG({ transparentBackground: true }); if (!s) return Promise.resolve(null);
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = Math.ceil(s.w * scale); c.height = Math.ceil(s.h * scale);
      const ctx = c.getContext('2d'); ctx.scale(scale, scale); ctx.drawImage(img, 0, 0, s.w, s.h); c.toBlob(res, 'image/png');
    };
    img.onerror = () => res(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s.str);
  });
}
function exportPNG() { exportFileDialog({ title: 'Exporter en PNG', extension: '.png', mime: 'image/png', makeBlob: renderPNG }); }
function exportPDF() {
  const printWindow = window.open('', '_blank');
  if (!printWindow) { toast('Autorisez les fenêtres surgissantes pour créer le PDF.'); return; }
  const originalDoc = doc, originalTool = tool, originalCycleDraft = cycleDraft;
  const originalSelection = [...sel], originalPick = pick, originalPickCFs = pickCFs;
  const originalPickRepLabels = pickRepLabels, originalMarquee = marquee;
  const sourceSheet = originalDoc.sheets.find(s => s.id === originalDoc.active) || originalDoc.sheets[0];
  if (!sourceSheet.pieces.length && !(sourceSheet.notes || []).length && !(sourceSheet.isoRefs || []).length && !(sourceSheet.isoSpecs || []).length) {
    printWindow.close(); toast('Graphe vide : rien à exporter.'); return;
  }
  const cycles = sourceSheet.cycles.filter(c => !cycleError(c, sourceSheet)).slice().sort((a, b) => a.num - b.num);
  const pages = [];
  try {
    tool = 'select'; cycleDraft = null; pick = []; pickCFs = []; pickRepLabels = []; marquee = null;
    sel.clear();
    // Page 1: vue d'ensemble complète, avec l'état d'affichage courant des cycles.
    doc = clone(originalDoc);
    render();
    const overview = buildExportSVG();
    if (overview) pages.push({ svg: overview.str, title: 'Vue d’ensemble' });
    // Pages suivantes: mêmes instantanés isolés que l'action « Extraire en feuille ».
    for (const cycle of cycles) {
      doc = clone(originalDoc);
      const snapshot = cycleSnapshotSheet(sourceSheet, cycle);
      doc.sheets = [snapshot]; doc.active = snapshot.id;
      render();
      const svg = buildExportSVG();
      if (svg) pages.push({ svg: svg.str, title: cycleName(cycle) });
    }
  } catch (error) {
    printWindow.close(); toast('Préparation du PDF impossible : ' + (error?.message || error)); return;
  } finally {
    doc = originalDoc; tool = originalTool; cycleDraft = originalCycleDraft;
    pick = originalPick; pickCFs = originalPickCFs; pickRepLabels = originalPickRepLabels;
    marquee = originalMarquee; sel.clear(); originalSelection.forEach(id => sel.add(id));
    render();
  }
  if (!pages.length) { printWindow.close(); toast('Aucune page exploitable à exporter.'); return; }
  const pageHtml = pages.map((page, i) => `<section class="page"><header><b>${esc(sourceSheet.name)}</b><span>${esc(page.title)} · ${i + 1} / ${pages.length}</span></header><main>${page.svg}</main></section>`).join('');
  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(fileBase())}.pdf</title><style>
    @page{size:A4 landscape;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif;color:#1f2430}
    .page{width:296mm;height:209mm;padding:8mm;display:flex;flex-direction:column;break-after:page;overflow:hidden}
    .page:last-child{break-after:auto}.page header{height:10mm;flex:none;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #d7dbe3;margin-bottom:3mm;font-size:10pt}
    .page main{flex:1;min-height:0;display:flex;align-items:center;justify-content:center}.page svg{display:block;width:100%;height:100%;object-fit:contain}
    @media screen{body{background:#e5e7eb}.page{background:#fff;margin:12px auto;padding:8mm;box-shadow:0 2px 12px #0003}}
    @media print{.page{margin:0}}
  </style></head><body>${pageHtml}<script>window.addEventListener('load',()=>setTimeout(()=>{window.focus();window.print()},250));</script></body></html>`);
  printWindow.document.close();
  toast(`PDF prêt : vue d’ensemble puis ${cycles.length} cycle(s) isolé(s). Choisissez « Enregistrer au format PDF » dans la fenêtre d’impression.`);
}
function exportPPTX() { exportFileDialog({ title: 'Exporter en PowerPoint (formes modifiables)', extension: '.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', makeBlob: makePptxBlob }); }
async function copyImage() {
  try { const b = await renderPNG(); if (!b) return; await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); toast('Image copiée dans le presse-papier'); }
  catch (e) { toast('Copie impossible : utilisez Export PNG'); }
}

/* ===== Démarrage ===== */
$('#curColor').addEventListener('input', () => { if (tool !== 'paint') setTool('paint'); });
window.addEventListener('resize', () => render());
(function init() {
  let loaded = false, loadError = null;
  try { const s = localStorage.getItem(LS_KEY); if (s) { loadDoc(JSON.parse(s)); loaded = true; } }
  catch (e) { doc = newDoc(); storageBlocked = true; loadError = e; }
  if (!loaded) { const r = stage.getBoundingClientRect(); S().view = { x: r.width / 2, y: r.height / 2, k: 1 }; }
  changed(); updateTip();
  if (loadError) {
    toast('Document non chargé : ' + loadError.message + ' Stockage conservé ; ouvrez un JSON ou créez un nouveau document.');
    $('#props').prepend(el(`<p class="err">Document non chargé : ${esc(loadError.message)} Le stockage original est conservé. Ouvrez un fichier JSON ou créez un nouveau document pour reprendre l’enregistrement automatique.</p>`));
  }
})();
