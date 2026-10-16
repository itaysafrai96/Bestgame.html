'use strict';
// ===== מערכת חלקיקים, טקסט צף, רעידות מסך =====
const FX = {
  parts: [], texts: [], rings: [], bolts: [], shake: 0, flash: 0, flashColor: '#fff',
  reset() { this.parts.length = 0; this.texts.length = 0; this.rings.length = 0; this.bolts.length = 0; this.shake = 0; this.flash = 0; },
};
function addPart(p) {
  if (FX.parts.length > 1400) return;
  p.life = p.life ?? 1; p.max = p.life; p.size = p.size ?? 3; p.g = p.g ?? 0; p.drag = p.drag ?? 0; p.z = p.z ?? 0; p.vz = p.vz ?? 0;
  FX.parts.push(p);
}
// התפרצות חלקיקים
function burst(x, y, n, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), sp = rand(o.spMin ?? 20, o.sp ?? 120);
    addPart({
      x: x + rand(-(o.spread || 0), o.spread || 0), y: y + rand(-(o.spread || 0), o.spread || 0) * 0.6,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.55, z: o.z ?? 10, vz: rand(o.vzMin ?? 20, o.vz ?? 120),
      g: o.g ?? 300, life: rand(o.lifeMin ?? 0.3, o.life ?? 0.8), size: rand(o.sizeMin ?? 1.5, o.size ?? 3.5),
      color: Array.isArray(o.color) ? pick(o.color) : o.color || '#fff', add: o.add, shape: o.shape || 'circle', drag: o.drag ?? 1.5, grow: o.grow || 0,
    });
  }
}
function floatText(x, y, text, color = '#fff', size = 16, o = {}) {
  FX.texts.push({ x, y, text, color, size, life: o.life || 1.2, max: o.life || 1.2, vy: o.vy ?? -38, bold: o.bold, crit: o.crit });
}
function ring(x, y, r0, r1, color, life = 0.5, width = 3) { FX.rings.push({ x, y, r0, r1, color, life, max: life, width }); }
function bolt(pts, color = '#bfe8ff', life = 0.3, width = 3) { FX.bolts.push({ pts, color, life, max: life, width }); }
function jagged(x1, y1, x2, y2, segs = 10, amp = 18) {
  const pts = [[x1, y1]];
  for (let i = 1; i < segs; i++) {
    const t = i / segs, nx = -(y2 - y1), ny = x2 - x1, l = Math.hypot(nx, ny) || 1;
    const off = rand(-amp, amp) * Math.sin(t * Math.PI);
    pts.push([lerp(x1, x2, t) + nx / l * off, lerp(y1, y2, t) + ny / l * off]);
  }
  pts.push([x2, y2]);
  return pts;
}
function updateFX(dt) {
  for (let i = FX.parts.length - 1; i >= 0; i--) {
    const p = FX.parts[i];
    p.life -= dt;
    if (p.life <= 0) { FX.parts.splice(i, 1); continue; }
    const k = Math.max(0, 1 - p.drag * dt);
    p.vx *= k; p.vy *= k;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vz -= p.g * dt; p.z += p.vz * dt;
    if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6; }
    p.size += p.grow * dt;
  }
  for (let i = FX.texts.length - 1; i >= 0; i--) { const t = FX.texts[i]; t.life -= dt; t.y += t.vy * dt; t.vy *= 1 - 1.5 * dt; if (t.life <= 0) FX.texts.splice(i, 1); }
  for (let i = FX.rings.length - 1; i >= 0; i--) { const r = FX.rings[i]; r.life -= dt; if (r.life <= 0) FX.rings.splice(i, 1); }
  for (let i = FX.bolts.length - 1; i >= 0; i--) { const b = FX.bolts[i]; b.life -= dt; if (b.life <= 0) FX.bolts.splice(i, 1); }
  FX.shake = Math.max(0, FX.shake - dt * 30);
  FX.flash = Math.max(0, FX.flash - dt * 2.5);
}
function drawFX(c) {
  // טבעות
  for (const r of FX.rings) {
    const t = 1 - r.life / r.max;
    c.strokeStyle = rgba(r.color, (1 - t) * 0.9); c.lineWidth = r.width * (1 - t) + 0.5;
    c.beginPath(); c.ellipse(r.x, r.y, lerp(r.r0, r.r1, easeOut(t)), lerp(r.r0, r.r1, easeOut(t)) * 0.55, 0, 0, TAU); c.stroke();
  }
  // חלקיקים
  for (const p of FX.parts) {
    const a = clamp(p.life / p.max, 0, 1);
    const y = p.y - p.z;
    if (p.add) c.globalCompositeOperation = 'lighter';
    if (p.shape === 'smoke') {
      c.fillStyle = rgba(p.color, a * 0.35); circ(c, p.x, y, p.size); c.fill();
    } else if (p.shape === 'spark') {
      c.strokeStyle = rgba(p.color, a); c.lineWidth = p.size * 0.5;
      c.beginPath(); c.moveTo(p.x, y); c.lineTo(p.x - p.vx * 0.04, y - (p.vy - p.vz) * 0.04); c.stroke();
    } else {
      c.fillStyle = rgba(p.color, a); c.beginPath(); c.arc(p.x, y, Math.max(0.3, p.size * (0.4 + a * 0.6)), 0, TAU); c.fill();
    }
    if (p.add) c.globalCompositeOperation = 'source-over';
  }
  // ברקים
  for (const b of FX.bolts) {
    const a = b.life / b.max;
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineJoin = 'round';
    for (const [w, al] of [[b.width * 4, 0.15], [b.width * 2, 0.35], [b.width * 0.7, 1]]) {
      c.strokeStyle = w === b.width * 0.7 ? `rgba(255,255,255,${a})` : rgba(b.color, al * a);
      c.lineWidth = w; c.beginPath(); c.moveTo(b.pts[0][0], b.pts[0][1]);
      for (const p of b.pts) c.lineTo(p[0], p[1]);
      c.stroke();
    }
    c.restore();
  }
}
function drawTexts(c, scale = 1) {
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const t of FX.texts) {
    const a = clamp(t.life / t.max * 2, 0, 1);
    const pop = t.crit ? 1 + Math.max(0, (t.life - t.max + 0.2) * 3) : 1;
    c.font = `${t.bold ? 900 : 700} ${t.size * pop / scale}px Heebo, sans-serif`;
    c.lineWidth = 3.5 / scale; c.strokeStyle = `rgba(0,0,0,${a * 0.85})`;
    c.strokeText(t.text, t.x, t.y);
    c.fillStyle = rgba(t.color, a); c.fillText(t.text, t.x, t.y);
  }
}
