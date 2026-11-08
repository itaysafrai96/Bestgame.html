// Shared wheel engine for the THE GANG versions.
// Each version supplies window.GAME (slices, rules, texts) and window.GAME_DATA (cards).
(() => {
  const G = window.GAME, GD = window.GAME_DATA;
  const $ = id => document.getElementById(id);
  const P = (G.id || 'game') + '_';
  const store = {
    get(k, d){ try { const v = localStorage.getItem(P + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v){ try { localStorage.setItem(P + k, JSON.stringify(v)); return true; } catch { return false; } },
    del(k){ try { localStorage.removeItem(P + k); } catch {} }
  };

  // ---------- slices ----------
  const CATS = {}; G.slices.forEach(s => { CATS[s.key] = s; });
  const SEGS = G.slices.map(s => s.key);
  const SEG = 360 / SEGS.length;
  const PEGS = SEGS.length * 6, PEG = 360 / PEGS;
  const CARD_KEYS = G.slices.filter(s => s.type !== 'bump').map(s => s.key);
  const HEAT = G.heat || null;
  const BUMP_EVERY = G.bumpEvery || 10;

  // slice colours on the result card
  const css = document.createElement('style');
  css.textContent = G.slices.map(s => `.sheet.${s.key}{background:${s.sheet};${s.dark ? 'color:#2a1300' : ''}}`).join('\n');
  document.head.appendChild(css);

  // base cards as {text, tag}: tag = heat level (1-3) or topic id
  const BASE = {}, TOPICS = {};
  G.slices.forEach(s => {
    if (s.type === 'bump') return;
    const src = GD[s.key], seen = new Set(), out = [];
    const push = (text, tag) => { if (text && !seen.has(text)){ seen.add(text); out.push({ text, tag }); } };
    if (s.type === 'topics'){ TOPICS[s.key] = src; src.forEach(t => t.items.forEach(x => push(x, t.id))); }
    else if (Array.isArray(src)) src.forEach(x => push(x, null));
    else Object.keys(src).sort().forEach(l => src[l].forEach(x => push(x, +l)));
    BASE[s.key] = out;
  });

  const emptyCounts = () => Object.fromEntries([...SEGS, 'bumpall'].map(k => [k, 0]));
  let st = Object.assign({ bumps:0, spins:0, counts:emptyCounts(), players:[], turn:0, sound:true, heat:null, partners:{} }, store.get('state', {}));
  const save = () => store.set('state', st);
  let rotation = 0, spinning = false, decks = store.get('decks', {}), current = null, pendingLevel = null;

  // ---------- helpers ----------
  const rnd = () => { try { const u = new Uint32Array(1); crypto.getRandomValues(u); return u[0] / 4294967296; } catch { return Math.random(); } };
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function drawFrom(key, list){
    const used = new Set((decks[key] && decks[key].used) || []);
    let pool = list.filter(t => !used.has(t));
    if (!pool.length){ used.clear(); pool = list.slice(); }
    const card = pool[rnd() * pool.length | 0];
    used.add(card); decks[key] = { used:[...used] };
    store.set('decks', decks);
    return card;
  }

  // ---------- edits from review mode (shared db when available) ----------
  const hash = str => { let h = 5381; for (const ch of str) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0; return h.toString(36); };
  const rmId = (cat, text) => 'r-' + cat + '-' + hash(text);
  let edits = store.get('edits', {}), editsDb = null;
  function activeItems(cat){
    const all = Object.values(edits);
    const gone = new Set(all.filter(e => e.type === 'remove' && e.cat === cat).map(e => e.text));
    const added = all.filter(e => e.type === 'add' && e.cat === cat).sort((a, b) => (a.ts || 0) - (b.ts || 0)).map(e => ({ text:e.text, tag:e.tag ?? null }));
    return [...BASE[cat], ...added].filter(i => !gone.has(i.text));
  }
  const activeList = cat => activeItems(cat).map(i => i.text);
  function tagOf(cat, text){
    const b = BASE[cat].find(i => i.text === text); if (b) return b.tag;
    const e = Object.values(edits).find(e => e.type === 'add' && e.cat === cat && e.text === text);
    return e ? e.tag ?? null : null;
  }
  async function putEdit(id, body){
    edits = { ...edits, [id]: body };
    if (!editsDb) store.set('edits', edits);
    renderReview();
    if (editsDb) await editsDb.collection('edits').doc(id).set(body);
  }
  async function dropEdit(id){
    const next = { ...edits }; delete next[id]; edits = next;
    if (!editsDb) store.set('edits', edits);
    renderReview();
    if (editsDb) await editsDb.collection('edits').doc(id).delete();
  }
  (async () => {
    try {
      const db = window.claude && await window.claude.use('db');
      if (!db) return;
      editsDb = db;
      db.collection('edits').onSnapshot(snap => {
        const m = {}; snap.docs.forEach(d => { m[d.id] = d.data(); });
        edits = m; renderReview();
      }, () => {});
    } catch {}
  })();

  const curPlayer = () => st.players.length ? st.players[st.turn % st.players.length] : null;
  function pickPartner(me){
    const others = st.players.filter(p => p !== me);
    if (!others.length) return null;
    const last = st.partners[me];
    const pool = others.length > 1 ? others.filter(p => p !== last) : others;
    const pick = pool[rnd() * pool.length | 0];
    st.partners[me] = pick;
    return pick;
  }
  function fill(text, partner){
    const me = curPlayer();
    const others = st.players.filter(p => p !== me);
    let secs = 0;
    text = text.replace(/\s*\[(\d+)\]\s*$/, (_, s) => { secs = +s; return ''; });
    text = text.replace(/\{p\}/g, () => partner || (others.length ? others[rnd() * others.length | 0] : (G.anyone || 'מישהו מהחבר׳ה')));
    return { text, secs };
  }

  // ---------- heat ----------
  const autoHeat = () => 1 + HEAT.at.filter(n => st.spins >= n).length;
  const heatLevel = () => HEAT ? (st.heat || autoHeat()) : null;
  function renderHeat(){
    if (!HEAT) return;
    const L = heatLevel();
    $('heat').classList.remove('hide');
    $('heat').innerHTML = `<span class="heat-lbl">${HEAT.levels[L - 1].emoji} ${esc(HEAT.levels[L - 1].name)} <small>${st.heat ? 'נבחר ידנית' : 'עולה לבד'}</small></span>`
      + `<span class="heat-btns">${HEAT.levels.map((l, i) => `<button class="hb ${i + 1 === L ? 'on' : ''}" data-l="${i + 1}" aria-label="${esc(l.name)}">${l.emoji}</button>`).join('')}</span>`;
  }
  if (HEAT) $('heat').addEventListener('click', e => {
    const b = e.target.closest('.hb'); if (!b) return;
    const L = +b.dataset.l;
    st.heat = st.heat === L ? null : L;   // tapping the chosen level again goes back to automatic
    save(); renderHeat(); SFX.ui();
  });

  // ---------- sound ----------
  let ac, master, wet, noiseBuf;
  function audio(){
    if (!st.sound) return null;
    try {
      if (!ac){
        ac = new (window.AudioContext || window.webkitAudioContext)();
        const comp = ac.createDynamicsCompressor();
        master = ac.createGain(); master.gain.value = .8;
        master.connect(comp).connect(ac.destination);
        wet = ac.createGain(); wet.gain.value = 1;
        const dl = ac.createDelay(), fb = ac.createGain(), lp = ac.createBiquadFilter();
        dl.delayTime.value = .14; fb.gain.value = .33; lp.type = 'lowpass'; lp.frequency.value = 2600;
        wet.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(master);
        noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
        const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      }
      if (ac.state === 'suspended') ac.resume();
      return ac;
    } catch { return null; }
  }
  function env(g, at, v, a, d){ g.gain.setValueAtTime(.0001, at); g.gain.exponentialRampToValueAtTime(v, at + a); g.gain.exponentialRampToValueAtTime(.0001, at + d); }
  function tone(f, o = {}){
    const c = audio(); if (!c) return;
    const { t = 0, d = .2, type = 'sine', v = .15, a = .006, rev = 0, bend = 0 } = o;
    const at = c.currentTime + t, osc = c.createOscillator(), g = c.createGain();
    osc.type = type; osc.frequency.setValueAtTime(f, at);
    if (bend) osc.frequency.exponentialRampToValueAtTime(f * bend, at + d);
    env(g, at, v, a, d); osc.connect(g).connect(master);
    if (rev){ const s = c.createGain(); s.gain.value = rev; g.connect(s).connect(wet); }
    osc.start(at); osc.stop(at + d + .05);
  }
  function noise(o = {}){
    const c = audio(); if (!c) return;
    const { t = 0, d = .05, v = .2, f = 2000, f2 = 0, q = 1, a = .002, rev = 0 } = o;
    const at = c.currentTime + t, src = c.createBufferSource(), flt = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noiseBuf; flt.type = 'bandpass'; flt.Q.value = q; flt.frequency.setValueAtTime(f, at);
    if (f2) flt.frequency.exponentialRampToValueAtTime(f2, at + d);
    env(g, at, v, a, d); src.connect(flt).connect(g).connect(master);
    if (rev){ const s = c.createGain(); s.gain.value = rev; g.connect(s).connect(wet); }
    src.start(at, Math.random() * .5); src.stop(at + d + .05);
  }
  const bell = (f, t = 0, v = .14) => { tone(f, { t, d:1.1, v, rev:.5 }); tone(f * 2.76, { t, d:.35, v:v * .3 }); tone(f * 5.4, { t, d:.12, v:v * .12 }); };
  const clink = (t = 0, v = 1) => [2637, 3951, 5588, 7040].forEach((f, i) => tone(f * (1 + Math.random() * .01), { t, d:.5 - i * .1, v:.06 * v / (i + 1), rev:.45 }));
  const SFX = {
    ui:    () => tone(880, { d:.05, type:'triangle', v:.06 }),
    tick:  speed => { const v = speed > 14 ? .12 : .3; noise({ d:.025, v, f:2600 + Math.random() * 500, q:5 }); tone(1500 + Math.random() * 200, { d:.018, type:'triangle', v:v * .2 }); },
    windup:() => tone(190, { d:.32, type:'triangle', v:.08, bend:.75 }),
    whoosh:() => noise({ d:1.1, v:.16, f:350, f2:2200, q:.7, a:.08 }),
    stop:  () => { tone(150, { d:.2, v:.25, bend:.5 }); noise({ d:.04, v:.25, f:1800, q:3 }); },
    truth: () => [1047, 1319, 1568].forEach((f, i) => bell(f, i * .11)),
    dare:  () => { [[110, 165], [147, 220]].forEach(([a, b], i) => { const t = i * .2;
              tone(a, { t, d:.3, type:'sawtooth', v:.09 }); tone(b, { t, d:.3, type:'sawtooth', v:.07 }); tone(a / 2, { t, d:.35, v:.25, bend:.7 }); noise({ t, d:.08, v:.2, f:900, q:.8 }); });
              tone(440, { t:.42, d:.6, type:'square', v:.05, rev:.4 }); },
    secret:() => { [659, 523, 440].forEach((f, i) => tone(f, { t:i * .2, d:.9, type:'triangle', v:.12, rev:.7 })); noise({ t:.1, d:1.2, v:.05, f:5000, f2:9000, q:2, a:.3, rev:.5 }); },
    group: () => { [392, 494, 587, 784].forEach((f, i) => tone(f, { t:i * .07, d:.25, type:'square', v:.05 })); noise({ t:.3, d:.6, v:.1, f:1200, f2:700, q:.5, a:.1 }); },
    kiss:  () => { noise({ d:.09, v:.25, f:3200, f2:1400, q:2 }); tone(620, { t:.08, d:.5, type:'sine', v:.1, bend:1.5, rev:.5 }); tone(930, { t:.2, d:.6, type:'triangle', v:.07, rev:.6 }); },
    bump:  () => { clink(0); clink(.16, .8); noise({ t:.3, d:.25, v:.06, f:500, f2:250, q:3 }); },
    bumpall:() => { [523, 659, 784, 1047].forEach((f, i) => { tone(f, { t:i * .1, d:.3, type:'square', v:.05 }); tone(f, { t:i * .1, d:.3, type:'triangle', v:.08 }); });
              [523, 659, 784, 1047].forEach(f => tone(f, { t:.42, d:1.3, type:'triangle', v:.07, rev:.5 }));
              clink(.45); clink(.6, .9); clink(.78, .8);
              noise({ t:.4, d:1.6, v:.14, f:1300, f2:900, q:.4, a:.25 }); },
    levelup:() => { [196, 247, 294, 392].forEach((f, i) => tone(f, { t:i * .09, d:.6, type:'sawtooth', v:.06, rev:.4 })); noise({ d:1.4, v:.2, f:300, f2:3000, q:.6, a:.4 }); },
    count: last => tone(last ? 1400 : 1000, { d:.06, type:'square', v:.05 }),
    alarm: () => [0, .22, .44].forEach(t => { tone(1320, { t, d:.1, type:'square', v:.07 }); tone(990, { t:t + .1, d:.1, type:'square', v:.07 }); }),
    add:   () => { tone(660, { d:.08, type:'triangle', v:.08 }); tone(990, { t:.07, d:.12, type:'triangle', v:.08 }); },
  };
  const sfxFor = cls => SFX[(CATS[cls] && CATS[cls].sfx) || cls] || SFX.ui;
  const buzz = p => { if (st.sound && navigator.vibrate) try { navigator.vibrate(p); } catch {} };

  let lock = null;
  async function keepAwake(){ try { if (!lock && navigator.wakeLock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => lock = null); } } catch {} }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && st.spins) keepAwake(); });

  function confetti(n = 60){
    const cols = G.confetti || ['#f5b82e','#e8306f','#1ea5e6','#a83be0','#fff'];
    for (let i = 0; i < n; i++){
      const c = document.createElement('div'); c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw'; c.style.background = cols[i % cols.length];
      c.style.animationDuration = 1.5 + Math.random() * 1.8 + 's'; c.style.animationDelay = Math.random() * .4 + 's';
      document.body.appendChild(c); setTimeout(() => c.remove(), 4000);
    }
  }

  // ---------- wheel (painted once, turned on one canvas) ----------
  const wheelBmp = document.createElement('canvas');
  let geo = null;
  let view = { rot:0, ptr:0, win:-1, flash:0 };
  function buildWheel(){
    const box = $('wheelBox'), stage = $('stage'), slot = $('wheel');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const bb = box.getBoundingClientRect(), wb = slot.getBoundingClientRect();
    stage.width = Math.round(bb.width * dpr); stage.height = Math.round(bb.height * dpr);
    geo = { dpr, size: bb.width * dpr, cx: (wb.left - bb.left + wb.width / 2) * dpr, cy: (wb.top - bb.top + wb.height / 2) * dpr, r: wb.width / 2 * dpr };
    const gl = $('gloss').style;
    gl.left = (wb.left - bb.left) + 'px'; gl.top = (wb.top - bb.top) + 'px'; gl.width = wb.width + 'px'; gl.height = wb.height + 'px';
    const c = wheelBmp;
    c.width = c.height = Math.round(wb.width * dpr);
    const g = c.getContext('2d'), R = c.width / 2;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
    g.translate(R, R);
    const rad = d => (d - 90) * Math.PI / 180;
    SEGS.forEach((k, i) => {
      const [ca, cb] = CATS[k].grad;
      const a0 = rad(i * SEG), a1 = rad((i + 1) * SEG), am = rad(i * SEG + SEG / 2);
      const gr = g.createLinearGradient(0, 0, Math.cos(am) * R, Math.sin(am) * R);
      gr.addColorStop(0, cb); gr.addColorStop(1, ca);
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, a0, a1); g.closePath();
      g.fillStyle = gr; g.fill();
    });
    g.strokeStyle = G.divider || '#1a1222'; g.lineWidth = Math.max(2, R * .018);
    SEGS.forEach((_, i) => { const a = rad(i * SEG); g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * R, Math.sin(a) * R); g.stroke(); });
    // labels: shrink to fit the slice, or break onto two lines
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const maxW = 2 * R * .70 * Math.sin(Math.min(SEG, 120) / 2 * Math.PI / 180) * .78;
    SEGS.forEach((k, i) => {
      const name = CATS[k].label || CATS[k].name;
      let fs = R * .17, lines = [name];
      const setF = () => { g.font = `900 ${fs}px Rubik, Heebo, system-ui, sans-serif`; };
      const widest = () => Math.max(...lines.map(l => g.measureText(l).width));
      setF();
      if (widest() > maxW && name.includes(' ')){ const w = name.split(' '), h = Math.ceil(w.length / 2); lines = [w.slice(0, h).join(' '), w.slice(h).join(' ')]; }
      while (widest() > maxW && fs > R * .08){ fs *= .94; setF(); }
      const mid = i * SEG + SEG / 2, flip = mid > 90 && mid < 270;
      g.save();
      g.rotate(mid * Math.PI / 180);
      g.translate(0, -R * .70);
      if (flip) g.rotate(Math.PI);
      g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = fs * .25; g.shadowOffsetY = fs * .06;
      g.fillStyle = CATS[k].ink || '#fff';
      lines.forEach((l, j) => g.fillText(l, 0, (j - (lines.length - 1) / 2) * fs * 1.02));
      g.restore();
    });
    for (let i = 0; i < PEGS; i++){
      const a = rad(i * PEG + PEG / 2), r = R * .945, pr = R * .03;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      const pg = g.createRadialGradient(x - pr * .3, y - pr * .35, pr * .1, x, y, pr);
      pg.addColorStop(0, '#fff'); pg.addColorStop(.45, G.peg || '#f3d98a'); pg.addColorStop(1, G.pegDark || '#9a7313');
      g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = pr * .8; g.shadowOffsetY = pr * .3;
      g.beginPath(); g.arc(x, y, pr, 0, Math.PI * 2); g.fillStyle = pg; g.fill();
    }
    g.shadowColor = 'transparent';
    render();
  }
  function render(){
    if (!geo) return;
    const ctx = $('stage').getContext('2d'), { cx, cy, r, size } = geo;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, $('stage').width, $('stage').height);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(view.rot * Math.PI / 180);
    ctx.drawImage(wheelBmp, -r, -r, r * 2, r * 2);
    if (view.win >= 0){
      const a0 = (view.win * SEG - 90) * Math.PI / 180, a1 = a0 + SEG * Math.PI / 180;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, a1, a0 + Math.PI * 2); ctx.closePath();
      ctx.fillStyle = 'rgba(10,4,16,.55)'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, a0, a1); ctx.closePath();
      ctx.fillStyle = `rgba(255,255,255,${(.08 + .3 * view.flash).toFixed(3)})`; ctx.fill();
    }
    ctx.restore();
    const w = size * .042, h = size * .078, top = size * -.005;
    ctx.save(); ctx.translate(size / 2, top); ctx.rotate(view.ptr * Math.PI / 180);
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = size * .012; ctx.shadowOffsetY = size * .006;
    ctx.beginPath(); ctx.moveTo(-w, 0); ctx.lineTo(w, 0); ctx.lineTo(0, h); ctx.closePath();
    const pc = G.pointer || ['#ffe08a', '#e09a10'];
    const pg = ctx.createLinearGradient(-w, 0, w, h); pg.addColorStop(0, pc[0]); pg.addColorStop(1, pc[1]);
    ctx.fillStyle = pg; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.beginPath(); ctx.arc(0, size * .008, size * .012, 0, Math.PI * 2); ctx.fillStyle = '#fff3c4'; ctx.fill();
    ctx.restore();
    $('stage').dataset.rot = view.rot;
  }
  let rT; addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(buildWheel, 150); });
  try { document.fonts.ready.then(buildWheel); document.fonts.load('900 40px Rubik').then(buildWheel); } catch {}

  // ---------- photo ----------
  function setPhoto(){ $('hub').style.backgroundImage = `url("${store.get('photo', null) || 'face.jpg'}")`; }
  $('photoIn').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height), c = document.createElement('canvas');
      c.width = c.height = 500;
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 500, 500);
      const url = c.toDataURL('image/jpeg', .85);
      if (!store.set('photo', url)) $('hub').style.backgroundImage = `url("${url}")`; else setPhoto();
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(f);
  });
  $('photoReset').onclick = () => { store.del('photo'); setPhoto(); };

  // ---------- HUD ----------
  function renderHUD(){
    const inCycle = st.bumps % BUMP_EVERY;
    $('bumpTotal').textContent = st.bumps;
    $('bumpLeft').innerHTML = `עוד <b>${BUMP_EVERY - inCycle}</b> לבאמפ לכולם 🍻`;
    $('dots').innerHTML = Array.from({ length:BUMP_EVERY }, (_, i) => `<i class="${i < inCycle ? 'on' : ''}"></i>`).join('');
    const p = curPlayer();
    $('turn').innerHTML = (p ? `התור של <b>${esc(p)}</b> · ` : (G.needPlayers ? '<b>הוסיפו שמות ב⚙️ שחקנים</b> · ' : '')) + `סיבוב ${st.spins + 1}`;
    renderHeat();
  }

  // ---------- spin ----------
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const easeOut = u => 1 - Math.pow(1 - u, 4);
  const easeInOut = u => .5 - Math.cos(Math.PI * u) / 2;
  let ptr = 0, ptrV = 0, busy = false, hist = [];

  function spin(){
    if (spinning || busy) return;
    busy = spinning = true; $('hub').classList.add('spinning'); $('hint').textContent = '🎡 מסתובב…';
    keepAwake();
    view.win = -1; document.body.classList.add('turning');
    let idx = rnd() * SEGS.length | 0;
    if (hist.length >= 2 && hist[0] === idx && hist[1] === idx) idx = rnd() * SEGS.length | 0;
    hist.unshift(idx); hist.length = Math.min(hist.length, 2);
    const margin = Math.min(14, SEG * .16);
    const target = idx * SEG + margin + rnd() * (SEG - margin * 2);
    const from = rotation;
    let to = from - (from % 360) + (360 - target) % 360;
    while (to - from < 360 * (reduce ? 2 : 6)) to += 360;
    if (!reduce) to += 360 * (Math.random() * 2 | 0);
    const W = reduce ? 0 : 320, M = reduce ? 1400 : 4700, S = reduce ? 0 : 650;
    const wind = 12, over = reduce ? 0 : Math.min(4 + Math.random() * 4, margin * .6);
    let lastPeg = Math.floor((from + PEG / 2) / PEG), prevRot = from, t0 = null, released = false;
    buzz(25); if (W) SFX.windup();
    function frame(now){
      if (t0 === null) t0 = now;
      const t = now - t0;
      let rot;
      if (t >= W && !released){ released = true; SFX.whoosh(); }
      if (t < W) rot = from - wind * easeInOut(t / W);
      else if (t < W + M) rot = (from - wind) + (to + over - from + wind) * easeOut((t - W) / M);
      else if (t < W + M + S) rot = to + over * (1 - easeInOut((t - W - M) / S));
      else rot = to;
      const speed = Math.abs(rot - prevRot); prevRot = rot;
      view.rot = rot;
      const peg = Math.floor((rot + PEG / 2) / PEG);
      if (peg !== lastPeg){
        lastPeg = peg;
        ptr = -Math.min(30, 10 + speed * 1.2);
        if (speed < 28) SFX.tick(speed);
        if (speed < 6) buzz(6);
      }
      ptrV += (0 - ptr) * .35; ptrV *= .55; ptr += ptrV;
      view.ptr = ptr; render();
      if (t < W + M + S || Math.abs(ptr) > .3) return requestAnimationFrame(frame);
      rotation = to % 360; view.rot = rotation; view.ptr = 0; ptr = ptrV = 0;
      spinning = false; document.body.classList.remove('turning');
      SFX.stop(); buzz([30, 40, 30]);
      view.win = idx; const f0 = performance.now();
      (function flash(now){
        const u = (now - f0) / (reduce ? 300 : 1100);
        view.flash = reduce ? 1 : (1 - Math.cos(Math.min(u, 1) * Math.PI * 6)) / 2;
        render();
        if (u < 1 && view.win === idx) requestAnimationFrame(flash);
      })(f0);
      $('hint').textContent = `יצא: ${CATS[SEGS[idx]].name}!`;
      setTimeout(() => land(SEGS[idx]), reduce ? 300 : 1100);
    }
    requestAnimationFrame(frame);
  }
  $('hub').onclick = spin;
  $('stage').onclick = spin;
  document.addEventListener('keydown', e => {
    if (e.target.matches('input')) return;
    const open = !$('resultOv').classList.contains('hide');
    const others = ['setOv', 'newOv', 'review'].some(id => !$(id).classList.contains('hide'));
    if ((e.key === ' ' || e.key === 'Enter') && !open && !others){ e.preventDefault(); spin(); }
    else if (e.key === 'Enter' && open && !e.target.matches('button') && !$('sheet').classList.contains('picking')){ e.preventDefault(); nextTurn(); }
  });

  // ---------- result ----------
  function land(cat){
    const s = CATS[cat];
    const lvlBefore = heatLevel();
    st.spins++;
    if (HEAT && !st.heat && heatLevel() > lvlBefore) pendingLevel = heatLevel();
    const p = curPlayer();
    st.counts[cat] = (st.counts[cat] || 0) + 1;
    if (s.type === 'bump'){
      st.bumps++;
      const all = st.bumps % BUMP_EVERY === 0;
      if (all) st.counts.bumpall = (st.counts.bumpall || 0) + 1;
      current = { cat, secs:0 };
      save();
      return showResult(all ? 'bumpall' : cat, all ? 'באמפ לכולם!' : 'באמפ!', all ? '🍻🍻🍻' : '🍻', 0, `באמפ #${st.bumps}`, p);
    }
    if (s.type === 'topics'){
      const tops = TOPICS[cat].filter(t => activeItems(cat).some(i => i.tag === t.id));
      const three = shuffle(tops.slice()).slice(0, 3);
      current = { cat, secs:0, raw:null };
      save();
      showResult(cat, s.name, s.ask || 'על מה בא לך לספר?', 0, '', p);
      $('sheet').classList.add('picking');
      $('topics').innerHTML = three.map(t => `<button class="topic" data-id="${t.id}"><span class="e">${t.emoji}</span>${esc(t.name)}</button>`).join('');
      $('topics').classList.remove('hide');
      $('dislikeBtn').classList.add('hide');
      setTimeout(() => { const f = $('topics').querySelector('button'); if (f) f.focus({ preventScroll:true }); }, 60);
      return;
    }
    // a plain card, maybe by heat level, maybe for a pair
    let items = activeItems(cat), deckKey = cat;
    if (s.heat && HEAT){
      const L = heatLevel(), lv = items.filter(i => i.tag === L);
      if (lv.length){ items = lv; deckKey = cat + ':' + L; }
    }
    const raw = drawFrom(deckKey, items.map(i => i.text));
    const partner = s.pair ? pickPartner(p) : null;
    const { text, secs } = fill(raw, partner || (s.pair && !st.players.length ? G.pairFallback : null));
    current = { cat, secs, raw, partner };
    save();
    showResult(cat, s.name, text, secs, s.heat && HEAT ? HEAT.levels[heatLevel() - 1].emoji : '', p, partner);
  }
  $('topics').addEventListener('click', e => {
    const b = e.target.closest('.topic'); if (!b) return;
    const cat = current.cat, t = TOPICS[cat].find(x => x.id === b.dataset.id);
    const raw = drawFrom(cat + ':' + t.id, activeItems(cat).filter(i => i.tag === t.id).map(i => i.text));
    current = { cat, secs:0, raw };
    $('sheet').classList.remove('picking');
    $('topics').classList.add('hide');
    $('rNum').textContent = t.emoji + ' ' + t.name; $('rNum').classList.remove('hide');
    $('rTxt').textContent = fill(raw).text;
    $('dislikeBtn').classList.remove('hide');
    sfxFor(cat)(); buzz(30);
    setTimeout(() => $('nextBtn').focus({ preventScroll:true }), 50);
  });

  function showResult(cls, title, text, secs, num, p, partner){
    const s = CATS[cls] || {};
    $('sheet').className = 'sheet ' + cls;
    $('topics').classList.add('hide');
    $('rCat').textContent = title;
    $('rNum').textContent = num || ''; $('rNum').classList.toggle('hide', !num);
    let who = '';
    if (cls === 'bumpall') who = `באמפ מספר ${st.bumps}, כולם שותים!`;
    else if (s.group) who = G.groupWho || 'כולם משחקים';
    else if (s.pair && p && partner) who = `${p} ${s.pairIcon || '❤️'} ${partner}`;
    else if (p) who = 'ל' + p;
    $('rWho').textContent = who;
    $('rTxt').textContent = text;
    $('rTxt').classList.toggle('big', cls === 'bump' || cls === 'bumpall');
    $('rRule').textContent = s.rule || '';
    $('rRule').classList.toggle('hide', !s.rule);
    $('dislikeBtn').classList.toggle('hide', !CARD_KEYS.includes(cls));
    $('dislikeBtn').disabled = false; $('dislikeBtn').textContent = '👎 לא אהבתי, להוריד מהמשחק';
    stopTimer();
    $('timerBox').classList.toggle('hide', !secs);
    $('clock').textContent = secs ? secs + 'ש׳' : ''; $('clock').classList.remove('done');
    $('resultOv').classList.remove('hide');
    renderHUD();
    sfxFor(cls)();
    if (cls === 'bumpall' || cls === 'levelup'){ confetti(90); buzz([100, 60, 100, 60, 300]); }
    else if (s.type === 'bump'){ confetti(25); buzz([60, 40, 60]); }
    else buzz(40);
    setTimeout(() => $('nextBtn').focus({ preventScroll:true }), 50);
  }

  function nextTurn(){
    if ($('resultOv').classList.contains('hide')) return;
    if (pendingLevel){
      // the night just got hotter: announce it before closing
      const L = pendingLevel, lv = HEAT.levels[L - 1]; pendingLevel = null;
      showResult('levelup', lv.emoji + ' ' + lv.name, lv.msg || '', 0, `רמה ${L} מתוך ${HEAT.levels.length}`, null);
      return;
    }
    busy = false; SFX.ui(); $('hub').classList.remove('spinning'); view.win = -1; render();
    stopTimer();
    $('resultOv').classList.add('hide');
    if (st.players.length) st.turn = (st.turn + 1) % st.players.length;
    save(); renderHUD(); $('hint').textContent = '👆 לחצו על מרכז הגלגל';
  }
  $('nextBtn').onclick = nextTurn;

  let tH = null, tLeft = 0;
  function stopTimer(){ clearInterval(tH); tH = null; $('timerBtn').textContent = '▶ טיימר'; }
  $('timerBtn').onclick = () => {
    if (tH) return stopTimer();
    tLeft = current.secs; $('clock').classList.remove('done'); $('timerBtn').textContent = '⏸ עצירה';
    $('clock').textContent = tLeft + 'ש׳';
    tH = setInterval(() => {
      tLeft--; $('clock').textContent = tLeft + 'ש׳';
      if (tLeft > 0) SFX.count(tLeft <= 3);
      if (tLeft <= 0){ stopTimer(); $('clock').textContent = 'זמן!'; $('clock').classList.add('done'); SFX.alarm(); buzz([200, 100, 200]); }
    }, 1000);
  };

  // ---------- settings ----------
  function renderSettings(){
    $('chips').innerHTML = st.players.map((n, i) =>
      `<span class="chip">${esc(n)}<button data-i="${i}" aria-label="הסרה">✕</button></span>`).join('') ||
      `<span class="small">${G.needPlayers ? 'בגרסה הזאת כדאי להכניס לפחות 2 שמות' : 'אין שחקנים, משחקים חופשי 🙂'}</span>`;
    $('stats').innerHTML = G.slices.map(s => `<div><b>${s.type === 'bump' ? st.bumps : (st.counts[s.key] || 0)}</b>${esc(s.name)}</div>`).join('');
    $('stats').style.gridTemplateColumns = `repeat(${G.slices.length},1fr)`;
    $('soundOpt').checked = st.sound;
  }
  $('settingsBtn').onclick = () => { renderSettings(); $('setOv').classList.remove('hide'); };
  $('setClose').onclick = () => { $('setOv').classList.add('hide'); renderHUD(); };
  $('addForm').addEventListener('submit', e => {
    e.preventDefault();
    const n = $('pName').value.trim(); if (!n || st.players.includes(n)) return;
    st.players.push(n); $('pName').value = ''; $('pName').focus(); save(); renderSettings(); renderHUD(); SFX.add();
  });
  $('chips').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    st.players.splice(+b.dataset.i, 1); st.turn = 0; save(); renderSettings(); renderHUD();
  });
  function setSound(on, quiet){
    st.sound = on; save();
    $('muteBtn').textContent = on ? '🔊' : '🔇'; $('muteBtn').setAttribute('aria-label', on ? 'השתקה' : 'הפעלת צלילים');
    $('soundOpt').checked = on;
    if (on && !quiet) SFX.add();
  }
  $('soundOpt').onchange = () => setSound($('soundOpt').checked);
  $('muteBtn').onclick = () => setSound(!st.sound);

  // ---------- review mode ----------
  let rvCat = CARD_KEYS[0], genBusy = false;
  const tagLabel = (cat, tag) => {
    if (tag == null) return '';
    if (CATS[cat].type === 'topics'){ const t = TOPICS[cat].find(x => x.id === tag); return t ? t.emoji + ' ' : ''; }
    return HEAT ? HEAT.levels[tag - 1].emoji + ' ' : '';
  };
  function renderReview(){
    if ($('review').classList.contains('hide')) return;
    const all = Object.values(edits);
    $('rvTabs').style.gridTemplateColumns = `repeat(${CARD_KEYS.length},1fr)`;
    $('rvTabs').innerHTML = CARD_KEYS.map(k => {
      const gone = all.filter(e => e.type === 'remove' && e.cat === k).length;
      return `<button class="tab ${k === rvCat ? 'on' : ''}" data-k="${k}" style="--c:${CATS[k].color}">${esc(CATS[k].name)}<small>${activeList(k).length} בגלגל${gone ? ` · ${gone} 👎` : ''}</small></button>`;
    }).join('');
    const gone = new Set(all.filter(e => e.type === 'remove' && e.cat === rvCat).map(e => e.text));
    const added = all.filter(e => e.type === 'add' && e.cat === rvCat).sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const row = (t, tag, isNew) => `<div class="rv-item ${gone.has(t) ? 'gone' : ''}"><p>${tagLabel(rvCat, tag)}${esc(t.replace(/\{p\}/g, '‹שם›').replace(/\s*\[(\d+)\]\s*$/, ' · $1 שנ׳'))}${isNew ? '<span class="new">חדש</span>' : ''}</p>
      <button data-t="${encodeURIComponent(t)}" aria-label="${gone.has(t) ? 'להחזיר' : 'להוריד'}">${gone.has(t) ? '↩️' : '👎'}</button></div>`;
    $('rvList').innerHTML = (added.length ? `<div class="rv-sep">✨ חדשות (${added.length})</div>` + added.map(e => row(e.text, e.tag ?? null, true)).join('') + '<div class="rv-sep">כל השאר</div>' : '')
      + BASE[rvCat].map(i => row(i.text, i.tag, false)).join('');
    const pending = all.filter(e => e.type === 'remove' && !e.replaced).length;
    if (!genBusy){
      $('rvGen').disabled = !pending;
      $('rvGen').textContent = pending ? `✨ לכתוב ${pending} שאלות חדשות במקום` : '✨ אין שאלות שמחכות להחלפה';
    }
  }
  $('rvTabs').addEventListener('click', e => { const b = e.target.closest('.tab'); if (!b) return; rvCat = b.dataset.k; SFX.ui(); renderReview(); $('rvList').scrollTop = 0; });
  $('rvList').addEventListener('click', async e => {
    const b = e.target.closest('button[data-t]'); if (!b) return;
    const t = decodeURIComponent(b.dataset.t), id = rmId(rvCat, t);
    try {
      if (edits[id]) await dropEdit(id);
      else { await putEdit(id, { type:'remove', cat:rvCat, text:t, tag:tagOf(rvCat, t), replaced:false, ts:Date.now() }); SFX.ui(); }
    } catch { $('rvStatus').textContent = 'לא הצלחתי לשמור. בדקו חיבור ונסו שוב.'; }
  });
  $('reviewBtn').onclick = () => { $('review').classList.remove('hide'); $('rvStatus').textContent = ''; SFX.ui(); renderReview(); };
  $('rvClose').onclick = () => { $('review').classList.add('hide'); renderHUD(); };
  $('dislikeBtn').onclick = async () => {
    if (!current || !current.raw) return;
    $('dislikeBtn').disabled = true; $('dislikeBtn').textContent = '✓ ירדה מהמשחק. אפשר להחליף אותה ב📝 הרצה';
    try { await putEdit(rmId(current.cat, current.raw), { type:'remove', cat:current.cat, text:current.raw, tag:tagOf(current.cat, current.raw), replaced:false, ts:Date.now() }); } catch {}
  };

  $('rvGen').onclick = async () => {
    const pendingList = Object.entries(edits).filter(([, e]) => e.type === 'remove' && !e.replaced);
    if (!pendingList.length || genBusy) return;
    let sample = null;
    try { sample = window.claude && await window.claude.use('sample'); } catch {}
    if (!sample){ $('rvStatus').textContent = 'השאלות שסימנתם כבר ירדו מהמשחק. כדי לקבל חדשות, כתבו לClaude בצ׳אט "תחליף את מה שסימנתי".'; return; }
    const need = {}; pendingList.forEach(([, e]) => { need[e.cat] = (need[e.cat] || 0) + 1; });
    const cats = CARD_KEYS.filter(k => need[k]);
    const pick = (arr, n) => shuffle(arr.slice()).slice(0, n);
    const tagRule = k => CATS[k].type === 'topics'
      ? `Each card has a topic tag. Topic ids: ${TOPICS[k].map(t => t.id + ' (' + t.name + ')').join(', ')}. Give each new card the SAME topic as the card it replaces.`
      : CATS[k].heat && HEAT ? 'Each card has a heat tag 1-3 (1 warm-up flirty, 2 spicy, 3 most explicit). Give each new card the SAME heat as the card it replaces.' : 'Use tag null.';
    const prompt = [
      G.gen.intro,
      'Write NEW cards in exactly the same voice as the liked examples: natural spoken Israeli Hebrew, the way a friend would text it, slang is fine.',
      'Rules: address the player in the generic masculine (אתה). No slashes like את/ה. No long dashes. No parentheses. Emoji only rarely. Short, at most about 15 words.',
      'Make them juicy, sexual is fine, but keep everything between consenting adults who are playing. Nothing about minors, nothing non-consensual, nothing that harms anyone.',
      '{p} stands for another player\'s name. Attach Hebrew prefix letters directly to it, like ל{p}. Do not use he/she pronouns about {p}.',
      'Cards may end with [N] to show an N-second timer.',
      G.gen.style || '',
      'Do not repeat or paraphrase any existing card.',
      '',
      ...cats.map(k => [
        `== ${k} (${CATS[k].name}) ==`, CATS[k].desc || '', tagRule(k),
        'Liked examples:', ...pick(activeItems(k), 15).map(i => '- ' + i.text + (i.tag != null ? '  [tag: ' + i.tag + ']' : '')),
        'Rejected by the group, avoid cards like these:', ...pendingList.filter(([, e]) => e.cat === k).map(([, e]) => '- ' + e.text + (e.tag != null ? '  [tag: ' + e.tag + ']' : '')),
        'All existing cards (do not repeat):', activeList(k).join(' | '),
        `Write exactly ${need[k]} new ${k} card(s).`, ''
      ].join('\n')),
      'Reply with only a JSON object whose keys are the categories asked for, each an array of {"tag": ..., "text": "..."} objects.'
    ].join('\n');
    genBusy = true; $('rvGen').disabled = true; $('rvGen').textContent = '✍️ כותב שאלות חדשות…';
    $('rvStatus').textContent = 'זה לוקח בערך חצי דקה';
    try {
      const res = await sample.json(prompt, { cache:false });
      let added = 0;
      for (const k of cats){
        const mine = pendingList.filter(([, e]) => e.cat === k);
        const raw = res && Array.isArray(res[k]) ? res[k] : [];
        const validTag = tag => CATS[k].type === 'topics' ? TOPICS[k].some(t => t.id === tag) : CATS[k].heat ? [1, 2, 3].includes(tag) : true;
        const arr = raw.map((x, i) => {
          const text = typeof x === 'string' ? x : x && typeof x.text === 'string' ? x.text : '';
          let tag = x && x.tag !== undefined ? (CATS[k].heat ? +x.tag : x.tag) : null;
          if (!validTag(tag)) tag = mine[i] ? mine[i][1].tag ?? null : null;
          return { text:text.trim(), tag };
        }).filter(x => x.text).slice(0, need[k]);
        for (let i = 0; i < arr.length; i++){
          await putEdit('a-' + k + '-' + hash(arr[i].text), { type:'add', cat:k, text:arr[i].text, tag:arr[i].tag, ts:Date.now() + i });
          added++;
        }
        for (const [id, e] of mine.slice(0, arr.length)) await putEdit(id, { ...e, replaced:true });
      }
      $('rvStatus').textContent = added ? `✨ נוספו ${added} שאלות חדשות. הן מסומנות "חדש" למעלה, ואפשר לתת גם להן 👎` : 'לא התקבלו שאלות. נסו שוב.';
      if (added){ SFX.add(); rvCat = cats[0]; $('rvList').scrollTop = 0; }
    } catch (e) {
      const code = e && e.code;
      $('rvStatus').textContent = code === 'not_granted' || code === 'sampling_disabled' ? 'בלי אישור לClaude אי אפשר לכתוב חדשות כאן. כתבו לי בצ׳אט "תחליף את מה שסימנתי".'
        : code === 'rate_limited' ? 'יותר מדי בקשות כרגע. נסו שוב עוד כמה דקות.'
        : code === 'cancelled' ? '' : 'משהו השתבש. נסו שוב.';
    } finally { genBusy = false; renderReview(); }
  };

  // ---------- new game ----------
  function newGame(clearPlayers){
    Object.assign(st, { bumps:0, spins:0, turn:0, counts:emptyCounts(), heat:null, partners:{} });
    if (clearPlayers) st.players = [];
    decks = {}; store.set('decks', decks); hist = []; pendingLevel = null;
    rotation = rnd() * 360; view.rot = rotation; view.win = -1; render();
    save(); renderHUD();
    $('newOv').classList.add('hide');
    $('hint').textContent = '🎲 משחק חדש! לחצו על מרכז הגלגל';
    SFX.add(); confetti(30);
    if (clearPlayers){ renderSettings(); $('setOv').classList.remove('hide'); setTimeout(() => $('pName').focus(), 100); }
  }
  const openNew = () => { if (!spinning) { $('setOv').classList.add('hide'); $('newOv').classList.remove('hide'); SFX.ui(); } };
  $('newBtn').onclick = openNew;
  $('newBtn2').onclick = openNew;
  $('newSame').onclick = () => newGame(false);
  $('newOther').onclick = () => newGame(true);
  $('newCancel').onclick = () => $('newOv').classList.add('hide');
  document.querySelectorAll('.overlay').forEach(o => o.addEventListener('click', e => {
    if (e.target !== o) return;
    if (o.id === 'setOv' || o.id === 'newOv'){ o.classList.add('hide'); renderHUD(); }
  }));

  buildWheel(); setPhoto(); renderHUD(); setSound(st.sound, true);
})();
