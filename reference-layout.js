'use strict';

const referenceOrderCache = new Map();
function referenceConstraints(groups, ids) {
  const alive = new Set(ids), seen = new Set(), constraints = [];
  for (const g of groups.filter(g => g.kind === 'ref')) {
    const members = [...new Set(g.members.filter(id => alive.has(id)))].sort();
    if (members.length < 2 || members.length >= ids.length) continue;
    const key = JSON.stringify(members);
    if (!seen.has(key)) { seen.add(key); constraints.push(new Set(members)); }
  }
  return constraints;
}
function referenceOrderValid(order, constraints) {
  return constraints.every(set => {
    let transitions = 0;
    for (let i = 0; i < order.length; i++) if (set.has(order[i]) !== set.has(order[(i + 1) % order.length])) transitions++;
    return transitions <= 2;
  });
}
function referenceCircularOrder(ids, constraints) {
  if (!constraints.length || referenceOrderValid(ids, constraints)) return ids.slice();
  const key = JSON.stringify([ids.slice().sort(), constraints.map(set => [...set].sort()).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))]);
  if (referenceOrderCache.has(key)) return referenceOrderCache.get(key)?.slice() || null;
  const anchor = ids.reduce((best, id) => constraints.filter(s => s.has(id)).length < constraints.filter(s => s.has(best)).length ? id : best);
  const rest = ids.filter(id => id !== anchor);
  // Cutting the circle at one surface turns each constraint into a linear interval.
  const intervals = constraints.map(set => new Set(rest.filter(id => set.has(id) !== set.has(anchor))))
    .filter(set => set.size > 1 && set.size < rest.length);
  const classes = new Map();
  rest.forEach(id => {
    const signature = intervals.map(set => set.has(id) ? '1' : '0').join('');
    if (!classes.has(signature)) classes.set(signature, []);
    classes.get(signature).push(id);
  });
  const blocks = [...classes.values()], masks = intervals.map(set => blocks.reduce((mask, block, i) => set.has(block[0]) ? mask | (1n << BigInt(i)) : mask, 0n));
  const all = (1n << BigInt(blocks.length)) - 1n, failed = new Set();
  function search(used, path) {
    if (used === all) return path.slice();
    if (failed.has(used)) return null;
    let candidates = all ^ used;
    for (const mask of masks) if ((mask & used) !== 0n && (mask & (all ^ used)) !== 0n) candidates &= mask;
    for (let i = 0; i < blocks.length; i++) {
      const bit = 1n << BigInt(i); if ((candidates & bit) === 0n) continue;
      path.push(i);
      const result = search(used | bit, path);
      if (result) return result;
      path.pop();
    }
    failed.add(used); return null;
  }
  const path = search(0n, []), order = path ? [anchor, ...path.flatMap(i => blocks[i])] : null;
  if (referenceOrderCache.size >= 200) referenceOrderCache.clear();
  referenceOrderCache.set(key, order);
  return order?.slice() || null;
}
function referenceLayoutError(groups, surfaces) {
  const byPiece = new Map();
  surfaces.forEach(s => { if (!byPiece.has(s.pieceId)) byPiece.set(s.pieceId, []); byPiece.get(s.pieceId).push(s.id); });
  for (const ids of byPiece.values()) {
    if (!referenceCircularOrder(ids, referenceConstraints(groups, ids)))
      return 'Références incompatibles : leurs surfaces ne peuvent pas toutes rester côte à côte dans cette pièce. Modifiez les membres des références qui se chevauchent.';
  }
  return '';
}
function spreadReferenceItems(items, perimeter, groups) {
  const ids = items.map(it => it.s.id), constraints = referenceConstraints(groups, ids);
  if (!constraints.length) { spreadOnLoop(items, perimeter); return ''; }
  const desired = items.slice().sort((a, b) => modP(a.sd, perimeter) - modP(b.sd, perimeter)).map(it => it.s.id);
  const current = items.slice().sort((a, b) => modP(a.cur, perimeter) - modP(b.cur, perimeter)).map(it => it.s.id);
  const order = referenceOrderValid(desired, constraints) ? desired : referenceOrderValid(current, constraints) ? current : referenceCircularOrder(current, constraints);
  if (!order) return 'Références incompatibles : aucune disposition contiguë des surfaces n’est possible.';
  const byId = new Map(items.map(it => [it.s.id, it])), count = order.length;
  const needed = items.reduce((sum, it) => sum + 2 * it.r + SURF_SPACING, 0);
  if (needed > perimeter + 1e-6) return 'La pièce est trop petite pour disposer les surfaces de référence sans chevauchement.';
  let best = null, score = Infinity;
  for (const orientation of [order, order.slice().reverse()]) for (let cut = 0; cut < count; cut++) {
    const sorted = orientation.slice(cut).concat(orientation.slice(0, cut)).map(id => byId.get(id)), offsets = [0];
    for (let i = 1; i < count; i++) offsets.push(offsets[i - 1] + sorted[i - 1].r + sorted[i].r + SURF_SPACING);
    const free = Math.max(0, perimeter - needed), weights = sorted.map(it => it.w);
    const origin = modP(sorted[0].sd, perimeter);
    const desiredPositions = sorted.map((it, i) => {
      const sd = modP(it.sd, perimeter);
      return sd + Math.round((origin + offsets[i] - sd) / perimeter) * perimeter;
    });
    const isotonic = pav(desiredPositions.map((d, i) => d - offsets[i]), weights);
    let lower = isotonic[0], upper = isotonic[count - 1];
    if (upper - lower > free) {
      for (let iteration = 0; iteration < 50; iteration++) {
        const mid = (lower + upper) / 2;
        const derivative = isotonic.reduce((sum, y, i) => sum + weights[i] * (clampN(y, mid, mid + free) - y), 0);
        if (derivative > 0) upper = mid; else lower = mid;
      }
      const lo = (lower + upper) / 2;
      isotonic.forEach((y, i) => isotonic[i] = clampN(y, lo, lo + free));
    }
    const positions = isotonic.map((y, i) => y + offsets[i]);
    const cost = positions.reduce((sum, x, i) => sum + weights[i] * (x - desiredPositions[i]) ** 2, 0);
    if (cost < score) { score = cost; best = sorted.map((it, i) => [it, positions[i]]); }
  }
  best.forEach(([it, x]) => it.x = x);
  return '';
}
