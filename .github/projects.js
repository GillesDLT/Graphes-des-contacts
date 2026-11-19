'use strict';
/* =====================================================================
   projects.js — plusieurs projets (documents) dans le même navigateur
   ---------------------------------------------------------------------
   • un index léger (nom, type, ordre, date) + un document par projet
   • l'ordre de la liste est celui choisi par l'utilisateur (glisser-déposer)
   • un projet peut rester local ou devenir un board partagé (Collab)
   ===================================================================== */

const P_INDEX = 'graphe.projects.v1';
const P_CUR = 'graphe.currentProject.v1';
const pSuffix = (() => { const v = new URLSearchParams(location.search).get('sandbox'); return v === null ? '' : '.sandbox' + (v ? '.' + encodeURIComponent(v) : ''); })();
const pDocKey = id => 'graphe.project.' + id + '.v1';
const pTime = t => {
  const d = Date.now() - (t || 0), m = Math.round(d / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60); if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24); if (j < 31) return `il y a ${j} j`;
  return new Date(t).toLocaleDateString('fr-FR');
};

const Projects = {
  items: [],
  current: null,

  load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(P_INDEX + pSuffix) || 'null'); } catch { raw = null; }
    this.items = Array.isArray(raw) ? raw.filter(p => p && p.id) : [];
    return this.items;
  },

  persist() {
    try { localStorage.setItem(P_INDEX + pSuffix, JSON.stringify(this.items)); }
    catch (e) { toast('Liste des projets non enregistrée : ' + e.message); }
  },

  /** Reprise de l'ancien document unique (grapheLiaisons.v1). */
  migrate() {
    let old = null;
    try { old = JSON.parse(localStorage.getItem('grapheLiaisons.v1' + pSuffix) || 'null'); } catch { old = null; }
    if (!old || !Array.isArray(old.sheets) || !old.sheets.length) return false;
    const id = uid();
    const name = old.sheets.length > 1 ? 'Mon graphe' : (old.sheets[0].name || 'Mon graphe');
    try { localStorage.setItem(pDocKey(id), JSON.stringify(old)); } catch (e) { toast('Reprise impossible : ' + e.message); return false; }
    this.items.unshift({ id, name, kind: 'local', updated: Date.now() });
    this.persist();
    try { localStorage.setItem(P_CUR + pSuffix, id); } catch {}
    return true;
  },

  get(id) { return this.items.find(p => p.id === id) || null; },
  currentProject() { return this.get(this.current); },
  docOf(id) {
    if (id === this.current && typeof doc !== 'undefined' && doc) return doc;
    return this.storedDoc(id);
  },
  /** Document tel qu'enregistré, sans jamais renvoyer le document vivant. */
  storedDoc(id) {
    try { return JSON.parse(localStorage.getItem(pDocKey(id)) || 'null'); } catch { return null; }
  },
  sheetCount(id) { const d = this.docOf(id); return d && Array.isArray(d.sheets) ? d.sheets.length : 0; },

  create(name, docData) {
    const id = uid();
    const d = docData || newDoc();
    d.sheets = (d.sheets || [newDoc().sheets[0]]);
    try { localStorage.setItem(pDocKey(id), JSON.stringify(d)); } catch (e) { toast('Enregistrement impossible : ' + e.message); }
    this.items.unshift({ id, name: name || (d.sheets[0] && d.sheets[0].name) || 'Nouveau projet', kind: 'local', updated: Date.now() });
    this.persist();
    return id;
  },

  update(id, patch) {
    const p = this.get(id); if (!p) return;
    Object.assign(p, patch, { updated: patch.updated || Date.now() });
    this.persist();
    if (id === this.current) renderProjectBadge();
  },

  remove(id) {
    this.items = this.items.filter(p => p.id !== id);
    try { localStorage.removeItem(pDocKey(id)); } catch {}
    this.persist();
  },

  move(id, toIndex) {
    const from = this.items.findIndex(p => p.id === id);
    if (from < 0) return;
    const [it] = this.items.splice(from, 1);
    this.items.splice(Math.max(0, Math.min(this.items.length, toIndex)), 0, it);
    this.persist();
  },

  /** Écrit le document courant dans son projet (appelé par l'enregistrement auto). */
  save(docData) {
    const p = this.currentProject();
    if (!p) return;
    try { localStorage.setItem(pDocKey(p.id), JSON.stringify(docData)); }
    catch (e) { toast('Espace de stockage local saturé : utilisez Enregistrer (.json)'); }
    const t = Date.now();
    if (!this._touched || t - this._touched > 4000) { this._touched = t; p.updated = t; this.persist(); }
  },

  /** Ferme le projet courant, puis charge celui demandé dans le document vivant. */
  switchTo(id, opts = {}) {
    if (id === this.current) return false;
    const previous = this.currentProject();
    if (previous && typeof doc !== 'undefined') this.save(doc);
    const p = this.get(id);
    if (!p) return false;
    const d = this.storedDoc(id);
    if (!d || !Array.isArray(d.sheets) || !d.sheets.length) { toast('Projet illisible'); return false; }
    this.current = id;
    try { localStorage.setItem(P_CUR + pSuffix, id); } catch {}
    p.updated = Date.now(); this.persist();
    if (typeof Collab !== 'undefined') Collab.leaveBoard();
    loadDoc(d);
    storageBlocked = false;
    if (!opts.keepView) { const r = stage.getBoundingClientRect(); if (S().view) S().view = { x: r.width / 2, y: r.height / 2, k: 1 }; }
    history.undo.length = 0; history.redo.length = 0;
    cycleDraft = null; pick = []; pickCFs = []; pickRepLabels = []; editGroupId = null; editSpecId = null; sel.clear();
    changed(); updateTip();
    if (p.kind === 'board' && p.boardId && typeof Collab !== 'undefined') Collab.joinBoard(p);
    return true;
  },

  /** Nouveau projet et bascule immédiate dessus. */
  createAndOpen(name) {
    if (typeof doc !== 'undefined') { const cur = this.currentProject(); if (cur) this.save(doc); }
    const id = this.create(name);
    const d = this.storedDoc(id);
    this.current = id;
    try { localStorage.setItem(P_CUR + pSuffix, id); } catch {}
    if (typeof Collab !== 'undefined') Collab.leaveBoard();
    loadDoc(d);
    storageBlocked = false;
    const r = stage.getBoundingClientRect(); S().view = { x: r.width / 2, y: r.height / 2, k: 1 };
    history.undo.length = 0; history.redo.length = 0;
    cycleDraft = null; pick = []; pickCFs = []; pickRepLabels = []; editGroupId = null; editSpecId = null; sel.clear();
    changed(); updateTip();
    return this.get(id);
  },

  /** Charge un JSON importé dans un nouveau projet. */
  importDoc(data, name) {
    if (!data || !Array.isArray(data.sheets) || !data.sheets.length) throw new Error('Fichier invalide');
    const id = this.createAndOpen(name || (data.sheets[0] && data.sheets[0].name) || 'Import');
    loadDoc(data);
    changed(); fitView();
    return id;
  }
};

/* ===== Badge du projet courant dans la barre d'outils ===== */
function renderProjectBadge() {
  const b = $('#projName');
  const p = Projects.currentProject();
  if (!b) return;
  b.textContent = p ? p.name : 'Projet';
  const btn = b.closest('button');
  if (btn) btn.title = p ? `Projet : ${p.name}` + (p.kind === 'board' ? ' — partagé' : '') + ' — cliquer pour gérer les projets' : 'Projets';
  const live = p && p.kind === 'board';
  const dot = $('#projDot');
  if (dot) dot.hidden = !live;
  document.title = (p ? p.name + ' — ' : '') + 'Graphe des contacts';
}

/* ===== Fenêtre « Projets » ===== */
function projectsDialog() {
  const rows = () => Projects.items.map((p, i) => {
    const n = Projects.sheetCount(p.id);
    const shared = p.kind === 'board';
    return `<div class="proj ${p.id === Projects.current ? 'active' : ''}" draggable="true" data-proj="${p.id}" data-i="${i}">
      <span class="drag" title="Glisser pour changer l'ordre">⠿</span>
      <div class="pi">
        <b>${esc(p.name)}${shared ? ' <span class="badge-live">partagé</span>' : ''}</b>
        <small>${n} graphe${n > 1 ? 's' : ''} · ${pTime(p.updated)}</small>
      </div>
      <div class="pa">
        <button data-open title="Ouvrir ce projet">Ouvrir</button>
        <button data-share title="Partager en direct et copier le lien">Partager</button>
        <button data-ren title="Renommer">✎</button>
        <button data-dup title="Dupliquer">⧉</button>
        <button data-exp title="Enregistrer en .json">⤓</button>
        <button data-del class="danger" title="Supprimer">🗑</button>
      </div>
    </div>`;
  }).join('') || '<p class="muted">Aucun projet. Créez-en un pour commencer.</p>';

  const body = el(`<div style="width:100%"><div id="projList">${rows()}</div>
    <p class="muted">Glissez un projet par la poignée ⠿ pour le déplacer. « Partager » crée un lien permanent : toute personne qui l'ouvre voit le même graphe en direct.</p></div>`);
  const draw = () => { $('#projList', body).innerHTML = rows(); renderProjectBadge(); };
  const list = $('#projList', body);

  list.addEventListener('click', async e => {
    const row = e.target.closest('[data-proj]'); if (!row) return;
    const id = row.dataset.proj, p = Projects.get(id);
    e.stopPropagation();
    if (e.target.closest('[data-open]')) { if (id === Projects.current || Projects.switchTo(id)) { closeModal(); toast(`Projet « ${p.name} » ouvert`); } else draw(); return; }
    if (e.target.closest('[data-share]')) { closeModal(); Collab.shareDialog(id); return; }
    if (e.target.closest('[data-ren]')) { askText('Renommer le projet', p.name, v => { if (v) { Projects.update(id, { name: v }); if (p.kind === 'board' && typeof Collab !== 'undefined') Collab.renameBoard(p, v); draw(); } }); return; }
    if (e.target.closest('[data-dup]')) {
      const d = Projects.docOf(id); if (!d) return;
      const copy = JSON.parse(JSON.stringify(d));
      copy.sheets.forEach(s => { s.id = uid(); });
      copy.active = copy.sheets[0].id;
      Projects.create(p.name + ' – copie', copy); draw(); toast('Projet dupliqué'); return;
    }
    if (e.target.closest('[data-exp]')) {
      const d = Projects.docOf(id); if (!d) return;
      download(new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' }), (p.name || 'graphe').replace(/[^\w\-À-ÿ ]+/g, '_') + '.json');
      return;
    }
    if (e.target.closest('[data-del]')) {
      askConfirm('Supprimer le projet', `Supprimer « ${esc(p.name)} » ? Le lien de partage, s'il existe, cessera de fonctionner sur ce navigateur mais restera accessible aux autres.`, async () => {
        if (p.kind === 'board' && typeof Collab !== 'undefined') await Collab.deleteBoard(p);
        Projects.remove(id);
        if (id === Projects.current) {
          if (!Projects.items.length) Projects.createAndOpen('Mon premier projet');
          else Projects.switchTo(Projects.items[0].id);
        }
        draw();
      });
      return;
    }
  });

  /* Réordonnancement par glisser-déposer */
  let dragId = null;
  list.addEventListener('dragstart', e => {
    const row = e.target.closest('[data-proj]'); if (!row) return;
    dragId = row.dataset.proj; row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', dragId); } catch {}
  });
  list.addEventListener('dragend', () => { dragId = null; $$('.proj', list).forEach(r => r.classList.remove('dragging', 'over')); });
  list.addEventListener('dragover', e => {
    e.preventDefault();
    const row = e.target.closest('[data-proj]'); if (!row || row.dataset.proj === dragId) return;
    $$('.proj', list).forEach(r => r.classList.toggle('over', r === row));
  });
  list.addEventListener('drop', e => {
    e.preventDefault();
    const row = e.target.closest('[data-proj]'); if (!row || !dragId) return;
    const to = Projects.items.findIndex(p => p.id === row.dataset.proj);
    Projects.move(dragId, to);
    dragId = null; draw();
  });

  const left = el(`<div class="row" style="gap:8px"><button id="pNew">＋ Nouveau projet</button><button id="pImp">⤒ Importer un .json</button></div>`);
  $('#pNew', left).onclick = () => { closeModal(); Projects.createAndOpen('Nouveau projet'); toast('Nouveau projet créé'); };
  $('#pImp', left).onclick = () => { closeModal(); $('#fileInput').dataset.intoNew = '1'; $('#fileInput').click(); };

  openModal({ title: '🗂 Projets', body, extraLeft: left, wide: 720, noCancel: true });
}
