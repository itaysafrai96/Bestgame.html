'use strict';
// ===== ציור פרוצדורלי של דמויות, יצורים ואובייקטים עם אנימציה =====
const HAS_FILTER = (() => { try { const c = document.createElement('canvas').getContext('2d'); return typeof c.filter === 'string'; } catch (e) { return false; } })();

function ell(c, x, y, rx, ry, fill) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU); if (fill) { c.fillStyle = fill; c.fill(); } }
function circ(c, x, y, r, fill) { c.beginPath(); c.arc(x, y, Math.max(0.1, r), 0, TAU); if (fill) { c.fillStyle = fill; c.fill(); } }
function glow(c, x, y, r, color, alpha = 0.5) {
  c.save(); c.globalCompositeOperation = 'lighter';
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha)); g.addColorStop(1, rgba(color, 0));
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); c.restore();
}

// a = { t, walk, moving, atk(-1|0..1), face(1|-1), flash, fly, dead(0..1), seed }
function drawFigure(c, L, x, y, s, a) {
  c.save();
  c.translate(x, y);
  const dead = a.dead || 0;
  let hover = 0;
  if (a.fly) hover = (14 + Math.sin(a.t * 3 + (a.seed || 0)) * 3) * (1 - dead);
  const wide = L.kind === 'dragon' ? 2.4 : (L.kind === 'rider' || L.kind === 'wolf' || L.kind === 'griffin') ? 1.6 : L.big ? 1.3 : 1;
  if (!a.noShadow) ell(c, 0, 0, 12 * s * wide * (hover ? 0.8 : 1), 4.2 * s * (hover ? 0.8 : 1), `rgba(0,0,0,${0.32 * (1 - dead * 0.6)})`);
  c.translate(0, -hover * s);
  c.scale(s, s);
  if (dead > 0) { c.globalAlpha *= 1 - Math.max(0, dead - 0.6) / 0.4 * 0.85; c.rotate(-a.face * Math.min(1, dead * 1.6) * 1.35); }
  if (L.glow && dead <= 0) glow(c, 0, -20, 34 * (L.big ? 1.4 : 1), L.glow, 0.28 + Math.sin(a.t * 3) * 0.06);
  if (a.flash > 0 && HAS_FILTER) c.filter = `brightness(${1 + a.flash * 2.2}) saturate(${1 - a.flash * 0.6})`;
  if (a.tint && HAS_FILTER) c.filter = a.tint;
  switch (L.kind) {
    case 'human': drawHumanoid(c, L, a); break;
    case 'ghost': drawGhost(c, L, a); break;
    case 'wolf': drawBeast(c, L, a, 'wolf'); break;
    case 'griffin': drawBeast(c, L, a, 'griffin'); break;
    case 'rider': drawBeast(c, { body: L.horse }, a, 'horse'); c.save(); c.translate(-1 * a.face, -19); drawHumanoid(c, { ...L, seated: true }, a); c.restore(); break;
    case 'dragon': drawDragon(c, L, a); break;
  }
  c.restore();
}

function armAngle(atk, rest, wind, strike) {
  if (atk < 0) return rest;
  if (atk < 0.45) return lerp(rest, wind, easeOut(atk / 0.45));
  if (atk < 0.6) return lerp(wind, strike, (atk - 0.45) / 0.15);
  return lerp(strike, rest, (atk - 0.6) / 0.4);
}

function drawHumanoid(c, L, a) {
  const t = a.t, f = a.face || 1;
  const sc = L.big ? 1.35 : L.small ? 0.78 : 1;
  c.save();
  c.scale(f * sc, sc);
  const ph = a.walk || 0, mv = a.moving ? 1 : 0;
  const sw = Math.sin(ph) * mv;
  const bob = mv ? Math.abs(Math.sin(ph)) * 1.6 : Math.sin(t * 2.2 + (a.seed || 0)) * 0.6;
  const atk = a.atk ?? -1;
  const skin = L.bone ? '#e8e2cf' : L.skin || '#e0b48a';
  const body = L.body, dark = shade(body, -0.4), light = shade(body, 0.25);
  c.lineCap = 'round'; c.lineJoin = 'round';

  // גלימה מאחור
  if (L.cape) {
    const flutter = Math.sin(t * 4 + (a.seed || 0)) * 2 + (mv ? 3 : 0);
    c.fillStyle = L.cape; c.beginPath();
    c.moveTo(-3, -27 - bob); c.quadraticCurveTo(-11 - flutter, -14, -9 - flutter * 1.4, L.seated ? -8 : 0);
    c.lineTo(-1, L.seated ? -8 : -1); c.lineTo(3, -26 - bob); c.closePath(); c.fill();
  }
  // כנפיים
  if (L.wings) {
    const flap = Math.sin(t * 7) * 0.45;
    for (const [side, col] of [[-1, shade(L.wings, -0.18)], [1, L.wings]]) {
      c.save(); c.translate(-3, -25 - bob); c.rotate(-0.5 + flap * side * 0.6 - (side > 0 ? 0.25 : 0));
      c.fillStyle = col; c.strokeStyle = 'rgba(200,190,150,.6)'; c.lineWidth = 0.6;
      c.beginPath(); c.moveTo(0, 0);
      c.bezierCurveTo(-8, -18, -24, -22, -30, -16);
      c.lineTo(-24, -12); c.lineTo(-27, -7); c.lineTo(-20, -5); c.lineTo(-22, 0); c.lineTo(-13, 0);
      c.quadraticCurveTo(-6, 4, 0, 0); c.fill(); c.stroke();
      c.restore();
    }
  }
  // רגליים / גלימה
  if (!L.seated) {
    if (L.robe) {
      const g = c.createLinearGradient(-8, 0, 8, 0); g.addColorStop(0, dark); g.addColorStop(0.5, body); g.addColorStop(1, shade(body, -0.15));
      c.fillStyle = g; c.beginPath();
      c.moveTo(-5.5, -24); c.lineTo(-8.5 + sw * 1.5, 0); c.quadraticCurveTo(0, 1.5, 8.5 + sw * 1.5, 0); c.lineTo(5.5, -24); c.closePath(); c.fill();
      if (L.trim) { c.strokeStyle = L.trim; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-8.2 + sw * 1.5, -1); c.quadraticCurveTo(0, 0.5, 8.2 + sw * 1.5, -1); c.stroke(); }
    } else {
      c.strokeStyle = L.bone ? '#d8d2bf' : shade(body, -0.5); c.lineWidth = L.bone ? 2 : 3.6;
      for (const [hx, k] of [[-2.2, 1], [2.2, -1]]) {
        const fx = hx + sw * 5 * k;
        c.beginPath(); c.moveTo(hx, -13 - bob); c.quadraticCurveTo(hx + sw * 2 * k + 1.5, -6, fx, 0); c.stroke();
        ell(c, fx + 1.5, 0, 2.6, 1.3, L.bone ? '#cfc8b4' : '#2b1d14');
      }
    }
  }
  c.translate(0, -bob);
  if (L.hunch) { c.translate(0, -13); c.rotate(0.3); c.translate(0, 13); }
  // יד אחורית
  const backAng = armAngle(atk, 0.25 + sw * 0.4, 0.6, -0.3);
  c.save(); c.translate(-1.5, -25); c.rotate(L.weapon === 'none' ? -1.3 : backAng);
  c.strokeStyle = L.armor ? shade(body, -0.2) : L.bone ? '#d8d2bf' : shade(body, -0.25); c.lineWidth = L.bone ? 1.8 : 3;
  c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 9); c.stroke(); circ(c, 0, 9.5, 1.8, skin); c.restore();
  // גו
  if (L.bone && !L.robe) {
    c.strokeStyle = '#e2dcc8'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(0, -27); c.lineTo(0, -13); c.stroke();
    for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(0, -24 + i * 2.8, 5 - i * 0.6, 1.2, 0, 0, Math.PI); c.stroke(); }
    ell(c, 0, -13, 4, 1.8, '#d8d2bf');
  } else {
    const g = c.createLinearGradient(-6, -28, 6, -13); g.addColorStop(0, light); g.addColorStop(1, dark);
    c.fillStyle = g; c.beginPath();
    c.moveTo(-6, -27); c.quadraticCurveTo(0, -29.5, 6, -27); c.lineTo(5.2, -13); c.quadraticCurveTo(0, -11.5, -5.2, -13); c.closePath(); c.fill();
    if (L.armor) { c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-2, -26); c.lineTo(-2.5, -15); c.stroke(); circ(c, -4.5, -26, 3, shade(body, 0.1)); circ(c, 4.5, -26, 3, shade(body, 0.1)); }
    if (L.trim) { c.fillStyle = L.trim; c.fillRect(-5.4, -16, 10.8, 2.4); if (L.robe) c.fillRect(-1, -27, 2, 11); }
  }
  // מגן
  if (L.shield) {
    c.save(); c.translate(3.5, -19); c.rotate(atk >= 0.45 && atk < 0.7 ? -0.2 : 0.05);
    const sg = c.createLinearGradient(-5, -7, 5, 7); sg.addColorStop(0, shade(L.shield, 0.3)); sg.addColorStop(1, shade(L.shield, -0.35));
    c.fillStyle = sg; c.beginPath(); c.moveTo(-5, -7); c.lineTo(5, -7); c.lineTo(5, 1); c.quadraticCurveTo(0, 9, -5, 1); c.closePath(); c.fill();
    c.strokeStyle = '#d9c27a'; c.lineWidth = 1; c.stroke();
    c.restore();
  }
  // ראש
  const hx = 0.6, hy = -33.5;
  if (L.hair && !L.helm) { ell(c, hx - 1.2, hy - 0.5, 5.6, 5.8, L.hair); }
  if (L.hood) { c.fillStyle = L.hood; c.beginPath(); c.arc(hx, hy, 6.6, Math.PI * 0.8, Math.PI * 2.25); c.lineTo(hx - 6, hy + 6); c.closePath(); c.fill(); }
  circ(c, hx, hy, 5, skin);
  if (L.bone) { circ(c, hx + 2.2, hy - 0.5, 1.3, '#1a1010'); circ(c, hx - 0.6, hy - 0.5, 1.1, '#1a1010'); c.fillStyle = '#1a1010'; c.fillRect(hx + 0.5, hy + 2.4, 3, 0.8); if (L.glow) { circ(c, hx + 2.2, hy - 0.5, 0.8, L.glow); } }
  else { circ(c, hx + 2.6, hy - 0.6, 0.85, '#1a1010'); }
  if (L.ears) { c.fillStyle = skin; c.beginPath(); c.moveTo(hx - 3, hy - 1); c.lineTo(hx - 9, hy - 4); c.lineTo(hx - 3, hy + 2); c.fill(); }
  if (L.helm) {
    c.fillStyle = L.helm; c.beginPath(); c.arc(hx, hy - 0.5, 5.6, Math.PI, TAU); c.lineTo(hx + 5.6, hy + 1); c.lineTo(hx - 5.6, hy + 1); c.closePath(); c.fill();
    c.fillStyle = shade(L.helm, -0.3); c.fillRect(hx + 2.5, hy - 1, 1.2, 4);
    if (L.armor) { c.fillStyle = L.trim || '#c33'; c.beginPath(); c.moveTo(hx - 1, hy - 6); c.quadraticCurveTo(hx - 7, hy - 10, hx - 8, hy - 3); c.lineTo(hx - 2, hy - 5); c.fill(); }
  }
  if (L.crown) { c.fillStyle = '#e8c04a'; c.beginPath(); c.moveTo(hx - 5, hy - 4); for (let i = 0; i <= 4; i++) { c.lineTo(hx - 5 + i * 2.5, hy - (i % 2 ? 7 : 10)); } c.lineTo(hx + 5, hy - 4); c.closePath(); c.fill(); }
  if (L.halo) { c.strokeStyle = '#ffe680'; c.lineWidth = 1.4; c.beginPath(); c.ellipse(hx, hy - 8.5, 5.5, 1.6, 0, 0, TAU); c.stroke(); glow(c, hx, hy - 8.5, 10, '#fff1a0', 0.4); }
  // יד קדמית + נשק
  drawWeaponArm(c, L, a, atk, sw, skin);
  c.restore();
}

function drawWeaponArm(c, L, a, atk, sw, skin) {
  const w = L.weapon || 'sword';
  const armCol = L.armor ? shade(L.body, 0.05) : L.bone ? '#e2dcc8' : shade(L.body, -0.1);
  c.lineCap = 'round';
  if (w === 'bow') {
    const pull = atk >= 0 && atk < 0.5 ? (atk / 0.5) * 8 : 0;
    c.strokeStyle = armCol; c.lineWidth = 2.8;
    c.beginPath(); c.moveTo(1.5, -25); c.lineTo(10, -24); c.stroke(); circ(c, 10.5, -24, 1.8, skin);
    c.strokeStyle = '#6b3f1d'; c.lineWidth = 1.8; c.beginPath(); c.arc(7, -24, 11, -1.15, 1.15); c.stroke();
    const tx = 7 + Math.cos(1.15) * 11, ty1 = -24 - Math.sin(1.15) * 11, ty2 = -24 + Math.sin(1.15) * 11;
    c.strokeStyle = 'rgba(240,230,210,.8)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(tx, ty1); c.lineTo(tx - 4 - pull, -24); c.lineTo(tx, ty2); c.stroke();
    if (pull > 0) { c.strokeStyle = '#d9c9a0'; c.lineWidth = 1; c.beginPath(); c.moveTo(tx - 4 - pull, -24); c.lineTo(tx + 10 - pull, -24); c.stroke(); }
    return;
  }
  if (w === 'spear' || w === 'lance') {
    const lower = atk >= 0 ? 1 : (L.seated ? 0.85 : 0);
    const thrust = atk >= 0.35 && atk < 0.75 ? Math.sin((atk - 0.35) / 0.4 * Math.PI) * 9 : 0;
    const ang = lerp(-Math.PI / 2 + 0.08, -0.05, lower);
    c.save(); c.translate(5 + thrust * 0.6, -20); c.rotate(ang);
    const len = w === 'lance' ? 40 : 36;
    c.strokeStyle = '#7a5530'; c.lineWidth = w === 'lance' ? 2.4 : 1.6; c.beginPath(); c.moveTo(-14, 0); c.lineTo(len - 14, 0); c.stroke();
    c.fillStyle = '#dfe4ea'; c.beginPath(); c.moveTo(len - 14, -2.2); c.lineTo(len - 6, 0); c.lineTo(len - 14, 2.2); c.fill();
    if (w === 'lance') { c.fillStyle = L.trim || '#3b6fb6'; c.beginPath(); c.moveTo(len - 20, 0); c.lineTo(len - 27, -6 - Math.sin(a.t * 8) * 1.5); c.lineTo(len - 27, 0); c.fill(); }
    c.restore();
    c.strokeStyle = armCol; c.lineWidth = 3; c.beginPath(); c.moveTo(1.5, -25); c.lineTo(5 + thrust * 0.6, -20); c.stroke(); circ(c, 5 + thrust * 0.6, -20, 1.8, skin);
    return;
  }
  if (w === 'staff') {
    const raise = atk >= 0 ? Math.sin(Math.min(1, atk) * Math.PI) : 0;
    c.save(); c.translate(6, -21); c.rotate(-0.08 + raise * 0.7);
    c.strokeStyle = '#5a3a20'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(0, 20); c.lineTo(0, -16); c.stroke();
    const gc = L.glow || '#9fd8ff';
    circ(c, 0, -17.5, 2.6 + raise * 1.2, gc); glow(c, 0, -17.5, 10 + raise * 12, gc, 0.7);
    c.restore();
    c.strokeStyle = armCol; c.lineWidth = 3; c.beginPath(); c.moveTo(1.5, -25); c.lineTo(6, -21); c.stroke(); circ(c, 6, -21, 1.8, skin);
    return;
  }
  if (w === 'none') {
    const ang = armAngle(atk, -1.3 + Math.sin(a.t * 2) * 0.1, -2.0, -0.6);
    c.save(); c.translate(1.5, -25); c.rotate(ang); c.strokeStyle = armCol; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 10); c.stroke(); circ(c, 0, 10.5, 2, skin); c.restore();
    return;
  }
  // חרב / אלה / גרזן / חרב לוהטת
  const ang = armAngle(atk, -0.45 + sw * 0.2 + Math.sin(a.t * 2) * 0.04, 2.6, -1.6);
  c.save(); c.translate(1.5, -25); c.rotate(ang);
  c.strokeStyle = armCol; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 9); c.stroke();
  c.translate(0, 9.5);
  if (w === 'sword' || w === 'flamesword') {
    c.strokeStyle = '#7a5530'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -1.5); c.lineTo(0, 2); c.stroke();
    c.strokeStyle = '#c9a24a'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-3, 2); c.lineTo(3, 2); c.stroke();
    const bl = w === 'flamesword' ? 18 : 15;
    const bg = c.createLinearGradient(-1.5, 0, 1.5, 0); bg.addColorStop(0, '#f4f7fa'); bg.addColorStop(1, '#8e98a4');
    c.fillStyle = w === 'flamesword' ? '#fff2c0' : bg;
    c.beginPath(); c.moveTo(-1.4, 2); c.lineTo(-1.2, bl); c.lineTo(0, bl + 3); c.lineTo(1.2, bl); c.lineTo(1.4, 2); c.fill();
    if (w === 'flamesword') glow(c, 0, bl * 0.6, 14, L.glow || '#ffb347', 0.75);
    if (atk >= 0.45 && atk < 0.65) { // קשת תנועה
      c.restore(); c.save(); c.translate(1.5, -25);
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 3;
      c.beginPath(); c.arc(0, 0, 24, -2.2, 0.9); c.stroke();
    }
  } else if (w === 'club') {
    c.strokeStyle = '#6b4a2b'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, -1); c.lineTo(0, 12); c.stroke();
    circ(c, 0, 13, 3.6, '#5a3d22'); circ(c, -1, 12, 1, '#3d2a16');
  } else if (w === 'axe') {
    c.strokeStyle = '#6b4a2b'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(0, -1); c.lineTo(0, 13); c.stroke();
    c.fillStyle = '#b8c0c8'; c.beginPath(); c.moveTo(0, 9); c.quadraticCurveTo(7, 9, 7, 14); c.quadraticCurveTo(3, 12, 0, 13.5); c.fill();
  }
  circ(c, 0, 0, 1.9, skin);
  c.restore();
}

function drawGhost(c, L, a) {
  const t = a.t, f = a.face || 1;
  c.save(); c.scale(f, 1);
  const g = c.createLinearGradient(0, -36, 0, 0);
  g.addColorStop(0, rgba(L.body, 0.9)); g.addColorStop(1, rgba(L.body, 0));
  c.fillStyle = g; c.beginPath();
  c.moveTo(-7, -26); c.quadraticCurveTo(0, -42, 7, -26);
  for (let i = 0; i <= 6; i++) { const x = 8 - i * 2.8; c.lineTo(x, -4 + Math.sin(t * 6 + i) * 3 - (i % 2) * 4); }
  c.closePath(); c.fill();
  const lunge = a.atk >= 0 ? Math.sin(a.atk * Math.PI) : 0;
  c.strokeStyle = rgba(L.body, 0.7); c.lineWidth = 2.5;
  c.beginPath(); c.moveTo(4, -24); c.quadraticCurveTo(10 + lunge * 8, -24 + Math.sin(t * 3) * 3, 14 + lunge * 12, -20); c.stroke();
  circ(c, 1, -30, 1.5, '#e8fbff'); circ(c, 4, -30, 1.5, '#e8fbff');
  glow(c, 2.5, -30, 8, '#9fe8ff', 0.6);
  c.restore();
}

function drawBeast(c, L, a, type) {
  const t = a.t, f = a.face || 1;
  c.save(); c.scale(f, 1);
  const ph = a.walk || 0, mv = a.moving ? 1 : 0;
  const atk = a.atk ?? -1;
  const lunge = atk >= 0.3 && atk < 0.8 ? Math.sin((atk - 0.3) / 0.5 * Math.PI) : 0;
  c.translate(lunge * 6, 0);
  const horse = type === 'horse', griffin = type === 'griffin';
  const bodyY = horse ? -19 : -14, rx = horse ? 14 : griffin ? 12 : 12.5, ry = horse ? 7.5 : 6.5;
  const legLen = horse ? 18 : 13;
  const bob = mv ? Math.abs(Math.sin(ph)) * 1.5 : Math.sin(t * 2) * 0.4;
  const col = L.body, dk = shade(col, -0.35);
  c.lineCap = 'round';
  // רגליים
  const legs = [[-rx + 4, 0, dk], [rx - 4, Math.PI, dk], [-rx + 6, Math.PI, col], [rx - 2, 0, col]];
  for (const [lx, off, lc] of legs) {
    const swing = Math.sin(ph + off) * 6 * mv;
    c.strokeStyle = lc; c.lineWidth = horse ? 3.2 : 2.6;
    c.beginPath(); c.moveTo(lx, bodyY + 2 - bob); c.lineTo(lx + swing * 0.5, bodyY + legLen * 0.55 - bob); c.lineTo(lx + swing, 0); c.stroke();
    if (horse) ell(c, lx + swing + 0.5, -0.5, 2, 1.2, '#2b2018');
    if (griffin && lx > 0) { c.strokeStyle = '#e0b030'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(lx + swing, 0); c.lineTo(lx + swing + 3, 0); c.stroke(); }
  }
  // זנב
  c.strokeStyle = griffin ? col : horse ? '#d8cfc0' : col; c.lineWidth = horse ? 3 : 3.5;
  c.beginPath(); c.moveTo(-rx + 1, bodyY - 2 - bob);
  c.quadraticCurveTo(-rx - 8, bodyY - 6 + Math.sin(t * 3) * 3, -rx - 12, bodyY + (horse ? 8 : -4) + Math.sin(t * 3 + 1) * 3); c.stroke();
  if (griffin) circ(c, -rx - 12, bodyY - 4 + Math.sin(t * 3 + 1) * 3, 2.5, dk);
  // כנף אחורית
  const flap = griffin ? Math.sin(t * (a.fly ? 9 : 2)) * (a.fly ? 0.7 : 0.15) : 0;
  if (griffin) drawWing(c, -2, bodyY - 4 - bob, shade(L.wing, -0.2), flap - 0.3, 1);
  // גוף
  const g = c.createLinearGradient(0, bodyY - ry, 0, bodyY + ry);
  g.addColorStop(0, shade(col, 0.2)); g.addColorStop(1, dk);
  ell(c, 0, bodyY - bob, rx, ry, g);
  if (L.belly) ell(c, 1, bodyY + 3 - bob, rx * 0.7, ry * 0.45, L.belly);
  // ראש
  c.save(); c.translate(rx - 2, bodyY - 4 - bob);
  const nod = atk >= 0 ? -lunge * 0.4 : Math.sin(t * 2) * 0.05;
  c.rotate(nod);
  if (horse) {
    c.fillStyle = col; c.beginPath(); c.moveTo(-3, 2); c.lineTo(4, -12); c.lineTo(9, -12); c.lineTo(14, -6); c.lineTo(12, -3); c.lineTo(6, -6); c.lineTo(3, 4); c.closePath(); c.fill();
    c.strokeStyle = '#d8cfc0'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(-2, 0); c.lineTo(4, -12); c.stroke();
    circ(c, 9, -9, 0.9, '#111');
    c.fillStyle = '#3b6fb6'; c.fillRect(-6, 3, 10, 6); // שבריקה
  } else if (griffin) {
    circ(c, 4, -8, 5.5, L.head);
    c.fillStyle = '#e8b030'; c.beginPath(); c.moveTo(8, -10); c.quadraticCurveTo(14, -8, 10, -3.5); c.lineTo(8, -6); c.fill();
    circ(c, 5.5, -9.5, 1, '#111');
  } else {
    c.fillStyle = col; c.beginPath(); c.moveTo(-2, 3); c.lineTo(2, -7); c.lineTo(8, -5); c.lineTo(15, -1 + lunge * 2); c.lineTo(14, 1.5); c.lineTo(4, 3); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(2, -6); c.lineTo(1, -12); c.lineTo(5, -6.5); c.fill();
    circ(c, 7, -3.5, 1, '#ffde59');
    if (lunge > 0.2) { c.fillStyle = '#fff'; c.fillRect(10, 0, 4, 1); }
  }
  c.restore();
  if (griffin) drawWing(c, 0, bodyY - 5 - bob, L.wing, flap, 1.1);
  c.restore();
}
function drawWing(c, x, y, col, ang, s) {
  c.save(); c.translate(x, y); c.rotate(-0.4 + ang); c.scale(s, s);
  c.fillStyle = col; c.beginPath(); c.moveTo(0, 0);
  c.bezierCurveTo(-4, -14, -16, -22, -24, -18); c.lineTo(-19, -14); c.lineTo(-22, -10); c.lineTo(-15, -8); c.lineTo(-17, -3); c.quadraticCurveTo(-8, 2, 0, 0);
  c.fill(); c.strokeStyle = 'rgba(0,0,0,.2)'; c.lineWidth = 0.6; c.stroke(); c.restore();
}

function drawDragon(c, L, a) {
  const t = a.t, f = a.face || 1;
  c.save(); c.scale(f, 1);
  const atk = a.atk ?? -1;
  const lunge = atk >= 0.3 && atk < 0.8 ? Math.sin((atk - 0.3) / 0.5 * Math.PI) : 0;
  const flap = Math.sin(t * 4) * 0.5;
  const bone = L.body, dk = shade(bone, -0.45);
  c.lineCap = 'round'; c.lineJoin = 'round';
  // כנף אחורית
  drawBoneWing(c, -4, -34, L.wing, -0.2 + flap, 0.9, dk);
  // זנב
  c.strokeStyle = bone; c.lineWidth = 3;
  c.beginPath(); c.moveTo(-18, -28); c.bezierCurveTo(-32, -24, -38, -14 + Math.sin(t * 2) * 4, -50, -18 + Math.sin(t * 2 + 1) * 6); c.stroke();
  // רגליים
  c.lineWidth = 3; c.strokeStyle = dk;
  for (const lx of [-12, 12]) { c.beginPath(); c.moveTo(lx, -26); c.lineTo(lx + 3, -14); c.lineTo(lx, -2); c.stroke(); }
  // גוף: עמוד שדרה וצלעות
  c.strokeStyle = bone; c.lineWidth = 3.4;
  c.beginPath(); c.moveTo(-20, -30); c.quadraticCurveTo(0, -40, 18, -32); c.stroke();
  c.lineWidth = 1.6;
  for (let i = 0; i < 6; i++) { const x = -14 + i * 5.5; c.beginPath(); c.moveTo(x, -35 + Math.abs(i - 3)); c.quadraticCurveTo(x + 3, -24, x, -20); c.stroke(); }
  // צוואר וראש
  const hx = 34 + lunge * 10, hy = -50 + lunge * 12 + Math.sin(t * 2) * 2;
  c.lineWidth = 3; c.beginPath(); c.moveTo(16, -32); c.quadraticCurveTo(24, -52, hx - 4, hy); c.stroke();
  c.save(); c.translate(hx, hy); c.rotate(0.2 + lunge * 0.3);
  c.fillStyle = bone; c.beginPath(); c.moveTo(-5, -4); c.lineTo(12, -2); c.lineTo(14, 1); c.lineTo(-4, 3); c.closePath(); c.fill();
  c.save(); c.rotate(0.15 + lunge * 0.5 + (atk >= 0 ? 0.2 : 0)); c.beginPath(); c.moveTo(-3, 2); c.lineTo(12, 3); c.lineTo(-2, 5); c.fill(); c.restore();
  c.beginPath(); c.moveTo(-4, -3); c.lineTo(-10, -9); c.lineTo(-2, -4); c.fill();
  circ(c, 2, -1.5, 1.6, '#1a1010'); circ(c, 2, -1.5, 0.9, '#7cff9a'); glow(c, 2, -1.5, 8, '#7cff9a', 0.6);
  c.restore();
  drawBoneWing(c, 0, -36, L.wing, flap, 1.05, dk);
  c.restore();
}
function drawBoneWing(c, x, y, col, ang, s, dk) {
  c.save(); c.translate(x, y); c.rotate(-0.5 + ang); c.scale(s, s);
  c.fillStyle = rgba('#5a5448', 0.55);
  c.beginPath(); c.moveTo(0, 0); c.lineTo(-14, -26); c.lineTo(-34, -30); c.lineTo(-28, -18); c.lineTo(-36, -12); c.lineTo(-24, -6); c.lineTo(-26, 2); c.closePath(); c.fill();
  c.strokeStyle = col; c.lineWidth = 2;
  c.beginPath(); c.moveTo(0, 0); c.lineTo(-14, -26); c.lineTo(-34, -30); c.moveTo(-14, -26); c.lineTo(-36, -12); c.moveTo(-14, -26); c.lineTo(-26, 2); c.stroke();
  c.restore();
}

// ---- גיבור במפה (על סוס עם דגל) ----
const MAP_HERO_LOOK = { kind: 'rider', horse: '#7a4a2a', body: '#3355a0', trim: '#e8c04a', skin: '#e0b48a', helm: '#d8dde3', weapon: 'lance', cape: '#2f6fd6', armor: true };
const MAP_NECRO_LOOK = { kind: 'rider', horse: '#1a1418', body: '#2a1f3a', trim: '#9a6aff', skin: '#c8c0d8', hood: '#1a1228', weapon: 'staff', cape: '#3a1a4a', glow: '#b07aff' };
function drawMapHero(c, x, y, face, walk, moving, t, flagColor = '#2f6fd6', look = MAP_HERO_LOOK) {
  drawFigure(c, look, x, y, 1.05, { t, walk, moving, atk: -1, face, seed: 1 });
  // דגל
  const fx = x - 10 * face, fy = y - 62;
  c.strokeStyle = '#5a3d22'; c.lineWidth = 2; c.beginPath(); c.moveTo(fx, y - 22); c.lineTo(fx, fy); c.stroke();
  c.fillStyle = flagColor; c.beginPath(); c.moveTo(fx, fy);
  for (let i = 0; i <= 6; i++) c.lineTo(fx - face * i * 2.5, fy + Math.sin(t * 6 + i * 0.8) * 1.6 + i * 0.1);
  c.lineTo(fx - face * 15, fy + 9); for (let i = 6; i >= 0; i--) c.lineTo(fx - face * i * 2.5, fy + 9 + Math.sin(t * 6 + i * 0.8) * 1.6);
  c.closePath(); c.fill();
}

// ---- אובייקטים במפה ----
function drawTree(c, x, y, s, kind) {
  if (kind === 'pine' || kind === 'snowpine') {
    c.fillStyle = '#4a3020'; c.fillRect(x - 1.5 * s, y - 6 * s, 3 * s, 6 * s);
    for (let i = 0; i < 3; i++) {
      const w = (12 - i * 3) * s, yy = y - (5 + i * 7) * s;
      c.fillStyle = i % 2 ? '#1f4a2c' : '#245535';
      c.beginPath(); c.moveTo(x - w, yy); c.lineTo(x, yy - 13 * s); c.lineTo(x + w, yy); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.08)'; c.beginPath(); c.moveTo(x, yy - 13 * s); c.lineTo(x + w, yy); c.lineTo(x + w * 0.3, yy); c.fill();
      if (kind === 'snowpine') { c.fillStyle = '#f2f6fa'; c.beginPath(); c.moveTo(x - w * 0.5, yy - 6 * s); c.lineTo(x, yy - 13 * s); c.lineTo(x + w * 0.5, yy - 6 * s); c.quadraticCurveTo(x, yy - 4 * s, x - w * 0.5, yy - 6 * s); c.fill(); }
    }
  } else if (kind === 'dead') {
    c.strokeStyle = '#3a2e2a'; c.lineWidth = 2.5 * s; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 22 * s); c.moveTo(x, y - 12 * s); c.lineTo(x - 8 * s, y - 20 * s); c.moveTo(x, y - 16 * s); c.lineTo(x + 7 * s, y - 25 * s); c.moveTo(x, y - 22 * s); c.lineTo(x - 3 * s, y - 29 * s); c.stroke();
  } else if (kind === 'cactus') {
    c.strokeStyle = '#4f7d3a'; c.lineWidth = 4.5 * s; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 20 * s); c.moveTo(x, y - 9 * s); c.lineTo(x - 6 * s, y - 9 * s); c.lineTo(x - 6 * s, y - 15 * s); c.moveTo(x, y - 12 * s); c.lineTo(x + 6 * s, y - 12 * s); c.lineTo(x + 6 * s, y - 18 * s); c.stroke();
  } else {
    c.fillStyle = '#5a3a22'; c.fillRect(x - 2 * s, y - 9 * s, 4 * s, 9 * s);
    const cols = ['#2e6b2e', '#3a7d34', '#4b8f3c'];
    [[-6, -14, 8], [6, -15, 8], [0, -22, 9], [0, -14, 9]].forEach(([dx, dy, r], i) => circ(c, x + dx * s, y + dy * s, r * s, cols[i % 3]));
    circ(c, x - 2 * s, y - 24 * s, 4 * s, 'rgba(255,255,200,0.12)');
  }
}
function drawMountain(c, x, y, s, r, snow) {
  const w = 30 * s, h = (34 + r * 18) * s, px = x + (r - 0.5) * 10 * s;
  c.fillStyle = '#6d645b'; c.beginPath(); c.moveTo(x - w, y); c.lineTo(px, y - h); c.lineTo(x + w, y); c.closePath(); c.fill();
  c.fillStyle = '#4c4540'; c.beginPath(); c.moveTo(px, y - h); c.lineTo(x + w, y); c.lineTo(px + 4 * s, y); c.closePath(); c.fill();
  c.fillStyle = '#857b70'; c.beginPath(); c.moveTo(px, y - h); c.lineTo(x - w, y); c.lineTo(x - w * 0.4, y); c.closePath(); c.fill();
  if (snow || h > 44 * s) {
    c.fillStyle = '#eef3f6'; c.beginPath(); c.moveTo(px, y - h);
    c.lineTo(px - w * 0.32, y - h * 0.68); c.lineTo(px - w * 0.12, y - h * 0.74); c.lineTo(px, y - h * 0.64); c.lineTo(px + w * 0.14, y - h * 0.76); c.lineTo(px + w * 0.3, y - h * 0.68); c.closePath(); c.fill();
  }
}
function drawRock(c, x, y, s, col = '#7d7468') {
  c.fillStyle = shade(col, -0.25); c.beginPath(); c.moveTo(x - 10 * s, y); c.lineTo(x - 8 * s, y - 8 * s); c.lineTo(x - 1 * s, y - 12 * s); c.lineTo(x + 8 * s, y - 7 * s); c.lineTo(x + 10 * s, y); c.closePath(); c.fill();
  c.fillStyle = col; c.beginPath(); c.moveTo(x - 8 * s, y - 8 * s); c.lineTo(x - 1 * s, y - 12 * s); c.lineTo(x + 2 * s, y - 4 * s); c.lineTo(x - 6 * s, y - 2 * s); c.closePath(); c.fill();
}
function drawFlag(c, x, y, col, t, h = 26) {
  c.strokeStyle = '#3a2a1a'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - h); c.stroke();
  c.fillStyle = col; c.beginPath(); c.moveTo(x, y - h);
  for (let i = 0; i <= 5; i++) c.lineTo(x + i * 2.4, y - h + Math.sin(t * 5 + i) * 1.4);
  for (let i = 5; i >= 0; i--) c.lineTo(x + i * 2.4, y - h + 8 + Math.sin(t * 5 + i) * 1.4);
  c.closePath(); c.fill();
}
function drawCastle(c, x, y, t, dark, flagCol) {
  const wall = dark ? '#3a3238' : '#cfc3a8', wallDk = dark ? '#221c22' : '#a39577', roof = dark ? '#5a1020' : '#3b6fb6';
  ell(c, x, y + 2, 58, 14, 'rgba(0,0,0,.3)');
  // חומה
  c.fillStyle = wallDk; c.fillRect(x - 46, y - 26, 92, 26);
  c.fillStyle = wall; c.fillRect(x - 46, y - 30, 92, 6);
  for (let i = 0; i < 12; i++) c.fillRect(x - 46 + i * 8, y - 35, 5, 6);
  // שער
  c.fillStyle = '#2a1a10'; c.beginPath(); c.moveTo(x - 10, y); c.lineTo(x - 10, y - 16); c.arc(x, y - 16, 10, Math.PI, 0); c.lineTo(x + 10, y); c.fill();
  // מגדלים
  const towers = [[-46, 52, 11], [46, 52, 11], [-20, 70, 10], [20, 70, 10], [0, 88, 12]];
  for (const [dx, h, r] of towers) {
    const tx = x + dx;
    const g = c.createLinearGradient(tx - r, 0, tx + r, 0); g.addColorStop(0, wall); g.addColorStop(1, wallDk);
    c.fillStyle = g; c.fillRect(tx - r, y - h, r * 2, h - (dx === 0 ? 30 : 0));
    c.fillStyle = roof; c.beginPath(); c.moveTo(tx - r - 3, y - h); c.lineTo(tx, y - h - r * 2.2); c.lineTo(tx + r + 3, y - h); c.closePath(); c.fill();
    c.fillStyle = dark ? '#ff4060' : '#ffd36b'; c.fillRect(tx - 1.5, y - h + 8, 3, 5);
    if (dark) glow(c, tx, y - h + 10, 10, '#ff3050', 0.5);
    drawFlag(c, tx, y - h - r * 2.2, flagCol || (dark ? '#b01030' : '#2f6fd6'), t + dx, 16);
  }
  if (dark) { glow(c, x, y - 60, 90, '#ff2040', 0.12 + Math.sin(t * 2) * 0.04); }
}
function drawMine(c, x, y, res, t, owner) {
  ell(c, x, y + 1, 22, 7, 'rgba(0,0,0,.3)');
  if (res === 'wood') {
    c.fillStyle = '#7a5230'; c.fillRect(x - 16, y - 16, 22, 16); c.fillStyle = '#5a3a20'; c.beginPath(); c.moveTo(x - 19, y - 16); c.lineTo(x - 5, y - 28); c.lineTo(x + 9, y - 16); c.fill();
    for (let i = 0; i < 3; i++) { ell(c, x + 12, y - 3 - i * 4, 6, 2.2, '#8a5a30'); circ(c, x + 17, y - 3 - i * 4, 2, '#d8b080'); }
    c.save(); c.translate(x - 5, y - 9); c.rotate(t * 2); c.strokeStyle = '#ccc'; c.lineWidth = 1; for (let i = 0; i < 4; i++) { c.rotate(Math.PI / 2); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 5); c.stroke(); } c.restore();
  } else if (res === 'gems') {
    ell(c, x, y - 4, 20, 8, '#2a6fa8'); ell(c, x, y - 5, 16, 5.5, '#4aa0d8');
    for (let i = 0; i < 4; i++) { const gx = x - 10 + i * 7, gy = y - 6 + Math.sin(i * 2) * 2; c.fillStyle = ['#ff4d6d', '#5eead4', '#fde047', '#a78bfa'][i]; c.beginPath(); c.moveTo(gx, gy - 4); c.lineTo(gx + 3, gy); c.lineTo(gx, gy + 2); c.lineTo(gx - 3, gy); c.fill(); }
    glow(c, x, y - 6, 22, '#9be7ff', 0.25 + Math.sin(t * 3) * 0.1);
  } else {
    drawRock(c, x, y, 2, res === 'crystal' ? '#6b5a80' : '#7d7468');
    c.fillStyle = '#140c08'; c.beginPath(); c.moveTo(x - 7, y); c.lineTo(x - 7, y - 9); c.arc(x, y - 9, 7, Math.PI, 0); c.lineTo(x + 7, y); c.fill();
    c.strokeStyle = '#6b4a2b'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 8, y); c.lineTo(x - 8, y - 12); c.lineTo(x + 8, y - 12); c.lineTo(x + 8, y); c.stroke();
    if (res === 'crystal') { for (let i = 0; i < 3; i++) { c.fillStyle = '#c084fc'; c.beginPath(); c.moveTo(x + 10 + i * 4, y); c.lineTo(x + 12 + i * 4, y - 10 - i * 3); c.lineTo(x + 14 + i * 4, y); c.fill(); } glow(c, x + 14, y - 6, 16, '#d8b4fe', 0.35); }
    if (res === 'gold') { c.fillStyle = '#5a3d22'; c.fillRect(x + 9, y - 6, 10, 5); circ(c, x + 11, y - 1, 1.6, '#222'); circ(c, x + 17, y - 1, 1.6, '#222'); for (let i = 0; i < 4; i++) circ(c, x + 11 + i * 2.2, y - 7, 1.8, '#f5c542'); glow(c, x + 14, y - 7, 10, '#ffd75e', 0.4); }
    if (res === 'ore') { for (let i = 0; i < 4; i++) circ(c, x + 11 + (i % 2) * 4, y - 2 - (i >> 1) * 3, 2.2, '#5c5560'); }
  }
  drawFlag(c, x - 18, y, owner ? '#2f6fd6' : '#888', t, 24);
}
function drawChest(c, x, y, t) {
  ell(c, x, y, 11, 4, 'rgba(0,0,0,.3)');
  c.fillStyle = '#7a4a1f'; c.fillRect(x - 10, y - 11, 20, 11);
  c.fillStyle = '#93602a'; c.beginPath(); c.moveTo(x - 10, y - 11); c.quadraticCurveTo(x, y - 19, x + 10, y - 11); c.fill();
  c.fillStyle = '#d9b25f'; c.fillRect(x - 10, y - 8, 20, 2); c.fillRect(x - 1.5, y - 10, 3, 5);
  const sp = (Math.sin(t * 3) + 1) / 2;
  glow(c, x + 4, y - 14, 10 + sp * 6, '#ffe28a', 0.35 + sp * 0.3);
}
function drawResPile(c, x, y, res, t) {
  ell(c, x, y, 12, 4, 'rgba(0,0,0,.3)');
  if (res === 'gold') { for (let i = 0; i < 7; i++) circ(c, x - 7 + (i % 4) * 4.5, y - 3 - (i >> 2) * 4, 3, i % 2 ? '#f5c542' : '#e0a92c'); glow(c, x, y - 5, 14, '#ffd75e', 0.35 + Math.sin(t * 4) * 0.12); }
  else if (res === 'wood') { for (let i = 0; i < 3; i++) { ell(c, x, y - 3 - i * 4, 10 - i * 2, 2.5, '#8a5a30'); circ(c, x + 9 - i * 2, y - 3 - i * 4, 2.2, '#d8b080'); } }
  else if (res === 'ore') { for (let i = 0; i < 5; i++) circ(c, x - 6 + (i % 3) * 6, y - 3 - (i >> 1) * 3.5, 3.4, i % 2 ? '#6c6570' : '#544e58'); }
  else if (res === 'crystal') { for (let i = 0; i < 3; i++) { c.fillStyle = ['#c084fc', '#e9d5ff', '#a855f7'][i]; c.beginPath(); c.moveTo(x - 6 + i * 6, y); c.lineTo(x - 4 + i * 6, y - 12 - i * 2); c.lineTo(x - 2 + i * 6, y); c.fill(); } glow(c, x, y - 6, 14, '#d8b4fe', 0.4); }
  else if (res === 'gems') { ['#ff4d6d', '#5eead4', '#fde047', '#a78bfa'].forEach((col, i) => { const gx = x - 6 + i * 4, gy = y - 3 - (i % 2) * 3; c.fillStyle = col; c.beginPath(); c.moveTo(gx, gy - 4); c.lineTo(gx + 3, gy); c.lineTo(gx, gy + 3); c.lineTo(gx - 3, gy); c.fill(); }); glow(c, x, y - 4, 14, '#fff', 0.3); }
}
function drawShrine(c, x, y, t, col = '#7fd4ff') {
  ell(c, x, y, 18, 6, 'rgba(0,0,0,.3)');
  c.fillStyle = '#bfb6a3'; c.fillRect(x - 16, y - 4, 32, 4);
  c.fillStyle = '#d8cfba'; c.fillRect(x - 13, y - 26, 4, 22); c.fillRect(x + 9, y - 26, 4, 22);
  c.fillStyle = '#a99f8b'; c.beginPath(); c.moveTo(x - 17, y - 26); c.lineTo(x, y - 36); c.lineTo(x + 17, y - 26); c.closePath(); c.fill();
  const b = Math.sin(t * 2.5) * 2;
  circ(c, x, y - 14 + b, 4, col); glow(c, x, y - 14 + b, 20, col, 0.6);
}
function drawStone(c, x, y, t) {
  ell(c, x, y, 12, 4, 'rgba(0,0,0,.3)');
  c.fillStyle = '#6a6470'; c.beginPath(); c.moveTo(x - 8, y); c.lineTo(x - 6, y - 26); c.quadraticCurveTo(x, y - 32, x + 6, y - 26); c.lineTo(x + 8, y); c.closePath(); c.fill();
  c.strokeStyle = `rgba(120,230,255,${0.5 + Math.sin(t * 2) * 0.3})`; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(x - 2, y - 22); c.lineTo(x + 2, y - 18); c.lineTo(x - 2, y - 14); c.moveTo(x + 1, y - 10); c.lineTo(x - 2, y - 6); c.stroke();
  glow(c, x, y - 15, 16, '#78e6ff', 0.25);
}
function drawWell(c, x, y, t) {
  ell(c, x, y, 14, 5, 'rgba(0,0,0,.3)');
  ell(c, x, y - 6, 12, 5, '#8a8070'); ell(c, x, y - 7, 9, 3.4, '#2d6fb0');
  glow(c, x, y - 8, 14, '#5ab0ff', 0.35 + Math.sin(t * 3) * 0.1);
  c.strokeStyle = '#5a3d22'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 10, y - 6); c.lineTo(x - 10, y - 22); c.lineTo(x + 10, y - 22); c.lineTo(x + 10, y - 6); c.stroke();
  c.fillStyle = '#7a3a22'; c.beginPath(); c.moveTo(x - 14, y - 21); c.lineTo(x, y - 30); c.lineTo(x + 14, y - 21); c.fill();
}
function drawArtifactPedestal(c, x, y, t, icon) {
  ell(c, x, y, 11, 4, 'rgba(0,0,0,.3)');
  c.fillStyle = '#9a917e'; c.fillRect(x - 7, y - 10, 14, 10); c.fillStyle = '#b8af9a'; c.fillRect(x - 9, y - 12, 18, 3);
  const b = Math.sin(t * 2) * 2;
  glow(c, x, y - 20 + b, 18, '#ffcf6b', 0.55);
  c.font = '14px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(icon || '✦', x, y - 20 + b);
}
