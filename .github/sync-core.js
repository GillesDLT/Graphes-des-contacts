'use strict';
/* =====================================================================
   sync-core.js — moteur commun de synchronisation (navigateur + serveur)

   Le document est un objet JSON classique, muté en place par toute
   l'application. Pour le partage en direct, on compare l'état précédent
   et l'état courant, on en déduit une liste d'opérations compactes, et
   on rejoue ces opérations côté serveur et chez les autres participants.

   Chaque opération est idempotente et ciblée par identifiant d'objet :
   aucun document complet n'est jamais réécrit, deux personnes peuvent
   donc modifier deux pièces différentes en même temps. Sur un même
   champ, la dernière écriture reçue gagne (comme un tableau blanc).
   ===================================================================== */
(function (global) {
  const COLLECTIONS = ['pieces', 'surfaces', 'liaisons', 'groups', 'cfgs', 'cycles', 'notes', 'isoRefs', 'isoSpecs'];
  const SHEET_FIELDS = ['name', 'color', 'refImage'];
  /* Réglages d'affichage propres à chaque poste : jamais synchronisés, sinon
     cacher les surfaces chez l'un les cacherait chez tout le monde. */
  const LOCAL_SETTINGS = ['showDetails', 'showSurfaces', 'showTorseurs', 'showNominalZero', 'grid'];

  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  /* --- comparaison profonde d'un objet : chemins de champs modifiés --- */
  function deepDiff(a, b, path, out, base) {
    if (same(a, b)) return;
    if (isObj(a) && isObj(b)) {
      for (const k of Object.keys(b)) {
        if (!(k in a)) out.push(Object.assign({}, base, { p: path.concat(k), v: clone(b[k]) }));
        else deepDiff(a[k], b[k], path.concat(k), out, base);
      }
      for (const k of Object.keys(a)) {
        if (!(k in b)) out.push(Object.assign({}, base, { t: 'unset', p: path.concat(k) }));
      }
      return;
    }
    out.push(Object.assign({}, base, { p: path, v: clone(b) }));
  }

  /* --- écriture / suppression dans un objet à un chemin donné --- */
  function setPath(target, path, value) {
    if (!path.length) return;
    let o = target;
    for (let i = 0; i < path.length - 1; i++) {
      const k = path[i];
      if (!isObj(o[k]) && !Array.isArray(o[k])) o[k] = {};
      o = o[k];
    }
    o[path[path.length - 1]] = clone(value);
  }
  function unsetPath(target, path) {
    if (!path.length) return;
    let o = target;
    for (let i = 0; i < path.length - 1; i++) {
      o = o[path[i]];
      if (!o || typeof o !== 'object') return;
    }
    delete o[path[path.length - 1]];
  }

  const idsOf = arr => (arr || []).map(o => o && o.id).join(',');

  /* --- diff(avant, après) -> [opérations] --- */
  function diff(prev, next) {
    const ops = [];
    if (!prev || !next) return ops;
    const ps = prev.settings || {}, ns = next.settings || {};
    for (const k of Object.keys(ns)) {
      if (LOCAL_SETTINGS.includes(k)) continue;
      if (!same(ps[k], ns[k])) ops.push({ t: 'setg', k, v: clone(ns[k]) });
    }
    for (const k of Object.keys(ps)) {
      if (LOCAL_SETTINGS.includes(k)) continue;
      if (!(k in ns)) ops.push({ t: 'unsetg', k });
    }

    const pSheets = prev.sheets || [], nSheets = next.sheets || [];
    const pById = new Map(pSheets.map(s => [s.id, s])), nById = new Map(nSheets.map(s => [s.id, s]));

    for (const [id, s] of nById) if (!pById.has(id)) ops.push({ t: 'sadd', v: clone(s) });
    for (const [id] of pById) if (!nById.has(id)) ops.push({ t: 'sdel', id });
    if (idsOf(pSheets) !== idsOf(nSheets)) ops.push({ t: 'sorder', v: nSheets.map(s => s.id) });

    for (const [id, n] of nById) {
      const p = pById.get(id);
      if (!p) continue;
      for (const k of SHEET_FIELDS) {
        if (!same(p[k], n[k])) {
          if (n[k] === undefined) ops.push({ t: 'sunset', s: id, k });
          else ops.push({ t: 'sf', s: id, k, v: clone(n[k]) });
        }
      }
      for (const c of COLLECTIONS) {
        const pArr = p[c] || [], nArr = n[c] || [];
        const pMap = new Map(pArr.map(o => [o && o.id, o])), nMap = new Map(nArr.map(o => [o && o.id, o]));
        for (const [oid, o] of nMap) if (oid && !pMap.has(oid)) ops.push({ t: 'add', s: id, c, v: clone(o) });
        for (const oid of pMap.keys()) if (oid && !nMap.has(oid)) ops.push({ t: 'del', s: id, c, id: oid });
        for (const [oid, o] of nMap) {
          const po = pMap.get(oid);
          if (po) deepDiff(po, o, [], ops, { t: 'set', s: id, c, id: oid });
        }
        if (idsOf(pArr) !== idsOf(nArr)) ops.push({ t: 'corder', s: id, c, v: nArr.map(o => o && o.id) });
      }
    }
    return ops;
  }

  /* --- apply(document, opérations) : mutation en place, tolérante --- */
  function apply(target, ops) {
    if (!target || !Array.isArray(ops)) return target;
    const sheetOf = id => (target.sheets || []).find(s => s.id === id);
    const collOf = (sid, c) => { const s = sheetOf(sid); if (!s) return null; if (!Array.isArray(s[c])) s[c] = []; return s[c]; };

    for (const op of ops) {
      if (!op || typeof op.t !== 'string') continue;
      switch (op.t) {
        case 'setg':
          if (!isObj(target.settings)) target.settings = {};
          target.settings[op.k] = clone(op.v);
          break;
        case 'unsetg':
          if (target.settings) delete target.settings[op.k];
          break;
        case 'sadd':
          if (op.v && op.v.id && !(target.sheets || []).some(s => s.id === op.v.id)) {
            if (!Array.isArray(target.sheets)) target.sheets = [];
            target.sheets.push(clone(op.v));
          }
          break;
        case 'sdel':
          target.sheets = (target.sheets || []).filter(s => s.id !== op.id);
          break;
        case 'sorder': {
          const wanted = Array.isArray(op.v) ? op.v : [];
          const byId = new Map((target.sheets || []).map(s => [s.id, s]));
          const ordered = wanted.map(id => byId.get(id)).filter(Boolean);
          for (const s of target.sheets || []) if (!wanted.includes(s.id)) ordered.push(s);
          target.sheets = ordered;
          break;
        }
        case 'sf': {
          const s = sheetOf(op.s);
          if (s) s[op.k] = clone(op.v);
          break;
        }
        case 'sunset': {
          const s = sheetOf(op.s);
          if (s) delete s[op.k];
          break;
        }
        case 'add': {
          const arr = collOf(op.s, op.c);
          if (arr && op.v && op.v.id && !arr.some(o => o.id === op.v.id)) arr.push(clone(op.v));
          break;
        }
        case 'del': {
          const arr = collOf(op.s, op.c);
          if (arr) { const i = arr.findIndex(o => o.id === op.id); if (i >= 0) arr.splice(i, 1); }
          break;
        }
        case 'set': {
          const arr = collOf(op.s, op.c);
          const o = arr && arr.find(x => x.id === op.id);
          if (o && Array.isArray(op.p)) setPath(o, op.p, op.v);
          break;
        }
        case 'unset': {
          const arr = collOf(op.s, op.c);
          const o = arr && arr.find(x => x.id === op.id);
          if (o && Array.isArray(op.p)) unsetPath(o, op.p);
          break;
        }
        case 'corder': {
          const arr = collOf(op.s, op.c);
          if (!arr) break;
          const wanted = Array.isArray(op.v) ? op.v : [];
          const byId = new Map(arr.map(o => [o && o.id, o]));
          const ordered = wanted.map(id => byId.get(id)).filter(Boolean);
          for (const o of arr) if (!wanted.includes(o && o.id)) ordered.push(o);
          arr.length = 0;
          ordered.forEach(o => arr.push(o));
          break;
        }
        default:
          break;
      }
    }
    return target;
  }

  /* --- instantané « propre » : sans l'état de vue, propre à chaque poste --- */
  function cleanDoc(d) {
    const o = clone(d);
    delete o.active;
    (o.sheets || []).forEach(s => { delete s.view; });
    return o;
  }

  const API = { COLLECTIONS, SHEET_FIELDS, LOCAL_SETTINGS, diff, apply, cleanDoc, clone };
  global.GraphSync = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
