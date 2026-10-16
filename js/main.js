'use strict';
// ===== לולאה ראשית, מסכים, קלט, חלונות =====
const VIEW = { w: 0, h: 0, dpr: 1 };
let SCREEN = 'intro';
let G = null;
const canvas = $('#game');
const ctx = canvas.getContext('2d');
const SAVE_KEY = 'hlc_save_v1', AUTO_KEY = 'hlc_auto_v1';

function resize() {
  VIEW.dpr = Math.min(2, window.devicePixelRatio || 1);
  VIEW.w = window.innerWidth; VIEW.h = window.innerHeight;
  canvas.width = Math.round(VIEW.w * VIEW.dpr); canvas.height = Math.round(VIEW.h * VIEW.dpr);
  if (G && SCREEN === 'map') clampCam();
}
window.addEventListener('resize', resize);
resize();

function setScreen(s) {
  SCREEN = s;
  document.querySelectorAll('.screen-ui').forEach((el) => el.classList.toggle('on', el.id === `${s}-ui`));
  hideTip();
  document.body.classList.remove('bpaused');
  document.body.dataset.screen = s;
  if (s === 'title') Sound.music('title');
  else if (s === 'map') { Sound.music('map'); FX.reset(); }
  else if (s === 'town') { Sound.music('town'); FX.reset(); learnGuildSpells(); }
}

// ---------- חלונות, הודעות וטיפים ----------
let modalCount = 0;
function modalOpen() { return modalCount > 0; }
function showModal({ title, html, buttons, noClose, wide }) {
  const wrap = document.createElement('div'); wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal panel ${wide ? 'wide' : ''}"><h2>${title}</h2><div class="modal-body">${html || ''}</div><div class="modal-btns"></div></div>`;
  const btns = wrap.querySelector('.modal-btns');
  const close = () => { if (!wrap.parentNode) return; wrap.remove(); modalCount--; };
  (buttons && buttons.length ? buttons : [{ label: 'אישור', cls: 'primary' }]).forEach((b) => {
    const el = document.createElement('button'); el.className = `btn ${b.cls || ''}`; el.innerHTML = b.label;
    el.onclick = () => { Sound.play('click'); close(); b.fn && b.fn(); };
    btns.appendChild(el);
  });
  wrap.dataset.closable = noClose ? '0' : '1';
  wrap._close = close;
  document.body.appendChild(wrap);
  modalCount++;
  Sound.play('open');
  return close;
}
function closeTopModal() {
  const all = document.querySelectorAll('.modal-wrap');
  const top = all[all.length - 1];
  if (top && top.dataset.closable === '1') { top._close(); Sound.play('close'); }
}
function toast(msg, ms = 2600) {
  const box = $('#toasts');
  const d = document.createElement('div'); d.className = 'toast'; d.innerHTML = msg;
  box.appendChild(d);
  setTimeout(() => d.classList.add('out'), ms);
  setTimeout(() => d.remove(), ms + 500);
  while (box.children.length > 5) box.firstChild.remove();
}
function showTip(html, x, y) {
  const t = $('#tip'); t.innerHTML = html; t.style.display = 'block';
  const r = t.getBoundingClientRect();
  t.style.left = `${clamp(x + 16, 4, VIEW.w - r.width - 4)}px`; t.style.top = `${clamp(y + 18, 4, VIEW.h - r.height - 4)}px`;
}
function hideTip() { const t = $('#tip'); if (t) t.style.display = 'none'; }

// ---------- משחק חדש / שמירה / טעינה ----------
function newGame() {
  const seed = (Math.random() * 1e9) | 0;
  const world = genWorld(seed);
  G = {
    seed, world, fog: new Uint8Array(MW * MH), res: { gold: 7500, wood: 15, ore: 15, crystal: 4, gems: 4 },
    day: 1, week: 1, month: 1, dayCount: 1, enemyLast: 0, tutorialSeen: false,
    hero: {
      name: 'סר אלדריק', x: world.town.x, y: world.town.y, px: world.town.x, py: world.town.y, face: 1,
      level: 1, xp: 0, atk: 2, def: 2, sp: 1, kn: 2, mana: 20, mp: 18,
      skills: { leadership: 1, offense: 1 }, spells: ['magic_arrow', 'heal'], arts: [],
      army: [{ t: 'pikeman', n: 24 }, { t: 'archer', n: 12 }, { t: 'griffin', n: 4 }, null, null, null, null],
    },
    town: { built: ['hall', 'dw1', 'dw2', 'dw3'], avail: { pikeman: 14, archer: 9, griffin: 7 }, garrison: [null, null, null, null, null, null, null], builtToday: false },
  };
  initMapState();
  autosave();
  showModal({
    title: '👑 גיבורי הכתר האבוד', wide: true,
    html: `<p>לפני מאה שנה נגנב <b>הכתר האבוד</b> של ממלכת אלדוריה בידי <b>מלקאר, האדון האפל</b>, שהסתגר במצודה בקצה הדרום-מזרחי של הארץ.</p>
      <p>אתה, <b>סר אלדריק</b>, אביר מסדר האור, יוצא מהעיר <b>אבן-הכתר</b>. בנה את עירך, גייס צבא, כבוש מכרות, אסוף חפצים קסומים — והבס את מלקאר במצודתו!</p>
      <p class="muted">⚠️ מדי פעם יוצא מהמצודה צבא מתים לעבר עירך. הגן עליה!</p>
      <ul class="help-list"><li>לחץ על משבצת כדי לראות נתיב, ולחץ שוב כדי לנוע.</li><li>היכנס לעיר (לחיצה על הגיבור כשהוא בעיר, או כפתור "עיר").</li><li>הקרבות מתנהלים בזמן אמת — <b>רווח</b> עוצר את הזמן כדי לתת פקודות.</li></ul>`,
    buttons: [{ label: '⚔️ צא להרפתקה!', cls: 'primary' }],
  });
}
function initMapState() {
  MV.terrainCv = renderTerrain(G.world);
  MV.fogDirty = true; MV.miniDirty = true; MV.miniBase = null; MV.path = null; MV.pathDest = null; MV.moving = false;
  MV.clouds = Array.from({ length: 7 }, () => ({ x: rand(-400, MW * TS), y: rand(0, MH * TS), r: rand(160, 320), v: rand(10, 22) }));
  G.hero.px = G.hero.x; G.hero.py = G.hero.y;
  rebuildOcc();
  reveal(G.hero.x, G.hero.y, heroVision());
  reveal(G.world.town.x, G.world.town.y, 6);
  buildMapUI();
  setScreen('map');
  centerCam(G.hero.x, G.hero.y);
  updateMapUI();
  drawHeroPortrait();
}
function serialize() {
  const objects = G.world.objects.map((o) => { const c = { ...o }; delete c.px; delete c.py; return c; });
  const hero = { ...G.hero }; delete hero.px; delete hero.py; delete hero.walk;
  return JSON.stringify({ v: 1, seed: G.seed, objects, fog: Array.from(G.fog), res: G.res, day: G.day, week: G.week, month: G.month, dayCount: G.dayCount, enemyLast: G.enemyLast, enemySpawns: G.enemySpawns || 0, tutorialSeen: G.tutorialSeen, hero, town: G.town });
}
function deserialize(s) {
  const d = JSON.parse(s);
  const world = genWorld(d.seed);
  world.objects = d.objects;
  G = { ...d, world, fog: Uint8Array.from(d.fog) };
  initMapState();
}
function autosave() { try { localStorage.setItem(AUTO_KEY, serialize()); } catch (e) { /* אחסון לא זמין */ } }
function saveGame() {
  try { localStorage.setItem(SAVE_KEY, serialize()); Sound.play('page'); toast('💾 המשחק נשמר'); }
  catch (e) { Sound.play('error'); toast('לא ניתן לשמור בדפדפן זה'); }
}
function loadGame(key = SAVE_KEY) {
  let s = null;
  try { s = localStorage.getItem(key) || (key === SAVE_KEY ? localStorage.getItem(AUTO_KEY) : null); } catch (e) { s = null; }
  if (!s) { Sound.play('error'); toast('לא נמצא משחק שמור'); return false; }
  try { deserialize(s); Sound.play('page'); toast('📂 המשחק נטען'); return true; }
  catch (e) { console.error(e); Sound.play('error'); toast('קובץ השמירה פגום'); return false; }
}
function gameOver(msg) {
  setScreen('map');
  Sound.music(null);
  showModal({
    title: '☠️ המערכה אבודה', html: `<p class="big-note">${msg}</p><p class="muted">הכתר האבוד נשאר בידי מלקאר... לעת עתה.</p>`,
    buttons: [{ label: '↺ טען מתחילת היום', cls: 'primary', fn: () => { if (!loadGame(AUTO_KEY)) toTitle(); } }, { label: 'משחק חדש', fn: () => newGame() }, { label: 'תפריט ראשי', fn: () => toTitle() }],
    noClose: true,
  });
}
function winGame() {
  Sound.play('victory');
  if (!G.hero.arts.includes('crown')) G.hero.arts.push('crown');
  for (let k = 0; k < 6; k++) setTimeout(() => {
    const x = (G.hero.x + rand(-4, 4)) * TS, y = (G.hero.y + rand(-3, 2)) * TS;
    burst(x, y, 60, { color: ['#ffd23a', '#ff6a8a', '#7fd4ff', '#a6ff8a', '#fff'], add: true, sp: 260, g: 60, z: 120, vz: 40, life: 1.6 });
    Sound.play('explosion');
  }, k * 450);
  showModal({
    title: '👑 ניצחון! הכתר האבוד הושב', wide: true,
    html: `<p class="big-note">מלקאר הובס, והכתר האבוד חוזר לממלכת אלדוריה!</p>
      <p>${G.hero.name} הגיע לרמה ${G.hero.level} וניצח תוך ${G.dayCount} ימים.</p>
      <p class="muted">הפעמונים מצלצלים בכל רחבי הממלכה. שמך ייזכר לעד בשירי הבארדים.</p>`,
    buttons: [{ label: 'המשך לשוטט', cls: 'primary' }, { label: 'משחק חדש', fn: () => newGame() }, { label: 'תפריט ראשי', fn: () => toTitle() }],
  });
}
function toTitle() { setScreen('title'); buildTitleUI(); }

// ---------- מסך גיבור ועזרה ----------
function showHeroScreen() {
  const H = G.hero;
  const x1 = xpForLevel(H.level + 1);
  const skills = Object.keys(H.skills).map((k) => `<div class="hs-item"><span>${SKILLS[k].icon}</span><div><b>${SKILLS[k].name}</b> <small>(${SKILL_LEVEL[H.skills[k]]})</small><div class="muted">${SKILLS[k].desc(H.skills[k])}</div></div></div>`).join('') || '<p class="muted">אין</p>';
  const arts = H.arts.map((a) => `<div class="hs-item"><span>${ARTIFACTS[a].icon}</span><div><b>${ARTIFACTS[a].name}</b><div class="muted">${ARTIFACTS[a].desc}</div></div></div>`).join('') || '<p class="muted">טרם נמצאו חפצים</p>';
  const spells = H.spells.map((k) => `<span class="chip" title="${SPELLS[k].desc}">${SPELLS[k].icon} ${SPELLS[k].name} <small>${SPELLS[k].mana}</small></span>`).join(' ');
  const army = H.army.map((s) => s ? `<div class="aslot"><img src="${unitIcon(s.t, 52)}"><b>${s.n}</b><small>${UNITS[s.t].name}</small></div>` : '<div class="aslot empty"></div>').join('');
  showModal({
    title: `🧙 ${H.name} — אביר, רמה ${H.level}`, wide: true,
    html: `<div class="hs-top"><div class="hs-stats">
        <div>⚔️ התקפה <b>${heroStat('atk')}</b></div><div>🛡️ הגנה <b>${heroStat('def')}</b></div>
        <div>✨ כוח כישוף <b>${heroStat('sp')}</b></div><div>📖 ידע <b>${heroStat('kn')}</b></div>
        <div>🔷 מאנה <b>${H.mana}/${heroManaMax()}</b></div><div>⭐ ניסיון <b>${fmt(H.xp)}/${fmt(x1)}</b></div></div></div>
      <h4>כישורים</h4><div class="hs-grid">${skills}</div>
      <h4>חפצים</h4><div class="hs-grid">${arts}</div>
      <h4>ספר לחשים</h4><div>${spells}</div>
      <h4>צבא</h4><div class="arow">${army}</div>`,
  });
}
function showHelp() {
  showModal({
    title: '❓ איך משחקים', wide: true,
    html: `<h4>🗺️ מפת ההרפתקאות (בסגנון Heroes 3/5)</h4><ul class="help-list">
      <li>לחיצה על משבצת מציגה נתיב (ירוק = מגיע היום). לחיצה שנייה — תנועה.</li>
      <li>חיצים / WASD / קצה המסך — גלילה. לחיצה על המפה הקטנה — קפיצה.</li>
      <li><b>E</b> — סיום תור · <b>T</b> — עיר · <b>H</b> — גיבור · רווח — מרכוז על הגיבור.</li>
      <li>כבוש מכרות להכנסה יומית. בכל שבוע חדש היצורים בעיר מתרבים (וגם המפלצות במפה...).</li>
      <li>משבצות סמוכות למפלצת "שמורות" — כניסה אליהן מתחילה קרב.</li></ul>
      <h4>⚔️ קרבות (בסגנון Baldur's Gate 2)</h4><ul class="help-list">
      <li>קרב בזמן אמת עם הפסקה: <b>רווח</b> עוצר/ממשיך. אפשר לתת פקודות בזמן הפסקה.</li>
      <li>לחיצה על יחידה — בחירה, גרירה — בחירת קבוצה, Shift — הוספה, <b>A</b> — הכל, <b>1-8</b> — דיוקנאות.</li>
      <li>לחיצה על הקרקע — תנועה, על אויב — התקפה. לחיצה ימנית — אותו דבר / ביטול כיוון.</li>
      <li>כל יחידה מטילה d20 לפגיעה מול ההגנה של היעד — 20 טבעי = פגיעה קריטית!</li>
      <li>לחשי הגיבור ויכולות היחידות בסרגל התחתון. <b>Q</b> — יכולת ראשונה.</li>
      <li>⚠️ כדור אש פוגע בכולם באזור. ⚠️ התחמקו מעיגולים אדומים על הקרקע!</li></ul>`,
  });
}

// ---------- מסך פתיחה ----------
const TITLE = { stars: [], embers: [], t0: 0 };
for (let i = 0; i < 160; i++) TITLE.stars.push({ x: Math.random(), y: Math.random() * 0.6, r: Math.random() * 1.4 + 0.3, p: Math.random() * TAU });
function buildTitleUI() {
  const has = (() => { try { return !!(localStorage.getItem(SAVE_KEY) || localStorage.getItem(AUTO_KEY)); } catch (e) { return false; } })();
  $('#title-ui').innerHTML = `
    <div class="title-box">
      <div class="studio">EMBERFORGE ANIMATION STUDIOS מציגים</div>
      <h1 class="logo">גיבורי הכתר האבוד</h1>
      <div class="sublogo">HEROES OF THE LOST CROWN</div>
      <div class="tagline">אסטרטגיה בתורות · קרבות בזמן אמת עם הפסקה</div>
      <div class="menu pe">
        <button class="btn big primary" id="t-new">⚔️ משחק חדש</button>
        <button class="btn big" id="t-load" ${has ? '' : 'disabled'}>📂 המשך משחק</button>
        <button class="btn big" id="t-help">📜 איך משחקים</button>
        <div class="row"><button class="btn" id="t-music">🎵 מוזיקה</button><button class="btn" id="t-sfx">🔊 אפקטים</button></div>
      </div>
    </div>
    <div class="credits">© 2026 Emberforge Animation Studios · כל הגרפיקה, האנימציה והסאונד נוצרים בזמן אמת בקוד</div>`;
  $('#t-new').onclick = () => { Sound.play('click'); newGame(); };
  $('#t-load').onclick = () => { Sound.play('click'); loadGame(); };
  $('#t-help').onclick = () => showHelp();
  $('#t-music').onclick = (e) => { e.target.classList.toggle('off', !Sound.toggleMusic()); };
  $('#t-sfx').onclick = (e) => { e.target.classList.toggle('off', !Sound.toggleSfx()); };
  $('#t-music').classList.toggle('off', !Sound.musicOn); $('#t-sfx').classList.toggle('off', !Sound.sfxOn);
}
function titleDraw(c, t) {
  const w = VIEW.w, h = VIEW.h;
  const sky = c.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#070512'); sky.addColorStop(0.55, '#2a1530'); sky.addColorStop(0.8, '#6a2a2a'); sky.addColorStop(1, '#1a0a08');
  c.fillStyle = sky; c.fillRect(0, 0, w, h);
  for (const s of TITLE.stars) { c.globalAlpha = 0.5 + Math.sin(t * 2 + s.p) * 0.4; circ(c, s.x * w, s.y * h, s.r, '#fff'); }
  c.globalAlpha = 1;
  // ירח
  const mx = w * 0.78, my = h * 0.2;
  glow(c, mx, my, 180, '#ffe6c0', 0.35); circ(c, mx, my, 48, '#f7ead0'); circ(c, mx + 14, my - 8, 10, 'rgba(200,180,150,.4)'); circ(c, mx - 12, my + 12, 7, 'rgba(200,180,150,.35)');
  // דרקון מעופף
  const dx = ((t * 60) % (w + 600)) - 300, dy = h * 0.28 + Math.sin(t * 0.8) * 30;
  c.save(); c.globalAlpha = 0.85; if (HAS_FILTER) c.filter = 'brightness(0.15)';
  drawFigure(c, UNITS.bonedragon.look, dx, dy, 1.4, { t, walk: 0, moving: false, atk: -1, face: 1, fly: false, noShadow: true });
  c.restore();
  // שכבות הרים
  const layers = [['#2a1a2e', 0.62, 60, 0.004], ['#1d1220', 0.72, 80, 0.0065], ['#110a12', 0.82, 50, 0.01]];
  layers.forEach(([col, base, amp, f], li) => {
    c.fillStyle = col; c.beginPath(); c.moveTo(0, h);
    for (let x = 0; x <= w + 20; x += 20) c.lineTo(x, h * base - Math.abs(Math.sin(x * f + li * 2 + t * 0.02 * (li + 1))) * amp - Math.sin(x * f * 3.1) * amp * 0.3);
    c.lineTo(w, h); c.fill();
  });
  // טירה על צוק
  const cx = w * 0.24, cy = h * 0.74;
  c.fillStyle = '#0c070c'; c.beginPath(); c.moveTo(cx - 160, h); c.lineTo(cx - 120, cy); c.lineTo(cx + 130, cy); c.lineTo(cx + 180, h); c.fill();
  const tw = [[-90, 90, 14], [-40, 150, 18], [10, 200, 22], [60, 130, 16], [100, 80, 12]];
  for (const [ox, th, r] of tw) {
    c.fillStyle = '#0c070c'; c.fillRect(cx + ox - r, cy - th, r * 2, th);
    c.beginPath(); c.moveTo(cx + ox - r - 4, cy - th); c.lineTo(cx + ox, cy - th - r * 2.6); c.lineTo(cx + ox + r + 4, cy - th); c.fill();
    const lit = 0.6 + Math.sin(t * 3 + ox) * 0.2;
    c.fillStyle = `rgba(255,190,90,${lit})`; c.fillRect(cx + ox - 3, cy - th + 20, 6, 10); glow(c, cx + ox, cy - th + 25, 18, '#ffb050', 0.3 * lit);
  }
  c.fillStyle = '#0c070c'; c.fillRect(cx - 100, cy - 60, 210, 60);
  // גחלים
  if (Math.random() < 0.6) TITLE.embers.push({ x: rand(0, w), y: h + 10, vx: rand(-15, 15), vy: rand(-40, -90), life: rand(4, 8), max: 8, s: rand(1, 2.6) });
  c.save(); c.globalCompositeOperation = 'lighter';
  for (const e of TITLE.embers) {
    e.x += (e.vx + Math.sin(t + e.y * 0.01) * 15) * 0.016; e.y += e.vy * 0.016; e.life -= 0.016;
    c.fillStyle = `rgba(255,${120 + (e.s * 40) | 0},40,${clamp(e.life / 4, 0, 1)})`; c.beginPath(); c.arc(e.x, e.y, e.s, 0, TAU); c.fill();
  }
  c.restore();
  TITLE.embers = TITLE.embers.filter((e) => e.life > 0 && e.y > -10);
  // ערפל
  const fog = c.createLinearGradient(0, h * 0.7, 0, h);
  fog.addColorStop(0, 'rgba(120,60,80,0)'); fog.addColorStop(1, 'rgba(60,20,30,0.6)');
  c.fillStyle = fog; c.fillRect(0, h * 0.7, w, h * 0.3);
}
function introDraw(c, t) {
  const w = VIEW.w, h = VIEW.h;
  c.fillStyle = '#050304'; c.fillRect(0, 0, w, h);
  const k = clamp(t / 1.5, 0, 1);
  glow(c, w / 2, h / 2 - 20, 260, '#ff7a2a', 0.25 * k);
  // סדן
  c.save(); c.translate(w / 2, h / 2 - 70); c.globalAlpha = k;
  c.fillStyle = '#2a2024'; c.beginPath(); c.moveTo(-60, 0); c.lineTo(60, 0); c.lineTo(40, 14); c.lineTo(20, 14); c.lineTo(26, 40); c.lineTo(-26, 40); c.lineTo(-20, 14); c.lineTo(-70, 10); c.closePath(); c.fill();
  c.strokeStyle = '#ff9a4a'; c.lineWidth = 2; c.stroke();
  c.restore();
  if (Math.random() < 0.5) burst(w / 2 + rand(-20, 20), h / 2 - 70, 3, { color: ['#ffb347', '#ffd23a', '#fff1a0'], add: true, shape: 'spark', sp: 300, g: 400, vz: 200, z: 0, life: 0.8 });
  updateFX(0.016); drawFX(c);
  c.globalAlpha = k; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#ffd9a0'; c.font = `800 ${Math.min(64, w / 12)}px Cinzel, serif`; c.fillText('EMBERFORGE', w / 2, h / 2 + 20);
  c.fillStyle = '#c98a5a'; c.font = `600 ${Math.min(20, w / 30)}px Cinzel, serif`; c.fillText('A N I M A T I O N   S T U D I O S', w / 2, h / 2 + 62);
  c.fillStyle = '#e8dcc0'; c.font = '400 18px Heebo, sans-serif'; c.fillText('סטודיו אמברפורג׳ לאנימציה ומשחקים מציג', w / 2, h / 2 + 100);
  c.globalAlpha = 0.5 + Math.sin(t * 3) * 0.4; c.fillStyle = '#fff'; c.font = '700 18px Heebo, sans-serif';
  c.fillText('🎧 לחץ בכל מקום כדי להתחיל (עם סאונד)', w / 2, h - 80);
  c.globalAlpha = 1;
}

// ---------- לולאה ----------
let lastT = performance.now(), T = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now; T += dt;
  ctx.setTransform(VIEW.dpr, 0, 0, VIEW.dpr, 0, 0);
  try {
    switch (SCREEN) {
      case 'intro': introDraw(ctx, T); break;
      case 'title': titleDraw(ctx, T); break;
      case 'map': if (!modalOpen()) mapUpdate(dt); else updateFX(dt); mapDraw(ctx, T); break;
      case 'town': townUpdate(dt); townDraw(ctx, T); break;
      case 'battle': battleUpdate(dt); battleDraw(ctx, T); break;
    }
  } catch (e) { console.error(e); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- קלט ----------
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => { if (SCREEN === 'battle' || SCREEN === 'map') e.preventDefault(); });
canvas.addEventListener('mousedown', (e) => {
  Sound.unlock();
  if (SCREEN === 'intro') { FX.reset(); Sound.play('horn'); toTitle(); return; }
  if (modalOpen()) return;
  if (SCREEN === 'map') mapClick(e.clientX, e.clientY, e.button);
  else if (SCREEN === 'battle') battleMouseDown(e.clientX, e.clientY, e.button, e.shiftKey);
});
window.addEventListener('mousemove', (e) => {
  const onCanvas = e.target === canvas;
  if (SCREEN === 'map') { if (onCanvas) mapMouseMove(e.clientX, e.clientY); else { MV.mouse.in = false; MV.hover = null; hideTip(); } }
  else if (SCREEN === 'battle') { if (onCanvas || B.drag) battleMouseMove(e.clientX, e.clientY); if (!onCanvas) hideTip(); }
});
window.addEventListener('mouseup', (e) => { if (SCREEN === 'battle') battleMouseUp(e.clientX, e.clientY, e.button); });
document.addEventListener('mousedown', () => Sound.unlock(), { capture: true });
document.addEventListener('mouseover', (e) => { if (e.target.closest && e.target.closest('.btn:not(:disabled), .bcard.ok, .tab')) Sound.play('hover'); });
window.addEventListener('keydown', (e) => {
  Sound.unlock();
  if (e.target.tagName === 'INPUT') return;
  if (SCREEN === 'intro') { toTitle(); return; }
  if (modalOpen()) {
    if (e.key === 'Escape') closeTopModal();
    else if (e.key === 'Enter') { const b = document.querySelectorAll('.modal-wrap'); const top = b[b.length - 1]; const p = top && top.querySelector('.btn.primary, .btn'); if (p) p.click(); }
    if (e.key === ' ') e.preventDefault();
    return;
  }
  if (SCREEN === 'battle') { battleKey(e); return; }
  if (SCREEN === 'map') {
    MV.keys[e.key] = true;
    const k = e.key.toLowerCase();
    if (k === 'e' || k === 'ק') endTurn();
    else if (k === 't' || k === 'א') openTown();
    else if (k === 'h' || k === 'י') showHeroScreen();
    else if (k === ' ') { e.preventDefault(); centerCam(G.hero.x, G.hero.y); }
    else if (k === 'escape') { MV.path = null; }
  } else if (SCREEN === 'town' && e.key === 'Escape') { setScreen('map'); updateMapUI(); }
});
window.addEventListener('keyup', (e) => { MV.keys[e.key] = false; });
window.addEventListener('blur', () => { for (const k in MV.keys) MV.keys[k] = false; });

setScreen('intro');
