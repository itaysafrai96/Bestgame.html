window.GAME = {
  id: 'heat',
  slices: [
    { key:'truth',  name:'אמת',  type:'card',   heat:true, sfx:'truth', color:'#ff7a2f', grad:['#ffa047','#ff5a1f'], sheet:'linear-gradient(160deg,#ff8a3d,#c2410c)', desc:'Truth questions the player answers honestly.' },
    { key:'dare',   name:'חובה', type:'card',   heat:true, sfx:'dare',  color:'#e11d48', grad:['#f43f5e','#be123c'], sheet:'linear-gradient(160deg,#f43f5e,#881337)', desc:'Dares the player does now, hands-on party moments.' },
    { key:'secret', name:'סוד',  type:'topics', sfx:'secret', color:'#7e22ce', grad:['#9333ea','#581c87'], sheet:'linear-gradient(160deg,#9333ea,#3b0764)', desc:'A topic phrase the player tells a secret about, no verb at the start.' },
    { key:'bump',   name:'באמפ', type:'bump',   sfx:'bump', color:'#f5b82e', grad:['#fcd34d','#f59e0b'], sheet:'linear-gradient(160deg,#fcd34d,#d97706)', dark:true, ink:'#3b1600' },
  ],
  heat: {
    at: [12, 25],   // spins at which the heat goes up by itself
    levels: [
      { emoji:'🌶️', name:'חימום', msg:'' },
      { emoji:'🌶️🌶️', name:'חם', msg:'מכאן זה כבר לא תמים 😏' },
      { emoji:'🌶️🌶️🌶️', name:'בוער', msg:'אין יותר הגבלות. מי שלא בעניין שותה 🔥' },
    ],
  },
  divider: '#1a0806',
  peg: '#ffb36b', pegDark: '#8a2c0a',
  pointer: ['#ffe08a', '#ff6a1f'],
  confetti: ['#ff7a2f', '#ffd166', '#e11d48', '#fff', '#9333ea'],
  gen: {
    intro: 'You write cards for "אש · THE GANG", an Israeli party game in Hebrew for adults (18+), played by friends who are drinking. The game heats up over the night in three levels.',
    style: 'Level 1 is flirty warm-up, level 2 is spicy, level 3 is the most explicit: sex, bodies, kinks, stripping and kissing dares, still between consenting adults.',
  },
};
