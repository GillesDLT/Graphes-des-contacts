'use strict';
/* ===== Fenêtre « Nouvelle liaison » ===== */
function liaisonDialog(pidA, pidB, editId) {
  let A = P(pidA), B = P(pidB);
  if (!A || !B) return;
  const cards = [];
  let swapped = false;

  const defDetails = code => ({ point: ['ROT', 'RD', 'LA'].includes(ltype(code).symbol) ? 'O' : 'A', axe: 'x', normale: 'z', pas: '' });
  const newCard = (code = 'PG') => {
    const t = ltype(code);
    return { editId: null, type: code, count: 1, countA: 1, countB: 1, sa: 'new:' + t.sA, sb: 'new:' + t.sB, touchedA: false, touchedB: false, details: defDetails(code) };
  };
  const cardFromLiaison = l => {
    const sa = SF(l.a), sb = SF(l.b);
    const onA = sa.pieceId === A.id;
    return { editId: l.id, type: l.type, count: l.count, countA: (onA ? sa : sb).count || 1, countB: (onA ? sb : sa).count || 1, sa: 'ex:' + (onA ? sa.id : sb.id), sb: 'ex:' + (onA ? sb.id : sa.id), touchedA: true, touchedB: true, details: Object.assign(defDetails(l.type), clone(l.details || {})) };
  };
  const between = () => S().liaisons.filter(l => { const a = SF(l.a), b = SF(l.b); if (!a || !b) return false; return (a.pieceId === A.id && b.pieceId === B.id) || (a.pieceId === B.id && b.pieceId === A.id); });

  if (editId) cards.push(cardFromLiaison(L(editId))); else cards.push(newCard());

  const body = el(`<div style="width:640px">
    <div class="ld-head"><div class="ld-piece" id="ldA"></div><button id="ldSwap" title="Inverser les pièces">⇄</button><div class="ld-piece" id="ldB"></div></div>
    <div id="ldExist"></div>
    <div id="ldErr" class="err" role="alert"></div>
    <div id="ldCards"></div>
    <button id="ldAdd" class="primary" style="margin-top:4px">＋ Nouvelle liaison entre ces deux pièces</button>
  </div>`);

  const pieceBox = (p, id) => { const d = $(id, body); d.style.background = p.color; d.style.color = textOn(p.color); d.innerHTML = esc(p.name); };
  const surfOptions = (p, val) => {
    const news = doc.settings.surfaceTypes.map(t => `<option value="new:${esc(t.code)}" ${val === 'new:' + t.code ? 'selected' : ''}>${esc(t.code)} — ${esc(t.label)}</option>`).join('');
    const ex = S().surfaces.filter(s => s.pieceId === p.id && !cfOfSurface(s.id)).map(s => `<option value="ex:${s.id}" ${val === 'ex:' + s.id ? 'selected' : ''}>${esc(sname(s))}</option>`).join('');
    return `<optgroup label="Nouvelle surface">${news}</optgroup>${ex ? `<optgroup label="Surfaces existantes">${ex}</optgroup>` : ''}`;
  };
  // Noms prévisionnels des surfaces (nouvelles surfaces numérotées dans l'ordre des cartes)
  const plannedNames = () => {
    const cnt = { [A.id]: 0, [B.id]: 0 };
    return cards.map(c => {
      const nm = (val, p) => {
        if (val.startsWith('ex:')) { const s = SF(val.slice(3)); return s ? sname(s) : '?'; }
        cnt[p.id]++; return `${val.slice(4)}.${p.num}.${nextSurfIdx(p.id) + cnt[p.id] - 1}`;
      };
      return [nm(c.sa, A), nm(c.sb, B)];
    });
  };

  const drawExist = () => {
    const ex = between().filter(l => !cards.some(c => c.editId === l.id));
    $('#ldExist', body).innerHTML = ex.length ? `<h4 style="margin:6px 0">Liaisons existantes</h4>` + ex.map(l => {
      const sa = SF(l.a), sb = SF(l.b);
      return `<div class="ld-exist"><span>${symbolSVG(l.type, l.details, P(sa.pieceId).color, P(sb.pieceId).color, 34, false)}</span>
        <span class="t"><b>${vecHTML(liaisonLabel(l))}</b> ${vecHTML(detailText(l.type, l.details))} — ${esc(sname(sa))} ⟷ ${esc(sname(sb))}</span>
        <button data-edit="${l.id}">Modifier</button><button class="danger" data-del="${l.id}" title="Supprimer">🗑</button></div>`;
    }).join('') : '';
  };

  const cardHTML = (c, i) => {
    const t = ltype(c.type);
    const det = t.fields.map(f => {
      const isVec = f === 'axe' || f === 'normale';
      const label = `<label title="${FIELD_LABELS[f]}">${f === 'normale' ? 'n' : f === 'axe' ? 'axe' : f === 'pas' ? 'pas' : 'pt'}</label>`;
      if (!isVec) return label + `<input type="text" data-det="${f}" value="${esc(c.details[f] || '')}" title="${FIELD_LABELS[f]}">`;
      const mode = c.vectorModes?.[f] || (['x', 'y', 'z'].includes(c.details[f]) ? c.details[f] : 'custom');
      const custom = c.customDetails?.[f] ?? (mode === 'custom' ? c.details[f] || '' : '');
      return label + `<span class="vector-editor"><select data-vector="${f}" aria-label="${FIELD_LABELS[f]}">${['x', 'y', 'z', 'custom'].map(v => `<option value="${v}" ${mode === v ? 'selected' : ''}>${v === 'custom' ? 'Personnalisé…' : v}</option>`).join('')}</select><input type="text" data-det="${f}" data-custom-vector="${f}" value="${esc(custom)}" placeholder="ex. u_123, -x…" title="Un _ suivi d'un suffixe affiche ce suffixe en indice (ex. u_123)." aria-label="${FIELD_LABELS[f]} personnalisé" ${mode === 'custom' ? '' : 'hidden'}></span>`;
    }).join('') || '<span class="muted">aucun paramètre</span>';
    return `<div class="ld-card ${c.editId ? 'editing' : ''}" data-i="${i}">
      <button class="close" data-rm="${i}" title="Retirer cette carte">✕</button>
      <div>
        <div class="muted" style="margin-bottom:4px">${c.editId ? '✎ Modification de la liaison' : 'Type de liaison'} : <b>${esc(t.label)}</b></div>
        <div class="ld-types">${doc.settings.liaisonTypes.map(x => `<button data-type="${esc(x.code)}" title="${esc(x.label)}" class="${x.code === c.type ? 'active' : ''}">${esc(x.code)}</button>`).join('')}</div>
        <div class="ld-grid">
          <label>Répétition</label><span class="spin"><button data-cnt="-1">−</button><input type="number" min="1" data-count value="${c.count}"><button data-cnt="1">＋</button><span class="muted">&nbsp;fois</span></span>
          <label><span class="chip" style="background:${A.color};color:${textOn(A.color)}">${esc(A.name)}</span></label><div class="surface-choice"><select data-side="sa">${surfOptions(A, c.sa)}</select><label class="surface-repeat" title="Répétitions de la surface A">× <input aria-label="Répétitions surface A" type="number" min="1" step="1" data-scount="countA" value="${c.countA}"></label></div>
          <label><span class="chip" style="background:${B.color};color:${textOn(B.color)}">${esc(B.name)}</span></label><div class="surface-choice"><select data-side="sb">${surfOptions(B, c.sb)}</select><label class="surface-repeat" title="Répétitions de la surface B">× <input aria-label="Répétitions surface B" type="number" min="1" step="1" data-scount="countB" value="${c.countB}"></label></div>
          <label>Détails</label><div class="dets">${det}</div>
        </div>
      </div>
      <div class="ld-schema" title="Schéma cinématique (orienté selon l'axe / la normale)"></div>
      <div class="ld-preview"></div>
    </div>`;
  };
  const refreshCard = (i) => {
    const c = cards[i], node = $(`.ld-card[data-i="${i}"]`, body); if (!node) return;
    $('.ld-schema', node).innerHTML = symbolSVG(c.type, c.details, A.color, B.color, 150);
    const [na, nb] = plannedNames()[i];
    const lbl = repetitionText(c.count) + c.type, det = detailText(c.type, c.details);
    $('.ld-preview', node).innerHTML = `Rendu : <b>${esc(na)}</b> —— <b>${esc(lbl)}</b> ${vecHTML(det)} —— <b>${esc(nb)}</b>`;
  };
  const drawCards = () => {
    $('#ldCards', body).innerHTML = cards.map(cardHTML).join('');
    cards.forEach((_, i) => refreshCard(i));
    drawExist();
  };
  const drawAll = () => { pieceBox(A, '#ldA'); pieceBox(B, '#ldB'); drawCards(); };

  body.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    const node = t.closest('.ld-card'), i = node ? +node.dataset.i : -1, c = cards[i];
    if (t.dataset.type) {
      const prev = ltype(c.type); c.type = t.dataset.type; const nt = ltype(c.type);
      if (!c.touchedA && c.sa.startsWith('new:')) c.sa = 'new:' + nt.sA;
      if (!c.touchedB && c.sb.startsWith('new:')) c.sb = 'new:' + nt.sB;
      if (['ROT', 'RD', 'LA'].includes(nt.symbol) !== ['ROT', 'RD', 'LA'].includes(prev.symbol) && ['A', 'O'].includes(c.details.point)) c.details.point = defDetails(c.type).point;
      drawCards();
    } else if (t.dataset.cnt) { c.count = Math.max(1, c.count + +t.dataset.cnt); $('[data-count]', node).value = c.count; refreshCard(i); }
    else if (t.dataset.rm != null) { cards.splice(+t.dataset.rm, 1); drawCards(); }
    else if (t.dataset.edit) { cards.push(cardFromLiaison(L(t.dataset.edit))); drawCards(); }
    else if (t.dataset.del) {
      checkpoint(); deleteIds([t.dataset.del]);
      const lt = c => ltype(c.type);
      cards.forEach(c => {
        if (c.sa.startsWith('ex:') && !SF(c.sa.slice(3))) c.sa = 'new:' + lt(c).sA;
        if (c.sb.startsWith('ex:') && !SF(c.sb.slice(3))) c.sb = 'new:' + lt(c).sB;
      });
      changed(); drawCards();
    }
    else if (t.id === 'ldAdd') { const last = cards[cards.length - 1]; cards.push(newCard(last ? last.type : 'PG')); drawCards(); setTimeout(() => $('#ldCards', body).lastElementChild?.scrollIntoView({ block: 'nearest' }), 0); }
    else if (t.id === 'ldSwap') {
      [A, B] = [B, A]; swapped = !swapped;
      cards.forEach(c => { [c.sa, c.sb] = [c.sb, c.sa]; [c.countA, c.countB] = [c.countB, c.countA]; [c.touchedA, c.touchedB] = [c.touchedB, c.touchedA]; });
      drawAll();
    }
  });
  body.addEventListener('input', e => {
    const t = e.target, node = t.closest('.ld-card'); if (!node) return;
    const i = +node.dataset.i, c = cards[i];
    if (t.dataset.vector) {
      const f = t.dataset.vector, input = $(`[data-custom-vector="${f}"]`, node);
      c.vectorModes = c.vectorModes || {}; c.customDetails = c.customDetails || {};
      c.vectorModes[f] = t.value;
      input.hidden = t.value !== 'custom';
      c.details[f] = t.value === 'custom' ? input.value.trim() : t.value;
      if (!input.hidden) input.focus();
      refreshCard(i); return;
    }
    if (t.dataset.det) {
      c.details[t.dataset.det] = t.value.trim();
      if (t.dataset.customVector) {
        c.customDetails = c.customDetails || {}; c.customDetails[t.dataset.det] = t.value.trim();
        t.classList.toggle('invalid', !t.value.trim());
      }
    }
    if ('count' in t.dataset) c.count = Math.max(1, parseInt(t.value, 10) || 1);
    if (t.dataset.scount) c[t.dataset.scount] = Number(t.value);
    if (t.dataset.side) {
      c[t.dataset.side] = t.value; c[t.dataset.side === 'sa' ? 'touchedA' : 'touchedB'] = true;
      const key = t.dataset.side === 'sa' ? 'countA' : 'countB';
      c[key] = t.value.startsWith('ex:') ? SF(t.value.slice(3)).count || 1 : 1;
      $(`[data-scount="${key}"]`, node).value = c[key];
      cards.forEach((_, j) => refreshCard(j)); return;
    }
    refreshCard(i);
  });

  drawAll();
  openModal({
    title: '⟷ Liaisons entre deux pièces', body, okText: 'Valider', wide: 690,
    onOk: () => {
      if (!cards.length) return true;
      for (let i = 0; i < cards.length; i++) {
        const c = cards[i], missing = ltype(c.type).fields.find(f => ['axe', 'normale'].includes(f) && !c.details[f]?.trim());
        if (missing) {
          const input = $(`.ld-card[data-i="${i}"] [data-custom-vector="${missing}"]`, body);
          input.classList.add('invalid'); input.focus();
          toast('Précisez la direction personnalisée ou choisissez x, y ou z.'); return false;
        }
      }
      if (cards.some(c => ![c.countA, c.countB].every(n => Number.isSafeInteger(n) && n > 0))) {
        toast('Les répétitions des surfaces doivent être des entiers positifs.'); return false;
      }
      const surfaceCounts = new Map();
      for (const c of cards) for (const [val, count] of [[c.sa, c.countA], [c.sb, c.countB]]) {
        if (!val.startsWith('ex:')) continue;
        if (surfaceCounts.has(val) && surfaceCounts.get(val) !== count) { toast('Une surface partagée doit avoir le même nombre de répétitions sur toutes les cartes.'); return false; }
        surfaceCounts.set(val, count);
      }
      const plannedSurfaces = [], plannedLinks = cards.map(c => {
        const surface = (val, p) => {
          if (val.startsWith('ex:')) return val.slice(3);
          const f = { id: uid(), pieceId: p.id };
          plannedSurfaces.push(f); return f.id;
        };
        return { id: c.editId || uid(), a: surface(c.sa, A), b: surface(c.sb, B) };
      });
      const layoutError = referenceCreationError(plannedSurfaces, plannedLinks, cards.filter(c => c.editId).map(c => c.editId));
      if (layoutError) { $('#ldErr', body).textContent = layoutError; return false; }
      checkpoint();
      const angAB = Math.atan2(B.y - A.y, B.x - A.x), angBA = angAB + Math.PI;
      let last = null;
      for (const c of cards) {
        const resolve = (val, p, ang, sign) => val.startsWith('ex:') ? val.slice(3) : createSurface(p.id, val.slice(4), null, ang, sign).id;
        const sa = resolve(c.sa, A, angAB, 1), sb = resolve(c.sb, B, angBA, -1);
        SF(sa).count = c.countA; SF(sb).count = c.countB;
        const details = {}; ltype(c.type).fields.forEach(f => details[f] = c.details[f] || '');
        if (c.editId && L(c.editId)) { const l = L(c.editId); Object.assign(l, { a: sa, b: sb, type: c.type, count: c.count, details }); last = l; }
        else last = createLiaison(sa, sb, c.type, c.count, details);
      }
      cleanupOrphans();
      setTool('select'); sel.clear(); if (last) sel.add(last.id);
      changed(); updateTip();
    }
  });
}
