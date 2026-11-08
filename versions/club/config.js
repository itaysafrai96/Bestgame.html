window.GAME = {
  id: 'club',
  slices: [
    { key:'never',  name:'אף פעם לא', label:'אף פעם לא', type:'card', group:true, sfx:'group', color:'#06b6d4', grad:['#22e1ff','#0891b2'], sheet:'linear-gradient(160deg,#22d3ee,#0e7490)',
      rule:'כל מי שכן עשה את זה שותה. מי שהכי מסמיק מספר את הסיפור.', desc:'"Never have I ever" lines starting with "אף פעם לא", written in first person. Everyone who did it drinks.' },
    { key:'likely', name:'מי הכי', label:'מי הכי', type:'card', group:true, sfx:'group', color:'#e11d9c', grad:['#ff4fd8','#c026d3'], sheet:'linear-gradient(160deg,#ff4fd8,#86198f)',
      rule:'סופרים עד 3 וכולם מצביעים. מי שקיבל הכי הרבה אצבעות שותה או מספר.', desc:'"Who here is most likely to" questions starting with "מי פה הכי סביר". Everyone points at the same time.' },
    { key:'secret', name:'סוד', type:'topics', sfx:'secret', color:'#84cc16', grad:['#bef264','#65a30d'], sheet:'linear-gradient(160deg,#84cc16,#365314)', ink:'#1a2e05',
      desc:'A topic phrase the player tells a secret about, no verb at the start.' },
    { key:'bump',   name:'באמפ', type:'bump', sfx:'bump', color:'#facc15', grad:['#fde047','#eab308'], sheet:'linear-gradient(160deg,#fde047,#ca8a04)', dark:true, ink:'#3b2a00' },
  ],
  groupWho: '🪩 כולם משחקים',
  divider: '#070b1a',
  peg: '#a5f3fc', pegDark: '#0e7490',
  pointer: ['#fdf4ff', '#ff4fd8'],
  confetti: ['#22e1ff', '#ff4fd8', '#bef264', '#fde047', '#fff'],
  gen: {
    intro: 'You write cards for "מי פה? · THE GANG CLUB", an Israeli party game in Hebrew for adults (18+). It is a group game: on most cards everyone plays at once, and whoever loses drinks.',
    style: 'Keep them juicy and personal, about sex, exes, flings, cheating, parties, drinking and secrets, so the room laughs and blushes.',
  },
};
