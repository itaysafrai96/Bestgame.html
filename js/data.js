'use strict';
// ===== נתוני המשחק =====
const RES_ICON = { gold: '🪙', wood: '🪵', ore: '⛰️', crystal: '🔮', gems: '💎' };
const RES_NAME = { gold: 'זהב', wood: 'עץ', ore: 'עפרה', crystal: 'קריסטל', gems: 'אבני חן' };

// יצורים. spd = פיקסלים לשנייה בקרב, cd = שניות בין התקפות, range>0 = טווח
const UNITS = {
  // ---- מסדר האור (Haven / Castle) ----
  pikeman: { name: 'חנית-אי', tier: 1, hp: 10, atk: 4, def: 5, dmg: [1, 3], spd: 95, cd: 1.6, range: 0, size: 15, cost: { gold: 60 }, growth: 14, ability: 'brace',
    look: { kind: 'human', body: '#3b6fb6', trim: '#d8b55a', skin: '#e0b48a', helm: '#aab3bd', weapon: 'spear' } },
  archer: { name: 'קשת', tier: 2, hp: 10, atk: 6, def: 3, dmg: [2, 3], spd: 100, cd: 1.8, range: 330, proj: 'arrow', size: 15, cost: { gold: 100 }, growth: 9, ability: 'volley',
    look: { kind: 'human', body: '#3f7d3a', trim: '#8a5a2b', skin: '#e0b48a', hood: '#2f5e2b', weapon: 'bow' } },
  griffin: { name: 'גריפון', tier: 3, hp: 25, atk: 8, def: 8, dmg: [3, 6], spd: 165, cd: 1.5, range: 0, size: 22, fly: true, cost: { gold: 200 }, growth: 7, ability: 'dive',
    look: { kind: 'griffin', body: '#b98a45', wing: '#e3cb93', head: '#f4efe2' } },
  swordsman: { name: 'אביר חרב', tier: 4, hp: 35, atk: 10, def: 12, dmg: [6, 9], spd: 90, cd: 1.7, range: 0, size: 17, cost: { gold: 300 }, growth: 4, ability: 'shieldwall',
    look: { kind: 'human', body: '#9aa3ad', trim: '#b8322a', skin: '#e0b48a', helm: '#c5ccd4', weapon: 'sword', shield: '#b8322a', armor: true } },
  monk: { name: 'נזיר', tier: 5, hp: 30, atk: 12, def: 7, dmg: [10, 12], spd: 95, cd: 2.0, range: 300, proj: 'holy', size: 16, cost: { gold: 400 }, growth: 3, ability: 'prayer',
    look: { kind: 'human', robe: true, body: '#e8dcc0', trim: '#c9a24a', skin: '#e0b48a', weapon: 'staff', glow: '#fff3a0' } },
  cavalier: { name: 'פרש', tier: 6, hp: 100, atk: 15, def: 15, dmg: [15, 25], spd: 175, cd: 1.8, range: 0, size: 27, cost: { gold: 1000 }, growth: 2, ability: 'charge',
    look: { kind: 'rider', horse: '#efe9df', body: '#9aa3ad', trim: '#3b6fb6', skin: '#e0b48a', helm: '#c5ccd4', weapon: 'lance' } },
  angel: { name: 'מלאך', tier: 7, hp: 200, atk: 20, def: 20, dmg: [50, 50], spd: 160, cd: 1.6, range: 0, size: 24, fly: true, cost: { gold: 3000, gems: 1 }, growth: 1, ability: 'rez',
    look: { kind: 'human', wings: '#ffffff', body: '#f5f0e1', trim: '#ffd84a', skin: '#f1cfa8', weapon: 'flamesword', halo: true, glow: '#fff7c0', hair: '#f5d76e' } },

  // ---- ניטרליים ----
  goblin: { name: 'גובלין', hp: 5, atk: 4, def: 2, dmg: [1, 2], spd: 110, cd: 1.3, range: 0, size: 13, look: { kind: 'human', small: true, skin: '#7fae4f', body: '#6b4a2b', weapon: 'club', ears: true } },
  wolf: { name: 'זאב', hp: 12, atk: 6, def: 3, dmg: [2, 4], spd: 170, cd: 1.2, range: 0, size: 17, ability: 'howl', look: { kind: 'wolf', body: '#6e6e78', belly: '#a9a9b2' } },
  orc: { name: 'אורק', hp: 15, atk: 8, def: 4, dmg: [2, 5], spd: 95, cd: 1.9, range: 240, proj: 'axe', size: 16, look: { kind: 'human', skin: '#6f8f4a', body: '#7a4a2a', weapon: 'axe', ears: true } },
  troll: { name: 'טרול', hp: 40, atk: 14, def: 7, dmg: [10, 15], spd: 85, cd: 2.2, range: 0, size: 25, regen: true, look: { kind: 'human', big: true, skin: '#6d8a7a', body: '#4b3a2a', weapon: 'club' } },
  // ---- מתים (צבא האדון האפל) ----
  skeleton: { name: 'שלד', hp: 6, atk: 5, def: 4, dmg: [1, 3], spd: 95, cd: 1.5, range: 0, size: 15, undead: true, look: { kind: 'human', bone: true, body: '#d8d2bf', weapon: 'sword', shield: '#5a4a3a' } },
  zombie: { name: 'זומבי', hp: 20, atk: 5, def: 5, dmg: [2, 3], spd: 55, cd: 2.0, range: 0, size: 16, undead: true, look: { kind: 'human', skin: '#8aa070', body: '#4d4a5a', weapon: 'none', hunch: true } },
  ghost: { name: 'רוח רפאים', hp: 18, atk: 7, def: 7, dmg: [3, 5], spd: 140, cd: 1.5, range: 0, size: 17, fly: true, undead: true, look: { kind: 'ghost', body: '#bfe6ff' } },
  lich: { name: 'ליץ\'', hp: 30, atk: 13, def: 10, dmg: [11, 13], spd: 85, cd: 2.3, range: 300, proj: 'death', splash: 60, size: 16, undead: true, look: { kind: 'human', robe: true, bone: true, body: '#3d2b5a', trim: '#7cff9a', weapon: 'staff', glow: '#7cff9a' } },
  vampire: { name: 'ערפד', hp: 30, atk: 10, def: 9, dmg: [5, 8], spd: 150, cd: 1.5, range: 0, size: 17, fly: true, drain: true, undead: true, look: { kind: 'human', body: '#1d1a24', trim: '#a01020', skin: '#d9d4e0', weapon: 'sword', cape: '#7a0d1a', hair: '#111' } },
  bonedragon: { name: 'דרקון עצמות', hp: 150, atk: 17, def: 15, dmg: [25, 50], spd: 130, cd: 2.2, range: 0, size: 38, fly: true, undead: true, ability: 'fear', look: { kind: 'dragon', body: '#d9d2bf', wing: '#8e877a' } },
  darklord: { name: 'מלקאר, האדון האפל', boss: true, hp: 1400, atk: 22, def: 18, dmg: [45, 80], spd: 100, cd: 2.0, range: 0, size: 26, undead: true, ability: 'hellfire',
    look: { kind: 'human', big: true, body: '#1a1420', trim: '#c01535', skin: '#c9c0d0', weapon: 'flamesword', cape: '#3a0a14', glow: '#ff3050', crown: true, helm: '#2a2430' } },
};
const PLAYER_UNITS = ['pikeman', 'archer', 'griffin', 'swordsman', 'monk', 'cavalier', 'angel'];

const ABILITIES = {
  brace: { name: 'חומת חניתות', icon: '🛡️', target: 'self', cd: 20, dur: 8, desc: '+6 הגנה ופוגע בחזרה בתוקפים בתגרה' },
  volley: { name: 'מטח חצים', icon: '🏹', target: 'point', cd: 16, radius: 85, desc: 'גשם חצים על אזור (85% נזק לכל יעד)' },
  dive: { name: 'צלילת טורף', icon: '🦅', target: 'enemy', cd: 14, desc: 'זינוק מהיר על אויב ונזק כפול' },
  shieldwall: { name: 'קיר מגנים', icon: '🧱', target: 'self', cd: 20, dur: 8, desc: 'חצי נזק מכל מקור למשך 8 שניות' },
  prayer: { name: 'תפילת ריפוי', icon: '✚', target: 'ally', cd: 15, desc: 'מרפא בעל ברית (12 × מספר הנזירים)' },
  charge: { name: 'הסתערות', icon: '🐎', target: 'enemy', cd: 14, desc: 'דהירה מהירה, המכה הראשונה גורמת נזק כפול' },
  rez: { name: 'תחיית המתים', icon: '✨', target: 'ally', cd: 40, desc: 'מחייה חיילים שנפלו ביחידה (100 חיים לכל מלאך)' },
  howl: { name: 'יללה', icon: '🐺', target: 'self', cd: 18, dur: 6, desc: 'הלהקה תוקפת מהר יותר' },
  fear: { name: 'שאגת אימה', icon: '💀', target: 'self', cd: 22, desc: 'מאט את כל האויבים הקרובים' },
  hellfire: { name: 'אש הגיהנום', icon: '🔥', target: 'point', cd: 11, radius: 100, desc: 'פיצוץ אש אפלה' },
};

// לחשים של הגיבור. power = בסיס + כוח כישוף × מקדם
const SPELLS = {
  magic_arrow: { name: 'חץ קסם', lvl: 1, mana: 5, target: 'enemy', icon: '✴️', base: 15, per: 10, desc: 'חץ אנרגיה מכוון באויב' },
  heal: { name: 'ריפוי', lvl: 1, mana: 6, target: 'ally', icon: '💚', base: 30, per: 15, desc: 'מרפא ומחזיר לוחמים שנפלו' },
  haste: { name: 'זריזות', lvl: 1, mana: 6, target: 'ally', icon: '💨', dur: 18, desc: '+50% מהירות תנועה והתקפה' },
  slow: { name: 'האטה', lvl: 2, mana: 6, target: 'enemy', icon: '🐌', dur: 15, desc: '-50% מהירות תנועה והתקפה' },
  stoneskin: { name: 'עור אבן', lvl: 2, mana: 5, target: 'ally', icon: '🪨', dur: 25, desc: '+8 הגנה' },
  lightning: { name: 'ברק', lvl: 2, mana: 10, target: 'enemy', icon: '⚡', base: 30, per: 25, desc: 'ברק מהשמיים במטרה בודדת' },
  fireball: { name: 'כדור אש', lvl: 3, mana: 12, target: 'point', icon: '🔥', base: 20, per: 12, radius: 95, desc: 'פיצוץ באזור — פוגע גם בבעלי ברית!' },
  chain: { name: 'שרשרת ברקים', lvl: 3, mana: 18, target: 'enemy', icon: '🌩️', base: 30, per: 22, desc: 'ברק שקופץ בין 4 אויבים' },
  resurrect: { name: 'תחייה', lvl: 3, mana: 20, target: 'ally', icon: '🕊️', base: 60, per: 40, desc: 'מחזיר לחיים לוחמים — גם יחידה שנפלה כליל' },
};

const SKILLS = {
  offense: { name: 'התקפה', icon: '⚔️', desc: (l) => `+${l * 10}% נזק בתגרה` },
  archery: { name: 'קשתות', icon: '🏹', desc: (l) => `+${l * 12}% נזק מטווח` },
  armorer: { name: 'שריון', icon: '🛡️', desc: (l) => `-${l * 6}% נזק שנספג` },
  leadership: { name: 'מנהיגות', icon: '🚩', desc: (l) => `+${l * 8}% מהירות התקפה (מורל)` },
  luck: { name: 'מזל', icon: '🍀', desc: (l) => `+${l * 5}% סיכוי לפגיעה קריטית` },
  logistics: { name: 'לוגיסטיקה', icon: '🐴', desc: (l) => `+${l * 3} נקודות תנועה במפה` },
  wisdom: { name: 'חוכמה', icon: '📜', desc: (l) => `+${l * 25}% מאנה מרבית` },
  sorcery: { name: 'כישוף', icon: '🔮', desc: (l) => `+${l * 12}% עוצמת לחשים` },
  estates: { name: 'אחוזות', icon: '🏰', desc: (l) => `+${l * 150} זהב ליום` },
  scouting: { name: 'סיור', icon: '👁️', desc: (l) => `+${l * 2} טווח ראייה` },
};
const SKILL_LEVEL = ['', 'בסיסי', 'מתקדם', 'מומחה'];

const ARTIFACTS = {
  sword_fire: { name: 'להב השחר', icon: '🗡️', desc: '+3 התקפה', atk: 3 },
  shield_lion: { name: 'מגן האריה', icon: '🛡️', desc: '+3 הגנה', def: 3 },
  cloak_mage: { name: 'גלימת המכשף', icon: '🧥', desc: '+3 כוח כישוף', sp: 3 },
  tome: { name: 'ספר הידע העתיק', icon: '📕', desc: '+3 ידע', kn: 3 },
  boots: { name: 'מגפי הנווד', icon: '👢', desc: '+4 נקודות תנועה', mp: 4 },
  clover: { name: 'תלתן הזהב', icon: '🍀', desc: '+10% סיכוי קריטי', luck: 0.1 },
  crown: { name: 'כתר המלכים האבוד', icon: '👑', desc: '+2 לכל התכונות', atk: 2, def: 2, sp: 2, kn: 2 },
  ring: { name: 'טבעת החיים', icon: '💍', desc: 'כל היחידות מתחדשות בקרב', regen: true },
};

const BUILDINGS = {
  hall: { name: 'בית מועצה', icon: '🏛️', cost: {}, req: [], desc: '+500 זהב ליום' },
  townhall: { name: 'בית העירייה', icon: '🏛️', cost: { gold: 2500 }, req: ['hall'], desc: '+1000 זהב ליום (במקום 500)' },
  cityhall: { name: 'היכל העיר', icon: '🏰', cost: { gold: 5000, wood: 5, ore: 5, crystal: 3, gems: 3 }, req: ['townhall', 'market'], desc: '+2000 זהב ליום' },
  fort: { name: 'מבצר', icon: '🧱', cost: { gold: 3000, wood: 5, ore: 15 }, req: [], desc: '+50% גידול שבועי, +3 הגנה למגינים' },
  market: { name: 'שוק', icon: '⚖️', cost: { gold: 500, wood: 5 }, req: [], desc: 'מסחר במשאבים' },
  guild1: { name: 'גילדת הקוסמים I', icon: '🔮', cost: { gold: 2000, wood: 5, ore: 5 }, req: [], desc: 'לימוד לחשים מדרגה 1' },
  guild2: { name: 'גילדת הקוסמים II', icon: '🔮', cost: { gold: 1000, wood: 5, ore: 5, crystal: 4, gems: 4 }, req: ['guild1'], desc: 'לימוד לחשים מדרגה 2' },
  guild3: { name: 'גילדת הקוסמים III', icon: '🔮', cost: { gold: 1000, wood: 5, ore: 5, crystal: 6, gems: 6 }, req: ['guild2'], desc: 'לימוד לחשים מדרגה 3' },
  dw1: { name: 'בית המשמר', icon: '🗡️', unit: 'pikeman', cost: { gold: 500, ore: 5 }, req: [], desc: 'מגייס חנית-אים' },
  dw2: { name: 'מגדל הקשתים', icon: '🏹', unit: 'archer', cost: { gold: 1000, wood: 5, ore: 5 }, req: ['dw1'], desc: 'מגייס קשתים' },
  dw3: { name: 'מגדל הגריפונים', icon: '🦅', unit: 'griffin', cost: { gold: 1000, ore: 5 }, req: ['dw2'], desc: 'מגייס גריפונים' },
  dw4: { name: 'קסרקטין', icon: '⚔️', unit: 'swordsman', cost: { gold: 2000, wood: 5, ore: 5 }, req: ['dw1'], desc: 'מגייס אבירי חרב' },
  dw5: { name: 'מנזר', icon: '⛪', unit: 'monk', cost: { gold: 3000, wood: 5, ore: 5, crystal: 2, gems: 2 }, req: ['dw4', 'guild1'], desc: 'מגייס נזירים' },
  dw6: { name: 'מגרש האימונים', icon: '🐎', unit: 'cavalier', cost: { gold: 5000, wood: 10 }, req: ['dw4', 'fort'], desc: 'מגייס פרשים' },
  dw7: { name: 'שער התהילה', icon: '👼', unit: 'angel', cost: { gold: 15000, ore: 10, crystal: 6, gems: 6 }, req: ['dw5', 'townhall'], desc: 'מזמן מלאכים' },
};
const BUILD_ORDER = ['hall', 'townhall', 'cityhall', 'fort', 'market', 'guild1', 'guild2', 'guild3', 'dw1', 'dw2', 'dw3', 'dw4', 'dw5', 'dw6', 'dw7'];

const WEEK_NAMES = ['שבוע הגריפון', 'שבוע הצפרדע', 'שבוע הזאב', 'שבוע החנית', 'שבוע הירח', 'שבוע הדרקון', 'שבוע הענק', 'שבוע הפרפר', 'שבוע הנמייה'];

// סולם XP (בהשראת Heroes 3)
function xpForLevel(l) { let x = 0, step = 1000; for (let i = 1; i < l; i++) { x += step; step += i < 3 ? 0 : 200 + i * 20; } return x; }

const TERRAIN = {
  0: { name: 'מים', color: '#1f5a8a', cost: Infinity },
  1: { name: 'דשא', color: '#5b8f3a', cost: 1 },
  2: { name: 'אדמה', color: '#8a6e44', cost: 1 },
  3: { name: 'חול', color: '#d1b878', cost: 1.4 },
  4: { name: 'שלג', color: '#dfe8ef', cost: 1.5 },
  5: { name: 'ביצה', color: '#4b5b3c', cost: 1.75 },
  6: { name: 'הרים', color: '#7c736a', cost: Infinity },
  7: { name: 'אדמה אפלה', color: '#3e3438', cost: 1.25 },
};
