window.GAME = {
  id: 'duo',
  needPlayers: true,
  slices: [
    { key:'kiss',     name:'נשיקה',      type:'card', pair:true, pairIcon:'💋', sfx:'kiss',  color:'#ff4d6d', grad:['#ff758f','#e11d48'], sheet:'linear-gradient(160deg,#ff4d6d,#9f1239)',
      desc:'A kiss or touch between the player and {p}, the partner the wheel picked.' },
    { key:'duoTruth', name:'אמת זוגית',  type:'card', pair:true, pairIcon:'🔥', sfx:'truth', color:'#c9184a', grad:['#e5383b','#a4133c'], sheet:'linear-gradient(160deg,#e5383b,#590d22)',
      rule:'שניכם עונים, כל אחד בתורו. מי שמסרב שותה.', desc:'A question both the player and {p} answer, starting with "שניכם עונים:".' },
    { key:'duoDare',  name:'חובה זוגית', type:'card', pair:true, pairIcon:'😈', sfx:'dare',  color:'#9d0208', grad:['#d00000','#6a040f'], sheet:'linear-gradient(160deg,#d00000,#370617)',
      desc:'A dare the player does together with {p}: body shots, lap dances, ice, blindfolds, outfits from things in the house.' },
    { key:'bump',     name:'באמפ',       type:'bump', sfx:'bump', color:'#f7b2a1', grad:['#fcd5ce','#e8a598'], sheet:'linear-gradient(160deg,#fcd5ce,#e29578)', dark:true, ink:'#4a0d1a' },
  ],
  pairFallback: 'מי שמשמאלך',
  divider: '#14040b',
  peg: '#ffd6dc', pegDark: '#9f1239',
  pointer: ['#ffe5ec', '#ff4d6d'],
  confetti: ['#ff4d6d', '#ffd6dc', '#c9184a', '#fff', '#f7b2a1'],
  gen: {
    intro: 'You write cards for "בשניים · THE GANG", an Israeli party game in Hebrew for adults (18+). Every spin pairs the player with a random partner {p}, and the card is something the two of them do or answer together.',
    style: 'This is the hottest version: kisses, touching, body shots, lap dances, stripping one item, ice and blindfolds, always between the two consenting players.',
  },
};
