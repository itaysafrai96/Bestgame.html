'use strict';
// ===== מנוע סאונד: אפקטים מסונתזים + מוזיקת רקע פרוצדורלית =====
const Sound = (() => {
  let ctx = null, master, musicBus, musicFader, sfxBus, reverb, noiseBuf;
  let musicOn = true, sfxOn = true;
  const MUSIC_VOL = 0.42, SFX_VOL = 0.75;
  const lastPlay = {};
  let theme = null, pendingTheme = null, step = 0, nextTime = 0, timer = null;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = 0.9;
    master.connect(comp); comp.connect(ctx.destination);
    reverb = ctx.createConvolver(); reverb.buffer = makeIR(3.2, 2.6); reverb.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? MUSIC_VOL : 0; musicBus.connect(master);
    const ms = ctx.createGain(); ms.gain.value = 0.45; musicBus.connect(ms); ms.connect(reverb);
    musicFader = ctx.createGain(); musicFader.gain.value = 1; musicFader.connect(musicBus);
    sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? SFX_VOL : 0; sfxBus.connect(master);
    const ss = ctx.createGain(); ss.gain.value = 0.18; sfxBus.connect(ss); ss.connect(reverb);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    timer = setInterval(scheduler, 25);
  }
  function makeIR(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  // ---- אבני בניין ----
  function osc(type, freq, t, dur, vol, dest, o = {}) {
    const s = ctx.createOscillator(); s.type = type;
    s.frequency.setValueAtTime(freq, t);
    if (o.slide) s.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
    if (o.detune) s.detune.value = o.detune;
    const g = ctx.createGain(); const a = o.a ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let last = s;
    if (o.filter) {
      const f = ctx.createBiquadFilter(); f.type = o.filter; f.frequency.setValueAtTime(o.ff, t);
      if (o.ffEnd) f.frequency.exponentialRampToValueAtTime(o.ffEnd, t + dur);
      f.Q.value = o.q ?? 1; s.connect(f); last = f;
    }
    last.connect(g); g.connect(dest);
    s.start(t); s.stop(t + dur + 0.05);
  }
  function noise(t, dur, vol, dest, o = {}) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = o.type || 'lowpass';
    f.frequency.setValueAtTime(o.f || 2000, t);
    if (o.fEnd) f.frequency.exponentialRampToValueAtTime(o.fEnd, t + dur);
    f.Q.value = o.q || 1;
    const g = ctx.createGain(); const a = o.a || 0.002;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  // קול מוזיקלי עם ADSR פשוט
  function voice(type, f, t, dur, vol, o = {}) {
    const a = o.a ?? 0.01, r = o.r ?? 0.12;
    const s = ctx.createOscillator(); s.type = type; s.frequency.value = f;
    if (o.detune) s.detune.value = o.detune;
    let lfo = null;
    if (o.vib) {
      lfo = ctx.createOscillator(); lfo.frequency.value = o.vibRate || 5.2;
      const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(o.vib, t + Math.min(0.4, dur));
      lfo.connect(lg); lg.connect(s.frequency); lfo.start(t); lfo.stop(t + dur + r + 0.1);
    }
    const g = ctx.createGain();
    const hold = Math.max(a, dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    if (o.decay) g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * o.decay), t + hold);
    else g.gain.setValueAtTime(vol, t + hold);
    g.gain.linearRampToValueAtTime(0, t + hold + r);
    let n = s;
    if (o.filter) {
      const fl = ctx.createBiquadFilter(); fl.type = o.filter; fl.frequency.setValueAtTime(o.ff, t); fl.Q.value = o.q ?? 0.8;
      if (o.ffEnd) fl.frequency.exponentialRampToValueAtTime(o.ffEnd, t + hold + r);
      s.connect(fl); n = fl;
    }
    n.connect(g); g.connect(o.dest || musicFader);
    s.start(t); s.stop(t + hold + r + 0.05);
  }
  const N = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // ---- אפקטים ----
  const SFX = {
    click(t) { osc('sine', 950, t, 0.07, 0.14, sfxBus, { slide: 620 }); },
    hover(t) { osc('sine', 1500, t, 0.03, 0.03, sfxBus); },
    open(t) { osc('triangle', 380, t, 0.18, 0.1, sfxBus, { slide: 760 }); noise(t, 0.25, 0.04, sfxBus, { type: 'bandpass', f: 1200, fEnd: 4200, a: 0.05 }); },
    close(t) { osc('triangle', 700, t, 0.15, 0.08, sfxBus, { slide: 350 }); },
    error(t) { osc('square', 140, t, 0.2, 0.07, sfxBus, { filter: 'lowpass', ff: 900 }); osc('square', 132, t + 0.1, 0.2, 0.07, sfxBus, { filter: 'lowpass', ff: 900 }); },
    step(t) { noise(t, 0.09, 0.09, sfxBus, { f: 380 + Math.random() * 200 }); },
    hoof(t) { noise(t, 0.06, 0.12, sfxBus, { f: 600, type: 'lowpass' }); osc('sine', 160, t, 0.06, 0.1, sfxBus, { slide: 90 }); },
    coin(t) { [1318, 1976, 2637].forEach((f, i) => osc('square', f, t + i * 0.06, 0.22, 0.045, sfxBus, { filter: 'lowpass', ff: 6000 })); },
    pickup(t) { [660, 880, 1320].forEach((f, i) => osc('triangle', f, t + i * 0.05, 0.25, 0.1, sfxBus)); },
    select(t) { osc('triangle', 520, t, 0.08, 0.1, sfxBus); osc('triangle', 780, t + 0.05, 0.1, 0.08, sfxBus); },
    order(t) { osc('triangle', 330, t, 0.09, 0.1, sfxBus); osc('triangle', 440, t + 0.06, 0.1, 0.09, sfxBus); },
    swing(t) { noise(t, 0.2, 0.22, sfxBus, { type: 'bandpass', f: 700, fEnd: 3600, q: 2.2, a: 0.06 }); },
    hit(t) { noise(t, 0.14, 0.38, sfxBus, { f: 2200, fEnd: 300 }); osc('sine', 150, t, 0.16, 0.45, sfxBus, { slide: 45 }); },
    clang(t) {
      [523, 1342, 2210, 3150].forEach((f, i) => osc('sine', f * rand(0.96, 1.04), t, 0.55 - i * 0.1, 0.11 / (i * 0.5 + 1), sfxBus));
      noise(t, 0.06, 0.28, sfxBus, { type: 'highpass', f: 3000 });
    },
    bone(t) { for (let i = 0; i < 3; i++) osc('square', rand(700, 1300), t + i * 0.025, 0.05, 0.06, sfxBus, { filter: 'bandpass', ff: 1500, q: 4 }); },
    miss(t) { noise(t, 0.22, 0.14, sfxBus, { type: 'bandpass', f: 1800, fEnd: 600, q: 3, a: 0.04 }); },
    arrow(t) { noise(t, 0.28, 0.16, sfxBus, { type: 'bandpass', f: 4200, fEnd: 1400, q: 3, a: 0.03 }); osc('triangle', 240, t, 0.13, 0.15, sfxBus, { slide: 110 }); },
    arrowHit(t) { noise(t, 0.06, 0.28, sfxBus, { f: 2600 }); osc('sine', 320, t, 0.07, 0.2, sfxBus, { slide: 120 }); },
    magic(t) { for (let i = 0; i < 5; i++) osc('sine', 600 + i * 230, t + i * 0.03, 0.45, 0.06, sfxBus, { slide: 1300 + i * 320, a: 0.02 }); },
    cast(t) { noise(t, 0.6, 0.12, sfxBus, { type: 'bandpass', f: 400, fEnd: 3200, q: 4, a: 0.25 }); [392, 494, 587].forEach((f, i) => osc('sine', f, t + i * 0.08, 0.6, 0.05, sfxBus, { a: 0.1 })); },
    fireball(t) { noise(t, 0.6, 0.28, sfxBus, { type: 'bandpass', f: 250, fEnd: 1600, q: 1, a: 0.25 }); },
    explosion(t) { noise(t, 1.4, 0.85, sfxBus, { f: 1400, fEnd: 50, a: 0.004 }); osc('sine', 95, t, 0.9, 0.9, sfxBus, { slide: 28 }); },
    lightning(t) {
      for (let i = 0; i < 7; i++) noise(t + i * 0.025 + Math.random() * 0.02, 0.05, 0.45, sfxBus, { type: 'highpass', f: 2200 });
      noise(t + 0.06, 2.0, 0.6, sfxBus, { f: 420, fEnd: 40, a: 0.06 });
    },
    heal(t) { [523, 659, 784, 1047, 1319].forEach((f, i) => osc('triangle', f, t + i * 0.07, 0.9, 0.07, sfxBus, { a: 0.02 })); },
    buff(t) { [392, 523, 659, 784].forEach((f, i) => osc('sine', f, t + i * 0.05, 0.5, 0.07, sfxBus, { a: 0.02 })); noise(t, 0.4, 0.05, sfxBus, { type: 'highpass', f: 5000 }); },
    debuff(t) { [600, 450, 340, 250].forEach((f, i) => osc('sawtooth', f, t + i * 0.06, 0.35, 0.04, sfxBus, { filter: 'lowpass', ff: 1200 })); },
    death(t) { osc('sawtooth', 280, t, 0.65, 0.1, sfxBus, { slide: 55, filter: 'lowpass', ff: 1100 }); noise(t, 0.35, 0.18, sfxBus, { f: 700 }); },
    roar(t) { osc('sawtooth', 130, t, 1.1, 0.25, sfxBus, { slide: 55, filter: 'lowpass', ff: 700, a: 0.08 }); noise(t, 1.0, 0.25, sfxBus, { type: 'bandpass', f: 500, fEnd: 200, q: 1.5, a: 0.1 }); },
    howl(t) { osc('sine', 500, t, 1.1, 0.12, sfxBus, { slide: 850, a: 0.25 }); osc('sine', 503, t, 1.1, 0.08, sfxBus, { slide: 700, a: 0.25 }); },
    gallop(t) { for (let i = 0; i < 6; i++) SFX.hoof(t + i * 0.11 + (i % 2) * 0.03); },
    levelup(t) {
      [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36], [784, 0.52], [1047, 0.62]].forEach(([f, d]) => {
        osc('sawtooth', f, t + d, 0.5, 0.07, sfxBus, { filter: 'lowpass', ff: 2400, a: 0.02 });
        osc('square', f / 2, t + d, 0.4, 0.03, sfxBus, { filter: 'lowpass', ff: 1200 });
      });
    },
    victory(t) {
      [[392, 0], [523, 0.18], [659, 0.36], [784, 0.54], [659, 0.8], [784, 0.95], [1047, 1.15]].forEach(([f, d], i) =>
        osc('sawtooth', f, t + d, i === 6 ? 1.6 : 0.35, 0.08, sfxBus, { filter: 'lowpass', ff: 2600, a: 0.02 }));
      [0, 0.54, 1.15].forEach((d) => osc('sine', 98, t + d, 0.6, 0.4, sfxBus, { slide: 50 }));
    },
    defeat(t) { [[392, 0], [370, 0.4], [349, 0.8], [262, 1.2]].forEach(([f, d], i) => osc('sawtooth', f, t + d, i === 3 ? 2 : 0.5, 0.07, sfxBus, { filter: 'lowpass', ff: 1200, a: 0.05 })); },
    build(t) { for (let i = 0; i < 4; i++) { noise(t + i * 0.16, 0.07, 0.35, sfxBus, { type: 'bandpass', f: 1000, q: 5 }); osc('sine', 190, t + i * 0.16, 0.09, 0.28, sfxBus, { slide: 90 }); } },
    recruit(t) { [0, 0.15, 0.3].forEach((d) => osc('sine', 110, t + d, 0.16, 0.3, sfxBus, { slide: 55 })); osc('sawtooth', 294, t + 0.45, 0.6, 0.06, sfxBus, { filter: 'lowpass', ff: 1400, a: 0.05 }); osc('sawtooth', 440, t + 0.45, 0.6, 0.05, sfxBus, { filter: 'lowpass', ff: 1400, a: 0.05 }); },
    newday(t) { osc('sine', 880, t, 1.4, 0.08, sfxBus); osc('sine', 1318, t + 0.02, 1.2, 0.05, sfxBus); osc('sine', 1760, t + 0.04, 0.9, 0.03, sfxBus); },
    newweek(t) { [523, 659, 784, 1047].forEach((f, i) => osc('triangle', f, t + i * 0.1, 1.2, 0.07, sfxBus)); },
    horn(t) {
      osc('sawtooth', 147, t, 1.4, 0.16, sfxBus, { filter: 'lowpass', ff: 600, ffEnd: 1400, a: 0.15 });
      osc('sawtooth', 220, t + 0.05, 1.3, 0.1, sfxBus, { filter: 'lowpass', ff: 700, ffEnd: 1500, a: 0.2 });
      osc('sine', 70, t, 0.6, 0.4, sfxBus, { slide: 40 });
    },
    flag(t) { noise(t, 0.4, 0.12, sfxBus, { type: 'bandpass', f: 1500, fEnd: 700, q: 1, a: 0.1 }); SFX.pickup(t + 0.1); },
    page(t) { noise(t, 0.18, 0.12, sfxBus, { type: 'highpass', f: 2500, a: 0.04 }); },
    drink(t) { for (let i = 0; i < 4; i++) osc('sine', rand(300, 600), t + i * 0.08, 0.08, 0.1, sfxBus, { slide: rand(700, 1000) }); },
  };

  function play(name, delay = 0) {
    if (!ctx || !sfxOn || !SFX[name]) return;
    const now = ctx.currentTime;
    if (lastPlay[name] && now - lastPlay[name] < 0.035 && delay === 0) return;
    lastPlay[name] = now;
    SFX[name](now + delay + 0.005);
  }

  // ---- מוזיקה ----
  // כל נושא: מקצב, מהלך אקורדים (MIDI), סולם למנגינה, וסגנון תזמור
  const THEMES = {
    title: { bpm: 66, style: 'epic', prog: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]], scale: [69, 71, 72, 74, 76, 77, 79, 81] },
    map: { bpm: 86, style: 'pastoral', prog: [[50, 54, 57], [55, 59, 62], [47, 50, 54], [57, 61, 64], [50, 54, 57], [55, 59, 62], [52, 55, 59], [57, 61, 64]], scale: [74, 76, 78, 79, 81, 83, 85, 86] },
    town: { bpm: 100, style: 'town', prog: [[53, 57, 60], [48, 52, 55], [50, 53, 57], [46, 50, 53], [53, 57, 60], [46, 50, 53], [48, 52, 55], [48, 52, 55]], scale: [77, 79, 81, 82, 84, 86, 88, 89] },
    battle: { bpm: 140, style: 'battle', prog: [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52], [50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]], scale: [74, 76, 77, 79, 81, 82, 85, 86] },
    boss: { bpm: 150, style: 'battle', prog: [[45, 48, 52], [46, 50, 53], [45, 48, 52], [44, 47, 51], [45, 48, 52], [41, 45, 48], [43, 46, 50], [44, 47, 51]], scale: [69, 70, 72, 74, 76, 77, 80, 81] },
  };
  // יצירת מנגינה דטרמיניסטית לכל נושא
  const MELODY_RHYTHMS = [
    [0, 4, 8, 12], [0, 6, 8, 12, 14], [0, 3, 4, 8, 10, 12], [0, 8, 12], [0, 2, 4, 6, 8, 12], [0, 4, 6, 8],
  ];
  for (const key in THEMES) {
    const th = THEMES[key]; const r = mulberry32(key.length * 9973 + th.bpm);
    const bars = [];
    let idx = 3;
    for (let b = 0; b < 8; b++) {
      const src = b >= 4 && b < 6 ? bars[b - 4] : null; // חזרה על מוטיב
      if (src) { bars.push(src.map((n) => ({ ...n, m: n.m + (b === 5 ? 0 : 0) }))); continue; }
      const rhythm = MELODY_RHYTHMS[Math.floor(r() * MELODY_RHYTHMS.length)];
      const chord = th.prog[b].map((m) => m % 12);
      const notes = [];
      rhythm.forEach((s, i) => {
        const next = i + 1 < rhythm.length ? rhythm[i + 1] : 16;
        idx = clamp(idx + Math.floor(r() * 5) - 2, 0, th.scale.length - 1);
        // על הפעמה החזקה - העדף צליל אקורד
        if (s % 8 === 0) {
          for (let k = 0; k < th.scale.length; k++) {
            const c1 = clamp(idx + k, 0, th.scale.length - 1), c2 = clamp(idx - k, 0, th.scale.length - 1);
            if (chord.includes(th.scale[c1] % 12)) { idx = c1; break; }
            if (chord.includes(th.scale[c2] % 12)) { idx = c2; break; }
          }
        }
        notes.push({ s, len: next - s, m: th.scale[idx] });
      });
      if (b === 7) notes.length = Math.min(notes.length, 2), notes[notes.length - 1].len = 16 - notes[notes.length - 1].s;
      bars.push(notes);
    }
    th.melody = bars;
  }

  function scheduler() {
    if (!ctx) return;
    if (!theme) { nextTime = ctx.currentTime + 0.05; return; }
    while (nextTime < ctx.currentTime + 0.14) {
      scheduleStep(theme, step, nextTime);
      nextTime += 60 / theme.bpm / 4;
      step++;
    }
  }
  function drum(kind, t, vol = 1) {
    const d = musicFader;
    if (kind === 'kick') { osc('sine', 140, t, 0.32, 0.55 * vol, d, { slide: 42 }); }
    else if (kind === 'timp') { osc('sine', 98, t, 0.9, 0.42 * vol, d, { slide: 70, a: 0.008 }); noise(t, 0.2, 0.08 * vol, d, { f: 400 }); }
    else if (kind === 'snare') { noise(t, 0.16, 0.22 * vol, d, { type: 'bandpass', f: 1800, q: 0.7 }); osc('triangle', 210, t, 0.08, 0.15 * vol, d, { slide: 140 }); }
    else if (kind === 'hat') { noise(t, 0.04, 0.06 * vol, d, { type: 'highpass', f: 7000 }); }
    else if (kind === 'tom') { osc('sine', 180 * vol, t, 0.25, 0.35, d, { slide: 90 }); }
    else if (kind === 'tamb') { noise(t, 0.07, 0.05 * vol, d, { type: 'highpass', f: 6000 }); }
  }
  function scheduleStep(th, st, t) {
    const bar = Math.floor(st / 16) % 8, s = st % 16;
    const chord = th.prog[bar];
    const spb = 60 / th.bpm, six = spb / 4;
    const mel = th.melody[bar].find((n) => n.s === s);
    const style = th.style;
    if (style === 'pastoral') {
      if (s === 0) chord.forEach((m, i) => { voice('sawtooth', N(m), t, spb * 4 - 0.1, 0.022, { a: 0.6, r: 0.8, detune: i % 2 ? 7 : -7, filter: 'lowpass', ff: 900 }); });
      if (s === 0 || s === 8) voice('triangle', N(chord[0] - 12), t, spb * 1.8, 0.12, { a: 0.02, r: 0.3, decay: 0.4 });
      if (s % 2 === 0) { const arp = [0, 1, 2, 1, 0, 2, 1, 2][s / 2]; voice('triangle', N(chord[arp] + 12), t, 0.25, 0.05, { a: 0.003, r: 0.5, decay: 0.05 }); }
      if (mel) voice('sine', N(mel.m), t, six * mel.len * 0.92, 0.075, { a: 0.06, r: 0.25, vib: 4, filter: 'lowpass', ff: 3000 });
      if (s === 12 && bar % 2 === 1) drum('tamb', t, 0.6);
    } else if (style === 'town') {
      if (s === 0) chord.forEach((m) => voice('triangle', N(m), t, spb * 4 - 0.1, 0.03, { a: 0.3, r: 0.5 }));
      if (s % 4 === 0) voice('triangle', N(chord[0] - 12 + (s === 8 ? 7 : 0)), t, spb * 0.8, 0.12, { a: 0.01, r: 0.15, decay: 0.3 });
      if (s % 2 === 0) { const arp = [0, 2, 1, 2][(s / 2) % 4]; voice('square', N(chord[arp] + 12), t, 0.12, 0.022, { a: 0.003, r: 0.15, filter: 'lowpass', ff: 2200, decay: 0.1 }); }
      if (mel) { voice('sine', N(mel.m), t, six * mel.len * 0.85, 0.07, { a: 0.005, r: 0.6, decay: 0.15 }); voice('sine', N(mel.m) * 2.01, t, six * mel.len * 0.5, 0.018, { a: 0.005, r: 0.3, decay: 0.05 }); }
      if (s % 4 === 2) drum('tamb', t); if (s === 0 || s === 8) drum('kick', t, 0.4);
    } else if (style === 'battle') {
      // אוסטינטו בס
      if (s % 2 === 0) voice('sawtooth', N(chord[0] - 12 + (s % 8 === 6 ? 12 : 0)), t, six * 1.4, 0.07, { a: 0.005, r: 0.06, filter: 'lowpass', ff: 700, decay: 0.3 });
      // מיתרים סטקטו
      if (s % 4 === 0 || s % 4 === 3) chord.forEach((m, i) => voice('sawtooth', N(m + 12), t, six * 0.7, 0.025, { a: 0.004, r: 0.06, detune: i * 5 - 5, filter: 'lowpass', ff: 2200 }));
      if (s === 0 || s === 10) drum('kick', t); if (s === 4 || s === 12) drum('snare', t); drum('hat', t, s % 2 ? 0.5 : 1);
      if (bar === 7 && s >= 8) drum('tom', t, 1 + (15 - s) * 0.06);
      if (s === 0 && bar % 4 === 0) drum('timp', t, 1.2);
      // מנגינת נחושת בחצי מהירות
      if (mel && (bar % 2 === 0 || mel.s % 8 === 0)) {
        voice('sawtooth', N(mel.m - 12), t, six * mel.len * 0.9, 0.045, { a: 0.04, r: 0.12, vib: 3, filter: 'lowpass', ff: 1500 });
        voice('sawtooth', N(mel.m - 12), t, six * mel.len * 0.9, 0.03, { a: 0.04, r: 0.12, detune: 9, filter: 'lowpass', ff: 1200 });
      }
    } else if (style === 'epic') {
      if (s === 0) chord.forEach((m, i) => { voice('sine', N(m), t, spb * 4, 0.05, { a: 1.0, r: 1.2, vib: 3 }); voice('triangle', N(m + 12), t, spb * 4, 0.018, { a: 1.2, r: 1.2, vib: 4, detune: i * 4 }); });
      if (s === 0) voice('sawtooth', N(chord[0] - 24), t, spb * 4, 0.05, { a: 0.4, r: 1, filter: 'lowpass', ff: 300 });
      if (s === 0) drum('timp', t, 1.2); if (s === 12 && bar % 2) { drum('timp', t, 0.6); drum('timp', t + six, 0.8); }
      if (mel) voice('sawtooth', N(mel.m - 12), t, six * mel.len * 0.95, 0.04, { a: 0.15, r: 0.5, vib: 3.5, filter: 'lowpass', ff: 1300 });
    }
  }
  function music(name) {
    if (!ctx) { pendingTheme = name; return; }
    const th = THEMES[name] || null;
    if (th === theme) return;
    const now = ctx.currentTime;
    musicFader.gain.cancelScheduledValues(now);
    musicFader.gain.setValueAtTime(musicFader.gain.value, now);
    musicFader.gain.linearRampToValueAtTime(0, now + 0.6);
    setTimeout(() => {
      theme = th; step = 0; nextTime = ctx.currentTime + 0.05;
      musicFader.gain.cancelScheduledValues(ctx.currentTime);
      musicFader.gain.setValueAtTime(0, ctx.currentTime);
      musicFader.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.2);
    }, 650);
  }
  function unlock() {
    init();
    if (pendingTheme) { const p = pendingTheme; pendingTheme = null; music(p); }
  }
  function toggleMusic() { musicOn = !musicOn; if (ctx) musicBus.gain.setTargetAtTime(musicOn ? MUSIC_VOL : 0, ctx.currentTime, 0.1); return musicOn; }
  function toggleSfx() { sfxOn = !sfxOn; if (ctx) sfxBus.gain.setTargetAtTime(sfxOn ? SFX_VOL : 0, ctx.currentTime, 0.05); return sfxOn; }
  return { init, unlock, play, music, toggleMusic, toggleSfx, get musicOn() { return musicOn; }, get sfxOn() { return sfxOn; } };
})();
