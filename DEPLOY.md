# VM Konkurranse – Deploy til GitHub og Vercel

## Hva skal gjøres
1. Sett opp prosjektet lokalt
2. Push til GitHub
3. Koble til Vercel

## Steg 1 – Installer avhengigheter
```bash
cd vm-konkurranse
npm install
```

## Steg 2 – Test lokalt
```bash
npm run dev
```
Åpne http://localhost:5173 og sjekk at appen fungerer.

## Steg 3 – Push til GitHub
```bash
git init
git add .
git commit -m "VM 2026 tippekonkurranse – første versjon"
gh repo create vm-konkurranse --public --push --source=.
```
(Krever GitHub CLI: https://cli.github.com)

Alternativt: Lag repo manuelt på github.com og følg instruksjonene der.

## Steg 4 – Deploy til Vercel
```bash
npx vercel
```
Følg wizard: 
- Link to existing project? No
- Project name: vm-konkurranse
- Framework: Vite
- Build command: npm run build
- Output directory: dist

## Steg 5 – Legg til miljøvariabler i Vercel
Gå til: vercel.com → ditt prosjekt → Settings → Environment Variables

Legg til:
- Name: ANTHROPIC_API_KEY
- Value: sk-ant-... (din Anthropic API-nøkkel)
- Environment: Production, Preview, Development

## Steg 6 – Redeploy
```bash
npx vercel --prod
```

## Filstruktur
```
vm-konkurranse/
├── api/
│   ├── claude.js     ← Proxy til Anthropic API (holder nøkkel server-side)
│   └── wc.js         ← Proxy til worldcup26.ir (løser CORS)
├── src/
│   ├── App.jsx       ← Hele appen
│   └── main.jsx      ← React entry point
├── index.html
├── package.json
├── vite.config.js
└── .gitignore
```

## Viktige noter
- `api/wc.js` proxyer worldcup26.ir-kall for å unngå CORS-feil
- `api/claude.js` proxyer Anthropic API så nøkkelen aldri er synlig i frontend
- Data lagres i localStorage (per bruker, per nettleser)
- Trykk "🔄 Oppdater resultater" i Fasit-fanen for å hente live standings
