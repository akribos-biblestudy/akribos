from pathlib import Path
import sys
from fontTools.ttLib import TTFont
root=Path(sys.argv[1] if len(sys.argv)>1 else '/home/mirko/git/akribos')
out=Path(__file__).parent/'fonts'
out.mkdir(exist_ok=True)
paths=list((root/'src/lib/assets/fonts').glob('akribos-text-*.woff2'))
paths += [root/'node_modules/@fontsource/noto-sans-hebrew/files'/f'noto-sans-hebrew-hebrew-{weight}-normal.woff2' for weight in (400,700)]
for p in paths:
    font=TTFont(p, recalcTimestamp=False)
    font.flavor=None
    font.save(out/(p.stem+'.ttf'))
    print(p.name, '->', p.stem+'.ttf')
