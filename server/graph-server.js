#!/usr/bin/env node
'use strict';
/* =====================================================================
   Serveur de partage en direct — Graphe des contacts
   ---------------------------------------------------------------------
   • Sert aussi l'application statique (pratique en local / derrière un tunnel)
   • Boards persistés en SQLite (module natif node:sqlite, aucune dépendance
     de compilation)
   • Synchronisation par opérations (voir sync-core.js) : deux personnes
     peuvent modifier deux pièces différentes en même temps
   • Présence : nom, couleur, curseur, feuille et sélection de chacun
   • Modèle de partage : toute personne ayant le lien peut modifier
   ===================================================================== */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');
const GraphSync = require('../sync-core.js');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ROOT = path.join(__dirname, '..');
const MAX_BODY = 32 * 1024 * 1024;
const MAX_MSG = 2 * 1024 * 1024;

fs.mkdirSync(DATA_DIR, { recursive: true });

/* ===== Base de données ===== */
let db;
try {
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(path.join(DATA_DIR, 'boards.sqlite'));
  db.exec(`CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    rev INTEGER NOT NULL DEFAULT 0,
    edit_key TEXT NOT NULL,
    created INTEGER NOT NULL,
    updated INTEGER NOT NULL
  )`);
} catch (err) {
  console.error('Base SQLite indisponible (node:sqlite) :', err.message);
  console.error('Node.js 22 ou plus récent est requis pour ce serveur.');
  process.exit(1);
}

const q = {
  insert: db.prepare('INSERT INTO boards (id, name, data, rev, edit_key, created, updated) VALUES (?,?,?,?,?,?,?)'),
  get: db.prepare('SELECT * FROM boards WHERE id = ?'),
  list: db.prepare('SELECT id, name, rev, updated FROM boards ORDER BY updated DESC LIMIT 500'),
  save: db.prepare('UPDATE boards SET data = ?, rev = ?, updated = ? WHERE id = ?'),
  rename: db.prepare('UPDATE boards SET name = ?, updated = ? WHERE id = ?'),
  remove: db.prepare('DELETE FROM boards WHERE id = ?')
};

const newId = () => crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').slice(0, 8);
const newKey = () => crypto.randomBytes(16).toString('hex');
const now = () => Date.now();
const rowToMeta = r => ({ id: r.id, name: r.name, rev: r.rev, updated: r.updated });

/* ===== Boards actifs (mémoire) ===== */
/** id -> { id, name, doc, rev, conns:Set<ws>, timer } */
const live = new Map();

function loadBoard(id) {
  if (live.has(id)) return live.get(id);
  const row = q.get.get(id);
  if (!row) return null;
  let doc;
  try { doc = JSON.parse(row.data); } catch { doc = null; }
  if (!doc || !Array.isArray(doc.sheets)) return null;
  const b = { id: row.id, name: row.name, doc, rev: row.rev, conns: new Set(), timer: null };
  live.set(id, b);
  return b;
}

function persist(b) {
  clearTimeout(b.timer);
  b.timer = setTimeout(() => {
    b.timer = null;
    try {
      q.save.run(JSON.stringify(b.doc), b.rev, now(), b.id);
    } catch (err) {
      console.error(`Écriture impossible (${b.id}) :`, err.message);
    }
  }, 350);
}

/* ===== Utilitaires HTTP ===== */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8', '.webmanifest': 'application/manifest+json'
};

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('Corps de requête trop volumineux')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve({});
      try { resolve(JSON.parse(text)); } catch { reject(new Error('JSON invalide')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  let rel = decodeURIComponent((req.url || '/').split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel === '/server' || rel.startsWith('/server/') || rel === '/.git' || rel.startsWith('/.git/')) {
    return json(res, 404, { error: 'introuvable' });
  }
  const file = path.join(ROOT, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!file.startsWith(ROOT)) return json(res, 403, { error: 'interdit' });
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return json(res, 404, { error: 'introuvable' });
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(file).pipe(res);
  });
}

/* ===== API ===== */
async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api','boards', id?]
  const method = req.method;

  if (method === 'OPTIONS') return json(res, 204, {});

  if (parts[1] === 'health') return json(res, 200, { ok: true, boards: live.size, uptime: process.uptime() });

  /* POST /api/boards  { name, doc }  -> { id, key } */
  if (parts[1] === 'boards' && parts.length === 2 && method === 'POST') {
    const body = await readBody(req);
    const doc = body.doc;
    if (!doc || !Array.isArray(doc.sheets) || !doc.sheets.length) return json(res, 400, { error: 'Document invalide' });
    const id = newId();
    const key = newKey();
    const name = String(body.name || doc.sheets[0].name || 'Graphe').slice(0, 120);
    const clean = GraphSync.cleanDoc(doc);
    q.insert.run(id, name, JSON.stringify(clean), 0, key, now(), now());
    return json(res, 200, { id, key, name, rev: 0 });
  }

  /* POST /api/boards/lookup  { keys: [...] } -> métadonnées des boards connus */
  if (parts[1] === 'boards' && parts[2] === 'lookup' && method === 'POST') {
    const body = await readBody(req);
    const keys = Array.isArray(body.keys) ? body.keys.slice(0, 300) : [];
    const out = [];
    const stmt = db.prepare('SELECT id, name, rev, updated FROM boards WHERE edit_key = ?');
    for (const k of keys) {
      const row = stmt.get(String(k));
      if (row) out.push(rowToMeta(row));
    }
    return json(res, 200, { boards: out });
  }

  /* GET /api/boards  -> liste publique minimale (id + date) pour la démo : désactivée */
  if (parts[1] === 'boards' && parts.length === 2 && method === 'GET') {
    return json(res, 404, { error: 'Liste non publique : utilisez le lien de partage' });
  }

  if (parts[1] === 'boards' && parts[2]) {
    const id = parts[2];
    const b = loadBoard(id);
    const row = b ? null : q.get.get(id);

    if (method === 'GET') {
      if (!b && !row) return json(res, 404, { error: 'Board inconnu' });
      const doc = b ? b.doc : JSON.parse(row.data);
      return json(res, 200, {
        id,
        name: b ? b.name : row.name,
        rev: b ? b.rev : row.rev,
        updated: b ? now() : row.updated,
        doc
      });
    }

    if (method === 'PATCH') {
      if (!b && !row) return json(res, 404, { error: 'Board inconnu' });
      const body = await readBody(req);
      const name = String(body.name || '').trim().slice(0, 120);
      if (!name) return json(res, 400, { error: 'Nom requis' });
      if (b) b.name = name;
      q.rename.run(name, now(), id);
      if (b) broadcast(b, { t: 'meta', name: b.name }, null);
      return json(res, 200, { ok: true, id, name });
    }

    if (method === 'DELETE') {
      const row2 = row || (b ? q.get.get(id) : null);
      if (!row2) return json(res, 404, { error: 'Board inconnu' });
      const body = await readBody(req);
      if (String(body.key || '') !== row2.edit_key) return json(res, 403, { error: 'Clé de propriétaire requise' });
      if (b) {
        for (const ws of b.conns) { try { ws.close(4000, 'Board supprimé'); } catch {} }
        clearTimeout(b.timer);
        live.delete(id);
      }
      q.remove.run(id);
      return json(res, 200, { ok: true });
    }
  }

  return json(res, 404, { error: 'Route inconnue' });
}

/* ===== WebSocket ===== */
const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch(err => {
      if (!res.headersSent) json(res, 400, { error: err.message });
      else try { res.end(); } catch {}
    });
    return;
  }
  serveStatic(req, res);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MSG });

function broadcast(board, msg, exceptWs) {
  const data = JSON.stringify(msg);
  for (const ws of board.conns) {
    if (ws === exceptWs) continue;
    if (ws.readyState === 1) { try { ws.send(data); } catch {} }
  }
}

function peerList(board, exceptCid) {
  return [...board.conns]
    .filter(ws => ws.cid && ws.cid !== exceptCid)
    .map(ws => ({
      cid: ws.cid, name: ws.peerName, color: ws.peerColor,
      sheet: ws.peerSheet || null, cursor: ws.peerCursor || null, sel: ws.peerSel || []
    }));
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const boardId = url.searchParams.get('board') || '';
  const cid = (url.searchParams.get('cid') || newId()).slice(0, 40);
  const board = boardId ? loadBoard(boardId) : null;
  if (!board) {
    ws.send(JSON.stringify({ t: 'error', message: 'Board inconnu ou supprimé' }));
    return ws.close(4004, 'Board inconnu');
  }

  /* Reconnexion du même onglet : on remplace l'ancienne prise */
  for (const old of [...board.conns]) {
    if (old.cid === cid) { board.conns.delete(old); try { old.close(4001, 'Reconnexion'); } catch {} }
  }

  ws.cid = cid;
  ws.board = board;
  ws.peerName = String(url.searchParams.get('name') || 'Invité').slice(0, 40);
  ws.peerColor = String(url.searchParams.get('color') || '#2b7de9').slice(0, 20);
  board.conns.add(ws);

  ws.send(JSON.stringify({
    t: 'init', rev: board.rev, name: board.name,
    doc: GraphSync.cleanDoc(board.doc),
    self: { cid },
    peers: peerList(board, cid)
  }));
  broadcast(board, { t: 'join', cid, name: ws.peerName, color: ws.peerColor }, ws);

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.t === 'ops' && Array.isArray(msg.ops) && msg.ops.length) {
      const ops = msg.ops.slice(0, 5000);
      try {
        GraphSync.apply(board.doc, ops);
      } catch (err) {
        console.error('Application des opérations impossible :', err.message);
        return ws.send(JSON.stringify({ t: 'resync', doc: GraphSync.cleanDoc(board.doc), rev: board.rev }));
      }
      board.rev++;
      persist(board);
      broadcast(board, { t: 'ops', ops, rev: board.rev, from: cid }, ws);
      if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'ack', rev: board.rev }));
      return;
    }

    if (msg.t === 'p') {
      ws.peerName = String(msg.name || ws.peerName).slice(0, 40);
      ws.peerColor = String(msg.color || ws.peerColor).slice(0, 20);
      ws.peerSheet = typeof msg.sheet === 'string' ? msg.sheet : null;
      ws.peerCursor = msg.cursor && typeof msg.cursor.x === 'number' ? { x: Math.round(msg.cursor.x), y: Math.round(msg.cursor.y) } : null;
      ws.peerSel = Array.isArray(msg.sel) ? msg.sel.slice(0, 200).map(String) : [];
      broadcast(board, {
        t: 'p', cid, name: ws.peerName, color: ws.peerColor,
        sheet: ws.peerSheet, cursor: ws.peerCursor, sel: ws.peerSel
      }, ws);
      return;
    }

    if (msg.t === 'ping') { try { ws.send(JSON.stringify({ t: 'pong' })); } catch {} }
  });

  ws.on('close', () => {
    board.conns.delete(ws);
    broadcast(board, { t: 'bye', cid }, ws);
    if (!board.conns.size) persist(board);
  });
  ws.on('error', () => {});
});

/* Battement de cœur : coupe les connexions mortes */
setInterval(() => {
  for (const board of live.values()) {
    for (const ws of board.conns) {
      if (ws.isAlive === false) { board.conns.delete(ws); try { ws.terminate(); } catch {} broadcast(board, { t: 'bye', cid: ws.cid }, ws); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch {}
    }
  }
}, 30000);
wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
});

server.listen(PORT, HOST, () => {
  console.log(`Graphe des contacts — serveur de partage`);
  console.log(`  écoute      : http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`  websocket   : ws://…:${PORT}/ws`);
  console.log(`  données     : ${path.join(DATA_DIR, 'boards.sqlite')}`);
});

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
function shutdown() {
  for (const b of live.values()) {
    clearTimeout(b.timer);
    try { q.save.run(JSON.stringify(b.doc), b.rev, now(), b.id); } catch {}
  }
  try { db.close(); } catch {}
  process.exit(0);
}
