'use strict';
// ===== מפת ההרפתקאות =====
const TS = 48, MW = 48, MH = 36;
const PANEL_W = 270, BAR_H = 40;
const MV = {
  cam: { x: 0, y: 0 }, terrainCv: null, fogCv: null, fogDirty: true, miniCv: null, miniDirty: true,
  path: null, pathDest: null, moving: false, stepT: 0, from: null, to: null,
  hover: null, mouse: { x: -1, y: -1, in: false }, clouds: [], occ: new Map(), guard: new Map(), keys: {},
  lastStepSound: 0,
};

// ---------- יצירת עולם ----------
function genWorld(seed) {
  const r = mulberry32(seed);
  const n1 = makeNoise(seed), n2 = makeNoise(seed + 101), n3 = makeNoise(seed + 202);
  const terr = new Uint8Array(MW * MH), deco = new Uint8Array(MW * MH), road = new Uint8Array(MW * MH);
  const town = { x: 5, y: 5 }, cit = { x: MW - 6, y: MH - 6 };
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = y * MW + x;
    let e = n1(x / 9, y / 9, 4);
    const m = n2(x / 7, y / 7, 3);
    const ed = Math.min(x, y, MW - 1 - x, MH - 1 - y);
    if (ed < 3) e -= (3 - ed) * 0.09;
    let tt;
    if (e < 0.37) tt = 0;
    else if (e > 0.64) tt = 6;
    else {
      const fx = x / MW, fy = y / MH;
      if (fx + fy > 1.38) tt = m > 0.56 ? 5 : 7;
      else if (fx > 0.58 && fy < 0.42) tt = 4;
      else if (fx < 0.42 && fy > 0.58) tt = 3;
      else tt = m > 0.6 ? 5 : m < 0.4 ? 2 : 1;
    }
    terr[i] = tt;
    if (tt !== 0 && tt !== 6 && n3(x / 3.2, y / 3.2, 2) > 0.57 && r() < 0.85) deco[i] = 1;
  }
  const W = { seed, terr, deco, road, town, cit, objects: [] };
  const clearArea = (cx, cy, rad, t) => {
    for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) {
      if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
      if (dist(x, y, cx, cy) > rad + 0.5) continue;
      const i = y * MW + x; deco[i] = 0; if (terr[i] === 0 || terr[i] === 6 || dist(x, y, cx, cy) < 2) terr[i] = t;
    }
  };
  clearArea(town.x, town.y, 3, 1); clearArea(cit.x, cit.y, 3, 7);
  const taken = new Set([town.y * MW + town.x, cit.y * MW + cit.x]);
  const carve = (sx, sy, tx, ty, isRoad) => {
    const p = astar(MW, MH, sx, sy, tx, ty, (x, y) => {
      const i = y * MW + x, t = terr[i];
      if (taken.has(i) && !(x === tx && y === ty)) return Infinity;
      let c = t === 0 ? 7 : t === 6 ? 10 : TERRAIN[t].cost;
      if (deco[i]) c += 2.5; if (road[i]) c = 0.5;
      return c + r() * 0.3;
    });
    if (!p) return;
    const open = (x, y) => {
      const i = y * MW + x;
      if (terr[i] === 0 || terr[i] === 6) terr[i] = (x / MW + y / MH > 1.38) ? 7 : 2;
      deco[i] = 0;
      return i;
    };
    let px = sx, py = sy;
    for (const [x, y] of p) {
      // צעד אלכסוני: לפתוח גם משבצת צמודה (שאינה תפוסה) כדי שהמעבר יהיה עביר במשחק
      if (x !== px && y !== py) {
        let ox = x, oy = py;
        if (taken.has(oy * MW + ox)) { ox = px; oy = y; }
        const j = open(ox, oy); if (isRoad) road[j] = 1;
      }
      const i = open(x, y); if (isRoad && !taken.has(i)) road[i] = 1;
      px = x; py = y;
    }
  };
  carve(town.x, town.y + 1, cit.x, cit.y - 1, true);
  // מיקום אובייקטים
  const isFree = (x, y) => {
    if (x < 1 || y < 1 || x >= MW - 1 || y >= MH - 1) return false;
    const i = y * MW + x;
    if (terr[i] === 0 || terr[i] === 6 || deco[i] || road[i]) return false;
    if (taken.has(i)) return false;
    if (dist(x, y, town.x, town.y) < 3 || dist(x, y, cit.x, cit.y) < 3.5) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (taken.has((y + dy) * MW + x + dx)) return false;
    return true;
  };
  const place = (type, props, dMin = 0, dMax = 99, connect = true) => {
    for (let k = 0; k < 600; k++) {
      const x = 1 + Math.floor(r() * (MW - 2)), y = 1 + Math.floor(r() * (MH - 2));
      const d = dist(x, y, town.x, town.y);
      if (d < dMin || d > dMax || !isFree(x, y)) continue;
      const o = { type, x, y, id: W.objects.length + 1, ...props };
      W.objects.push(o); taken.add(y * MW + x);
      if (connect) carve(town.x, town.y + 1, x, y, false);
      return o;
    }
    return null;
  };
  const guardNear = (o, d) => {
    if (!o) return;
    const nb = shuffle([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]], r);
    for (const [dx, dy] of nb) {
      const x = o.x + dx, y = o.y + dy, i = y * MW + x;
      if (x < 1 || y < 1 || x >= MW - 1 || y >= MH - 1 || terr[i] === 0 || terr[i] === 6 || deco[i] || taken.has(i)) continue;
      W.objects.push({ type: 'monster', x, y, id: W.objects.length + 1, army: monsterArmy(d, r) });
      taken.add(i); return;
    }
  };
  // מכרות: אחד של כל סוג קרוב, ועוד מרוחקים
  for (const res of ['wood', 'ore']) { place('mine', { res, owner: 0 }, 3, 9); place('mine', { res, owner: 0 }, 14, 40); }
  const gm = place('mine', { res: 'gold', owner: 0 }, 10, 20); guardNear(gm, 14);
  const gm2 = place('mine', { res: 'gold', owner: 0 }, 22, 50); guardNear(gm2, 28);
  for (const res of ['crystal', 'gems']) { const o = place('mine', { res, owner: 0 }, 8, 18); guardNear(o, 12); const o2 = place('mine', { res, owner: 0 }, 20, 50); guardNear(o2, 26); }
  for (let k = 0; k < 18; k++) place('res', { res: ['gold', 'gold', 'wood', 'ore', 'crystal', 'gems'][Math.floor(r() * 6)], amt: 0 }, 2, 60);
  for (const o of W.objects) if (o.type === 'res') o.amt = o.res === 'gold' ? 500 + Math.floor(r() * 6) * 100 : o.res === 'wood' || o.res === 'ore' ? 5 + Math.floor(r() * 6) : 3 + Math.floor(r() * 4);
  for (let k = 0; k < 10; k++) place('chest', {}, 3, 60);
  const arts = shuffle(Object.keys(ARTIFACTS).filter((a) => a !== 'crown'), r);
  for (let k = 0; k < 6; k++) { const o = place('art', { art: arts[k] }, 8 + k * 4, 60); guardNear(o, 12 + k * 5); }
  const spells = shuffle(['haste', 'slow', 'stoneskin', 'lightning', 'fireball', 'chain'], r);
  for (let k = 0; k < 4; k++) place('shrine', { spell: spells[k] }, 6 + k * 5, 60);
  for (let k = 0; k < 3; k++) place('stone', { visited: false }, 6, 60);
  for (let k = 0; k < 3; k++) place('well', { day: 0 }, 6, 60);
  // מפלצות משוטטות
  for (let k = 0; k < 16; k++) {
    const o = place('monster', {}, 4 + k * 1.5, 70);
    if (o) o.army = monsterArmy(dist(o.x, o.y, town.x, town.y), r);
  }
  // מעבר תיקון: לוודא שכל אובייקט נגיש מהעיר לפי חוקי התנועה במשחק
  const passable = (x, y) => { const i = y * MW + x, t = terr[i]; return !(t === 0 || t === 6 || deco[i]); };
  for (let pass = 0; pass < 4; pass++) {
    const seen = new Uint8Array(MW * MH); const q = [[town.x, town.y]]; seen[town.y * MW + town.x] = 1;
    while (q.length) {
      const [x, y] = q.pop();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
        const i = ny * MW + nx; if (seen[i]) continue;
        if (dx && dy && !passable(x + dx, y) && !passable(x, y + dy)) continue;
        if (taken.has(i)) { seen[i] = 2; continue; }
        if (!passable(nx, ny)) continue;
        seen[i] = 1; q.push([nx, ny]);
      }
    }
    const lost = W.objects.filter((o) => !seen[o.y * MW + o.x]);
    if (!seen[(cit.y - 1) * MW + cit.x]) lost.push({ x: cit.x, y: cit.y - 1 });
    if (!lost.length) break;
    for (const o of lost) carve(town.x, town.y + 1, o.x, o.y, false);
  }
  // המצודה של האדון האפל
  W.objects.push({ type: 'citadel', x: cit.x, y: cit.y, id: 9999, army: [{ t: 'darklord', n: 1 }, { t: 'bonedragon', n: 3 }, { t: 'lich', n: 12 }, { t: 'vampire', n: 14 }, { t: 'skeleton', n: 50 }, { t: 'ghost', n: 16 }] });
  W.objects.push({ type: 'town', x: town.x, y: town.y, id: 9998 });
  return W;
}
function monsterArmy(d, r = Math.random) {
  const lvl = d < 11 ? 0 : d < 20 ? 1 : d < 30 ? 2 : 3;
  const pools = [['goblin', 'wolf', 'skeleton'], ['orc', 'zombie', 'wolf', 'skeleton', 'ghost'], ['ghost', 'troll', 'vampire', 'lich', 'orc'], ['vampire', 'lich', 'troll', 'bonedragon']];
  const base = { goblin: 24, wolf: 12, skeleton: 20, orc: 14, zombie: 12, ghost: 10, troll: 6, vampire: 8, lich: 7, bonedragon: 2 };
  const pool = pools[lvl];
  const t = pool[Math.floor(r() * pool.length)];
  const mult = 0.75 + r() * 0.5 + Math.max(0, d - 6) * 0.025;
  const army = [{ t, n: Math.max(1, Math.round(base[t] * mult)) }];
  if (r() < 0.35) { const t2 = pool[Math.floor(r() * pool.length)]; if (t2 !== t) army.push({ t: t2, n: Math.max(1, Math.round(base[t2] * mult * 0.5)) }); }
  return army;
}
function armyPower(army, heroBonus = 0) {
  let p = 0;
  for (const s of army) { if (!s) continue; const u = UNITS[s.t]; p += s.n * (u.hp + (u.dmg[0] + u.dmg[1]) * 2) * (1 + (u.atk + u.def + heroBonus) / 25) * (u.range ? 1.25 : 1); }
  return p;
}
function sizeWord(n) { return n < 5 ? 'כמה' : n < 10 ? 'קבוצת' : n < 20 ? 'להקת' : n < 50 ? 'המון' : n < 100 ? 'עדר' : 'לגיון'; }

// ---------- רינדור השטח מראש ----------
function renderTerrain(W) {
  const cv = document.createElement('canvas'); cv.width = MW * TS; cv.height = MH * TS;
  const c = cv.getContext('2d');
  const r = mulberry32(W.seed + 5);
  // מים כרקע
  const wg = c.createLinearGradient(0, 0, cv.width, cv.height); wg.addColorStop(0, '#1d5585'); wg.addColorStop(1, '#173f66');
  c.fillStyle = wg; c.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(120,190,255,${r() * 0.07})`; ell(c, r() * cv.width, r() * cv.height, 10 + r() * 30, 3 + r() * 6); c.fill(); }
  const T = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH) ? 0 : W.terr[y * MW + x];
  // רצועת חוף
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (T(x, y) === 0) continue;
    let shore = false; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (T(x + dx, y + dy) === 0) shore = true;
    if (shore) { circ(c, (x + 0.5) * TS + (r() - 0.5) * 6, (y + 0.5) * TS + (r() - 0.5) * 6, TS * 0.86, '#cdb57f'); }
  }
  // כתמים לפי סדר עדיפות
  const order = [3, 2, 7, 5, 1, 4, 6];
  for (const tt of order) {
    const col = tt === 6 ? '#6f675e' : TERRAIN[tt].color;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      if (T(x, y) !== tt) continue;
      const cx = (x + 0.5) * TS, cy = (y + 0.5) * TS;
      c.fillStyle = col;
      c.beginPath(); c.arc(cx, cy, TS * 0.74, 0, TAU); c.fill();
      for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(cx + (r() - 0.5) * TS * 0.7, cy + (r() - 0.5) * TS * 0.7, TS * (0.35 + r() * 0.2), 0, TAU); c.fill(); }
    }
  }
  // פרטי טקסטורה
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const tt = T(x, y); if (tt === 0) continue;
    const bx = x * TS, by = y * TS;
    for (let k = 0; k < 14; k++) {
      const px = bx + r() * TS, py = by + r() * TS;
      if (tt === 1) { c.strokeStyle = r() < 0.5 ? 'rgba(30,70,20,.35)' : 'rgba(170,210,110,.3)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(px, py); c.lineTo(px + (r() - 0.5) * 3, py - 4 - r() * 3); c.stroke(); if (r() < 0.04) circ(c, px, py, 1.6, pick(['#f6e27a', '#f08bb0', '#fff'])); }
      else if (tt === 2) { circ(c, px, py, 0.8 + r() * 1.6, r() < 0.5 ? 'rgba(60,40,20,.35)' : 'rgba(200,170,120,.3)'); }
      else if (tt === 3) { if (k < 4) { c.strokeStyle = 'rgba(160,130,70,.3)'; c.lineWidth = 1; c.beginPath(); c.arc(px, py, 6, 0.2, 1.4); c.stroke(); } else circ(c, px, py, 0.8, 'rgba(255,240,200,.4)'); }
      else if (tt === 4) { circ(c, px, py, 0.8 + r() * 1.5, r() < 0.5 ? 'rgba(170,200,230,.5)' : 'rgba(255,255,255,.7)'); }
      else if (tt === 5) { if (k < 2) ell(c, px, py, 5 + r() * 5, 2 + r() * 2, 'rgba(30,50,40,.45)'); else { c.strokeStyle = 'rgba(110,130,70,.5)'; c.lineWidth = 1; c.beginPath(); c.moveTo(px, py); c.lineTo(px + 1, py - 6); c.stroke(); } }
      else if (tt === 7) { if (k < 2) { c.strokeStyle = 'rgba(255,80,40,.25)'; c.lineWidth = 1; c.beginPath(); c.moveTo(px, py); c.lineTo(px + 5, py + 3); c.lineTo(px + 8, py + 1); c.stroke(); } else circ(c, px, py, 1, 'rgba(20,10,15,.4)'); }
      else if (tt === 6) { circ(c, px, py, 1.5, 'rgba(40,35,30,.3)'); }
    }
  }
  // דרכים
  c.lineCap = 'round';
  for (const [w, col] of [[18, '#7a6040'], [12, '#b39a6a']]) {
    c.strokeStyle = col; c.lineWidth = w;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      if (!W.road[y * MW + x]) continue;
      const cx = (x + 0.5) * TS, cy = (y + 0.5) * TS;
      let any = false;
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MW || ny >= MH || !W.road[ny * MW + nx]) continue;
        if (dx && dy && (W.road[y * MW + nx] || W.road[ny * MW + x])) continue;
        c.beginPath(); c.moveTo(cx, cy); c.lineTo((nx + 0.5) * TS, (ny + 0.5) * TS); c.stroke(); any = true;
      }
      if (!any) { c.beginPath(); c.arc(cx, cy, w / 2, 0, TAU); c.fillStyle = col; c.fill(); }
    }
  }
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (W.road[y * MW + x]) for (let k = 0; k < 4; k++) circ(c, (x + 0.2 + r() * 0.6) * TS, (y + 0.2 + r() * 0.6) * TS, 1.5 + r(), 'rgba(90,70,45,.5)');
  // עצים והרים — ממוינים לפי y
  const sprites = [];
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = y * MW + x, tt = W.terr[i];
    if (tt === 6) {
      for (let k = 0; k < 2; k++) { const sx = (x + 0.25 + r() * 0.5) * TS, sy = (y + 0.75 + k * 0.2) * TS, rr = r(), s = 0.8 + r() * 0.45; sprites.push([sy, () => drawMountain(c, sx, sy, s, rr, x / MW > 0.55 && y / MH < 0.5)]); }
    } else if (W.deco[i]) {
      const kind = tt === 4 ? 'snowpine' : tt === 3 ? (r() < 0.6 ? 'cactus' : 'oak') : (tt === 5 || tt === 7) ? (r() < 0.6 ? 'dead' : 'pine') : r() < 0.45 ? 'pine' : 'oak';
      const cnt = 2 + Math.floor(r() * 2);
      for (let k = 0; k < cnt; k++) { const sx = (x + 0.15 + r() * 0.7) * TS, sy = (y + 0.35 + r() * 0.6) * TS, s = 0.85 + r() * 0.4; sprites.push([sy, () => drawTree(c, sx, sy, s, kind)]); }
    }
  }
  sprites.sort((a, b) => a[0] - b[0]);
  for (const [, f] of sprites) f();
  return cv;
}

// ---------- ערפל ומיפוי ----------
function rebuildOcc() {
  MV.occ.clear(); MV.guard.clear();
  for (const o of G.world.objects) {
    MV.occ.set(o.y * MW + o.x, o);
  }
  for (const o of G.world.objects) {
    if (o.type !== 'monster' && o.type !== 'enemy') continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const x = o.x + dx, y = o.y + dy; if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
      const i = y * MW + x;
      const occ = MV.occ.get(i);
      if (occ && occ.type === 'town') continue;
      if (!MV.guard.has(i)) MV.guard.set(i, o);
    }
  }
  MV.miniDirty = true;
}
function reveal(cx, cy, rad) {
  let ch = false;
  for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) {
    if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
    if (dist(x, y, cx, cy) > rad + 0.3) continue;
    const i = y * MW + x; if (!G.fog[i]) { G.fog[i] = 1; ch = true; }
  }
  if (ch) { MV.fogDirty = true; MV.miniDirty = true; }
}
function heroVision() { return 5 + 2 * skillLvl('scouting'); }
function renderFog() {
  if (!MV.fogCv) { MV.fogCv = document.createElement('canvas'); MV.fogCv.width = MW + 2; MV.fogCv.height = MH + 2; }
  const c = MV.fogCv.getContext('2d');
  const img = c.createImageData(MW + 2, MH + 2);
  for (let y = 0; y < MH + 2; y++) for (let x = 0; x < MW + 2; x++) {
    const sx = x - 1, sy = y - 1;
    const seen = sx >= 0 && sy >= 0 && sx < MW && sy < MH && G.fog[sy * MW + sx];
    const k = (y * (MW + 2) + x) * 4;
    img.data[k] = 8; img.data[k + 1] = 6; img.data[k + 2] = 10; img.data[k + 3] = seen ? 0 : 255;
  }
  c.putImageData(img, 0, 0);
  MV.fogDirty = false;
}

// ---------- עזרי גיבור ----------
function skillLvl(k) { return (G.hero.skills && G.hero.skills[k]) || 0; }
function heroStat(k) { let v = G.hero[k] || 0; for (const a of G.hero.arts) v += ARTIFACTS[a][k] || 0; return v; }
function heroManaMax() { return Math.round(heroStat('kn') * 10 * (1 + 0.25 * skillLvl('wisdom'))); }
function heroMpMax() { let m = 18 + 3 * skillLvl('logistics'); for (const a of G.hero.arts) m += ARTIFACTS[a].mp || 0; return m; }
function heroInTown() { return G.hero.x === G.world.town.x && G.hero.y === G.world.town.y; }

function baseCost(x, y) {
  const i = y * MW + x, t = G.world.terr[i];
  if (t === 0 || t === 6 || G.world.deco[i]) return Infinity;
  return G.world.road[i] ? 0.7 : TERRAIN[t].cost;
}
function stepCost(ax, ay, bx, by) { const c = baseCost(bx, by); const b = isFinite(c) ? c : 1; return (ax !== bx && ay !== by) ? b * 1.414 : b; }
function findPath(tx, ty) {
  const destObj = MV.occ.get(ty * MW + tx) || null;
  if (!destObj && !isFinite(baseCost(tx, ty))) return null;
  if (!G.fog[ty * MW + tx]) return null;
  return astar(MW, MH, G.hero.x, G.hero.y, tx, ty, (x, y) => {
    const i = y * MW + x;
    if (!G.fog[i]) return Infinity;
    if (x === tx && y === ty) return destObj ? 1 : baseCost(x, y);
    if (MV.occ.has(i)) return Infinity;
    const b = baseCost(x, y); if (!isFinite(b)) return Infinity;
    const g = MV.guard.get(i);
    if (g && g !== destObj) return Infinity;
    return b;
  });
}

// ---------- ממשק משתמש של המפה ----------
function buildMapUI() {
  const ui = $('#map-ui');
  ui.innerHTML = `
  <div id="side" class="panel pe">
    <div class="hero-box">
      <canvas id="hero-portrait" width="76" height="76"></canvas>
      <div class="hero-info">
        <div class="hero-name" id="h-name"></div>
        <div class="hero-lvl" id="h-lvl"></div>
        <div class="bar xp"><div id="h-xp"></div></div>
      </div>
    </div>
    <div class="stats">
      <span title="התקפה">⚔️ <b id="s-atk"></b></span><span title="הגנה">🛡️ <b id="s-def"></b></span>
      <span title="כוח כישוף">✨ <b id="s-sp"></b></span><span title="ידע">📖 <b id="s-kn"></b></span>
    </div>
    <div class="bar-row"><span>מאנה</span><div class="bar mana"><div id="h-mana"></div></div><b id="h-mana-t"></b></div>
    <div class="bar-row"><span>תנועה</span><div class="bar mp"><div id="h-mp"></div></div><b id="h-mp-t"></b></div>
    <div id="army-slots" class="slots"></div>
    <canvas id="minimap" width="240" height="180"></canvas>
    <div class="side-btns">
      <button class="btn primary wide" id="b-end">⏳ סיום תור</button>
      <button class="btn" id="b-town">🏰 עיר</button>
      <button class="btn" id="b-hero">🧙 גיבור</button>
      <button class="btn" id="b-save">💾 שמור</button>
      <button class="btn" id="b-load">📂 טען</button>
      <button class="btn" id="b-music">🎵</button>
      <button class="btn" id="b-sfx">🔊</button>
      <button class="btn" id="b-help">❓</button>
    </div>
  </div>
  <div id="resbar" class="panel pe">
    <div id="res-list"></div>
    <div id="date"></div>
  </div>`;
  $('#b-end').onclick = () => { Sound.play('click'); endTurn(); };
  $('#b-town').onclick = () => { Sound.play('open'); openTown(); };
  $('#b-hero').onclick = () => { Sound.play('open'); showHeroScreen(); };
  $('#b-save').onclick = () => { saveGame(); };
  $('#b-load').onclick = () => { loadGame(); };
  $('#b-music').onclick = (e) => { const on = Sound.toggleMusic(); e.target.classList.toggle('off', !on); };
  $('#b-sfx').onclick = (e) => { const on = Sound.toggleSfx(); e.target.classList.toggle('off', !on); };
  $('#b-help').onclick = () => showHelp();
  $('#minimap').addEventListener('mousedown', miniClick);
  $('#minimap').addEventListener('mousemove', (e) => { if (e.buttons & 1) miniClick(e); });
}
function miniClick(e) {
  const r = e.target.getBoundingClientRect();
  const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
  const vw = viewW(), vh = viewH();
  MV.cam.x = fx * MW * TS - vw / 2; MV.cam.y = fy * MH * TS - vh / 2; clampCam();
}
const unitIconCache = {};
function unitIcon(t, size = 44) {
  const key = t + size;
  if (unitIconCache[key]) return unitIconCache[key];
  const cv = document.createElement('canvas'); cv.width = size * 2; cv.height = size * 2;
  const c = cv.getContext('2d'); c.scale(2, 2);
  const L = t === 'hero' ? HERO_LOOK : UNITS[t].look;
  const big = L.kind === 'dragon' ? 0.55 : L.kind === 'rider' ? 0.8 : L.big ? 0.8 : 1;
  const s = size / 44 * big;
  const g = c.createRadialGradient(size / 2, size * 0.45, 2, size / 2, size / 2, size * 0.7);
  g.addColorStop(0, '#4b3a28'); g.addColorStop(1, '#1a120b');
  c.fillStyle = g; c.fillRect(0, 0, size, size);
  drawFigure(c, L, size / 2 - (L.kind === 'dragon' ? 4 : 0), size * 0.93, s, { t: 1, walk: 0, moving: false, atk: -1, face: 1, noShadow: false, seed: 0 });
  return (unitIconCache[key] = cv.toDataURL());
}
const HERO_LOOK = { kind: 'human', body: '#3355a0', trim: '#e8c04a', skin: '#e0b48a', helm: '#d8dde3', weapon: 'sword', shield: '#2f6fd6', cape: '#2f6fd6', armor: true };
function drawHeroPortrait() {
  const cv = $('#hero-portrait'); if (!cv) return;
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, 76); g.addColorStop(0, '#5a7fb8'); g.addColorStop(1, '#1d2a44');
  c.fillStyle = g; c.fillRect(0, 0, 76, 76);
  c.save(); c.translate(38, 128); c.scale(2.6, 2.6);
  drawHumanoid(c, { ...HERO_LOOK, weapon: 'none', shield: null }, { t: 0, walk: 0, moving: false, atk: -1, face: 1 });
  c.restore();
}
function updateMapUI() {
  const H = G.hero;
  $('#h-name').textContent = H.name;
  $('#h-lvl').textContent = `אביר · רמה ${H.level}`;
  const x0 = xpForLevel(H.level), x1 = xpForLevel(H.level + 1);
  $('#h-xp').style.width = `${clamp((H.xp - x0) / (x1 - x0), 0, 1) * 100}%`;
  $('#h-xp').parentElement.title = `ניסיון: ${fmt(H.xp)} / ${fmt(x1)}`;
  $('#s-atk').textContent = heroStat('atk'); $('#s-def').textContent = heroStat('def');
  $('#s-sp').textContent = heroStat('sp'); $('#s-kn').textContent = heroStat('kn');
  const mm = heroManaMax();
  $('#h-mana').style.width = `${clamp(H.mana / mm, 0, 1) * 100}%`; $('#h-mana-t').textContent = `${H.mana}/${mm}`;
  const mpm = heroMpMax();
  $('#h-mp').style.width = `${clamp(H.mp / mpm, 0, 1) * 100}%`; $('#h-mp-t').textContent = `${Math.floor(H.mp)}`;
  $('#army-slots').innerHTML = H.army.map((s) => s ? `<div class="slot" title="${UNITS[s.t].name}"><img src="${unitIcon(s.t)}"><span>${s.n}</span></div>` : `<div class="slot empty"></div>`).join('');
  $('#res-list').innerHTML = ['gold', 'wood', 'ore', 'crystal', 'gems'].map((k) => `<span class="res" title="${RES_NAME[k]}">${RES_ICON[k]} <b>${fmt(G.res[k])}</b></span>`).join('');
  $('#date').textContent = `חודש ${G.month} · שבוע ${G.week} · יום ${G.day}`;
  $('#b-music').classList.toggle('off', !Sound.musicOn);
  $('#b-sfx').classList.toggle('off', !Sound.sfxOn);
}

// ---------- מצלמה ----------
function viewW() { return VIEW.w - PANEL_W; }
function viewH() { return VIEW.h - BAR_H; }
function clampCam() {
  MV.cam.x = clamp(MV.cam.x, -60, MW * TS - viewW() + 60);
  MV.cam.y = clamp(MV.cam.y, -60, MH * TS - viewH() + 60);
}
function centerCam(x, y) { MV.cam.x = (x + 0.5) * TS - viewW() / 2; MV.cam.y = (y + 0.5) * TS - viewH() / 2; clampCam(); }

// ---------- עדכון ----------
function mapUpdate(dt) {
  // גלילה
  const sp = 700 * dt;
  if (MV.keys.ArrowLeft || MV.keys.a) MV.cam.x -= sp;
  if (MV.keys.ArrowRight || MV.keys.d) MV.cam.x += sp;
  if (MV.keys.ArrowUp || MV.keys.w) MV.cam.y -= sp;
  if (MV.keys.ArrowDown || MV.keys.s) MV.cam.y += sp;
  if (MV.mouse.in && !modalOpen()) {
    const m = 14;
    if (MV.mouse.x < m) MV.cam.x -= sp; if (MV.mouse.x > viewW() - m && MV.mouse.x < viewW()) MV.cam.x += sp;
    if (MV.mouse.y < m) MV.cam.y -= sp; if (MV.mouse.y > viewH() - m && MV.mouse.y < viewH()) MV.cam.y += sp;
  }
  clampCam();
  // ענן
  for (const cl of MV.clouds) { cl.x += cl.v * dt; if (cl.x > MW * TS + 400) cl.x = -400; }
  // אויב שנע
  for (const o of G.world.objects) {
    if (o.px === undefined) { o.px = o.x; o.py = o.y; }
    o.px = lerp(o.px, o.x, Math.min(1, dt * 4)); o.py = lerp(o.py, o.y, Math.min(1, dt * 4));
  }
  updateHeroMove(dt);
  updateFX(dt);
}
function startMove() {
  if (!MV.path || !MV.path.length) return;
  MV.moving = true; MV.stepT = 0;
}
function stopMove() { MV.moving = false; MV.stepT = 0; MV.path = null; MV.pathDest = null; G.hero.px = G.hero.x; G.hero.py = G.hero.y; updateMapUI(); }
function updateHeroMove(dt) {
  const H = G.hero;
  if (!MV.moving) { H.px = H.x; H.py = H.y; return; }
  if (MV.stepT === 0) {
    const [nx, ny] = MV.path[0];
    const i = ny * MW + nx;
    const o = MV.occ.get(i);
    const cost = stepCost(H.x, H.y, nx, ny);
    if (H.mp + 1e-6 < cost) { stopMove(); toast('לגיבור לא נותרו נקודות תנועה להיום'); Sound.play('error'); return; }
    if (nx !== H.x) H.face = nx > H.x ? 1 : -1;
    if (o && (o.type === 'monster' || o.type === 'citadel' || o.type === 'enemy')) { stopMove(); mapBattle(o); return; }
    MV.from = [H.x, H.y]; MV.to = [nx, ny]; H.mp -= cost;
  }
  const prev = MV.stepT;
  MV.stepT += dt * 6;
  if ((prev < 0.5 && MV.stepT >= 0.5) || prev === 0) Sound.play('hoof');
  const t = Math.min(1, MV.stepT);
  H.px = lerp(MV.from[0], MV.to[0], t); H.py = lerp(MV.from[1], MV.to[1], t);
  H.walk = (H.walk || 0) + dt * 14;
  // מעקב מצלמה עדין
  const sx = (H.px + 0.5) * TS - MV.cam.x, sy = (H.py + 0.5) * TS - MV.cam.y;
  if (sx < viewW() * 0.25 || sx > viewW() * 0.75 || sy < viewH() * 0.25 || sy > viewH() * 0.75) {
    MV.cam.x = lerp(MV.cam.x, (H.px + 0.5) * TS - viewW() / 2, dt * 3); MV.cam.y = lerp(MV.cam.y, (H.py + 0.5) * TS - viewH() / 2, dt * 3);
  }
  if (MV.stepT >= 1) {
    H.x = MV.to[0]; H.y = MV.to[1]; MV.path.shift(); MV.stepT = 0;
    reveal(H.x, H.y, heroVision());
    const i = H.y * MW + H.x;
    const o = MV.occ.get(i);
    if (o) { stopMove(); interact(o); return; }
    const g = MV.guard.get(i);
    if (g) { stopMove(); mapBattle(g); return; }
    if (!MV.path.length) stopMove();
    else updateMapUI();
  }
}

// ---------- אינטראקציה עם אובייקטים ----------
function removeObj(o) { const k = G.world.objects.indexOf(o); if (k >= 0) G.world.objects.splice(k, 1); rebuildOcc(); }
function interact(o) {
  const H = G.hero;
  const wx = (o.x + 0.5) * TS, wy = (o.y + 0.5) * TS;
  switch (o.type) {
    case 'town': openTown(); break;
    case 'mine':
      if (!o.owner) {
        o.owner = 1; Sound.play('flag');
        const inc = { gold: '1000 זהב', wood: '2 עץ', ore: '2 עפרה', crystal: '1 קריסטל', gems: '1 אבני חן' }[o.res];
        toast(`🚩 השתלטת על ${mineName(o.res)}! (+${inc} ליום)`);
        burst(wx, wy, 30, { color: ['#ffd75e', '#ffffff', '#6fb0ff'], add: true, sp: 160, g: 200 });
        MV.miniDirty = true;
      }
      break;
    case 'res':
      G.res[o.res] += o.amt; Sound.play(o.res === 'gold' ? 'coin' : 'pickup');
      floatText(wx, wy - 20, `+${o.amt} ${RES_ICON[o.res]}`, '#ffe28a', 18, { bold: true });
      burst(wx, wy, 20, { color: ['#ffd75e', '#fff'], add: true, sp: 120 });
      removeObj(o); break;
    case 'chest': {
      const gold = 1000 + randi(0, 5) * 100; const xp = gold - 500;
      Sound.play('pickup');
      showModal({
        title: '📦 תיבת אוצר', html: `<p>מצאת תיבת אוצר נעולה בין השיחים. המנעול נשבר בקלות...</p><p>מה תבחר?</p>`,
        buttons: [
          { label: `🪙 קח ${gold} זהב`, cls: 'primary', fn: () => { G.res.gold += gold; Sound.play('coin'); floatText(wx, wy - 20, `+${gold} 🪙`, '#ffe28a', 18, { bold: true }); updateMapUI(); } },
          { label: `⭐ חלק לאיכרים (+${xp} ניסיון)`, fn: () => gainXP(xp) },
        ],
      });
      removeObj(o); break;
    }
    case 'art': {
      const A = ARTIFACTS[o.art]; H.arts.push(o.art); Sound.play('levelup');
      burst(wx, wy, 40, { color: ['#ffcf6b', '#fff'], add: true, sp: 200 });
      showModal({ title: `${A.icon} ${A.name}`, html: `<p>מצאת חפץ קסום עתיק!</p><p class="big-note">${A.desc}</p>` });
      if (o.art === 'boots') H.mp += 4;
      removeObj(o); break;
    }
    case 'shrine': {
      const S = SPELLS[o.spell];
      if (H.spells.includes(o.spell)) { toast(`כבר ידוע לך הלחש ${S.name}`); break; }
      H.spells.push(o.spell); Sound.play('magic');
      burst(wx, wy - 14, 40, { color: ['#7fd4ff', '#fff'], add: true, sp: 150, g: -40 });
      showModal({ title: '⛩️ מקדש הקסם', html: `<p>רוחות המקדש לוחשות לך סוד עתיק...</p><p class="big-note">${S.icon} למדת את הלחש <b>${S.name}</b>!</p><p class="muted">${S.desc}</p>` });
      break;
    }
    case 'stone':
      if (o.visited) { toast('כבר למדת מאבן זו'); break; }
      o.visited = true; Sound.play('magic'); toast('📜 אבן הלמידה מעניקה לך חוכמה עתיקה');
      gainXP(1000); break;
    case 'well': {
      const mm = heroManaMax();
      if (o.day === G.dayCount) { toast('כבר שתית מהבאר היום'); break; }
      if (H.mana >= mm) { toast('המאנה שלך כבר מלאה'); break; }
      o.day = G.dayCount; H.mana = mm; Sound.play('drink');
      burst(wx, wy - 8, 30, { color: ['#5ab0ff', '#fff'], add: true, sp: 90, g: -20 });
      toast('💧 הבאר הקסומה מילאה את המאנה שלך'); break;
    }
  }
  updateMapUI();
}
function mineName(res) { return { gold: 'מכרה הזהב', wood: 'המנסרה', ore: 'מכרה העפרה', crystal: 'מערת הקריסטל', gems: 'בריכת אבני החן' }[res]; }

function gainXP(xp) {
  const H = G.hero;
  H.xp += Math.round(xp);
  floatText((H.x + 0.5) * TS, (H.y) * TS - 30, `+${fmt(xp)} ניסיון`, '#a6e3ff', 18, { bold: true });
  const queue = [];
  while (H.xp >= xpForLevel(H.level + 1)) { H.level++; queue.push(H.level); }
  updateMapUI();
  const next = () => { if (!queue.length) return; queue.shift(); levelUpDialog(next); };
  next();
}
function levelUpDialog(done) {
  const H = G.hero;
  Sound.play('levelup');
  const stats = ['atk', 'atk', 'def', 'def', 'sp', 'kn'];
  const st = pick(stats); H[st]++;
  const stName = { atk: 'התקפה', def: 'הגנה', sp: 'כוח כישוף', kn: 'ידע' }[st];
  // שתי אפשרויות כישורים (בסגנון Heroes 3)
  const known = Object.keys(H.skills).filter((k) => H.skills[k] < 3);
  const fresh = Object.keys(SKILLS).filter((k) => !H.skills[k]);
  const opts = [];
  if (known.length) opts.push(pick(known));
  const pool = Object.keys(H.skills).length < 6 ? fresh : known;
  const second = shuffle(pool.filter((k) => !opts.includes(k)))[0];
  if (second) opts.push(second);
  if (opts.length < 2) { const extra = shuffle(Object.keys(SKILLS).filter((k) => !opts.includes(k) && (H.skills[k] || 0) < 3))[0]; if (extra) opts.push(extra); }
  const btns = opts.map((k) => {
    const nl = (H.skills[k] || 0) + 1;
    return { label: `${SKILLS[k].icon} ${SKILLS[k].name} (${SKILL_LEVEL[nl]})<small>${SKILLS[k].desc(nl)}</small>`, cls: 'skill-pick', fn: () => { H.skills[k] = nl; if (k === 'wisdom') H.mana = Math.min(H.mana + 5, heroManaMax()); updateMapUI(); done && done(); } };
  });
  if (!btns.length) btns.push({ label: 'המשך', fn: () => done && done() });
  showModal({ title: `⭐ ${H.name} עלה לרמה ${H.level}!`, html: `<p class="big-note">+1 ${stName}</p><p>בחר כישור חדש:</p>`, buttons: btns, noClose: true });
}

// ---------- סוף תור ----------
function endTurn() {
  if (MV.moving) return;
  const H = G.hero;
  G.day++; G.dayCount++;
  let newWeek = false;
  if (G.day > 7) { G.day = 1; G.week++; newWeek = true; if (G.week > 4) { G.week = 1; G.month++; } }
  // הכנסות
  const income = { gold: 0, wood: 0, ore: 0, crystal: 0, gems: 0 };
  const b = G.town.built;
  income.gold += b.includes('cityhall') ? 2000 : b.includes('townhall') ? 1000 : 500;
  income.gold += 150 * skillLvl('estates');
  for (const o of G.world.objects) if (o.type === 'mine' && o.owner) income[o.res] += o.res === 'gold' ? 1000 : o.res === 'wood' || o.res === 'ore' ? 2 : 1;
  for (const k in income) G.res[k] += income[k];
  H.mp = heroMpMax();
  H.mana = Math.min(heroManaMax(), H.mana + 2 + Math.ceil(heroManaMax() * 0.05));
  G.town.builtToday = false;
  Sound.play(newWeek ? 'newweek' : 'newday');
  if (newWeek) {
    const fort = b.includes('fort') ? 1.5 : 1;
    for (const id of BUILD_ORDER) { const B = BUILDINGS[id]; if (B.unit && b.includes(id)) G.town.avail[B.unit] = (G.town.avail[B.unit] || 0) + Math.round(UNITS[B.unit].growth * fort); }
    for (const o of G.world.objects) if (o.type === 'monster') for (const s of o.army) s.n = Math.ceil(s.n * 1.1);
    const wn = WEEK_NAMES[(G.dayCount / 7 | 0) % WEEK_NAMES.length];
    toast(`🌅 ${wn}! היצורים בעיר התרבו.`, 4000);
  } else toast(`☀️ יום חדש: +${fmt(income.gold)} זהב`);
  // צבא המתים
  enemyTurn();
  autosave();
  updateMapUI();
}
function enemyTurn() {
  const W = G.world;
  const weeks = Math.floor((G.dayCount - 1) / 7);
  let en = W.objects.find((o) => o.type === 'enemy');
  if (!en && G.dayCount >= 9 && G.dayCount - (G.enemyLast || 0) >= 10) {
    const k = weeks + 1;
    const army = [{ t: 'skeleton', n: 12 + k * 6 }, { t: 'zombie', n: 6 + k * 3 }, { t: 'ghost', n: 3 + k * 2 }];
    if (k >= 3) army.push({ t: 'lich', n: k * 2 }); if (k >= 4) army.push({ t: 'vampire', n: k * 2 }); if (k >= 6) army.push({ t: 'bonedragon', n: Math.floor(k / 3) });
    en = { type: 'enemy', x: W.cit.x - 2, y: W.cit.y, id: 5000 + G.dayCount, army };
    W.objects.push(en); G.enemyLast = G.dayCount;
    rebuildOcc();
    Sound.play('horn');
    showModal({ title: '☠️ צבא המתים יוצא לדרך!', html: `<p>שערי המצודה האפלה נפתחו. צבא של מתים-חיים צועד לעבר העיר שלך!</p><p class="muted">הגן על העיר — אם תיפול, המערכה אבודה.</p>` });
    return;
  }
  if (!en) return;
  // תנועה לעבר הגיבור (אם קרוב) או העיר
  const H = G.hero;
  const tgt = dist(en.x, en.y, H.x, H.y) < 9 ? { x: H.x, y: H.y } : W.town;
  const route = (blockObjs) => astar(MW, MH, en.x, en.y, tgt.x, tgt.y, (x, y) => {
    const i = y * MW + x; if (x === tgt.x && y === tgt.y) return 1;
    const o = MV.occ.get(i); if (blockObjs && o && o !== en && o.type !== 'mine') return Infinity;
    return baseCost(x, y);
  });
  const p = route(true) || route(false);
  if (!p) return;
  let mp = 7;
  for (const [x, y] of p) {
    const c = stepCost(en.x, en.y, x, y); if (mp < c) break;
    if (x === H.x && y === H.y) break;
    if (x === W.town.x && y === W.town.y) { en.x = x; en.y = y; break; }
    const o = MV.occ.get(y * MW + x);
    if (o && o.type !== 'mine') break;
    if (o && o.type === 'mine' && o.owner) { o.owner = 0; toast(`☠️ צבא המתים כבש את ${mineName(o.res)}!`); }
    en.x = x; en.y = y; mp -= c;
    if (Math.max(Math.abs(x - H.x), Math.abs(y - H.y)) <= 1) break;
  }
  rebuildOcc();
  if (en.x === W.town.x && en.y === W.town.y) {
    setTimeout(() => townSiege(en), 400);
  } else if (Math.max(Math.abs(en.x - H.x), Math.abs(en.y - H.y)) <= 1) {
    setTimeout(() => { toast('☠️ צבא המתים תוקף אותך!'); mapBattle(en); }, 400);
  }
}
function townSiege(en) {
  const garrison = G.town.garrison.filter(Boolean);
  if (heroInTown()) { mapBattle(en, { siege: true }); return; }
  if (!garrison.length) { gameOver('העיר שלך נפלה בידי צבא המתים...'); return; }
  showModal({
    title: '🏰 המצור על העיר!', html: '<p>צבא המתים הגיע לשערי העיר. חיל המצב יוצא להגן עליה — בלי הגיבור!</p>',
    buttons: [{ label: '⚔️ להגנה!', cls: 'primary', fn: () => {
      startBattle({
        army: G.town.garrison, hero: null, enemy: en.army.map((s) => ({ ...s })), terrain: 1, siege: true,
        title: 'הגנה על העיר',
        onEnd: (res) => {
          if (res.victory) { removeObj(en); toast('🏆 חיל המצב הדף את המתים!'); setScreen('map'); }
          else gameOver('העיר שלך נפלה בידי צבא המתים...');
        },
      });
    } }], noClose: true,
  });
}
function mapBattle(o, opts = {}) {
  const tile = G.world.terr[G.hero.y * MW + G.hero.x];
  const isBoss = o.type === 'citadel';
  const desc = o.army.map((s) => `${s.n} ${UNITS[s.t].name}`).join(', ');
  const ratio = armyPower(o.army) / Math.max(1, armyPower(G.hero.army, heroStat('atk') + heroStat('def')) + G.hero.level * 60);
  const danger = ratio < 0.4 ? ['קלה', '#7fd47f'] : ratio < 0.8 ? ['בינונית', '#ffd75e'] : ratio < 1.3 ? ['קשה', '#ff9b4a'] : ['קטלנית', '#ff4d4d'];
  Sound.play('horn');
  const go = () => {
    startBattle({
      army: G.hero.army, hero: G.hero, enemy: o.army.map((s) => ({ ...s })), terrain: tile, boss: isBoss,
      title: isBoss ? 'הקרב על המצודה האפלה' : o.type === 'enemy' ? 'צבא המתים' : 'קרב',
      onEnd: (res) => {
        if (res.victory) {
          if (isBoss) { removeObj(o); setScreen('map'); winGame(); return; }
          removeObj(o); setScreen('map'); gainXP(res.xp);
        } else if (res.retreat) {
          G.hero.army = [null, null, null, null, null, null, null];
          G.hero.x = G.world.town.x; G.hero.y = G.world.town.y; G.hero.mp = 0;
          // מפלצת שורדת עם הכוחות שנותרו
          o.army = res.enemyLeft.filter((s) => s.n > 0);
          if (!o.army.length) removeObj(o);
          setScreen('map'); centerCam(G.hero.x, G.hero.y); reveal(G.hero.x, G.hero.y, heroVision());
          toast('🏳️ הגיבור נסוג לעיר. הצבא אבד.', 4000);
        } else {
          gameOver(opts.siege ? 'העיר שלך נפלה בידי צבא המתים...' : `${G.hero.name} נפל בקרב. צבאו הושמד...`);
        }
        updateMapUI();
      },
    });
  };
  if (o.type === 'enemy') { go(); return; }
  showModal({
    title: isBoss ? '💀 המצודה האפלה' : '⚔️ קרב!',
    html: isBoss
      ? `<p>מלקאר, האדון האפל, מחכה בין חומות המצודה עם משמר העילית שלו.</p><p class="muted">${desc}</p><p>רמת סכנה: <b style="color:${danger[1]}">${danger[0]}</b></p>`
      : `<p>${sizeWord(o.army[0].n)} ${UNITS[o.army[0].t].name} חוסמים את הדרך!</p><p class="muted">${desc}</p><p>רמת סכנה: <b style="color:${danger[1]}">${danger[0]}</b></p>`,
    buttons: [{ label: '⚔️ להילחם!', cls: 'primary', fn: go }, { label: 'לסגת', fn: () => { G.hero.mp = Math.max(0, G.hero.mp); } }],
  });
}

// ---------- רינדור ----------
function mapDraw(c, t) {
  const vw = viewW(), vh = viewH();
  c.save();
  c.beginPath(); c.rect(0, 0, vw, vh); c.clip();
  c.fillStyle = '#08060a'; c.fillRect(0, 0, vw, vh);
  const cx = Math.round(MV.cam.x), cy = Math.round(MV.cam.y);
  c.translate(-cx, -cy);
  c.drawImage(MV.terrainCv, 0, 0);
  // אנימציית מים
  const x0 = Math.max(0, Math.floor(cx / TS)), y0 = Math.max(0, Math.floor(cy / TS));
  const x1 = Math.min(MW - 1, Math.ceil((cx + vw) / TS)), y1 = Math.min(MH - 1, Math.ceil((cy + vh) / TS));
  c.strokeStyle = 'rgba(200,235,255,0.18)'; c.lineWidth = 1.5;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (G.world.terr[y * MW + x] !== 0) continue;
    const ph = t * 1.2 + x * 0.7 + y * 1.3;
    const ox = (x + 0.3) * TS + Math.sin(ph) * 6, oy = (y + 0.4) * TS + Math.cos(ph * 0.7) * 4;
    c.globalAlpha = (Math.sin(ph * 1.3) + 1) / 2;
    c.beginPath(); c.arc(ox, oy, 7, 3.6, 5.8); c.stroke();
    c.beginPath(); c.arc(ox + 18, oy + 16, 5, 3.6, 5.8); c.stroke();
  }
  c.globalAlpha = 1;
  // נתיב
  if (MV.path && !MV.moving) drawPath(c);
  // אובייקטים + גיבור ממוינים
  const list = G.world.objects.filter((o) => o.x >= x0 - 2 && o.x <= x1 + 2 && o.y >= y0 - 1 && o.y <= y1 + 3);
  const items = list.map((o) => [o.py ?? o.y, () => drawObj(c, o, t)]);
  items.push([G.hero.py ?? G.hero.y, () => drawMapHero(c, (G.hero.px + 0.5) * TS, (G.hero.py + 0.5) * TS + 14, G.hero.face || 1, G.hero.walk || 0, MV.moving, t)]);
  items.sort((a, b) => a[0] - b[0]);
  for (const [, f] of items) f();
  // הדגשת ריחוף
  if (MV.hover && !MV.moving) {
    const { x, y } = MV.hover;
    c.strokeStyle = 'rgba(255,230,150,0.55)'; c.lineWidth = 2;
    c.strokeRect(x * TS + 2, y * TS + 2, TS - 4, TS - 4);
  }
  drawFX(c); drawTexts(c);
  // צללי עננים
  for (const cl of MV.clouds) {
    const g = c.createRadialGradient(cl.x, cl.y, 10, cl.x, cl.y, cl.r);
    g.addColorStop(0, 'rgba(0,0,20,0.13)'); g.addColorStop(1, 'rgba(0,0,20,0)');
    c.fillStyle = g; c.beginPath(); c.ellipse(cl.x, cl.y, cl.r, cl.r * 0.6, 0, 0, TAU); c.fill();
  }
  // ערפל
  if (MV.fogDirty) renderFog();
  c.imageSmoothingEnabled = true;
  c.drawImage(MV.fogCv, -TS, -TS, (MW + 2) * TS, (MH + 2) * TS);
  c.restore();
  // וינייטה
  const vg = c.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.45, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  c.fillStyle = vg; c.fillRect(0, 0, vw, vh);
  drawMinimap();
}
function drawPath(c) {
  let mp = G.hero.mp, px = G.hero.x, py = G.hero.y;
  const n = MV.path.length;
  MV.path.forEach(([x, y], k) => {
    mp -= stepCost(px, py, x, y);
    const ok = mp >= -1e-6;
    const cx = (x + 0.5) * TS, cy = (y + 0.5) * TS;
    if (k === n - 1) {
      c.strokeStyle = ok ? '#7dff7a' : '#ff6a5a'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(cx - 8, cy - 8); c.lineTo(cx + 8, cy + 8); c.moveTo(cx + 8, cy - 8); c.lineTo(cx - 8, cy + 8); c.stroke();
    } else {
      const [nx, ny] = MV.path[k + 1]; const a = Math.atan2(ny - y, nx - x);
      c.save(); c.translate(cx, cy); c.rotate(a);
      c.fillStyle = ok ? '#7dff7a' : '#ff6a5a'; c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(7, 0); c.lineTo(-5, -6); c.lineTo(-2, 0); c.lineTo(-5, 6); c.closePath(); c.fill(); c.stroke();
      c.restore();
    }
    px = x; py = y;
  });
}
function drawObj(c, o, t) {
  const x = ((o.px ?? o.x) + 0.5) * TS, y = ((o.py ?? o.y) + 0.5) * TS + 14;
  switch (o.type) {
    case 'town': drawCastle(c, x, y + 4, t, false); break;
    case 'citadel': drawCastle(c, x, y + 4, t, true); break;
    case 'mine': drawMine(c, x, y, o.res, t, o.owner); break;
    case 'res': drawResPile(c, x, y - 4, o.res, t); break;
    case 'chest': drawChest(c, x, y - 4, t); break;
    case 'art': drawArtifactPedestal(c, x, y - 4, t, ARTIFACTS[o.art].icon); break;
    case 'shrine': drawShrine(c, x, y - 2, t); break;
    case 'stone': drawStone(c, x, y - 2, t); break;
    case 'well': drawWell(c, x, y - 2, t); break;
    case 'monster': case 'enemy': {
      const s = o.army[0], L = UNITS[s.t].look;
      const big = L.kind === 'dragon' ? 0.6 : L.big ? 0.85 : 1.05;
      if (o.type === 'enemy') { glow(c, x, y - 16, 40, '#ff2040', 0.3); }
      drawFigure(c, L, x, y - 4, big, { t: t + o.id, walk: 0, moving: false, atk: -1, face: -1, fly: false, seed: o.id });
      if (o.army.length > 1 || s.n > 1) {
        const n = o.army.reduce((a, b) => a + b.n, 0);
        c.font = '700 11px Heebo'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = o.type === 'enemy' ? 'rgba(120,10,20,.85)' : 'rgba(20,12,6,.8)'; c.fillRect(x - 14, y - 2, 28, 13);
        c.fillStyle = '#ffe9b0'; c.fillText(o.type === 'enemy' ? `☠ ${n}` : sizeWord(n), x, y + 4.5);
      }
      break;
    }
  }
}
function drawMinimap() {
  const cv = $('#minimap'); if (!cv) return;
  const c = cv.getContext('2d');
  const sx = cv.width / MW, sy = cv.height / MH;
  if (MV.miniDirty || !MV.miniBase) {
    if (!MV.miniBase) { MV.miniBase = document.createElement('canvas'); MV.miniBase.width = cv.width; MV.miniBase.height = cv.height; }
    const b = MV.miniBase.getContext('2d');
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const i = y * MW + x;
      b.fillStyle = !G.fog[i] ? '#0b080c' : G.world.deco[i] ? '#2a4a26' : G.world.road[i] ? '#b39a6a' : TERRAIN[G.world.terr[i]].color;
      b.fillRect(x * sx, y * sy, sx + 0.5, sy + 0.5);
    }
    for (const o of G.world.objects) {
      if (!G.fog[o.y * MW + o.x]) continue;
      b.fillStyle = o.type === 'town' ? '#4a9bff' : o.type === 'citadel' || o.type === 'enemy' ? '#ff3040' : o.type === 'mine' ? (o.owner ? '#4a9bff' : '#aaa') : o.type === 'monster' ? '#e05030' : '#ffd75e';
      const r = o.type === 'town' || o.type === 'citadel' ? 3 : 1.6;
      b.fillRect(o.x * sx + sx / 2 - r, o.y * sy + sy / 2 - r, r * 2, r * 2);
    }
    MV.miniDirty = false;
  }
  c.drawImage(MV.miniBase, 0, 0);
  c.fillStyle = '#fff'; c.fillRect(G.hero.px * sx, G.hero.py * sy, sx + 1, sy + 1);
  c.strokeStyle = 'rgba(255,240,180,.9)'; c.lineWidth = 1;
  c.strokeRect(MV.cam.x / TS * sx, MV.cam.y / TS * sy, viewW() / TS * sx, viewH() / TS * sy);
}

// ---------- קלט ----------
function mapMouseMove(x, y) {
  MV.mouse.x = x; MV.mouse.y = y; MV.mouse.in = x < viewW() && y < viewH();
  if (!MV.mouse.in) { MV.hover = null; hideTip(); return; }
  const tx = Math.floor((x + MV.cam.x) / TS), ty = Math.floor((y + MV.cam.y) / TS);
  if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) { MV.hover = null; hideTip(); return; }
  MV.hover = { x: tx, y: ty };
  const i = ty * MW + tx;
  if (!G.fog[i]) { hideTip(); return; }
  const o = MV.occ.get(i);
  let tip = '';
  if (o) {
    if (o.type === 'monster' || o.type === 'enemy' || o.type === 'citadel') {
      const ratio = armyPower(o.army) / Math.max(1, armyPower(G.hero.army, heroStat('atk') + heroStat('def')) + G.hero.level * 60);
      const danger = ratio < 0.4 ? ['קלה', '#7fd47f'] : ratio < 0.8 ? ['בינונית', '#ffd75e'] : ratio < 1.3 ? ['קשה', '#ff9b4a'] : ['קטלנית', '#ff4d4d'];
      tip = `<b>${o.type === 'citadel' ? 'המצודה האפלה' : o.type === 'enemy' ? 'צבא המתים' : sizeWord(o.army[0].n) + ' ' + UNITS[o.army[0].t].name}</b><br>` +
        o.army.map((s) => `${o.type === 'monster' ? sizeWord(s.n) : s.n} ${UNITS[s.t].name}`).join('<br>') + `<br>סכנה: <b style="color:${danger[1]}">${danger[0]}</b>`;
    } else if (o.type === 'mine') tip = `<b>${mineName(o.res)}</b><br>${o.owner ? '🚩 בשליטתך' : 'לא נכבש'}`;
    else if (o.type === 'res') tip = `<b>${RES_NAME[o.res]}</b> ${RES_ICON[o.res]}`;
    else if (o.type === 'chest') tip = '<b>תיבת אוצר</b>';
    else if (o.type === 'art') tip = `<b>חפץ קסום</b><br>${ARTIFACTS[o.art].name}`;
    else if (o.type === 'shrine') tip = `<b>מקדש הקסם</b><br>מלמד: ${SPELLS[o.spell].name}`;
    else if (o.type === 'stone') tip = `<b>אבן הלמידה</b><br>${o.visited ? 'כבר ביקרת' : '+1000 ניסיון'}`;
    else if (o.type === 'well') tip = '<b>באר קסומה</b><br>ממלאת מאנה';
    else if (o.type === 'town') tip = '<b>העיר שלך — אבן-הכתר</b>';
  } else {
    const g = MV.guard.get(i);
    tip = `${TERRAIN[G.world.terr[i]].name}${G.world.road[i] ? ' (דרך)' : ''}${g ? '<br><span style="color:#ff8a7a">⚠ אזור שמור</span>' : ''}`;
  }
  showTip(tip, x, y);
}
function mapClick(x, y, button) {
  if (x >= viewW() || y >= viewH()) return;
  if (MV.moving) { MV.path = MV.path.slice(0, 1); return; }
  const tx = Math.floor((x + MV.cam.x) / TS), ty = Math.floor((y + MV.cam.y) / TS);
  if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return;
  if (button === 2) { MV.path = null; return; }
  const H = G.hero;
  if (tx === H.x && ty === H.y) { if (heroInTown()) openTown(); else showHeroScreen(); return; }
  if (MV.pathDest && MV.pathDest.x === tx && MV.pathDest.y === ty && MV.path) { Sound.play('order'); startMove(); return; }
  const p = findPath(tx, ty);
  if (!p) { MV.path = null; MV.pathDest = null; Sound.play('error'); return; }
  MV.path = p; MV.pathDest = { x: tx, y: ty }; Sound.play('click');
}
