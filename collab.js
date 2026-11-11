'use strict';
/* =====================================================================
   collab.js — partage en direct (plusieurs personnes sur le même graphe)
   ---------------------------------------------------------------------
   • un board = un document stocké sur le petit serveur du dossier server/
   • l'application envoie des opérations ciblées (sync-core.js) : deux
     personnes peuvent déplacer deux pièces différentes en même temps
   • présence : nom, couleur, curseur et sélection de chaque participant
   • lien permanent : https://…/index.html#/b/<id>
   ===================================================================== */

const COLLAB = (() => {
  const CFG_KEY = 'graphe.collab.server';
  const ID_KEY = 'graphe.identity';
  const COLORS = ['#2b7de9', '#e0533d', '#3fa34d', '#a259d6', '#e08b1f', '#0f9b8e', '#c2436f', '#5b6b8c'];

  const base = () => {
    const v = localStorage.getItem(CFG_KEY);
    if (v !== null) return v.trim();
    return (window.GRAPHE_COLLAB && window.GRAPHE_COLLAB.server || '').trim();
  };
  const apiBase = () => base().replace(/\/+$/, '');
  const wsBase = () => apiBase().replace(/^http/, 'ws');

  const readIdentity = () => {
    let o = null;
    try { o = JSON.parse(localStorage.getItem(ID_KEY) || 'null'); } catch {}
    if (!o || !o.name) o = { name: 'Invité ' + Math.floor(10 + Math.random() * 89), color: COLORS[Math.floor(Math.random() * COLORS.length)] };
    if (!o.color) o.color = COLORS[0];
    return o;
  };
  const identity = readIdentity();
  const saveIdentity = () => { try { localStorage.setItem(ID_KEY, JSON.stringify(identity)); } catch {} };

  const cid = uid();
  let socket = null, board = null, attempt = 0, firstInit = true, applying = false, opTimer = null;
  let baseline = null, state = 'off', lastCursor = null, cursorTimer = 0;
  const peers = new Map();
  /* Compteurs de diagnostic (fenêtre Partage > Diagnostics) */
  const stats = { init: 0, merge: 0, opsSent: 0, opsRecv: 0, adopt: 0, reconnect: 0 };

  /* ---------- HTTP ---------- */
  async function api(path, opts = {}) {
    if (!apiBase()) throw new Error('Serveur de partage non configuré');
    const res = await fetch(apiBase() + path, Object.assign({
      headers: { 'Content-Type': 'application/json' }
    }, opts));
    const txt = await res.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : {}; } catch { data = { error: txt.slice(0, 200) }; }
    if (!res.ok) throw new Error(data && data.error || ('HTTP ' + res.status));
    return data;
  }

  /* ---------- État affiché ---------- */
  function setState(s, msg) {
    state = s;
    const el = $('#collabState');
    if (el) {
      el.hidden = !board;
      el.dataset.state = s;
      el.textContent = s === 'live' ? 'En direct' : s === 'connecting' ? 'Connexion…' : s === 'retry' ? 'Reconnexion…' : s === 'error' ? (msg || 'Hors ligne') : '';
      el.title = s === 'live' ? `${peers.size + 1} personne(s) sur ce graphe` : (msg || '');
    }
  }

  /* ---------- Envoi des modifications locales ---------- */
  function onLocalChange() {
    if (!board || applying) return;
    clearTimeout(opTimer);
    opTimer = setTimeout(flush, 180);
  }

  function flush() {
    if (!board || !socket || socket.readyState !== 1) return;
    const snap = JSON.stringify(GraphSync.cleanDoc(doc));
    if (!baseline) { baseline = snap; return; }
    if (snap === baseline) return;
    let ops;
    try { ops = GraphSync.diff(JSON.parse(baseline), JSON.parse(snap)); } catch { return; }
    baseline = snap;
    if (ops.length) { stats.opsSent++; try { socket.send(JSON.stringify({ t: 'ops', ops })); } catch {} }
  }

  /* ---------- Réception ---------- */
  function patchHistory(ops) {
    for (const stack of [history.undo, history.redo]) {
      for (let i = 0; i < stack.length; i++) {
        try { const o = JSON.parse(stack[i]); GraphSync.apply(o, ops); stack[i] = JSON.stringify(o); } catch {}
      }
    }
  }

  function applyRemote(ops) {
    if (!Array.isArray(ops) || !ops.length) return;
    applying = true;
    try {
      GraphSync.apply(doc, ops);
      patchHistory(ops);
    } finally { applying = false; }
    if (!doc.sheets.some(s => s.id === doc.active) && doc.sheets.length) doc.active = doc.sheets[0].id;
    baseline = JSON.stringify(GraphSync.cleanDoc(doc));
    try { pruneSel(); } catch {}
    /* Ne pas reconstruire le panneau pendant une saisie : le champ garderait le focus perdu. */
    const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest('#props, .modal');
    changed(!typing); updateTip();
    renderPeers();
  }

  function adoptDoc(next) {
    if (!next || !Array.isArray(next.sheets) || !next.sheets.length) return;
    stats.adopt++;
    /* Les interrupteurs d'affichage restent ceux de ce poste. */
    const keepSettings = {};
    (GraphSync.LOCAL_SETTINGS || []).forEach(k => { if (doc && doc.settings && k in doc.settings) keepSettings[k] = doc.settings[k]; });
    if (next.settings) Object.assign(next.settings, keepSettings);
    const views = new Map((doc.sheets || []).map(s => [s.id, s.view]));
    const active = doc.active;
    next.sheets.forEach(s => {
      const v = views.get(s.id);
      s.view = v ? JSON.parse(JSON.stringify(v)) : (s.view || { x: 0, y: 0, k: 1 });
    });
    doc = next;
    doc.active = next.sheets.some(s => s.id === active) ? active : next.sheets[0].id;
    baseline = JSON.stringify(GraphSync.cleanDoc(doc));
    try { pruneSel(); } catch {}
    const r = stage.getBoundingClientRect();
    next.sheets.forEach(s => { if (!s.view.k) s.view = { x: r.width / 2, y: r.height / 2, k: 1 }; });
    changed(); updateTip(); renderPeers();
  }

  function handle(msg) {
    if (!msg || !msg.t) return;
    if (msg.t === 'init') {
      clearTimeout(reconnectTimer);
      attempt = 0;
      stats.init++;
      setState('live');
      if (firstInit) {
        firstInit = false;
        adoptDoc(JSON.parse(JSON.stringify(msg.doc)));
      } else {
        stats.merge++;
        /* Reconnexion : on rejoue d'abord les modifications locales faites hors ligne. */
        const local = JSON.parse(JSON.stringify(GraphSync.cleanDoc(doc)));
        const server = JSON.parse(JSON.stringify(msg.doc));
        const pending = GraphSync.diff(server, local);
        GraphSync.apply(server, pending);
        adoptDoc(server);
        if (pending.length && socket && socket.readyState === 1) socket.send(JSON.stringify({ t: 'ops', ops: pending }));
      }
      if (board && msg.name && msg.name !== board.name) { board.name = msg.name; refreshBoardName(); }
      peers.clear();
      (msg.peers || []).forEach(p => peers.set(p.cid, p));
      renderPeers(); renderPresence();
      return;
    }
    if (msg.t === 'ops') { stats.opsRecv++; applyRemote(msg.ops); return; }
    if (msg.t === 'resync') { adoptDoc(JSON.parse(JSON.stringify(msg.doc))); return; }
    if (msg.t === 'p') {
      const p = peers.get(msg.cid) || { cid: msg.cid };
      Object.assign(p, { name: msg.name, color: msg.color, sheet: msg.sheet, cursor: msg.cursor, sel: msg.sel || [] });
      peers.set(msg.cid, p);
      renderPeers(); renderPresence();
      return;
    }
    if (msg.t === 'join') {
      peers.set(msg.cid, { cid: msg.cid, name: msg.name, color: msg.color, sheet: null, cursor: null, sel: [] });
      renderPresence();
      return;
    }
    if (msg.t === 'bye') { peers.delete(msg.cid); renderPeers(); renderPresence(); return; }
    if (msg.t === 'meta') {
      if (board) { board.name = msg.name; refreshBoardName(); }
      return;
    }
    if (msg.t === 'error') { toast(msg.message); setState('error', msg.message); }
  }

  /* ---------- Connexion ---------- */
  let reconnectTimer = null;
  function connect() {
    if (!board || !apiBase()) return;
    try { if (socket) { socket.onclose = null; socket.close(); } } catch {}
    setState(attempt ? 'retry' : 'connecting');
    const url = `${wsBase()}/ws?board=${encodeURIComponent(board.id)}&cid=${cid}`
      + `&name=${encodeURIComponent(identity.name)}&color=${encodeURIComponent(identity.color)}`;
    let ws;
    try { ws = new WebSocket(url); } catch (e) { toast('Connexion impossible : ' + e.message); setState('error'); return; }
    socket = ws;
    ws.onopen = () => { attempt = 0; setState('live'); };
    ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch { return; } handle(m); };
    ws.onclose = ev => {
      if (socket !== ws) return;
      socket = null;
      if (!board) return;
      if (ev.code === 4004) { setState('error', 'Board supprimé'); toast('Ce board a été supprimé par son auteur.'); board = null; renderPresence(); return; }
      attempt++;
      setState('retry');
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, Math.min(15000, 800 * attempt));
    };
    ws.onerror = () => {};
  }

  /* ---------- Présence ---------- */
  function presencePayload() {
    return {
      t: 'p', name: identity.name, color: identity.color,
      sheet: doc.active,
      cursor: lastCursor,
      sel: [...sel].slice(0, 60)
    };
  }
  let lastPresence = '';
  function sendPresence(force) {
    if (!socket || socket.readyState !== 1 || !board) return;
    const p = presencePayload();
    const key = JSON.stringify([p.sheet, p.cursor, p.sel, p.name, p.color]);
    if (!force && key === lastPresence) return;
    lastPresence = key;
    try { socket.send(JSON.stringify(p)); } catch {}
  }
  setInterval(() => { if (board) sendPresence(); }, 450);

  function initials(name) {
    return (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
  }

  function renderPresence() {
    const host = $('#presence');
    if (!host) return;
    if (!board) { host.innerHTML = ''; setState('off'); return; }
    host.innerHTML = `<span class="peer me" style="--pc:${identity.color}" title="Vous (${esc(identity.name)})">${esc(initials(identity.name))}</span>` +
      [...peers.values()].map(p => `<span class="peer" style="--pc:${esc(p.color || '#888')}" title="${esc(p.name || 'Invité')}${p.sheet && p.sheet !== doc.active ? ' — sur un autre graphe' : ''}">${esc(initials(p.name))}${p.sheet && p.sheet !== doc.active ? '<i class="away"></i>' : ''}</span>`).join('');
    const st = $('#collabState');
    if (st) st.title = `${peers.size + 1} personne(s) sur ce graphe`;
    /* La fenêtre Partager, si elle est ouverte, suit les arrivées et départs. */
    const list = document.querySelector('#shPeersList');
    if (list) {
      list.textContent = peers.size
        ? `${peers.size + 1} personne(s) connectée(s) : ` + [identity.name, ...[...peers.values()].map(x => x.name || 'Invité')].join(', ')
        : 'Vous êtes seul pour le moment.';
    }
  }

  function renderPeers() {
    const g = $('#l-peers');
    if (!g) return;
    if (!board) { if (g.innerHTML) g.innerHTML = ''; return; }
    const k = S().view.k;
    let html = '';
    for (const p of peers.values()) {
      if (p.sheet !== doc.active) continue;
      const color = p.color || '#888';
      for (const id of (p.sel || [])) {
        const kd = kindOf(id);
        if (kd === 'piece') {
          const pc = P(id); if (!pc) continue;
          html += `<ellipse cx="${r1(pc.x)}" cy="${r1(pc.y)}" rx="${r1(pc.rx + 8 / k)}" ry="${r1(pc.ry + 8 / k)}" fill="none" stroke="${esc(color)}" stroke-opacity="0.55" stroke-width="${2.2 / k}" stroke-dasharray="${6 / k} ${4 / k}"/>`;
        } else if (kd === 'surface') {
          const sf = SF(id); if (!sf) continue;
          const c = spos(sf);
          html += `<circle cx="${r1(c.x)}" cy="${r1(c.y)}" r="${r1(sf.r + 6 / k)}" fill="none" stroke="${esc(color)}" stroke-opacity="0.6" stroke-width="${2 / k}"/>`;
        }
      }
      if (p.cursor && typeof p.cursor.x === 'number') {
        const s = 1 / k;
        html += `<g transform="translate(${r1(p.cursor.x)},${r1(p.cursor.y)}) scale(${r1(s * 100) / 100})" opacity="0.95">` +
          `<path d="M0 0 L0 17 L4.6 12.8 L7.6 19.6 L10.4 18.4 L7.4 11.8 L13.4 11.4 Z" fill="${esc(color)}" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>` +
          `<text x="15" y="17" font-size="11.5" font-weight="600" fill="#fff" stroke="${esc(color)}" stroke-width="3.4" paint-order="stroke" stroke-linejoin="round">${esc(p.name || 'Invité')}</text></g>`;
      }
    }
    if (g.innerHTML !== html) g.innerHTML = html;
  }

  /* curseur local -> présence */
  function trackCursor(e) {
    if (!board) return;
    const now = performance.now();
    if (now - cursorTimer < 90) return;
    cursorTimer = now;
    try { const pt = toWorld(e); lastCursor = { x: Math.round(pt.x * 10) / 10, y: Math.round(pt.y * 10) / 10 }; } catch {}
  }

  /* ---------- Cycle de vie d'un board ---------- */
  function refreshBoardName() {
    if (!board) return;
    const p = Projects.get(board.projectId);
    if (p && p.name !== board.name) { p.name = board.name; Projects.persist(); }
    renderProjectBadge();
  }

  async function joinBoard(project) {
    leaveBoard({ silent: true });
    if (!apiBase()) { toast('Configurez le serveur de partage pour synchroniser ce graphe.'); return; }
    board = { id: project.boardId, projectId: project.id, name: project.name };
    firstInit = true; baseline = null; peers.clear();
    try {
      const r = await api('/api/boards/' + encodeURIComponent(project.boardId));
      if (r.doc) adoptDoc(JSON.parse(JSON.stringify(r.doc)));
      if (r.name && r.name !== board.name) { board.name = r.name; refreshBoardName(); }
    } catch (e) {
      toast('Board indisponible (' + e.message + ') — la copie locale reste utilisable.');
      board = null; renderPresence(); return;
    }
    try { window.history.replaceState(null, '', '#/b/' + board.id); } catch {}
    connect();
    renderPresence(); renderPeers(); setState('connecting');
  }

  function leaveBoard(opts = {}) {
    clearTimeout(reconnectTimer);
    const wasBoard = !!board;
    board = null;
    try { if (socket) { socket.onclose = null; socket.close(1000); } } catch {}
    socket = null; peers.clear(); baseline = null; firstInit = true;
    renderPresence(); renderPeers(); setState('off');
    if (wasBoard && !opts.silent) { try { window.history.replaceState(null, '', location.pathname + location.search); } catch {} }
  }

  /* ---------- Création / suppression ---------- */
  async function shareProject(projectId) {
    const p = Projects.get(projectId);
    if (!p) return;
    if (!apiBase()) return shareDialog(projectId);
    try {
      const d = Projects.docOf(projectId);
      if (!d) throw new Error('Document illisible');
      const res = await api('/api/boards', { method: 'POST', body: JSON.stringify({ name: p.name, doc: d }) });
      Projects.update(projectId, { kind: 'board', boardId: res.id, key: res.key, name: res.name || p.name });
      if (projectId === Projects.current) joinBoard(Projects.get(projectId));
      shareDialog(projectId);
    } catch (e) { toast('Partage impossible : ' + e.message); }
  }

  async function renameBoard(p, name) {
    if (!p || p.kind !== 'board' || !apiBase()) return;
    try { await api('/api/boards/' + p.boardId, { method: 'PATCH', body: JSON.stringify({ name }) }); }
    catch (e) { /* le nom local reste modifié */ }
  }

  async function deleteBoard(p) {
    if (!p || p.kind !== 'board' || !apiBase() || !p.key) return;
    try { await api('/api/boards/' + p.boardId, { method: 'DELETE', body: JSON.stringify({ key: p.key }) }); }
    catch (e) { toast('Suppression du lien impossible : ' + e.message); }
  }

  /* ---------- Fenêtre de partage ---------- */
  function shareUrl(p) {
    return location.origin + location.pathname + '#/b/' + p.boardId;
  }

  function shareDialog(projectId) {
    const p = Projects.get(projectId || (Projects.current));
    if (!p) return;
    const configured = !!apiBase();
    const isBoard = p.kind === 'board' && p.boardId;

    const body = el(`<div style="width:560px">
      <div class="row" style="align-items:center;gap:10px;margin-bottom:6px">
        <label style="width:120px">Votre nom</label>
        <input type="text" id="shName" value="${esc(identity.name)}" style="width:160px" title="Nom affiché aux autres participants">
        <input type="color" id="shColor" value="${esc(identity.color)}" title="Votre couleur">
      </div>
      <div class="row" style="align-items:center;gap:10px">
        <label style="width:120px">Serveur</label>
        <input type="text" id="shServer" value="${esc(base())}" placeholder="https://graphe.exemple.fr" style="flex:1" title="Adresse du serveur de partage (dossier server/)">
        <button id="shSave">Enregistrer</button>
      </div>
      <hr style="border:none;border-top:1px solid #eceef2;margin:14px 0">
      ${isBoard ? `
        <p><b>${esc(p.name)}</b> est partagé. Toute personne munie de ce lien voit et modifie le même graphe en direct.</p>
        <div class="row" style="gap:6px"><input type="text" id="shLink" readonly value="${esc(shareUrl(p))}" style="flex:1"><button id="shCopy" class="primary">Copier le lien</button></div>
        <p class="muted">Le lien reste valable même quand vous fermez le navigateur. Vous pouvez aussi l'envoyer par courriel.</p>
        <div class="row" style="gap:6px;margin-top:10px"><button id="shOpen">Ouvrir dans un nouvel onglet</button><button id="shTake" class="danger">Repasser en local</button></div>
        <p class="muted" id="shPeersList">${peers.size ? peers.size + 1 + ' personne(s) connectée(s) : ' + [identity.name, ...[...peers.values()].map(x => x.name)].map(esc).join(', ') : 'Vous êtes seul pour le moment.'}</p>
      ` : `
        <p>Le projet <b>${esc(p.name)}</b> n'est enregistré que dans ce navigateur. Créez un lien de partage pour l'ouvrir depuis n'importe quel appareil, seul ou à plusieurs.</p>
        ${configured ? '<p class="muted">Le lien créera une copie du graphe sur le serveur de partage ; les modifications seront ensuite synchronisées en direct.</p>'
          : '<p class="err">Aucun serveur de partage configuré : renseignez l\'adresse du serveur ci-dessus (dossier <code>server/</code>) puis enregistrez.</p>'}
        <button id="shCreate" class="primary" ${configured ? '' : 'disabled'}>Créer le lien de partage</button>
      `}
    </div>`);

    const bd = openModal({ title: '🔗 Partager', body, wide: 620, noCancel: true });
    $('#shName', body).addEventListener('input', e => { identity.name = e.target.value.trim() || 'Invité'; saveIdentity(); renderPresence(); sendPresence(true); });
    $('#shColor', body).addEventListener('input', e => { identity.color = e.target.value; saveIdentity(); renderPresence(); sendPresence(true); });
    $('#shSave', body).onclick = () => {
      const v = $('#shServer', body).value.trim();
      try { localStorage.setItem(CFG_KEY, v); } catch {}
      closeModal();
      toast(v ? 'Serveur enregistré' : 'Serveur retiré');
      shareDialog(projectId);
    };
    if (isBoard) {
      $('#shCopy', body).onclick = async () => {
        const link = shareUrl(p);
        try { await navigator.clipboard.writeText(link); toast('Lien copié'); }
        catch { const i = $('#shLink', body); i.select(); document.execCommand && document.execCommand('copy'); toast('Lien sélectionné — Ctrl+C pour copier'); }
      };
      $('#shOpen', body).onclick = () => window.open(shareUrl(p), '_blank', 'noopener');
      $('#shTake', body).onclick = () => {
        askConfirm('Repasser en local', 'Le lien de partage cessera d\'être mis à jour pour vous ; les autres participants continuent avec le leur. Le graphe reste dans ce navigateur.', () => {
          leaveBoard();
          Projects.update(p.id, { kind: 'local', boardId: null, key: null });
          renderProjectBadge(); closeModal(); toast('Projet de nouveau local');
        });
      };
    } else {
      const btn = $('#shCreate', body);
      if (btn) btn.onclick = () => { closeModal(); shareProject(p.id); };
    }
    return bd;
  }

  /* ---------- Ouverture au démarrage ---------- */
  async function bootSession() {
    Projects.load();
    if (!Projects.items.length) Projects.migrate();

    const hash = (location.hash.match(/#\/b\/([A-Za-z0-9_-]{4,40})/) || [])[1];
    if (hash) {
      try {
        const r = await api('/api/boards/' + hash);
        let p = Projects.items.find(x => x.boardId === hash);
        if (!p) {
          p = { id: uid(), name: r.name || 'Graphe partagé', kind: 'board', boardId: hash, updated: Date.now() };
          Projects.items.unshift(p); Projects.persist();
        } else { p.kind = 'board'; p.boardId = hash; }
        Projects.current = p.id;
        try { localStorage.setItem(P_CUR + pSuffix, p.id); } catch {}
        loadDoc(r.doc);
        Collab.joinBoard(p);
        return { project: p, remote: true };
      } catch (e) {
        toast('Lien de partage indisponible : ' + e.message);
        try { window.history.replaceState(null, '', location.pathname + location.search); } catch {}
      }
    }

    let id = null;
    try { id = localStorage.getItem(P_CUR + pSuffix); } catch {}
    if (!id || !Projects.items.some(p => p.id === id)) id = Projects.items.length ? Projects.items[0].id : Projects.create('Mon premier projet');
    Projects.current = id;
    try { localStorage.setItem(P_CUR + pSuffix, id); } catch {}
    const p = Projects.get(id);
    const d = Projects.storedDoc(id);
    if (d) loadDoc(d);
    if (p.kind === 'board' && p.boardId) joinBoard(p);
    return { project: p, remote: false };
  }

  return {
    stats, identity, api, base, shareDialog, shareProject, shareUrl,
    joinBoard, leaveBoard, isLive: () => !!board, boardInfo: () => board,
    onLocalChange, renderPeers, renderPresence, bootSession,
    renameBoard, deleteBoard, setState,
    peers: () => peers,
    trackCursor
  };
})();

const Collab = COLLAB;
