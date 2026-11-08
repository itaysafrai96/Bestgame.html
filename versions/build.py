"""Builds the three THE GANG versions from template.html + engine.js.

Run from anywhere:  python3 versions/build.py
Each version folder gets index.html, engine.js, base.js (the original game's cards) and face.jpg.
"""
import pathlib, shutil

ROOT = pathlib.Path(__file__).resolve().parent
REPO = ROOT.parent

VERSIONS = {
    'heat': dict(
        TITLE='אמת או חובה · אש', DESC='גלגל אמת, חובה, סוד ובאמפ לחברים 18+ שמתחמם לאורך הערב בשלוש רמות.',
        BG='#160604', MUTED='#e7b9a6', GOLD='#ffb347', PANEL='#2a0d08',
        ACCENT='linear-gradient(135deg,#ff7a2f,#e11d48)',
        BODYBG='radial-gradient(700px 520px at 50% -5%,#7a1d0a 0%,transparent 65%),radial-gradient(600px 500px at 100% 60%,#5c0d24 0%,transparent 60%),linear-gradient(180deg,#250a06,#140504 70%,#0c0303)',
        H1GRAD='linear-gradient(0deg,#ff4d1a,#ff9a3c 45%,#ffe08a)',
        RIM='conic-gradient(from 0deg,#ff4d1a,#ffb347,#ff7a2f,#e11d48,#ff4d1a,#ffd166,#ff4d1a)',
        RIMGLOW='0 0 40px #ff4d1a77,0 0 90px #ffb34744', GLOW='#ff6a2b44',
        LEVELUP='linear-gradient(160deg,#ffb347,#ff4d1a 50%,#7f1d1d)', BUMPALL='linear-gradient(160deg,#ffd166,#ff4d1a 60%,#e11d48)',
        BADGE='18+ · HEAT EDITION', H1='אמת או חובה', GANG='THE GANG', TAG='ככל שהערב מתקדם, הגלגל מתחמם',
        PLAYERS_OPT=' (לא חובה)', PLAYERS_NOTE='אם תוסיפו שמות, הגלגל יגיד של מי התור ומשימות יכללו שמות של אחרים.',
        SPARK1='🔥', SPARK2='🌶️'),
    'club': dict(
        TITLE='מי פה? · מועדון', DESC='גלגל קבוצתי לחברים 18+: אף פעם לא, מי הכי, סוד ובאמפ. כולם משחקים בכל סיבוב.',
        BG='#060a18', MUTED='#a9b8e8', GOLD='#fde047', PANEL='#0e1430',
        ACCENT='linear-gradient(135deg,#22e1ff,#ff4fd8)',
        BODYBG='radial-gradient(600px 460px at 10% 0%,#0c4a6e 0%,transparent 65%),radial-gradient(600px 520px at 100% 25%,#701a75 0%,transparent 60%),radial-gradient(500px 400px at 50% 100%,#3f6212 0%,transparent 70%),linear-gradient(180deg,#0a0f24,#060a18)',
        H1GRAD='linear-gradient(270deg,#22e1ff,#a78bfa 45%,#ff4fd8)',
        RIM='conic-gradient(from 0deg,#22e1ff,#ff4fd8,#bef264,#fde047,#22e1ff)',
        RIMGLOW='0 0 40px #22e1ff66,0 0 90px #ff4fd855', GLOW='#22e1ff33',
        LEVELUP='linear-gradient(160deg,#22e1ff,#ff4fd8)', BUMPALL='linear-gradient(160deg,#fde047,#ff4fd8 55%,#22e1ff)',
        BADGE='18+ · CLUB EDITION', H1='מי פה?', GANG='THE GANG', TAG='כולם משחקים בכל סיבוב ✦ מי שמפסיד שותה',
        PLAYERS_OPT=' (לא חובה)', PLAYERS_NOTE='בגרסה הזאת כולם משחקים ביחד. שמות עוזרים רק כדי לדעת מי מסובב.',
        SPARK1='🪩', SPARK2='✨'),
    'duo': dict(
        TITLE='בשניים · THE GANG', DESC='גלגל זוגי לחברים 18+: כל סיבוב מגריל לך פרטנר. נשיקה, אמת זוגית, חובה זוגית ובאמפ.',
        BG='#12030a', MUTED='#e8b4c0', GOLD='#f7b2a1', PANEL='#250812',
        ACCENT='linear-gradient(135deg,#ff4d6d,#9d0208)',
        BODYBG='radial-gradient(700px 520px at 50% -10%,#6b0f2a 0%,transparent 65%),radial-gradient(500px 500px at 0% 70%,#3d0a1f 0%,transparent 60%),linear-gradient(180deg,#1d0510,#12030a 70%,#0a0206)',
        H1GRAD='linear-gradient(270deg,#ffd6dc,#ff4d6d 50%,#c9184a)',
        RIM='conic-gradient(from 0deg,#f7b2a1,#ff4d6d,#9d0208,#ff758f,#f7b2a1)',
        RIMGLOW='0 0 40px #ff4d6d66,0 0 90px #f7b2a144', GLOW='#ff4d6d33',
        LEVELUP='linear-gradient(160deg,#ff4d6d,#590d22)', BUMPALL='linear-gradient(160deg,#fcd5ce,#ff4d6d 55%,#9d0208)',
        BADGE='18+ · DUO EDITION', H1='בשניים', GANG='THE GANG', TAG='כל סיבוב מגריל לך פרטנר ✦ מה שיוצא עושים ביחד',
        PLAYERS_OPT='', PLAYERS_NOTE='הכניסו את כל השמות. בכל סיבוב הגלגל מגריל למי שמסובב פרטנר מתוכם.',
        SPARK1='💋', SPARK2='❤️‍🔥'),
}

template = (ROOT / 'template.html').read_text()
for name, vals in VERSIONS.items():
    out = template
    for k, v in vals.items():
        out = out.replace('{{' + k + '}}', v)
    assert '{{' not in out, (name, out[out.index('{{'):out.index('{{') + 30])
    d = ROOT / name
    (d / 'index.html').write_text(out)
    shutil.copy(ROOT / 'engine.js', d / 'engine.js')
    shutil.copy(REPO / 'bump' / 'data.js', d / 'base.js')
    shutil.copy(REPO / 'bump' / 'face.jpg', d / 'face.jpg')
    print('built', name)
