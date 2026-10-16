'use strict';
// ===== קרבות בזמן אמת עם הפסקה (בסגנון Baldur's Gate 2) =====
const BW = 1400, BH = 760, PORT_W = 104, BBAR_H = 156, FIG = 1.5, ATK_ANIM = 0.55;
const B = { units: [], projs: [], obstacles: [], tele: [], markers: [], sel: new Set(), log: [], view: { s: 1, ox: 0, oy: 0 }, mouse: { x: 0, y: 0, wx: 0, wy: 0 } };
let uidSeq = 0;

function startBattle(opts) {
  Object.assign(B, {
    opts, units: [], projs: [], obstacles: [], tele: [], markers: [], sel: new Set(), log: [], time: 0,
    paused: false, speed: 1, over: false, overT: 0, targeting: null, drag: null, hover: null, spellCd: 0, ai: true,
    killedXP: 0, uiT: 0, boss: !!opts.boss, summoned: false, result: null,
  });
  FX.reset();
  B.bg = renderBattleBG(opts.terrain, opts.boss, opts.siege);
  genObstacles(opts.terrain, opts.boss);
  const fortDef = opts.siege && G.town.built.includes('fort') ? 3 : 0;
  B.bonus = opts.hero ? { atk: heroStat('atk'), def: heroStat('def') + fortDef } : { atk: 0, def: fortDef };
  // צד השחקן
  const pl = [];
  for (const arr of [opts.army, opts.army2]) {
    if (arr) arr.forEach((s, i) => { if (s && s.n > 0) { const u = makeUnit(s.t, s.n, 0, i); u.src = arr; pl.push(u); } });
  }
  if (opts.hero) pl.push(makeHeroUnit(opts.hero));
  // צד האויב — ערימות ניטרליות מתפצלות לקבוצות (כמו ב-Heroes 3)
  const en = [];
  const split = !opts.boss && opts.enemy.length <= 2;
  for (const s of opts.enemy) {
    const U = UNITS[s.t];
    let groups = split ? clamp(Math.ceil(s.n / (U.hp >= 100 ? 1 : U.hp >= 30 ? 4 : 9)), 1, opts.enemy.length === 1 ? 4 : 2) : 1;
    groups = Math.min(groups, s.n);
    for (let g = 0; g < groups; g++) {
      const n = Math.floor(s.n / groups) + (g < s.n % groups ? 1 : 0);
      if (n > 0) en.push(makeUnit(s.t, n, 1, -1));
    }
  }
  // גיבור אויב (נקרומנסר)
  B.ebonus = { atk: 0, def: 0 };
  if (opts.ehero) {
    const L = opts.ehero.level;
    const nu = makeUnit('necro', 1, 1, -1);
    nu.U = { ...UNITS.necro, hp: 120 + L * 45, dmg: [6 + L * 2, 12 + L * 3] };
    Object.assign(nu, { hpMax: nu.U.hp, hpTop: nu.U.hp, isEHero: true, name: opts.ehero.name, spellT: 3, elvl: L });
    B.ebonus = { atk: L, def: L };
    en.push(nu);
  }
  placeSide(pl, 0); placeSide(en, 1);
  // מצור: חומות ומגדלי חצים
  B.towers = opts.siege && G.town.built.includes('tower') ? [{ x: 62, top: 150, cd: 1 }, { x: 62, top: BH - 150, cd: 2 }] : [];
  B.units = pl.concat(en);
  setScreen('battle');
  buildBattleUI();
  Sound.music(opts.boss ? 'boss' : 'battle');
  Sound.play('horn');
  logLine(`⚔️ ${opts.title || 'קרב'} מתחיל! (רווח = הפסקה)`, '#ffd36b');
  if (opts.boss) { setTimeout(() => { Sound.play('roar'); logLine('מלקאר: "הכתר שלי! אף בן תמותה לא ייקח אותו!"', '#ff6a7a'); }, 600); }
  if (!G.tutorialSeen) {
    G.tutorialSeen = true; B.paused = true;
    showModal({ title: '⚔️ קרב בזמן אמת', html: `<ul class="help-list">
      <li><b>לחיצה שמאלית</b> על יחידה שלך — בחירה. <b>גרירה</b> — בחירת קבוצה. <b>Shift</b> — הוספה.</li>
      <li><b>לחיצה</b> על הקרקע — תנועה. על אויב — התקפה. (גם לחיצה ימנית)</li>
      <li><b>רווח</b> — הפסקה/המשך (תן פקודות בזמן הפסקה!)</li>
      <li>לחשים ויכולות מיוחדות בסרגל התחתון. <b>Q</b> — יכולת, <b>1-8</b> — בחירת יחידה, <b>A</b> — בחר הכל.</li>
      <li>⚠️ כדור אש פוגע גם בכוחות שלך!</li></ul>`,
      buttons: [{ label: 'לקרב!', cls: 'primary', fn: () => { B.paused = false; updatePauseUI(); } }], noClose: true });
  }
  updatePauseUI();
}
function makeUnit(t, n, side, slot) {
  const U = UNITS[t];
  return {
    id: ++uidSeq, t, U, L: U.look, side, slot, n, n0: n, hpMax: U.hp, hpTop: U.hp, x: 0, y: 0, r: U.size,
    face: side ? -1 : 1, order: null, target: null, cd: rand(0.2, 1.2), atk: -1, hitDone: false, walk: rand(0, 6), moving: false,
    flash: 0, dead: false, deadT: 0, buffs: {}, abCd: side ? rand(3, 8) : 0, seed: rand(0, 100), fly: !!U.fly, retarget: 0, lastHitBy: null, lastHitT: -9,
    nextMult: 1, name: U.name,
  };
}
function makeHeroUnit(H) {
  const U = { name: H.name, hp: 70 + H.level * 18 + heroStat('def') * 6, atk: 2, def: 2, dmg: [4 + H.level, 8 + H.level * 2], spd: 120, cd: 1.5, range: 0, size: 17, look: HERO_LOOK };
  const u = makeUnit('pikeman', 1, 0, -1);
  Object.assign(u, { t: 'hero', U, L: HERO_LOOK, hpMax: U.hp, hpTop: U.hp, r: 17, isHero: true, name: H.name, fly: false });
  return u;
}
function placeSide(list, side) {
  const melee = list.filter((u) => !u.U.range), ranged = list.filter((u) => u.U.range);
  const cols = [melee, ranged];
  cols.forEach((col, ci) => {
    const x = side === 0 ? (ci === 0 ? 330 : 170) : (ci === 0 ? BW - 330 : BW - 170);
    col.forEach((u, k) => {
      const n = col.length; const span = Math.min(560, n * 110);
      u.x = x + rand(-20, 20) + (k % 2) * (side ? 30 : -30);
      u.y = BH / 2 + 20 + (n === 1 ? 0 : (k / (n - 1) - 0.5) * span);
    });
  });
}
function genObstacles(terrain, boss) {
  const kinds = boss ? ['pillar', 'deadtree', 'rock', 'pillar'] : terrain === 4 ? ['snowpine', 'rock'] : terrain === 3 ? ['rock', 'cactus', 'pillar'] : (terrain === 5 || terrain === 7) ? ['deadtree', 'rock', 'deadtree'] : ['tree', 'rock', 'pine', 'tree'];
  const n = randi(4, 7);
  for (let k = 0; k < 200 && B.obstacles.length < n; k++) {
    const x = rand(470, BW - 470), y = rand(140, BH - 80);
    if (B.obstacles.some((o) => dist(o.x, o.y, x, y) < 150)) continue;
    const kind = pick(kinds);
    B.obstacles.push({ x, y, kind, r: kind === 'rock' ? rand(22, 32) : kind === 'pillar' ? 18 : 16, s: rand(0.9, 1.3) });
  }
}
function renderBattleBG(terrain, boss, siege) {
  const cv = document.createElement('canvas'); cv.width = BW; cv.height = BH;
  const c = cv.getContext('2d');
  const pal = boss ? ['#2a1e22', '#3a2a2c', '#4a2420'] : {
    1: ['#4f7f33', '#5f8f3c', '#6e9a48'], 2: ['#7a6040', '#8a6e48', '#9a7c55'], 3: ['#c9ae6e', '#d6bd80', '#e0c890'],
    4: ['#cdd8e2', '#dfe8ef', '#f0f5f8'], 5: ['#3f4f34', '#4b5b3c', '#5a6a48'], 7: ['#352c30', '#3e3438', '#4a3e40'],
  }[terrain] || ['#4f7f33', '#5f8f3c', '#6e9a48'];
  const g = c.createLinearGradient(0, 0, 0, BH); g.addColorStop(0, shade(pal[0], -0.3)); g.addColorStop(0.3, pal[1]); g.addColorStop(1, pal[0]);
  c.fillStyle = g; c.fillRect(0, 0, BW, BH);
  for (let i = 0; i < 500; i++) { c.fillStyle = rgba(pick(pal), 0.35); ell(c, rand(0, BW), rand(0, BH), rand(20, 90), rand(8, 30)); c.fill(); }
  for (let i = 0; i < 3500; i++) {
    const x = rand(0, BW), y = rand(60, BH);
    if (terrain === 1 && !boss) { c.strokeStyle = Math.random() < 0.5 ? 'rgba(30,60,20,.4)' : 'rgba(170,210,110,.35)'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(x, y); c.lineTo(x + rand(-2, 2), y - rand(4, 9)); c.stroke(); }
    else if (terrain === 4 && !boss) circ(c, x, y, rand(0.5, 2), Math.random() < 0.5 ? 'rgba(160,190,220,.5)' : 'rgba(255,255,255,.8)');
    else circ(c, x, y, rand(0.6, 2), Math.random() < 0.5 ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.12)');
  }
  if (terrain === 1 && !boss) for (let i = 0; i < 70; i++) circ(c, rand(0, BW), rand(80, BH), 2, pick(['#f6e27a', '#f08bb0', '#ffffff', '#b8a0ff']));
  // שבילי אדמה
  c.strokeStyle = rgba('#3a2a1a', 0.18); c.lineWidth = 60; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-50, BH * 0.6); c.bezierCurveTo(BW * 0.3, BH * 0.45, BW * 0.6, BH * 0.75, BW + 50, BH * 0.55); c.stroke();
  if (boss) {
    for (let i = 0; i < 25; i++) {
      let x = rand(0, BW), y = rand(80, BH); c.strokeStyle = 'rgba(255,70,30,.5)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += rand(-25, 25); y += rand(-12, 12); c.lineTo(x, y); } c.stroke();
    }
    glow(c, BW / 2, BH / 2, 500, '#ff2a20', 0.1);
  }
  // רקע עליון: קו עצים/הרים
  c.fillStyle = boss ? '#120c10' : terrain === 4 ? '#8ea2b4' : terrain === 3 ? '#a08050' : '#1f3a22';
  c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 60);
  for (let x = 0; x <= BW; x += 30) c.lineTo(x, 50 + Math.sin(x * 0.03) * 12 + Math.sin(x * 0.11) * 8 + rand(-4, 4));
  c.lineTo(BW, 0); c.fill();
  if (!boss && terrain !== 3) for (let x = 10; x < BW; x += rand(22, 40)) drawTree(c, x, 70 + rand(-6, 8), rand(1.1, 1.6), terrain === 4 ? 'snowpine' : (terrain === 5 || terrain === 7) ? 'dead' : Math.random() < 0.5 ? 'pine' : 'oak');
  if (boss) { for (let x = 30; x < BW; x += 160) { c.fillStyle = '#2a2228'; c.fillRect(x, 10, 40, 60); c.fillStyle = '#ff3050'; c.fillRect(x + 16, 30, 8, 10); glow(c, x + 20, 35, 20, '#ff3050', 0.5); } }
  if (siege) drawSiegeWall(c, G.town.built.includes('fort'), G.town.built.includes('tower'));
  const fog = c.createLinearGradient(0, 40, 0, 140); fog.addColorStop(0, 'rgba(220,230,255,.25)'); fog.addColorStop(1, 'rgba(220,230,255,0)');
  c.fillStyle = fog; c.fillRect(0, 40, BW, 100);
  return cv;
}

// ---------- חישובי סטטיסטיקה ----------
const alive = (u) => !u.dead;
function foes(u) { return B.units.filter((e) => e.side !== u.side && !e.dead); }
function friends(u) { return B.units.filter((e) => e.side === u.side && !e.dead); }
function atkOf(u) { return u.U.atk + (u.side === 0 ? B.bonus.atk : B.ebonus.atk); }
function defOf(u) { return u.U.def + (u.side === 0 ? B.bonus.def : B.ebonus.def) + (u.buffs.stone ? 8 : 0) + (u.buffs.brace ? 6 : 0); }
function spdMult(u) { let m = 1; if (u.buffs.haste) m *= 1.5; if (u.buffs.slow) m *= 0.5; if (u.buffs.rush) m *= 2.6; return m; }
function atkSpdMult(u) {
  let m = 1; if (u.buffs.haste) m *= 1.5; if (u.buffs.slow) m *= 0.5; if (u.buffs.frenzy) m *= 1.4;
  if (u.side === 0 && B.opts.hero) m *= 1 + 0.08 * skillLvl('leadership');
  return m;
}
function totalHp(u) { return u.dead ? 0 : (u.n - 1) * u.hpMax + u.hpTop; }
function reach(a, b) { return a.U.range ? a.U.range : a.r + b.r + 8; }
function inRange(a, b) { return dist(a.x, a.y, b.x, b.y) <= reach(a, b); }
function chestY(u) { return u.y - 24 * FIG - (u.fly ? 15 * FIG : 0); }

// ---------- עדכון ----------
function battleUpdate(rdt) {
  B.uiT -= rdt;
  if (B.uiT <= 0) { B.uiT = 0.15; refreshBattleUI(); }
  for (const m of B.markers) m.t += rdt;
  B.markers = B.markers.filter((m) => m.t < 0.8);
  if (B.paused || modalOpen()) return;
  const dt = Math.min(0.05, rdt) * B.speed;
  B.time += dt;
  B.spellCd = Math.max(0, B.spellCd - dt);
  for (const u of B.units) updateUnit(u, dt);
  separate();
  updateProjs(dt);
  updateTele(dt);
  updateTowers(dt);
  updateFX(dt);
  if (!B.over) {
    const a0 = B.units.some((u) => u.side === 0 && !u.dead), a1 = B.units.some((u) => u.side === 1 && !u.dead);
    if (!a0 || !a1) { B.over = true; B.overT = 0; B.result = a1 ? 'defeat' : 'victory'; }
  } else {
    B.overT += rdt;
    if (B.overT > 1.4 && !B.endShown) { B.endShown = true; endBattle(); }
  }
}
function updateUnit(u, dt) {
  if (u.dead) { u.deadT = Math.min(1, u.deadT + dt * 1.4); return; }
  u.flash = Math.max(0, u.flash - dt * 4);
  for (const k in u.buffs) { u.buffs[k] -= dt; if (u.buffs[k] <= 0) delete u.buffs[k]; }
  u.cd -= dt * atkSpdMult(u);
  u.abCd -= dt;
  if (u.U.regen || (u.side === 0 && G.hero && G.hero.arts.includes('ring') && B.opts.hero)) {
    u.regenT = (u.regenT || 0) + dt;
    if (u.regenT > 1) { u.regenT = 0; healUnit(u, u.hpMax * (u.U.regen ? 0.5 : 0.1) * Math.min(u.n, 10), false); }
  }
  if (u.cast) {
    u.cast.t += dt; u.moving = false;
    if (Math.random() < 0.5) addPart({ x: u.x + rand(-u.r, u.r), y: u.y, z: 0, vz: rand(40, 90), g: 0, life: 0.7, size: 2.5, color: u.cast.color || '#9fd8ff', add: true, drag: 0.5 });
    if (u.cast.t >= u.cast.dur) { const c = u.cast; u.cast = null; c.fn(); }
    return;
  }
  if (u.atk >= 0) {
    u.atk += dt / ATK_ANIM; u.moving = false;
    if (!u.hitDone && u.atk >= 0.5) { u.hitDone = true; doHit(u); }
    if (u.atk >= 1) u.atk = -1;
    return;
  }
  think(u, dt);
  const o = u.order;
  if (o && o.type === 'move') { if (moveTo(u, o.x, o.y, dt, 5)) u.order = null; return; }
  let tgt = o && o.type === 'attack' ? o.target : u.target;
  if (tgt && tgt.dead) { if (o) u.order = null; u.target = null; tgt = null; }
  if (!tgt) { tgt = idleTarget(u); u.target = tgt; }
  if (!tgt) { u.moving = false; return; }
  if (inRange(u, tgt)) {
    u.moving = false; if (Math.abs(tgt.x - u.x) > 3) u.face = tgt.x > u.x ? 1 : -1;
    if (u.cd <= 0) startAttack(u, tgt);
  } else moveTo(u, tgt.x, tgt.y, dt, reach(u, tgt) - 4);
}
function think(u, dt) {
  u.retarget -= dt;
  if (u.side === 1) {
    if (u.U.ability && u.abCd <= 0) aiAbility(u);
    if (u.U.boss && !B.summoned && totalHp(u) < u.hpMax * 0.5) summonMinions(u);
    if (u.isEHero) { u.spellT -= dt; if (u.spellT <= 0) { u.spellT = rand(5, 8); enemyHeroCast(u); } }
    if (u.retarget <= 0 || !u.target || u.target.dead) { u.retarget = rand(1.2, 2.2); u.target = pickTarget(u); }
  } else if (B.ai && !u.order) {
    if (u.retarget <= 0 || !u.target || u.target.dead) { u.retarget = rand(1.2, 2); u.target = pickTarget(u); }
  }
}
function pickTarget(u) {
  const list = foes(u); if (!list.length) return null;
  let best = null, bs = Infinity;
  for (const e of list) {
    let s = dist(u.x, u.y, e.x, e.y);
    if (!u.U.range && e.U.range) s -= 70;
    if (e.isHero) s -= 30;
    if (e === u.target) s *= 0.75;
    if (s < bs) { bs = s; best = e; }
  }
  return best;
}
function idleTarget(u) {
  if (u.side === 1 || B.ai) return pickTarget(u);
  if (u.lastHitBy && !u.lastHitBy.dead && B.time - u.lastHitT < 4) return u.lastHitBy;
  let best = null, bd = u.U.range ? u.U.range : 260;
  for (const e of foes(u)) { const d = dist(u.x, u.y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
  return best;
}
function moveTo(u, tx, ty, dt, stop) {
  let dx = tx - u.x, dy = ty - u.y;
  const d = Math.hypot(dx, dy);
  if (d <= stop) { u.moving = false; return true; }
  dx /= d; dy /= d;
  if (!u.fly) {
    for (const o of B.obstacles) {
      const ox = o.x - u.x, oy = o.y - u.y, od = Math.hypot(ox, oy) || 1;
      const R = o.r + u.r + 6;
      if (od < R + 40 && ox * dx + oy * dy > 0 && dist(tx, ty, o.x, o.y) > o.r) {
        const cross = dx * oy - dy * ox; const side = cross > 0 ? -1 : 1;
        const tnx = (-oy / od) * side, tny = (ox / od) * side;
        const w = clamp((R + 40 - od) / 40, 0, 1);
        dx = lerp(dx, tnx, w * 0.85); dy = lerp(dy, tny, w * 0.85);
        const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      }
    }
  }
  const step = Math.min(u.U.spd * spdMult(u) * dt, d - stop + 0.5);
  u.x += dx * step; u.y += dy * step;
  u.walk += step / 6.5;
  u.moving = true;
  if (Math.abs(dx) > 0.25) u.face = dx > 0 ? 1 : -1;
  if (u.buffs.rush && Math.random() < 0.5) addPart({ x: u.x - dx * 10, y: u.y, z: 2, vz: 20, g: 0, life: 0.5, size: 8, grow: 14, color: '#c8b28a', shape: 'smoke' });
  return false;
}
function separate() {
  const L = B.units;
  for (let i = 0; i < L.length; i++) {
    const a = L[i]; if (a.dead) continue;
    for (let j = i + 1; j < L.length; j++) {
      const b = L[j]; if (b.dead || a.fly !== b.fly) continue;
      let dx = b.x - a.x, dy = b.y - a.y; const d = Math.hypot(dx, dy) || 0.01;
      const R = (a.r + b.r) * 0.92;
      if (d < R) {
        const push = (R - d) / 2; dx /= d; dy /= d;
        const wa = a.atk >= 0 ? 0.3 : 1, wb = b.atk >= 0 ? 0.3 : 1;
        a.x -= dx * push * wa; a.y -= dy * push * wa; b.x += dx * push * wb; b.y += dy * push * wb;
      }
    }
    if (!a.fly) for (const o of B.obstacles) {
      const dx = a.x - o.x, dy = a.y - o.y, d = Math.hypot(dx, dy) || 0.01, R = o.r + a.r * 0.8;
      if (d < R) { a.x = o.x + dx / d * R; a.y = o.y + dy / d * R; }
    }
    a.x = clamp(a.x, 30, BW - 30); a.y = clamp(a.y, 110, BH - 20);
  }
}

// ---------- התקפות ----------
function startAttack(u, t) {
  u.atk = 0; u.hitDone = false; u.atkTarget = t; u.cd = u.U.cd;
  if (!u.U.range) setTimeout(() => Sound.play('swing'), 120 / B.speed);
}
function doHit(u) {
  const t = u.atkTarget;
  if (!t || t.dead) return;
  if (u.U.range) {
    const kind = u.U.proj || 'arrow';
    Sound.play(kind === 'arrow' ? 'arrow' : kind === 'axe' ? 'swing' : 'magic');
    spawnProj(u, t, kind, () => resolveAttack(u, t, { ranged: true, splash: u.U.splash }));
    return;
  }
  if (dist(u.x, u.y, t.x, t.y) > reach(u, t) + 22) { logLine(`${u.name} מחטיא — היעד התרחק`, '#999'); return; }
  resolveAttack(u, t, {});
}
function resolveAttack(a, t, o = {}) {
  if (t.dead) return;
  const atk = atkOf(a), def = defOf(t);
  const roll = randi(1, 20);
  const need = clamp(2 + Math.round((def - atk) * 0.5), 2, 19);
  const side0 = a.side === 0;
  if (roll === 1 || roll < need) {
    floatText(t.x, chestY(t) - 14, 'החטאה', '#c8d0d8', 14);
    Sound.play('miss');
    logLine(`${a.name} תוקף את ${t.name} — הטלה ${roll} (נדרש ${need}): החטאה`, side0 ? '#9cc8ff' : '#ffa0a0');
    return;
  }
  let crit = roll === 20 || Math.random() < (side0 && B.opts.hero ? 0.05 * skillLvl('luck') + (G.hero.arts.includes('clover') ? 0.1 : 0) : 0.03);
  let dmg = 0;
  const n = a.n;
  if (n <= 10) for (let i = 0; i < n; i++) dmg += rand(a.U.dmg[0], a.U.dmg[1] + 0.999) | 0;
  else dmg = n * rand(a.U.dmg[0], a.U.dmg[1] + 0.5);
  dmg *= atk >= def ? Math.min(3, 1 + 0.05 * (atk - def)) : Math.max(0.3, 1 - 0.025 * (def - atk));
  if (side0 && B.opts.hero) dmg *= 1 + (o.ranged ? 0.12 * skillLvl('archery') : 0.1 * skillLvl('offense'));
  if (!side0 && B.opts.hero) dmg *= 1 - 0.06 * skillLvl('armorer');
  if (o.ranged && !a.U.noMeleePenalty && foes(a).some((e) => dist(e.x, e.y, a.x, a.y) < a.r + e.r + 12)) dmg *= 0.5;
  if (o.mult) dmg *= o.mult;
  if (a.nextMult > 1) { dmg *= a.nextMult; a.nextMult = 1; crit = true; }
  if (crit) dmg *= 2;
  dmg = Math.max(1, Math.round(dmg));
  const killed = applyDamage(t, dmg, a, { crit });
  logLine(`${a.name} תוקף את ${t.name} — הטלה ${roll}${crit ? ' ★ קריטי!' : ''}: ${dmg} נזק${killed ? `, ${killed} נהרגו` : ''}`, side0 ? '#9cc8ff' : '#ffa0a0');
  if (a.U.drain && !a.dead) { const raised = healUnit(a, dmg * 0.5, true); if (raised > 0) floatText(a.x, chestY(a) - 20, `+${raised} 🦇`, '#ff6080', 14); }
  if (t.buffs.brace && !o.ranged && !a.dead) { applyDamage(a, Math.round(dmg * 0.3), t, { silent: true }); }
  if (o.splash) {
    for (const e of B.units) if (e !== t && !e.dead && dist(e.x, e.y, t.x, t.y) < o.splash) applyDamage(e, Math.round(dmg * 0.5), a, {});
    burst(t.x, t.y, 20, { color: ['#7cff9a', '#2a6a3a'], add: true, sp: 160, z: 20 });
    ring(t.x, t.y, 5, o.splash, '#7cff9a', 0.5);
  }
}
function applyDamage(u, dmg, src, o = {}) {
  if (u.dead) return 0;
  if (u.buffs.wall) dmg = Math.round(dmg * 0.5);
  const before = u.n;
  const tot = totalHp(u) - dmg;
  if (tot <= 0) { u.n = 0; u.hpTop = 0; }
  else { u.n = Math.ceil(tot / u.hpMax); u.hpTop = tot - (u.n - 1) * u.hpMax; }
  const killed = before - u.n;
  u.flash = 1; u.lastHitBy = src; u.lastHitT = B.time;
  const cy = chestY(u);
  floatText(u.x + rand(-8, 8), cy - 18, `${o.crit ? '✦' : ''}${dmg}`, o.crit ? '#ffd23a' : o.magic ? '#a6e3ff' : '#ff5a4a', o.crit ? 22 : 17, { bold: true, crit: o.crit });
  const L = u.L;
  if (u.U.undead || L.kind === 'ghost') { burst(u.x, u.y, 8 + Math.min(12, dmg / 10), { color: L.bone || L.kind === 'dragon' ? ['#e8e2cf', '#bbb3a0'] : ['#9fe8ff', '#ffffff'], z: 24 * FIG, sp: 140, size: 3 }); Sound.play('bone'); }
  else { burst(u.x, u.y, 8 + Math.min(14, dmg / 8), { color: ['#b0141e', '#7a0a10', '#d83a2a'], z: 24 * FIG, sp: 150, size: 2.8 }); }
  burst(u.x, u.y, 5, { color: '#fff4c0', shape: 'spark', add: true, z: 26 * FIG, sp: 260, g: 0, life: 0.25, size: 3 });
  if (!o.silent) Sound.play(L.armor || L.bone || u.U.def >= 12 ? 'clang' : 'hit');
  if (dmg > 120 || o.crit) FX.shake = Math.max(FX.shake, Math.min(14, 4 + dmg / 40));
  if (u.n <= 0) kill(u, src);
  return killed;
}
function kill(u, src) {
  u.dead = true; u.deadT = 0; u.n = 0; u.atk = -1; u.cast = null;
  B.sel.delete(u);
  Sound.play(u.U.boss || u.L.kind === 'dragon' ? 'roar' : 'death');
  logLine(`☠ ${u.name}${u.isHero ? '' : ' (היחידה)'} הושמד${u.isHero ? '' : 'ה'}!`, u.side ? '#ffd36b' : '#ff7070');
  burst(u.x, u.y, 25, { color: ['#3a3030', '#6a6060'], shape: 'smoke', sp: 60, size: 10, grow: 12, g: -20, life: 1.2, z: 10 });
  if (u.side === 1) B.killedXP += u.n0 * u.hpMax * (u.U.boss ? 3 : 1);
  if (u.isHero) { logLine(`${u.name} נפל! הצבא ממשיך להילחם...`, '#ff7070'); }
  if (u.isEHero) { logLine(`💀 ${u.name} הנקרומנסר הובס! הקסם האפל נחלש.`, '#ffd36b'); B.ebonus = { atk: 0, def: 0 }; FX.flash = 0.5; FX.flashColor = '#b07aff'; }
  if (u.U.boss) { FX.flash = 1; FX.flashColor = '#ff3050'; FX.shake = 20; for (const e of B.units) if (e.side === 1 && !e.dead) { e.n = 0; kill(e, u); } }
}
function healUnit(u, amt, raise) {
  if (u.dead && !raise) return 0;
  const cur = totalHp(u);
  const max = raise ? u.n0 * u.hpMax : u.n * u.hpMax;
  const nw = Math.min(max, cur + amt);
  if (nw <= 0 || nw <= cur) return 0;
  const before = u.dead ? 0 : u.n;
  u.n = Math.ceil(nw / u.hpMax); u.hpTop = nw - (u.n - 1) * u.hpMax;
  if (u.dead) { u.dead = false; u.deadT = 0; u.atk = -1; u.order = null; }
  return u.n - before;
}

// ---------- קליעים ----------
function spawnProj(from, tgt, kind, onHit, opts = {}) {
  const sx = from.x + from.face * 10, sy = chestY(from);
  const tx = tgt.x !== undefined && tgt.n !== undefined ? tgt.x : tgt.x, ty = tgt.n !== undefined ? chestY(tgt) : tgt.y;
  const sp = { arrow: 750, axe: 520, holy: 520, death: 460, magic: 820, fireball: 560, hellfire: 500 }[kind] || 600;
  const d = dist(sx, sy, tx, ty);
  B.projs.push({ kind, x: sx, y: sy, sx, sy, tx, ty, tgt: tgt.n !== undefined ? tgt : null, t: 0, dur: Math.max(0.12, d / sp), onHit, arc: kind === 'arrow' || kind === 'axe' ? Math.min(90, d * 0.18) : 0, rot: 0, ...opts });
}
function updateProjs(dt) {
  for (let i = B.projs.length - 1; i >= 0; i--) {
    const p = B.projs[i];
    if (p.tgt && !p.tgt.dead) { p.tx = p.tgt.x; p.ty = chestY(p.tgt); }
    p.t += dt / p.dur; p.rot += dt * 18;
    const t = Math.min(1, p.t);
    const nx = lerp(p.sx, p.tx, t), ny = lerp(p.sy, p.ty, t) - p.arc * 4 * t * (1 - t);
    p.vx = nx - p.x; p.vy = ny - p.y; p.x = nx; p.y = ny;
    const trail = { holy: '#fff3a0', death: '#7cff9a', magic: '#7fd4ff', fireball: '#ff8a2a', hellfire: '#ff3050' }[p.kind];
    if (trail) for (let k = 0; k < (p.kind === 'fireball' || p.kind === 'hellfire' ? 3 : 1); k++) addPart({ x: p.x + rand(-3, 3), y: p.y + rand(-3, 3), z: 0, vz: 0, g: 0, vx: rand(-20, 20), vy: rand(-20, 20), life: rand(0.2, 0.5), size: p.kind === 'fireball' ? rand(3, 7) : 2.5, color: trail, add: true });
    if (p.t >= 1) {
      B.projs.splice(i, 1);
      if (p.kind === 'arrow') Sound.play('arrowHit');
      if (!p.tgt || !p.tgt.dead || p.point) p.onHit && p.onHit();
    }
  }
}
function updateTele(dt) {
  for (let i = B.tele.length - 1; i >= 0; i--) {
    const t = B.tele[i]; t.t += dt;
    if (t.t >= t.dur) { B.tele.splice(i, 1); t.fn(); }
  }
}

// ---------- לחשים ויכולות ----------
function heroUnit() { return B.units.find((u) => u.isHero); }
function spellPower(S) { return Math.round((S.base + S.per * heroStat('sp')) * (1 + 0.12 * skillLvl('sorcery'))); }
function castSpell(id, target) {
  const S = SPELLS[id], hu = heroUnit();
  if (!hu || hu.dead || G.hero.mana < S.mana || B.spellCd > 0) { Sound.play('error'); return; }
  G.hero.mana -= S.mana; B.spellCd = 2.5;
  hu.order = null; hu.atk = -1;
  const col = { fireball: '#ff8a2a', lightning: '#bfe8ff', chain: '#bfe8ff', heal: '#7dff9a', resurrect: '#fff3a0', haste: '#ffe28a', stoneskin: '#c8b8a0', slow: '#b08aff', magic_arrow: '#7fd4ff' }[id];
  hu.cast = { t: 0, dur: 0.55, color: col, fn: () => applySpell(id, target, hu) };
  if (target.x !== undefined) hu.face = target.x > hu.x ? 1 : -1;
  Sound.play('cast');
  ring(hu.x, hu.y, 4, 40, col, 0.6, 3);
  logLine(`✨ ${hu.name} מטיל ${S.name}`, '#e0c0ff');
}
function applySpell(id, tg, hu) {
  const S = SPELLS[id], pw = spellPower(S);
  const tu = tg && tg.n !== undefined ? tg : null;
  if (tu && tu.dead && id !== 'resurrect') return;
  switch (id) {
    case 'magic_arrow':
      Sound.play('magic');
      spawnProj(hu, tu, 'magic', () => { magicDamage(tu, pw, S.name); burst(tu.x, tu.y, 18, { color: ['#7fd4ff', '#fff'], add: true, z: 24 * FIG, sp: 180 }); });
      break;
    case 'heal': case 'resurrect': {
      const raised = healUnit(tu, pw, true);
      Sound.play('heal');
      burst(tu.x, tu.y, 40, { color: id === 'heal' ? ['#7dff9a', '#ffffff'] : ['#fff3a0', '#ffffff'], add: true, g: -60, vz: 60, sp: 60, life: 1.2, z: 5 });
      ring(tu.x, tu.y, 5, 50, id === 'heal' ? '#7dff9a' : '#fff3a0', 0.8);
      floatText(tu.x, chestY(tu) - 20, raised > 0 ? `+${raised} ⬆` : `+${pw} ❤`, '#7dff9a', 18, { bold: true });
      logLine(`${S.name}: ${tu.name} מתרפא${raised > 0 ? `, ${raised} לוחמים קמו לתחייה` : ''}`, '#7dff9a');
      break;
    }
    case 'haste': case 'slow': case 'stoneskin': {
      const key = id === 'stoneskin' ? 'stone' : id;
      tu.buffs[key] = S.dur;
      Sound.play(id === 'slow' ? 'debuff' : 'buff');
      ring(tu.x, tu.y, 50, 8, id === 'slow' ? '#b08aff' : id === 'haste' ? '#ffe28a' : '#c8b8a0', 0.6);
      burst(tu.x, tu.y, 22, { color: id === 'slow' ? ['#b08aff'] : id === 'haste' ? ['#ffe28a', '#fff'] : ['#c8b8a0', '#8a7a60'], add: id !== 'stoneskin', z: 10, sp: 90 });
      floatText(tu.x, chestY(tu) - 20, S.name, '#ffe9b0', 15);
      break;
    }
    case 'lightning': {
      const pts = jagged(tu.x + rand(-60, 60), -40, tu.x, chestY(tu), 12, 26);
      bolt(pts, '#bfe8ff', 0.35, 3.5); bolt(jagged(tu.x, -40, tu.x, chestY(tu), 10, 30), '#9fd0ff', 0.25, 2);
      FX.flash = 0.6; FX.flashColor = '#dff2ff'; FX.shake = 8;
      Sound.play('lightning');
      magicDamage(tu, pw, S.name);
      burst(tu.x, tu.y, 30, { color: ['#bfe8ff', '#fff'], add: true, shape: 'spark', sp: 300, z: 10, g: 0, life: 0.4 });
      break;
    }
    case 'chain': {
      let cur = tu, from = { x: hu.x, y: chestY(hu) }, power = pw;
      const hit = new Set();
      Sound.play('lightning'); FX.flash = 0.5; FX.flashColor = '#dff2ff';
      for (let k = 0; k < 4 && cur; k++) {
        hit.add(cur);
        bolt(jagged(from.x, from.y, cur.x, chestY(cur), 9, 16), '#bfe8ff', 0.45, 3);
        magicDamage(cur, Math.round(power), S.name);
        from = { x: cur.x, y: chestY(cur) }; power *= 0.6;
        let nb = null, nd = 340;
        for (const e of B.units) if (!e.dead && e.side === 1 && !hit.has(e)) { const d = dist(e.x, e.y, cur.x, cur.y); if (d < nd) { nd = d; nb = e; } }
        cur = nb;
      }
      break;
    }
    case 'fireball': {
      Sound.play('fireball');
      spawnProj(hu, tg, 'fireball', () => explode(tg.x, tg.y, S.radius, pw, S.name, null), { point: true });
      break;
    }
  }
}
function magicDamage(u, dmg, src) {
  if (u.dead) return;
  const killed = applyDamage(u, dmg, heroUnit() || u, { magic: true, silent: true });
  logLine(`${src} פוגע ב-${u.name}: ${dmg} נזק${killed ? `, ${killed} נהרגו` : ''}`, '#c8b0ff');
}
function explode(x, y, r, dmg, name, onlySide) {
  Sound.play('explosion');
  FX.shake = 16; FX.flash = 0.5; FX.flashColor = '#ffb060';
  ring(x, y, 10, r * 1.2, '#ffb347', 0.6, 6); ring(x, y, 5, r * 0.8, '#fff1a0', 0.4, 4);
  burst(x, y, 70, { color: ['#ff8a2a', '#ffd23a', '#ff4a1a', '#fff1a0'], add: true, sp: 320, z: 10, vz: 220, size: 5, life: 0.9 });
  burst(x, y, 30, { color: ['#2a2020', '#4a3a30'], shape: 'smoke', sp: 90, size: 16, grow: 30, g: -40, life: 1.6, z: 20 });
  for (const e of B.units) {
    if (e.dead || (onlySide !== null && e.side !== onlySide)) continue;
    if (dist(e.x, e.y, x, y) <= r + e.r * 0.5) {
      const killed = applyDamage(e, dmg, heroUnit() || e, { magic: true, silent: true });
      logLine(`${name} פוגע ב-${e.name}${e.side === 0 ? ' (כוח ידידותי!)' : ''}: ${dmg} נזק${killed ? `, ${killed} נהרגו` : ''}`, e.side === 0 ? '#ffb070' : '#c8b0ff');
    }
  }
}
function useAbility(u, target) {
  const A = ABILITIES[u.U.ability];
  if (!A || u.dead || u.abCd > 0) return false;
  u.abCd = A.cd;
  floatText(u.x, chestY(u) - 28, A.name + '!', '#ffe28a', 15, { bold: true });
  switch (u.U.ability) {
    case 'brace': case 'shieldwall':
      u.buffs[u.U.ability === 'brace' ? 'brace' : 'wall'] = A.dur; Sound.play('buff'); ring(u.x, u.y, u.r + 30, u.r + 4, '#c8d8ff', 0.5, 4);
      break;
    case 'howl':
      Sound.play('howl');
      for (const f of friends(u)) if (dist(f.x, f.y, u.x, u.y) < 320) f.buffs.frenzy = A.dur;
      ring(u.x, u.y, 10, 300, '#ffcf6b', 0.9, 2);
      break;
    case 'fear':
      Sound.play('roar'); FX.shake = 8;
      for (const e of foes(u)) if (dist(e.x, e.y, u.x, u.y) < 280) { e.buffs.slow = 5; floatText(e.x, chestY(e) - 18, 'פחד!', '#b08aff', 13); }
      ring(u.x, u.y, 10, 280, '#7cff9a', 1, 3);
      break;
    case 'volley': {
      Sound.play('arrow'); setTimeout(() => Sound.play('arrow'), 90); setTimeout(() => Sound.play('arrow'), 180);
      const r = A.radius;
      for (const e of foes(u)) if (dist(e.x, e.y, target.x, target.y) <= r + e.r * 0.5) spawnProj(u, e, 'arrow', () => resolveAttack(u, e, { ranged: true, mult: 0.85 }), { arc: 160 });
      for (let k = 0; k < 10; k++) { const a = rand(0, TAU), d = rand(0, r); spawnProj(u, { x: target.x + Math.cos(a) * d, y: target.y + Math.sin(a) * d * 0.55 }, 'arrow', null, { arc: 170, point: true }); }
      break;
    }
    case 'dive': case 'charge':
      u.buffs.rush = 2.5; u.nextMult = 2; u.order = { type: 'attack', target }; u.target = target;
      Sound.play(u.U.ability === 'charge' ? 'gallop' : 'howl');
      break;
    case 'prayer': {
      const amt = 12 * u.n; healUnit(target, amt, false); Sound.play('heal');
      bolt([[u.x, chestY(u) - 20], [target.x, chestY(target)]], '#fff3a0', 0.4, 2);
      burst(target.x, target.y, 26, { color: ['#fff3a0', '#7dff9a'], add: true, g: -60, sp: 50, z: 5, life: 1 });
      floatText(target.x, chestY(target) - 20, `+${amt} ❤`, '#7dff9a', 16, { bold: true });
      break;
    }
    case 'rez': {
      const raised = healUnit(target, 100 * u.n, true); Sound.play('heal');
      FX.flash = 0.4; FX.flashColor = '#fff7c0';
      bolt(jagged(target.x, -40, target.x, target.y, 6, 6), '#fff3a0', 0.8, 6);
      burst(target.x, target.y, 50, { color: ['#fff3a0', '#ffffff'], add: true, g: -80, sp: 70, z: 5, life: 1.4 });
      floatText(target.x, chestY(target) - 22, `+${raised} ⬆`, '#fff3a0', 18, { bold: true });
      logLine(`✨ מלאכים מחזירים לחיים ${raised} מ-${target.name}`, '#fff3a0');
      break;
    }
    case 'hellfire': {
      u.cast = { t: 0, dur: 0.6, color: '#ff3050', fn: () => {} };
      const tx = target.x, ty = target.y;
      Sound.play('cast');
      logLine('🔥 מלקאר מזמן את אש הגיהנום! התרחקו מהעיגול האדום!', '#ff6a7a');
      B.tele.push({ x: tx, y: ty, r: A.radius, t: 0, dur: 1.6, color: '#ff3050', fn: () => explode(tx, ty, A.radius, 60 + B.units.filter((e) => e.side === 0).length * 8, 'אש הגיהנום', 0) });
      break;
    }
  }
  return true;
}
function aiAbility(u) {
  const ab = u.U.ability; const fs = foes(u);
  if (!fs.length) return;
  if (ab === 'howl' || ab === 'fear') { if (fs.some((e) => dist(e.x, e.y, u.x, u.y) < 260)) useAbility(u); }
  else if (ab === 'hellfire') {
    let best = null, bc = 0;
    for (const e of fs) { const c = fs.filter((f) => dist(f.x, f.y, e.x, e.y) < 110).length + (e.U.range ? 0.5 : 0); if (c > bc) { bc = c; best = e; } }
    if (best) useAbility(u, { x: best.x, y: best.y });
  }
}
function summonMinions(u) {
  B.summoned = true;
  Sound.play('roar'); FX.shake = 10;
  logLine('מלקאר קורא לשלדים לקום מן האדמה!', '#ff6a7a');
  for (let k = 0; k < 3; k++) {
    const m = makeUnit('skeleton', 15, 1, -1);
    m.x = clamp(u.x + rand(-140, 140), 60, BW - 60); m.y = clamp(u.y + rand(-100, 100), 120, BH - 40);
    B.units.push(m);
    burst(m.x, m.y, 30, { color: ['#7cff9a', '#3a3030'], add: true, sp: 120, z: 5 });
  }
}

// ---------- סיום קרב ----------
function endBattle() {
  const victory = B.result === 'victory';
  const H = G.hero;
  const lost = [];
  for (const u of B.units) {
    if (u.side !== 0 || u.isHero || u.slot < 0) continue;
    const diff = u.n0 - u.n;
    if (diff > 0) lost.push(`${diff} ${u.name}`);
    u.src[u.slot] = u.n > 0 ? { t: u.t, n: u.n } : null;
  }
  if (victory) {
    Sound.play('victory');
    const xp = Math.round(B.killedXP);
    showModal({
      title: '🏆 ניצחון!',
      html: `<p>האויב הובס בשדה הקרב.</p>${B.opts.hero ? `<p class="big-note">+${fmt(xp)} ניסיון</p>` : ''}<p class="muted">אבדות: ${lost.length ? lost.join(', ') : 'אין — ניצחון מושלם!'}</p>`,
      buttons: [{ label: 'המשך', cls: 'primary', fn: () => B.opts.onEnd({ victory: true, xp }) }], noClose: true,
    });
  } else {
    Sound.play('defeat');
    B.opts.onEnd({ victory: false, enemyLeft: enemyLeft() });
  }
}
function enemyLeft() {
  const m = {};
  for (const u of B.units) if (u.side === 1 && !u.dead && !u.U.boss && !u.isEHero) m[u.t] = (m[u.t] || 0) + u.n;
  return Object.keys(m).map((t) => ({ t, n: m[t] }));
}
function retreat() {
  if (B.opts.siege) { toast('אי אפשר לסגת מהגנה על העיר!'); Sound.play('error'); return; }
  B.paused = true; updatePauseUI();
  showModal({
    title: '🏳️ נסיגה', html: '<p>לסגת מהקרב? הגיבור יימלט לעיר, אך הצבא כולו יאבד.</p>',
    buttons: [{ label: 'לסגת', cls: 'primary', fn: () => { B.over = true; B.endShown = true; B.opts.onEnd({ victory: false, retreat: true, enemyLeft: enemyLeft() }); } }, { label: 'להמשיך להילחם', fn: () => {} }],
  });
}

// ---------- ממשק ----------
function buildBattleUI() {
  const ui = $('#battle-ui');
  ui.innerHTML = `
    <div id="b-top"><span id="b-title">${B.opts.title || 'קרב'}</span><span id="b-paused">❚❚ הפסקה</span></div>
    <div id="b-ports" class="panel pe"></div>
    <div id="b-bar" class="panel pe">
      <div id="b-log"></div>
      <div id="b-mid">
        <div class="b-row" id="b-abil"></div>
        <div class="b-row" id="b-spells"></div>
      </div>
      <div id="b-ctrl">
        <button class="btn" id="bc-pause" title="רווח">⏸ הפסקה</button>
        <button class="btn" id="bc-speed">×1</button>
        <button class="btn" id="bc-ai" title="בינה מלאכותית לכוחות שלך">🤖 AI: פעיל</button>
        <button class="btn" id="bc-all" title="A">👥 בחר הכל</button>
        <button class="btn" id="bc-retreat">🏳️ נסיגה</button>
      </div>
    </div>`;
  const ports = $('#b-ports');
  B.units.filter((u) => u.side === 0).forEach((u, k) => {
    const d = document.createElement('div'); d.className = 'port'; d.dataset.id = u.id;
    d.innerHTML = `<img src="${unitIcon(u.isHero ? 'hero' : u.t, 60)}"><span class="pn">${u.isHero ? '★' : u.n}</span><div class="phb"><div></div></div><span class="pk">${k + 1}</span><div class="pbuffs"></div>`;
    d.title = u.name;
    d.onmousedown = (e) => { e.stopPropagation(); selectUnit(u, e.shiftKey); };
    ports.appendChild(d);
    u.portEl = d;
  });
  $('#bc-pause').onclick = () => togglePause();
  $('#bc-speed').onclick = () => { B.speed = B.speed === 1 ? 2 : B.speed === 2 ? 0.5 : 1; $('#bc-speed').textContent = `×${B.speed}`; Sound.play('click'); };
  $('#bc-ai').onclick = () => { B.ai = !B.ai; $('#bc-ai').textContent = `🤖 AI: ${B.ai ? 'פעיל' : 'כבוי'}`; Sound.play('click'); };
  $('#bc-all').onclick = () => selectAll();
  $('#bc-retreat').onclick = () => retreat();
  if (B.opts.siege) $('#bc-retreat').disabled = true;
  B.logDirty = true;
  refreshBattleUI(true);
}
function selectUnit(u, add) {
  if (u.dead) return;
  if (B.targeting) { handleTargetUnit(u); return; }
  if (!add) B.sel.clear();
  if (add && B.sel.has(u)) B.sel.delete(u); else B.sel.add(u);
  Sound.play('select');
  refreshBattleUI(true);
}
function selectAll() { B.sel = new Set(B.units.filter((u) => u.side === 0 && !u.dead)); Sound.play('select'); refreshBattleUI(true); }
function togglePause() { B.paused = !B.paused; Sound.play(B.paused ? 'close' : 'open'); updatePauseUI(); }
function updatePauseUI() {
  const el = $('#b-paused'); if (el) el.style.display = B.paused ? 'inline-block' : 'none';
  const b = $('#bc-pause'); if (b) b.textContent = B.paused ? '▶ המשך' : '⏸ הפסקה';
  document.body.classList.toggle('bpaused', !!B.paused && SCREEN === 'battle');
}
function logLine(text, color = '#e8dcc0') {
  B.log.push({ text, color }); if (B.log.length > 80) B.log.shift();
  const el = $('#b-log'); if (!el) return;
  const d = document.createElement('div'); d.textContent = text; d.style.color = color; el.appendChild(d);
  while (el.childNodes.length > 80) el.removeChild(el.firstChild);
  el.scrollTop = el.scrollHeight;
}
function refreshBattleUI(force) {
  if (SCREEN !== 'battle') return;
  for (const u of B.units) {
    if (!u.portEl) continue;
    const e = u.portEl;
    e.classList.toggle('sel', B.sel.has(u)); e.classList.toggle('dead', u.dead);
    e.querySelector('.pn').textContent = u.isHero ? '★' : u.n;
    const r = u.dead ? 0 : totalHp(u) / (u.n0 * u.hpMax);
    const bar = e.querySelector('.phb div'); bar.style.width = `${r * 100}%`; bar.style.background = r > 0.6 ? '#4fc35a' : r > 0.3 ? '#e8c04a' : '#d8432a';
    e.querySelector('.pbuffs').textContent = Object.keys(u.buffs).map((k) => ({ haste: '💨', slow: '🐌', stone: '🪨', brace: '🛡️', wall: '🧱', rush: '⚡', frenzy: '🐺' })[k] || '').join('');
  }
  // יכולות לפי בחירה
  const abil = $('#b-abil'); const spells = $('#b-spells');
  if (!abil) return;
  const groups = {};
  for (const u of B.sel) if (!u.dead && u.U.ability && ABILITIES[u.U.ability]) (groups[u.U.ability] = groups[u.U.ability] || []).push(u);
  const abKey = Object.keys(groups).map((k) => k + ':' + groups[k].map((u) => Math.max(0, Math.ceil(u.abCd))).join(',')).join('|') + (B.targeting ? B.targeting.id : '');
  if (force || abKey !== B.abKey) {
    B.abKey = abKey;
    abil.innerHTML = Object.keys(groups).length ? Object.keys(groups).map((k) => {
      const A = ABILITIES[k]; const ready = groups[k].filter((u) => u.abCd <= 0);
      const cd = ready.length ? 0 : Math.ceil(Math.min(...groups[k].map((u) => u.abCd)));
      return `<button class="abtn ${B.targeting && B.targeting.id === k ? 'on' : ''}" data-ab="${k}" ${ready.length ? '' : 'disabled'} title="${A.name}: ${A.desc} (Q)"><span class="ai">${A.icon}</span><span class="al">${A.name}</span>${cd ? `<span class="acd">${cd}</span>` : ''}</button>`;
    }).join('') : '<span class="muted small">בחר יחידות כדי לראות יכולות מיוחדות</span>';
    abil.querySelectorAll('[data-ab]').forEach((b) => b.onclick = () => activateAbility(b.dataset.ab));
  }
  const hu = heroUnit();
  const spKey = (hu ? (hu.dead ? 'd' : 'a') : 'n') + G.hero?.mana + ':' + Math.ceil(B.spellCd) + (B.targeting ? B.targeting.id : '');
  if (force || spKey !== B.spKey) {
    B.spKey = spKey;
    if (!hu) spells.innerHTML = '<span class="muted small">אין גיבור בקרב — אין לחשים</span>';
    else {
      spells.innerHTML = `<span class="mana">🔷 ${G.hero.mana}</span>` + G.hero.spells.map((k) => {
        const S = SPELLS[k]; const ok = !hu.dead && G.hero.mana >= S.mana && B.spellCd <= 0;
        return `<button class="sbtn ${B.targeting && B.targeting.id === k ? 'on' : ''}" data-sp="${k}" ${ok ? '' : 'disabled'} title="${S.name} (${S.mana} מאנה): ${S.desc}"><span class="ai">${S.icon}</span><span class="al">${S.name}</span><span class="am">${S.mana}</span></button>`;
      }).join('') + (B.spellCd > 0 ? `<span class="muted small">⌛${Math.ceil(B.spellCd)}</span>` : '');
      spells.querySelectorAll('[data-sp]').forEach((b) => b.onclick = () => activateSpell(b.dataset.sp));
    }
  }
}
function activateAbility(k) {
  const A = ABILITIES[k];
  const users = [...B.sel].filter((u) => !u.dead && u.U.ability === k && u.abCd <= 0);
  if (!users.length) { Sound.play('error'); return; }
  if (A.target === 'self') { users.forEach((u) => useAbility(u)); refreshBattleUI(true); return; }
  B.targeting = { kind: 'ability', id: k, target: A.target, radius: A.radius };
  Sound.play('click'); refreshBattleUI(true);
}
function activateSpell(k) {
  const S = SPELLS[k];
  if (B.targeting && B.targeting.id === k) { B.targeting = null; refreshBattleUI(true); return; }
  B.targeting = { kind: 'spell', id: k, target: S.target, radius: S.radius };
  Sound.play('click'); refreshBattleUI(true);
}
function handleTargetUnit(u) {
  const T = B.targeting; if (!T) return false;
  const want = T.target;
  if (want === 'point') { handleTargetPoint(u.x, u.y); return true; }
  if ((want === 'enemy' && u.side !== 1) || (want === 'ally' && u.side !== 0)) { Sound.play('error'); return true; }
  if (u.dead && !(T.id === 'resurrect' || T.id === 'rez')) { Sound.play('error'); return true; }
  if (T.kind === 'spell') castSpell(T.id, u);
  else {
    const users = [...B.sel].filter((x) => !x.dead && x.U.ability === T.id && x.abCd <= 0);
    if (T.id === 'prayer' || T.id === 'rez') { if (users[0]) useAbility(users[0], u); }
    else users.forEach((x) => useAbility(x, u));
  }
  B.targeting = null; refreshBattleUI(true);
  return true;
}
function handleTargetPoint(x, y) {
  const T = B.targeting; if (!T) return;
  if (T.target !== 'point') { Sound.play('error'); return; }
  if (T.kind === 'spell') castSpell(T.id, { x, y });
  else { const users = [...B.sel].filter((u) => !u.dead && u.U.ability === T.id && u.abCd <= 0); users.forEach((u) => useAbility(u, { x, y })); }
  B.targeting = null; refreshBattleUI(true);
}

// ---------- קלט ----------
function toWorld(x, y) { return { x: (x - B.view.ox) / B.view.s, y: (y - B.view.oy) / B.view.s }; }
function unitAt(wx, wy, allowDead) {
  let best = null, by = -Infinity;
  for (const u of B.units) {
    if (u.dead && !allowDead) continue;
    if (u.dead && u.deadT < 0.3) continue;
    const cy = u.y - 18 * FIG - (u.fly && !u.dead ? 15 * FIG : 0);
    const hw = u.r + 10, hh = 26 * FIG;
    if (Math.abs(wx - u.x) < hw && Math.abs(wy - cy) < hh && u.y > by) { best = u; by = u.y; }
  }
  return best;
}
function battleMouseDown(x, y, button, shift) {
  if (B.over) return;
  const w = toWorld(x, y);
  if (button === 2) {
    if (B.targeting) { B.targeting = null; refreshBattleUI(true); return; }
    issueOrder(w.x, w.y);
    return;
  }
  if (B.targeting) {
    const T = B.targeting;
    const u = unitAt(w.x, w.y, T.id === 'resurrect' || T.id === 'rez');
    if (T.target === 'point') handleTargetPoint(w.x, w.y);
    else if (u) handleTargetUnit(u);
    else Sound.play('error');
    return;
  }
  B.drag = { x0: x, y0: y, x1: x, y1: y, shift };
}
function battleMouseMove(x, y) {
  B.mouse.x = x; B.mouse.y = y;
  const w = toWorld(x, y); B.mouse.wx = w.x; B.mouse.wy = w.y;
  if (B.drag) { B.drag.x1 = x; B.drag.y1 = y; }
  const T = B.targeting;
  B.hover = unitAt(w.x, w.y, T && (T.id === 'resurrect' || T.id === 'rez'));
  if (B.hover) {
    const u = B.hover;
    showTip(`<b>${u.name}</b>${u.isHero ? '' : ` × ${u.n}`}<br>❤️ ${Math.ceil(totalHp(u))} · ⚔️ ${atkOf(u)} · 🛡️ ${defOf(u)}${u.U.range ? ' · 🏹' : ''}`, x, y);
  } else hideTip();
}
function battleMouseUp(x, y, button) {
  if (button !== 0 || !B.drag) return;
  const d = B.drag; B.drag = null;
  if (Math.abs(d.x1 - d.x0) < 6 && Math.abs(d.y1 - d.y0) < 6) {
    const w = toWorld(x, y);
    const u = unitAt(w.x, w.y);
    if (u && u.side === 0) selectUnit(u, d.shift);
    else issueOrder(w.x, w.y);
    return;
  }
  const a = toWorld(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1)), b = toWorld(Math.max(d.x0, d.x1), Math.max(d.y0, d.y1));
  if (!d.shift) B.sel.clear();
  for (const u of B.units) if (u.side === 0 && !u.dead && u.x >= a.x && u.x <= b.x && chestY(u) + 10 >= a.y && u.y - 10 <= b.y) B.sel.add(u);
  if (B.sel.size) Sound.play('select');
  refreshBattleUI(true);
}
function issueOrder(wx, wy) {
  const sel = [...B.sel].filter(alive);
  if (!sel.length) return;
  const tgt = unitAt(wx, wy);
  if (tgt && tgt.side === 1) {
    sel.forEach((u) => { u.order = { type: 'attack', target: tgt }; u.target = tgt; u.cast = null; });
    B.markers.push({ x: tgt.x, y: tgt.y, t: 0, color: '#ff4a3a', r: tgt.r + 10 });
    Sound.play('order');
    return;
  }
  const n = sel.length, cols = Math.ceil(Math.sqrt(n));
  sel.forEach((u, k) => {
    const cx = (k % cols) - (cols - 1) / 2, cy = Math.floor(k / cols) - (Math.ceil(n / cols) - 1) / 2;
    u.order = { type: 'move', x: clamp(wx + cx * 52, 40, BW - 40), y: clamp(wy + cy * 44, 115, BH - 25) }; u.target = null;
  });
  B.markers.push({ x: wx, y: wy, t: 0, color: '#6aff6a', r: 18 });
  Sound.play('order');
}
function battleKey(e) {
  const k = e.key;
  if (k === ' ') { e.preventDefault(); togglePause(); }
  else if (k === 'Escape') { if (B.targeting) { B.targeting = null; refreshBattleUI(true); } else { B.sel.clear(); refreshBattleUI(true); } }
  else if (k.toLowerCase() === 'a' || k === 'ש') selectAll();
  else if (k.toLowerCase() === 'q' || k === '/') { const b = document.querySelector('#b-abil [data-ab]:not([disabled])'); if (b) b.click(); }
  else if (/^[1-9]$/.test(k)) { const list = B.units.filter((u) => u.side === 0 && u.portEl); const u = list[+k - 1]; if (u) selectUnit(u, e.shiftKey); }
}

// ---------- ציור ----------
function battleDraw(c, t) {
  const vw = VIEW.w - PORT_W, vh = VIEW.h - BBAR_H;
  const s = Math.min(vw / BW, vh / BH);
  B.view = { s, ox: (vw - BW * s) / 2, oy: (vh - BH * s) / 2 };
  c.save();
  c.fillStyle = '#050304'; c.fillRect(0, 0, vw, vh);
  c.beginPath(); c.rect(0, 0, vw, vh); c.clip();
  const sh = FX.shake;
  c.translate(B.view.ox + rand(-sh, sh), B.view.oy + rand(-sh, sh)); c.scale(s, s);
  c.drawImage(B.bg, 0, 0);
  // סמני פקודות
  for (const m of B.markers) {
    const a = 1 - m.t / 0.8;
    c.strokeStyle = rgba(m.color, a); c.lineWidth = 2.5;
    c.beginPath(); c.ellipse(m.x, m.y, m.r * (1 + m.t), m.r * 0.5 * (1 + m.t), 0, 0, TAU); c.stroke();
  }
  // אזהרות (טלגרף)
  for (const tl of B.tele) {
    const k = tl.t / tl.dur;
    c.fillStyle = rgba(tl.color, 0.12 + k * 0.15); c.strokeStyle = rgba(tl.color, 0.8); c.lineWidth = 3;
    c.beginPath(); c.ellipse(tl.x, tl.y, tl.r, tl.r * 0.55, 0, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = rgba(tl.color, 0.3); c.beginPath(); c.ellipse(tl.x, tl.y, tl.r * k, tl.r * 0.55 * k, 0, 0, TAU); c.fill();
  }
  // תצוגה מקדימה של כיוון
  const T = B.targeting;
  if (T && T.target === 'point' && T.radius) {
    const { wx, wy } = B.mouse;
    const pulse = 1 + Math.sin(t * 6) * 0.03;
    c.strokeStyle = T.id === 'fireball' ? 'rgba(255,140,40,.9)' : 'rgba(255,230,140,.9)'; c.fillStyle = T.id === 'fireball' ? 'rgba(255,120,30,.15)' : 'rgba(255,230,140,.12)';
    c.lineWidth = 2; c.setLineDash([8, 6]);
    c.beginPath(); c.ellipse(wx, wy, T.radius * pulse, T.radius * 0.55 * pulse, 0, 0, TAU); c.fill(); c.stroke(); c.setLineDash([]);
  }
  // עיגולי בחירה (מתחת ליחידות)
  for (const u of B.units) {
    if (u.dead) continue;
    const selected = B.sel.has(u), hov = B.hover === u;
    let col = null, w = 2;
    if (selected) { col = '#5aff5a'; w = 2.5; }
    else if (hov) col = u.side === 0 ? '#9affaa' : '#ff5a4a';
    else if (T && ((T.target === 'enemy' && u.side === 1) || (T.target === 'ally' && u.side === 0))) col = T.target === 'enemy' ? 'rgba(255,90,74,.6)' : 'rgba(120,255,140,.6)';
    const rx = u.r + 8, ry = rx * 0.48;
    if (col) {
      c.strokeStyle = col.startsWith('#') ? rgba(col, 0.95) : col; c.lineWidth = w;
      if (selected) { c.setLineDash([10, 5]); c.lineDashOffset = -t * 20; }
      c.beginPath(); c.ellipse(u.x, u.y, rx, ry, 0, 0, TAU); c.stroke(); c.setLineDash([]);
    } else {
      c.strokeStyle = u.side === 0 ? 'rgba(90,200,255,.35)' : 'rgba(255,80,60,.3)'; c.lineWidth = 1.5;
      c.beginPath(); c.ellipse(u.x, u.y, rx, ry, 0, 0, TAU); c.stroke();
    }
    if (u.cast) {
      c.save(); c.translate(u.x, u.y); c.scale(1, 0.5); c.rotate(t * 3);
      c.strokeStyle = rgba(u.cast.color || '#9fd8ff', 0.9); c.lineWidth = 2;
      c.beginPath(); c.arc(0, 0, u.r + 18, 0, TAU); c.stroke();
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; c.beginPath(); c.moveTo(Math.cos(a) * (u.r + 18), Math.sin(a) * (u.r + 18)); c.lineTo(Math.cos(a + 2.1) * (u.r + 18), Math.sin(a + 2.1) * (u.r + 18)); c.stroke(); }
      c.restore();
    }
  }
  // יחידות + מכשולים לפי עומק
  const items = [];
  for (const o of B.obstacles) items.push([o.y, () => drawObstacle(c, o)]);
  for (const u of B.units) items.push([u.dead ? u.y - 1000 : u.y + (u.fly ? 0.5 : 0), () => drawUnit(c, u, t)]);
  items.sort((a, b) => a[0] - b[0]);
  for (const [, f] of items) f();
  // קליעים
  for (const tw of B.towers) drawBattleTower(c, tw, t);
  for (const p of B.projs) drawProj(c, p);
  drawFX(c);
  // פסי חיים ותוויות מעל הכל
  for (const u of B.units) if (!u.dead) drawUnitHud(c, u, t);
  drawTexts(c, s);
  c.restore();
  // גרירה
  if (B.drag && (Math.abs(B.drag.x1 - B.drag.x0) > 5 || Math.abs(B.drag.y1 - B.drag.y0) > 5)) {
    const d = B.drag;
    c.strokeStyle = '#6aff6a'; c.lineWidth = 1.5; c.fillStyle = 'rgba(100,255,100,.08)';
    c.fillRect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
    c.strokeRect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
  }
  // הבזק ווינייטה
  if (FX.flash > 0) { c.fillStyle = rgba(FX.flashColor, FX.flash * 0.5); c.fillRect(0, 0, vw, vh); }
  const vg = c.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.4, vw / 2, vh / 2, Math.max(vw, vh) * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, B.boss ? 'rgba(40,0,5,0.6)' : 'rgba(0,0,0,0.5)');
  c.fillStyle = vg; c.fillRect(0, 0, vw, vh);
  if (B.paused) { c.strokeStyle = `rgba(255,200,80,${0.6 + Math.sin(t * 4) * 0.25})`; c.lineWidth = 6; c.strokeRect(3, 3, vw - 6, vh - 6); }
}
function drawObstacle(c, o) {
  const s = o.s * 1.7;
  if (o.kind === 'rock') { ell(c, o.x, o.y, o.r * 1.2, o.r * 0.45, 'rgba(0,0,0,.3)'); drawRock(c, o.x, o.y + 4, o.r / 9, '#7d7468'); }
  else if (o.kind === 'pillar') {
    ell(c, o.x, o.y, 24, 9, 'rgba(0,0,0,.35)');
    c.fillStyle = '#8f8676'; c.fillRect(o.x - 13, o.y - 70 * o.s, 26, 70 * o.s);
    c.fillStyle = '#a59c8a'; c.fillRect(o.x - 17, o.y - 8, 34, 10); c.fillRect(o.x - 16, o.y - 74 * o.s, 32, 8);
    c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(o.x + 4, o.y - 70 * o.s, 9, 70 * o.s);
  } else {
    ell(c, o.x, o.y, 26 * o.s, 9 * o.s, 'rgba(0,0,0,.35)');
    drawTree(c, o.x, o.y, s, o.kind === 'deadtree' ? 'dead' : o.kind);
  }
}
function drawUnit(c, u, t) {
  const big = u.L.kind === 'dragon' || u.L.kind === 'rider' || u.L.big || u.isHero || u.U.boss;
  const nf = u.dead ? 1 : big ? (u.n >= 3 && !u.isHero && !u.U.boss ? 2 : 1) : u.n >= 12 ? 3 : u.n >= 4 ? 2 : 1;
  const off = nf === 1 ? [[0, 0]] : nf === 2 ? [[-0.55, -0.35], [0.55, 0.3]] : [[-0.6, -0.4], [0.6, -0.3], [0, 0.45]];
  const k = u.r * 0.85;
  const sorted = off.map((o, i) => [o, i]).sort((a, b) => a[0][1] - b[0][1]);
  const scale = FIG * (u.L.kind === 'dragon' ? 1.05 : 1);
  for (const [o, i] of sorted) {
    const atk = u.atk >= 0 ? clamp(u.atk - i * 0.06, 0, 1) : -1;
    drawFigure(c, u.L, u.x + o[0] * k, u.y + o[1] * k * 0.6, scale, {
      t: B.paused ? B.time : t + i * 0.3, walk: u.walk + i * 1.3, moving: u.moving, atk, face: u.face, flash: u.flash, fly: u.fly,
      dead: u.dead ? Math.max(0.05, u.deadT) : 0, seed: u.seed + i,
      tint: u.buffs.stone ? 'sepia(0.8) saturate(0.4)' : u.buffs.slow ? 'hue-rotate(220deg) saturate(0.6)' : null,
    });
  }
  if (u.buffs.haste || u.buffs.rush) { if (Math.random() < 0.3) addPart({ x: u.x + rand(-u.r, u.r), y: u.y, z: rand(0, 30), vz: 0, g: 0, vx: -u.face * 60, vy: 0, life: 0.3, size: 2, color: '#ffe28a', add: true, shape: 'spark' }); }
  if (u.buffs.wall || u.buffs.brace) {
    c.strokeStyle = 'rgba(180,200,255,.5)'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(u.x, u.y - 20 * FIG, u.r + 12, 30 * FIG, 0, Math.PI, TAU); c.stroke();
  }
}
function drawUnitHud(c, u, t) {
  const top = u.y - (u.L.kind === 'dragon' ? 78 : u.L.kind === 'rider' ? 66 : u.L.big || u.U.boss ? 62 : 50) * FIG - (u.fly ? 15 * FIG : 0);
  const w = u.U.boss ? 80 : 40, r = totalHp(u) / (u.n0 * u.hpMax);
  c.fillStyle = 'rgba(0,0,0,.65)'; c.fillRect(u.x - w / 2 - 1, top - 1, w + 2, 6);
  c.fillStyle = u.side === 0 ? (r > 0.5 ? '#4fc35a' : r > 0.25 ? '#e8c04a' : '#d8432a') : '#d8432a';
  c.fillRect(u.x - w / 2, top, w * clamp(r, 0, 1), 4);
  if (!u.isHero) {
    c.font = '800 13px Heebo'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const tx = u.x, ty = u.y + 12;
    const tw = c.measureText(u.n).width + 10;
    c.fillStyle = u.side === 0 ? 'rgba(20,40,90,.85)' : 'rgba(90,15,15,.85)';
    c.beginPath(); c.roundRect ? c.roundRect(tx - tw / 2, ty - 8, tw, 16, 4) : c.rect(tx - tw / 2, ty - 8, tw, 16); c.fill();
    c.strokeStyle = 'rgba(232,192,74,.7)'; c.lineWidth = 1; c.stroke();
    c.fillStyle = '#fff3d6'; c.fillText(u.n, tx, ty + 0.5);
  } else {
    c.font = '700 12px Heebo'; c.textAlign = 'center'; c.fillStyle = '#ffe9a0'; c.fillText('★ ' + u.name, u.x, top - 9);
  }
}
function drawProj(c, p) {
  const a = Math.atan2(p.vy || 0.01, p.vx || 0.01);
  c.save(); c.translate(p.x, p.y);
  if (p.kind === 'arrow') {
    c.rotate(a); c.strokeStyle = '#d9c9a0'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-12, 0); c.lineTo(8, 0); c.stroke();
    c.fillStyle = '#ccd'; c.beginPath(); c.moveTo(11, 0); c.lineTo(6, -2.5); c.lineTo(6, 2.5); c.fill();
    c.fillStyle = '#e0e0e0'; c.fillRect(-13, -2, 4, 1.2); c.fillRect(-13, 0.8, 4, 1.2);
  } else if (p.kind === 'axe') {
    c.rotate(p.rot); c.strokeStyle = '#6b4a2b'; c.lineWidth = 2; c.beginPath(); c.moveTo(-6, 0); c.lineTo(6, 0); c.stroke();
    c.fillStyle = '#b8c0c8'; c.beginPath(); c.moveTo(3, 0); c.quadraticCurveTo(8, -7, 10, -2); c.lineTo(5, 0); c.fill();
  } else {
    const col = { holy: '#fff3a0', death: '#7cff9a', magic: '#7fd4ff', fireball: '#ff8a2a', hellfire: '#ff3050' }[p.kind] || '#fff';
    const r = p.kind === 'fireball' ? 10 : p.kind === 'magic' ? 4 : 5.5;
    glow(c, 0, 0, r * 4, col, 0.8);
    circ(c, 0, 0, r, '#ffffff'); circ(c, 0, 0, r * 0.7, col);
    if (p.kind === 'magic') { c.rotate(a); c.fillStyle = rgba(col, 0.6); c.beginPath(); c.moveTo(6, 0); c.lineTo(-18, -3); c.lineTo(-18, 3); c.fill(); }
  }
  c.restore();
}

// ---------- גיבור אויב: לחשים אפלים ----------
function enemyHeroCast(u) {
  const L = u.elvl || 1;
  const fs = foes(u); if (!fs.length) return;
  const fallen = B.units.filter((e) => e.side === 1 && e.dead && e.U.undead && !e.U.boss && !e.isEHero && e.deadT >= 1);
  const opts = ['bolt', 'bolt', 'slow'];
  if (fallen.length || B.units.some((e) => e.side === 1 && !e.dead && e.U.undead && e.n < e.n0 && !e.isEHero)) opts.push('raise', 'raise');
  const kind = pick(opts);
  const col = kind === 'raise' ? '#7cff9a' : '#b07aff';
  u.cast = { t: 0, dur: 0.7, color: col, fn: () => {
    if (u.dead) return;
    if (kind === 'bolt') {
      const tg = pick(fs); if (tg.dead) return;
      Sound.play('magic');
      spawnProj(u, tg, 'death', () => { applyDamage(tg, 18 + L * 14, u, { magic: true, silent: true }); logLine(`☠ ${u.name} מטיל חץ מוות על ${tg.name}`, '#d0a0ff'); burst(tg.x, tg.y, 18, { color: ['#b07aff', '#2a1a3a'], add: true, z: 24 * FIG, sp: 160 }); });
    } else if (kind === 'slow') {
      const tg = fs.filter((e) => !e.buffs.slow).sort((a, b) => totalHp(b) - totalHp(a))[0] || pick(fs);
      tg.buffs.slow = 8; Sound.play('debuff');
      ring(tg.x, tg.y, 50, 8, '#b08aff', 0.6);
      floatText(tg.x, chestY(tg) - 20, 'קללת האטה', '#c8a8ff', 15);
      logLine(`☠ ${u.name} מקלל את ${tg.name} באטיות`, '#d0a0ff');
    } else {
      const tg = fallen.length ? pick(fallen) : B.units.filter((e) => e.side === 1 && !e.dead && e.U.undead && e.n < e.n0 && !e.isEHero)[0];
      if (!tg) return;
      const raised = healUnit(tg, 40 + L * 30, true);
      Sound.play('roar');
      bolt(jagged(u.x, chestY(u), tg.x, tg.y, 8, 14), '#7cff9a', 0.6, 3);
      burst(tg.x, tg.y, 40, { color: ['#7cff9a', '#1a3a20', '#ffffff'], add: true, g: -60, sp: 80, z: 5, life: 1.2 });
      floatText(tg.x, chestY(tg) - 20, `+${raised} ☠`, '#7cff9a', 18, { bold: true });
      logLine(`☠ ${u.name} מקים מן המתים ${raised} ${tg.name}!`, '#7cff9a');
    }
  } };
  Sound.play('cast');
  ring(u.x, u.y, 4, 46, col, 0.6, 3);
}

// ---------- מצור: חומה ומגדלים ----------
function drawSiegeWall(c, fort, towers) {
  const x0 = 0, w = fort ? 46 : 30;
  const g = c.createLinearGradient(x0, 0, x0 + w, 0); g.addColorStop(0, fort ? '#8f8471' : '#6b4a2b'); g.addColorStop(1, fort ? '#cfc3a8' : '#8a6a40');
  c.fillStyle = g; c.fillRect(x0, 60, w, BH - 60);
  c.fillStyle = fort ? '#e0d6bf' : '#a07a48';
  for (let y = 70; y < BH; y += 26) c.fillRect(x0 + w, y, 10, 14);
  if (fort) {
    c.fillStyle = '#3a2618'; c.fillRect(x0, BH / 2 - 10, w + 4, 64);
    c.strokeStyle = '#7a5530'; c.lineWidth = 2; for (let y = BH / 2 - 6; y < BH / 2 + 54; y += 10) { c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + w + 4, y); c.stroke(); }
    for (const y of [BH / 2 - 30, BH / 2 + 74]) drawFlag(c, x0 + w - 6, y, '#2f6fd6', 1, 40);
  }
}
function drawBattleTower(c, tw, t) {
  const x = tw.x, y = tw.top;
  ell(c, x, y + 40, 46, 14, 'rgba(0,0,0,.35)');
  const g = c.createLinearGradient(x - 34, 0, x + 34, 0); g.addColorStop(0, '#e0d6bf'); g.addColorStop(1, '#8f8471');
  c.fillStyle = g; c.fillRect(x - 32, y - 70, 64, 110);
  c.fillStyle = '#e0d6bf'; for (let i = 0; i < 4; i++) c.fillRect(x - 34 + i * 19, y - 84, 12, 16);
  c.fillStyle = '#1a1008'; c.fillRect(x + 4, y - 40, 8, 18);
  drawFlag(c, x, y - 84, '#2f6fd6', t + x + y, 34);
  // קשת על המגדל
  drawFigure(c, UNITS.marksman.look, x, y - 66, 1.2, { t, walk: 0, moving: false, atk: tw.anim > 0 ? 1 - tw.anim : -1, face: 1, noShadow: true });
}
function updateTowers(dt) {
  if (!B.towers.length) return;
  const week = Math.floor(G.dayCount / 7);
  for (const tw of B.towers) {
    tw.cd -= dt; tw.anim = Math.max(0, (tw.anim || 0) - dt * 2);
    if (tw.cd > 0) continue;
    let best = null, bd = 900;
    for (const e of B.units) if (e.side === 1 && !e.dead) { const d = dist(e.x, e.y, tw.x, tw.top); if (d < bd) { bd = d; best = e; } }
    if (!best) continue;
    tw.cd = 2.2; tw.anim = 1;
    const from = { x: tw.x, y: tw.top - 66 + 24 * FIG + 18, face: 1, fly: false };
    const tg = best;
    Sound.play('arrow');
    spawnProj(from, tg, 'arrow', () => {
      const dmg = 20 + week * 8 + (G.town.built.includes('cityhall') ? 15 : 0);
      const killed = applyDamage(tg, dmg, null, {});
      logLine(`🗼 מגדל החצים פוגע ב-${tg.name}: ${dmg} נזק${killed ? `, ${killed} נהרגו` : ''}`, '#9cc8ff');
    });
  }
}
