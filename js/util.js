'use strict';
// ===== כלי עזר כלליים =====
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const $ = (s) => document.querySelector(s);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, r = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
function fmt(n) { return Math.floor(n).toLocaleString('en-US'); }

// צבעים: הבהרה/הכהיה של צבע hex
function shade(hex, amt) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  let r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function rgba(hex, a) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  return `rgba(${parseInt(c.substr(0, 2), 16)},${parseInt(c.substr(2, 2), 16)},${parseInt(c.substr(4, 2), 16)},${a})`;
}

// רעש ערכי (value noise) עם אוקטבות
function makeNoise(seed) {
  const r = mulberry32(seed);
  const tab = new Float32Array(256 * 256);
  for (let i = 0; i < tab.length; i++) tab[i] = r();
  const g = (a, b) => tab[(a & 255) * 256 + (b & 255)];
  function v(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
    return lerp(lerp(g(xi, yi), g(xi + 1, yi), u), lerp(g(xi, yi + 1), g(xi + 1, yi + 1), u), w);
  }
  return (x, y, oct = 4) => {
    let s = 0, a = 1, f = 1, n = 0;
    for (let o = 0; o < oct; o++) { s += v(x * f + o * 17.3, y * f + o * 9.1) * a; n += a; a *= 0.5; f *= 2; }
    return s / n;
  };
}

// A* על רשת. costFn(x,y) מחזיר עלות או Infinity
function astar(w, h, sx, sy, tx, ty, costFn) {
  const N = w * h;
  const g = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = [];
  const push = (f, i) => {
    heap.push([f, i]); let c = heap.length - 1;
    while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; }
  };
  const pop = () => {
    const top = heap[0]; const last = heap.pop();
    if (heap.length) {
      heap[0] = last; let c = 0;
      for (;;) {
        const l = 2 * c + 1, r = l + 1; let m = c;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m;
      }
    }
    return top;
  };
  const hf = (x, y) => { const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return (Math.max(dx, dy) + 0.414 * Math.min(dx, dy)) * 0.7; };
  const s = sy * w + sx; g[s] = 0; push(hf(sx, sy), s);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (heap.length) {
    const [, i] = pop();
    if (closed[i]) continue; closed[i] = 1;
    const x = i % w, y = (i / w) | 0;
    if (x === tx && y === ty) {
      const path = []; let c = i;
      while (c !== s) { path.push([c % w, (c / w) | 0]); c = came[c]; }
      return path.reverse();
    }
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx; if (closed[ni]) continue;
      let c = costFn(nx, ny);
      if (!isFinite(c)) continue;
      if (dx && dy) {
        c *= 1.414;
        if (!isFinite(costFn(x + dx, y)) && !isFinite(costFn(x, y + dy))) continue;
      }
      const ng = g[i] + c;
      if (ng < g[ni]) { g[ni] = ng; came[ni] = i; push(ng + hf(nx, ny), ni); }
    }
  }
  return null;
}

function costStr(cost) {
  const parts = [];
  for (const k of ['gold', 'wood', 'ore', 'crystal', 'gems']) if (cost[k]) parts.push(`<span class="cost-item">${RES_ICON[k]} ${fmt(cost[k])}</span>`);
  return parts.join(' ') || '<span class="muted">חינם</span>';
}
function canAfford(cost, mult = 1) {
  for (const k in cost) if ((G.res[k] || 0) < cost[k] * mult) return false;
  return true;
}
function pay(cost, mult = 1) { for (const k in cost) G.res[k] -= cost[k] * mult; }
