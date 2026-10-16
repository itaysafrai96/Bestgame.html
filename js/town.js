'use strict';
// ===== מסך העיר (בהשראת Heroes 5) =====
const TV = { tab: 'build', anims: {}, t: 0, birds: [] };

function openTown() {
  setScreen('town');
  TV.tab = TV.tab || 'build';
  buildTownUI();
}
function buildTownUI() {
  const ui = $('#town-ui');
  const inTown = heroInTown();
  ui.innerHTML = `
  <div id="town-title" class="panel pe"><span>🏰 אבן-הכתר</span><small>${inTown ? 'הגיבור נמצא בעיר' : 'הגיבור מחוץ לעיר — יחידות שיגויסו יצטרפו לחיל המצב'}</small></div>
  <div id="town-panel" class="panel pe">
    <div class="tabs">
      ${[['build', '🔨 בנייה'], ['recruit', '⚔️ גיוס'], ['guild', '🔮 גילדה'], ['market', '⚖️ שוק'], ['army', '🛡️ צבא']].map(([k, l]) => `<button class="tab ${TV.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}
    </div>
    <div id="town-content"></div>
    <div class="town-foot">
      <div id="town-res"></div>
      <button class="btn primary" id="town-exit">יציאה ⮌</button>
    </div>
  </div>`;
  ui.querySelectorAll('.tab').forEach((b) => b.onclick = () => { TV.tab = b.dataset.tab; Sound.play('page'); buildTownUI(); });
  $('#town-exit').onclick = () => { Sound.play('close'); setScreen('map'); updateMapUI(); };
  renderTownTab();
}
function townRes() {
  $('#town-res').innerHTML = ['gold', 'wood', 'ore', 'crystal', 'gems'].map((k) => `<span class="res">${RES_ICON[k]} <b>${fmt(G.res[k])}</b></span>`).join('');
}
function renderTownTab() {
  const el = $('#town-content');
  const T = G.town;
  townRes();
  if (TV.tab === 'build') {
    el.innerHTML = `<p class="muted center">${T.builtToday ? '⏳ כבר נבנה מבנה היום. חזור מחר.' : 'ניתן לבנות מבנה אחד ביום.'}</p><div class="build-grid">` +
      BUILD_ORDER.filter((id) => id !== 'hall').map((id) => {
        const B = BUILDINGS[id];
        const built = T.built.includes(id);
        const reqOk = B.req.every((r) => T.built.includes(r));
        const afford = canAfford(B.cost);
        const state = built ? 'built' : !reqOk ? 'locked' : afford && !T.builtToday ? 'ok' : 'nores';
        const reqTxt = !reqOk ? `<div class="req">דורש: ${B.req.filter((r) => !T.built.includes(r)).map((r) => BUILDINGS[r].name).join(', ')}</div>` : '';
        return `<div class="bcard ${state}" data-id="${id}">
          <div class="bicon">${B.icon}</div>
          <div class="bname">${B.name}</div>
          <div class="bdesc">${B.desc}</div>
          ${built ? '<div class="bstate">✔ נבנה</div>' : `${reqTxt}<div class="bcost">${costStr(B.cost)}</div>`}
        </div>`;
      }).join('') + '</div>';
    el.querySelectorAll('.bcard.ok').forEach((d) => d.onclick = () => buildBuilding(d.dataset.id));
    el.querySelectorAll('.bcard.nores, .bcard.locked').forEach((d) => d.onclick = () => Sound.play('error'));
  } else if (TV.tab === 'recruit') {
    const dw = BUILD_ORDER.filter((id) => BUILDINGS[id].unit);
    el.innerHTML = '<div class="recruit-list">' + dw.map((id) => {
      const B = BUILDINGS[id], base = B.unit, ut = isUpgraded(base) ? UPGRADE[base] : base, U = UNITS[ut];
      const built = T.built.includes(id);
      const av = T.avail[base] || 0;
      const maxAff = Math.min(av, ...Object.keys(U.cost).map((k) => Math.floor(G.res[k] / U.cost[k])));
      return `<div class="rcard ${built ? '' : 'locked'}">
        <img src="${unitIcon(ut, 64)}">
        <div class="rinfo">
          <div class="rname">${U.name} <small>דרגה ${U.tier}${U.up ? ' · ⬆ משודרג' : ''}</small></div>
          <div class="rstats">❤️${U.hp} ⚔️${U.atk} 🛡️${U.def} 💥${U.dmg[0]}-${U.dmg[1]} ${U.range ? '🏹' : ''}${U.fly ? '🪽' : ''}</div>
          <div class="rstats">${ABILITIES[U.ability] ? ABILITIES[U.ability].icon + ' ' + ABILITIES[U.ability].name : ''}</div>
          <div class="rcost">${costStr(U.cost)} ליחידה</div>
        </div>
        <div class="ract">
          ${built ? `<div class="avail">זמינים: <b>${av}</b></div>
          <input type="number" min="0" max="${maxAff}" value="${maxAff}" data-ut="${ut}">
          <button class="btn" data-rec="${ut}" ${maxAff > 0 ? '' : 'disabled'}>גייס</button>` : `<div class="muted">דורש ${B.name}</div>`}
        </div>
      </div>`;
    }).join('') + '</div>';
    el.querySelectorAll('[data-rec]').forEach((b) => b.onclick = () => {
      const ut = b.dataset.rec; const inp = el.querySelector(`input[data-ut="${ut}"]`);
      recruit(ut, parseInt(inp.value, 10) || 0);
    });
  } else if (TV.tab === 'guild') {
    const lvl = T.built.includes('guild3') ? 3 : T.built.includes('guild2') ? 2 : T.built.includes('guild1') ? 1 : 0;
    if (!lvl) { el.innerHTML = '<p class="center muted">יש לבנות את גילדת הקוסמים כדי ללמוד לחשים.</p>'; return; }
    const inTown = heroInTown();
    el.innerHTML = `<p class="center">${inTown ? 'הגיבור לומד אוטומטית את כל הלחשים הזמינים.' : 'הגיבור צריך להיות בעיר כדי ללמוד לחשים.'}</p><div class="spell-grid">` +
      Object.keys(SPELLS).map((k) => {
        const S = SPELLS[k]; const avail = S.lvl <= lvl; const known = G.hero.spells.includes(k);
        return `<div class="scard ${avail ? '' : 'locked'} ${known ? 'known' : ''}"><div class="sicon">${S.icon}</div><div><b>${S.name}</b> <small>דרגה ${S.lvl} · ${S.mana} מאנה</small><div class="muted">${S.desc}</div></div>${known ? '<span class="tick">✔</span>' : ''}</div>`;
      }).join('') + '</div>';
  } else if (TV.tab === 'market') {
    if (!T.built.includes('market')) { el.innerHTML = '<p class="center muted">יש לבנות שוק כדי לסחור.</p>'; return; }
    const rates = { wood: [100, 300], ore: [100, 300], crystal: [250, 700], gems: [250, 700] };
    el.innerHTML = '<div class="market">' + Object.keys(rates).map((k) => `<div class="mrow"><span class="mres">${RES_ICON[k]} ${RES_NAME[k]}</span>
      <button class="btn" data-sell="${k}" ${G.res[k] > 0 ? '' : 'disabled'}>מכור 1 (+${rates[k][0]}🪙)</button>
      <button class="btn" data-buy="${k}" ${G.res.gold >= rates[k][1] ? '' : 'disabled'}>קנה 1 (-${rates[k][1]}🪙)</button></div>`).join('') + '</div>';
    el.querySelectorAll('[data-sell]').forEach((b) => b.onclick = () => { const k = b.dataset.sell; G.res[k]--; G.res.gold += rates[k][0]; Sound.play('coin'); renderTownTab(); });
    el.querySelectorAll('[data-buy]').forEach((b) => b.onclick = () => { const k = b.dataset.buy; G.res[k]++; G.res.gold -= rates[k][1]; Sound.play('coin'); renderTownTab(); });
  } else if (TV.tab === 'army') {
    const inTown = heroInTown();
    const slot = (s, i, side) => {
      if (!s) return '<div class="aslot empty"></div>';
      const canUp = UPGRADE[s.t] && isUpgraded(s.t) && (side === 'g' || inTown);
      const upCost = canUp ? upgradeCost(s.t, s.n) : null;
      return `<div class="aslot"><img src="${unitIcon(s.t, 52)}"><b>${s.n}</b><small>${UNITS[s.t].name}</small>${inTown ? `<button class="btn tiny" data-mv="${side}:${i}">${side === 'g' ? '⬆ לגיבור' : '⬇ לחיל המצב'}</button>` : ''}${canUp ? `<button class="btn tiny up" data-up="${side}:${i}" ${canAfford(upCost) ? '' : 'disabled'} title="עלות: ${Object.keys(upCost).map((k) => upCost[k] + ' ' + RES_NAME[k]).join(', ')}">✨ שדרג</button>` : ''}</div>`;
    };
    el.innerHTML = `<h4>צבא הגיבור ${inTown ? '' : '<small class="muted">(מחוץ לעיר)</small>'}</h4><div class="arow">${G.hero.army.map((s, i) => slot(s, i, 'h')).join('')}</div>
      <h4>חיל המצב</h4><div class="arow">${T.garrison.map((s, i) => slot(s, i, 'g')).join('')}</div>
      ${inTown ? '<div class="center"><button class="btn primary" id="all-to-hero">⬆ העבר הכל לגיבור</button></div>' : ''}`;
    el.querySelectorAll('[data-mv]').forEach((b) => b.onclick = () => {
      const [side, i] = b.dataset.mv.split(':');
      const from = side === 'g' ? T.garrison : G.hero.army, to = side === 'g' ? G.hero.army : T.garrison;
      if (moveStack(from, +i, to)) Sound.play('select'); else { Sound.play('error'); toast('אין מקום פנוי'); }
      renderTownTab();
    });
    el.querySelectorAll('[data-up]').forEach((b) => b.onclick = () => {
      const [side, i] = b.dataset.up.split(':');
      const arr = side === 'g' ? T.garrison : G.hero.army; const st = arr[+i];
      const cost = upgradeCost(st.t, st.n);
      if (!canAfford(cost)) { Sound.play('error'); return; }
      pay(cost); const from = UNITS[st.t].name; st.t = UPGRADE[st.t];
      // איחוד עם ערימה משודרגת קיימת
      const j = arr.findIndex((x, k) => x && k !== +i && x.t === st.t);
      if (j >= 0) { arr[j].n += st.n; arr[+i] = null; }
      Sound.play('levelup'); toast(`✨ ${from} שודרגו ל${UNITS[UPGRADE[BASE_OF[st.t]]].name}!`);
      renderTownTab();
    });
    const all = $('#all-to-hero');
    if (all) all.onclick = () => { for (let i = 0; i < 7; i++) if (T.garrison[i]) moveStack(T.garrison, i, G.hero.army); Sound.play('recruit'); renderTownTab(); };
  }
}
function moveStack(from, i, to) {
  const s = from[i]; if (!s) return false;
  let j = to.findIndex((x) => x && x.t === s.t);
  if (j < 0) j = to.findIndex((x) => !x);
  if (j < 0) return false;
  if (to[j]) to[j].n += s.n; else to[j] = { t: s.t, n: s.n };
  from[i] = null;
  if (from === G.hero.army && !G.hero.army.some(Boolean)) { /* גיבור ללא צבא — מותר בעיר */ }
  return true;
}
function addToArmy(arr, t, n) {
  let j = arr.findIndex((x) => x && x.t === t);
  if (j < 0) j = arr.findIndex((x) => !x);
  if (j < 0) return false;
  if (arr[j]) arr[j].n += n; else arr[j] = { t, n };
  return true;
}
function isUpgraded(base) { const id = Object.keys(BUILDINGS).find((k) => BUILDINGS[k].upg === base); return !!id && G.town.built.includes(id); }
function upgradeCost(t, n) {
  const a = UNITS[t].cost, b = UNITS[UPGRADE[t]].cost, c = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = ((b[k] || 0) - (a[k] || 0)) * n; if (d > 0) c[k] = d; }
  return c;
}
function recruit(ut, n) {
  const U = UNITS[ut], base = BASE_OF[ut] || ut;
  n = Math.min(n, G.town.avail[base] || 0);
  if (n <= 0 || !canAfford(U.cost, n)) { Sound.play('error'); return; }
  const target = heroInTown() ? G.hero.army : G.town.garrison;
  if (!addToArmy(target, ut, n)) {
    if (target === G.hero.army && addToArmy(G.town.garrison, ut, n)) toast('צבא הגיבור מלא — היחידות נשלחו לחיל המצב');
    else { Sound.play('error'); toast('אין מקום פנוי בצבא'); return; }
  }
  pay(U.cost, n); G.town.avail[base] -= n;
  Sound.play('recruit');
  toast(`⚔️ גויסו ${n} ${U.name}`);
  TV.marchers = (TV.marchers || []).concat(Array.from({ length: Math.min(6, n) }, (_, k) => ({ t: ut, x: -40 - k * 30, life: 0 })));
  renderTownTab();
}
function buildBuilding(id) {
  const B = BUILDINGS[id];
  if (G.town.builtToday || !canAfford(B.cost)) { Sound.play('error'); return; }
  pay(B.cost);
  G.town.built.push(id); G.town.builtToday = true;
  if (B.unit && !G.town.avail[B.unit]) G.town.avail[B.unit] = UNITS[B.unit].growth;
  TV.anims[id] = 0;
  Sound.play('build');
  setTimeout(() => Sound.play('levelup'), 700);
  toast(`🔨 ${B.name} נבנה!`);
  learnGuildSpells();
  renderTownTab();
}
function learnGuildSpells() {
  if (!heroInTown()) return;
  const lvl = G.town.built.includes('guild3') ? 3 : G.town.built.includes('guild2') ? 2 : G.town.built.includes('guild1') ? 1 : 0;
  const learned = [];
  for (const k in SPELLS) if (SPELLS[k].lvl <= lvl && !G.hero.spells.includes(k)) { G.hero.spells.push(k); learned.push(SPELLS[k].name); }
  if (learned.length) { Sound.play('magic'); toast(`📖 הגיבור למד: ${learned.join(', ')}`, 3500); }
}

// ---------- ציור העיר ----------
const TOWN_SPOTS = {
  hall: [800, 560], townhall: [800, 560], cityhall: [800, 560], fort: [800, 740],
  market: [1120, 700], guild1: [470, 520], dw1: [610, 690], dw2: [330, 640], dw3: [1290, 520],
  dw4: [1000, 620], dw5: [1150, 480], dw6: [250, 790], dw7: [560, 430],
};
function townUpdate(dt) {
  TV.t += dt;
  for (const k in TV.anims) { TV.anims[k] += dt * 0.8; if (TV.anims[k] >= 1) delete TV.anims[k]; }
  if (TV.marchers) { for (const m of TV.marchers) { m.x += dt * 140; m.life += dt; } TV.marchers = TV.marchers.filter((m) => m.x < 1700); }
  updateFX(dt);
}
function townDraw(c, t) {
  const w = VIEW.w - 440, h = VIEW.h;
  const s = Math.min(w / 1480, h / 860);
  c.save();
  c.beginPath(); c.rect(0, 0, w, h); c.clip();
  c.translate(w / 2 - 800 * s, h - 880 * s); c.scale(s, s);
  // שמיים
  const sky = c.createLinearGradient(0, 0, 0, 600);
  sky.addColorStop(0, '#20305e'); sky.addColorStop(0.5, '#c8735a'); sky.addColorStop(1, '#f2c27a');
  c.fillStyle = sky; c.fillRect(-2000, -3000, 6000, 3600);
  glow(c, 1250, 330, 260, '#ffcf80', 0.5);
  circ(c, 1250, 330, 46, '#ffe9b8');
  // עננים
  for (let i = 0; i < 6; i++) {
    const cx = ((i * 330 + t * (8 + i * 2)) % 2000) - 200, cy = 120 + (i % 3) * 60;
    c.fillStyle = 'rgba(255,220,200,0.35)';
    for (let k = 0; k < 4; k++) { c.beginPath(); c.ellipse(cx + k * 40, cy + Math.sin(k) * 8, 60, 22, 0, 0, TAU); c.fill(); }
  }
  // הרים רחוקים
  c.fillStyle = '#5a4a6a'; c.beginPath(); c.moveTo(-200, 520);
  for (let x = -200; x <= 1800; x += 80) c.lineTo(x, 400 + Math.sin(x * 0.01) * 50 + Math.sin(x * 0.027) * 30);
  c.lineTo(2600, 400); c.lineTo(2600, 600); c.lineTo(-1000, 600); c.lineTo(-1000, 520); c.fill();
  c.fillStyle = '#3f5a3a'; c.beginPath(); c.moveTo(-200, 600);
  for (let x = -200; x <= 1800; x += 60) c.lineTo(x, 500 + Math.sin(x * 0.008 + 1) * 30);
  c.lineTo(2600, 500); c.lineTo(2600, 3000); c.lineTo(-1000, 3000); c.lineTo(-1000, 600); c.fill();
  // קרקע
  const gr = c.createLinearGradient(0, 520, 0, 900); gr.addColorStop(0, '#5f8a3e'); gr.addColorStop(1, '#3a5a28');
  c.fillStyle = gr; c.fillRect(-1000, 560, 3600, 2400);
  // נהר
  c.fillStyle = '#4f8fc0'; c.beginPath(); c.moveTo(-1000, 880); c.lineTo(-200, 860); c.bezierCurveTo(400, 800, 900, 900, 1800, 830); c.lineTo(2600, 820); c.lineTo(2600, 900); c.lineTo(-1000, 940); c.fill();
  c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = 2;
  for (let i = 0; i < 8; i++) { const x = ((i * 220 + t * 30) % 2000) - 200; c.beginPath(); c.moveTo(x, 868); c.lineTo(x + 30, 866); c.stroke(); }
  // דרך
  c.fillStyle = '#b39a6a'; c.beginPath(); c.moveTo(740, 900); c.lineTo(860, 900); c.lineTo(820, 600); c.lineTo(780, 600); c.fill();
  // מבנים לפי עומק
  const built = G.town.built;
  const draws = [];
  const add = (id, y, f) => { if (built.includes(id)) draws.push([y, id, f]); };
  add('dw7', 430, (x, y) => drawPortal(c, x, y, t));
  add('guild1', 520, (x, y) => drawMageTower(c, x, y, t, built.includes('guild3') ? 3 : built.includes('guild2') ? 2 : 1));
  add('dw3', 520, (x, y) => drawGriffinTower(c, x, y, t));
  add('dw5', 480, (x, y) => drawMonastery(c, x, y, t));
  const hallId = built.includes('cityhall') ? 'cityhall' : built.includes('townhall') ? 'townhall' : 'hall';
  draws.push([560, hallId, (x, y) => drawKeep(c, x, y, t, hallId)]);
  add('dw4', 620, (x, y) => drawBarracks(c, x, y, t));
  add('dw2', 640, (x, y) => drawArcheryTower(c, x, y, t));
  add('dw1', 690, (x, y) => drawGuardhouse(c, x, y, t));
  add('market', 700, (x, y) => drawMarket(c, x, y, t));
  add('fort', 740, (x, y) => drawWalls(c, x, y, t));
  add('dw6', 790, (x, y) => drawTraining(c, x, y, t));
  draws.sort((a, b) => a[0] - b[0]);
  for (const [, id, f] of draws) {
    const [x, y] = TOWN_SPOTS[id];
    const an = TV.anims[id];
    c.save();
    if (an !== undefined) {
      const k = easeOutBack(Math.min(1, an));
      c.translate(x, y); c.scale(1, Math.max(0.01, k)); c.translate(-x, -y);
      if (Math.random() < 0.6) burst(x + rand(-60, 60), y, 2, { color: ['#c8b28a', '#9a8a70'], shape: 'smoke', sp: 40, size: 12, grow: 20, g: -30, life: 1.2 });
    }
    f(x, y);
    c.restore();
    // דגל זהב מעל משכנות משודרגים
    const upId = BUILDINGS[id] && BUILDINGS[id].unit ? Object.keys(BUILDINGS).find((k) => BUILDINGS[k].upg === BUILDINGS[id].unit) : null;
    if (upId && built.includes(upId)) {
      const fx = x + 50, fy = y - 40;
      glow(c, fx, fy - 40, 40, '#ffd060', 0.35 + Math.sin(t * 3 + x) * 0.1);
      drawFlag(c, fx, fy, '#e8b830', t + x, 50);
      c.font = '20px serif'; c.textAlign = 'center'; c.fillText('✨', fx + 8, fy - 62);
    }
  }
  // צועדים (מגויסים חדשים)
  if (TV.marchers) for (const m of TV.marchers) drawFigure(c, UNITS[m.t].look, m.x, 840, 2.2, { t, walk: m.life * 10, moving: true, atk: -1, face: 1, fly: UNITS[m.t].fly });
  // ציפורים
  c.strokeStyle = '#2a2030'; c.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const bx = ((i * 380 + t * 50) % 2000) - 200, by = 200 + Math.sin(t + i) * 30 + i * 20, f = Math.sin(t * 8 + i) * 6;
    c.beginPath(); c.moveTo(bx - 10, by - f); c.quadraticCurveTo(bx - 4, by - 4, bx, by); c.quadraticCurveTo(bx + 4, by - 4, bx + 10, by - f); c.stroke();
  }
  drawFX(c);
  c.restore();
  const vg = c.createRadialGradient(w / 2, h / 2, h * 0.4, w / 2, h / 2, w * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  c.fillStyle = vg; c.fillRect(0, 0, w, h);
}
function roof(c, x, y, w, h, col) { c.fillStyle = col; c.beginPath(); c.moveTo(x - w / 2 - 6, y); c.lineTo(x, y - h); c.lineTo(x + w / 2 + 6, y); c.closePath(); c.fill(); c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.moveTo(x, y - h); c.lineTo(x + w / 2 + 6, y); c.lineTo(x, y); c.fill(); }
function wallBox(c, x, y, w, h, col) { const g = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0); g.addColorStop(0, shade(col, 0.15)); g.addColorStop(1, shade(col, -0.3)); c.fillStyle = g; c.fillRect(x - w / 2, y - h, w, h); }
function windowLit(c, x, y, t) { c.fillStyle = '#ffd36b'; c.fillRect(x - 3, y - 6, 6, 9); glow(c, x, y - 2, 12, '#ffcf6b', 0.3 + Math.sin(t * 2 + x) * 0.08); }
function drawKeep(c, x, y, t, lvl) {
  ell(c, x, y + 4, 150, 24, 'rgba(0,0,0,.25)');
  const big = lvl === 'cityhall' ? 1.25 : lvl === 'townhall' ? 1.1 : 1;
  wallBox(c, x, y, 220 * big, 150 * big, '#d8ccb0');
  for (let i = 0; i < 4; i++) windowLit(c, x - 75 * big + i * 50 * big, y - 90 * big, t);
  c.fillStyle = '#3a2618'; c.beginPath(); c.moveTo(x - 22, y); c.lineTo(x - 22, y - 40); c.arc(x, y - 40, 22, Math.PI, 0); c.lineTo(x + 22, y); c.fill();
  roof(c, x, y - 150 * big, 220 * big, 80 * big, '#3b6fb6');
  for (const dx of [-130, 130]) { wallBox(c, x + dx * big, y, 50, 220 * big, '#cfc3a8'); roof(c, x + dx * big, y - 220 * big, 50, 70, '#2f5a9a'); windowLit(c, x + dx * big, y - 160 * big, t); drawFlag(c, x + dx * big, y - 290 * big, '#2f6fd6', t + dx, 30); }
  if (lvl === 'cityhall') { c.fillStyle = '#e8c04a'; c.beginPath(); c.arc(x, y - 230 * big, 40, Math.PI, 0); c.fill(); glow(c, x, y - 240 * big, 60, '#ffe080', 0.35); }
  drawFlag(c, x, y - 230 * big - (lvl === 'cityhall' ? 40 : 0), '#e8c04a', t, 40);
}
function drawMageTower(c, x, y, t, lvl) {
  ell(c, x, y + 4, 60, 12, 'rgba(0,0,0,.25)');
  const h = 140 + lvl * 50;
  wallBox(c, x, y, 70, h, '#8a7aa8');
  for (let i = 0; i < lvl; i++) windowLit(c, x, y - 60 - i * 60, t);
  roof(c, x, y - h, 70, 110, '#4a2a7a');
  const oy = y - h - 125 + Math.sin(t * 2) * 6;
  circ(c, x, oy, 10, '#b98cff'); glow(c, x, oy, 50 + lvl * 10, '#b98cff', 0.6);
  for (let i = 0; i < 3; i++) { const a = t * 2 + i * 2.1; circ(c, x + Math.cos(a) * 26, oy + Math.sin(a) * 10, 2.5, '#e9d5ff'); }
}
function drawGriffinTower(c, x, y, t) {
  ell(c, x, y + 4, 60, 12, 'rgba(0,0,0,.25)');
  wallBox(c, x, y, 80, 230, '#b9ab8e'); roof(c, x, y - 230, 80, 60, '#7a4a2a');
  c.fillStyle = '#6b4a2b'; ell(c, x, y - 232, 46, 12, '#6b4a2b');
  const a = t * 0.8;
  drawFigure(c, UNITS.griffin.look, x + Math.cos(a) * 160, y - 330 + Math.sin(a * 2) * 30, 1.8, { t, walk: 0, moving: false, atk: -1, face: Math.sin(a) > 0 ? -1 : 1, fly: true, noShadow: true });
}
function drawMonastery(c, x, y, t) {
  ell(c, x, y + 4, 100, 16, 'rgba(0,0,0,.25)');
  wallBox(c, x, y, 160, 110, '#e8dcc0'); roof(c, x, y - 110, 160, 60, '#9a3a2a');
  wallBox(c, x + 60, y - 110, 40, 90, '#e8dcc0'); roof(c, x + 60, y - 200, 40, 50, '#9a3a2a');
  c.strokeStyle = '#e8c04a'; c.lineWidth = 4; c.beginPath(); c.moveTo(x + 60, y - 270); c.lineTo(x + 60, y - 245); c.moveTo(x + 50, y - 262); c.lineTo(x + 70, y - 262); c.stroke();
  c.fillStyle = '#7fb0e8'; c.beginPath(); c.arc(x, y - 60, 16, 0, TAU); c.fill(); glow(c, x, y - 60, 30, '#c8e4ff', 0.3);
}
function drawBarracks(c, x, y, t) {
  ell(c, x, y + 4, 110, 16, 'rgba(0,0,0,.25)');
  wallBox(c, x, y, 190, 80, '#9a8a70'); roof(c, x, y - 80, 190, 50, '#6a3a22');
  for (let i = 0; i < 3; i++) windowLit(c, x - 60 + i * 60, y - 40, t);
  for (let i = 0; i < 3; i++) { c.fillStyle = '#b8322a'; c.fillRect(x - 70 + i * 60, y - 74, 20, 26); c.fillStyle = '#e8c04a'; c.fillRect(x - 63 + i * 60, y - 68, 6, 12); }
}
function drawArcheryTower(c, x, y, t) {
  ell(c, x, y + 4, 50, 10, 'rgba(0,0,0,.25)');
  c.fillStyle = '#7a5530'; for (const dx of [-30, 30]) c.fillRect(x + dx - 4, y - 160, 8, 160);
  c.strokeStyle = '#6b4a2b'; c.lineWidth = 3; c.beginPath(); c.moveTo(x - 30, y); c.lineTo(x + 30, y - 80); c.moveTo(x + 30, y); c.lineTo(x - 30, y - 80); c.stroke();
  c.fillStyle = '#8a6a40'; c.fillRect(x - 45, y - 190, 90, 30); roof(c, x, y - 190, 90, 50, '#3f7d3a');
  c.fillStyle = '#a07a40'; c.beginPath(); c.arc(x + 70, y - 30, 22, 0, TAU); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(x + 70, y - 30, 15, 0, TAU); c.fill(); c.fillStyle = '#c33'; c.beginPath(); c.arc(x + 70, y - 30, 8, 0, TAU); c.fill();
}
function drawGuardhouse(c, x, y, t) {
  ell(c, x, y + 4, 70, 12, 'rgba(0,0,0,.25)');
  wallBox(c, x, y, 110, 90, '#bfb29a'); for (let i = 0; i < 5; i++) { c.fillStyle = '#bfb29a'; c.fillRect(x - 55 + i * 24, y - 104, 14, 14); }
  c.fillStyle = '#3a2618'; c.fillRect(x - 14, y - 40, 28, 40);
  drawFlag(c, x + 40, y - 104, '#3b6fb6', t, 30);
}
function drawMarket(c, x, y, t) {
  ell(c, x, y + 4, 100, 14, 'rgba(0,0,0,.25)');
  const cols = ['#c0392b', '#e8c04a', '#2f6fd6'];
  for (let i = 0; i < 3; i++) {
    const sx = x - 70 + i * 70;
    c.fillStyle = '#7a5530'; c.fillRect(sx - 26, y - 50, 4, 50); c.fillRect(sx + 22, y - 50, 4, 50);
    c.fillStyle = '#8a6a40'; c.fillRect(sx - 28, y - 22, 56, 8);
    c.fillStyle = cols[i]; c.beginPath(); c.moveTo(sx - 34, y - 46); c.lineTo(sx, y - 70); c.lineTo(sx + 34, y - 46); c.fill();
    for (let k = 0; k < 4; k++) circ(c, sx - 18 + k * 12, y - 26, 4, ['#e05a3a', '#f5c542', '#7fae4f', '#c084fc'][k]);
  }
}
function drawWalls(c, x, y, t) {
  c.fillStyle = '#a39577'; c.fillRect(x - 600, y - 50, 1200, 50);
  c.fillStyle = '#cfc3a8'; c.fillRect(x - 600, y - 58, 1200, 10);
  for (let i = 0; i < 50; i++) c.fillRect(x - 600 + i * 24, y - 70, 14, 14);
  c.fillStyle = '#3a2618'; c.beginPath(); c.moveTo(x - 40, y); c.lineTo(x - 40, y - 30); c.arc(x, y - 30, 40, Math.PI, 0); c.lineTo(x + 40, y); c.fill();
  for (const dx of [-80, 80, -520, 520]) { wallBox(c, x + dx, y, 56, 120, '#cfc3a8'); roof(c, x + dx, y - 120, 56, 50, '#3b6fb6'); }
  if (G.town.built.includes('tower')) for (const dx of [-300, 300]) {
    wallBox(c, x + dx, y, 70, 200, '#bfb29a'); for (let i = 0; i < 4; i++) c.fillRect(x + dx - 35 + i * 20, y - 214, 12, 14);
    c.fillStyle = '#1a1008'; c.fillRect(x + dx - 4, y - 150, 8, 20);
    drawFlag(c, x + dx, y - 214, '#2f6fd6', t + dx, 34);
  }
}
function drawTraining(c, x, y, t) {
  c.strokeStyle = '#7a5530'; c.lineWidth = 4;
  c.beginPath(); c.ellipse(x, y - 20, 130, 40, 0, 0, TAU); c.stroke();
  c.beginPath(); c.ellipse(x, y - 30, 130, 40, 0, 0, TAU); c.stroke();
  const a = t * 1.2;
  drawFigure(c, UNITS.cavalier.look, x + Math.cos(a) * 90, y - 20 + Math.sin(a) * 25, 1.8, { t, walk: t * 12, moving: true, atk: -1, face: Math.sin(a) > 0 ? -1 : 1 });
}
function drawPortal(c, x, y, t) {
  ell(c, x, y + 4, 90, 16, 'rgba(0,0,0,.25)');
  c.fillStyle = '#e8d8a0'; c.fillRect(x - 70, y - 200, 24, 200); c.fillRect(x + 46, y - 200, 24, 200);
  c.strokeStyle = '#e8c04a'; c.lineWidth = 22; c.beginPath(); c.arc(x, y - 200, 58, Math.PI, 0); c.stroke();
  const g = c.createLinearGradient(x, y - 260, x, y); g.addColorStop(0, 'rgba(255,250,220,.9)'); g.addColorStop(1, 'rgba(255,220,120,.2)');
  c.fillStyle = g; c.beginPath(); c.moveTo(x - 46, y); c.lineTo(x - 46, y - 200); c.arc(x, y - 200, 46, Math.PI, 0); c.lineTo(x + 46, y); c.fill();
  glow(c, x, y - 150, 160, '#fff1a0', 0.35 + Math.sin(t * 2) * 0.1);
  c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,240,180,0.08)'; c.beginPath(); c.moveTo(x - 30, y - 250); c.lineTo(x + 30, y - 250); c.lineTo(x + 70, -200); c.lineTo(x - 70, -200); c.fill(); c.restore();
}
