# VM 2026 – tippekonkurranse

En React-app for å importere VM-tips fra `.xlsx`, beregne poeng, vise offentlig stilling og gjennomføre en kontrollert vinnerkåring. Appen kjører på Netlify. Konkurransedata lagres i Netlify Blobs, mens live kampdata hentes server-side fra `worldcup26.ir`.

## Kom i gang

Krav: Node.js 24 og npm.

```bash
nvm use
npm ci
cp .env.example .env
npx netlify dev
```

Netlify Dev gir både Vite-appen og funksjonene på samme origin. `npm run dev` starter bare frontend og bruker utviklingsdata; det er nyttig for UI-arbeid, men tester ikke innlogging eller Blob-lagring.

Kvalitetssjekken som også kjøres i CI:

```bash
npm run check
```

Enkeltkommandoer er `npm run lint`, `npm run test`, `npm run test:watch`, `npm run build` og `npm run preview`.

## Arkitektur

```text
React/Vite
├── src/App.jsx                         applikasjonsskall og navigasjon
├── src/features/                       kåring, VM-reise, livekamper og XLSX-adapter
├── src/hooks/                          data-, sesjons- og mediahooks
├── shared/competition.js               felles domeneinngang
└── netlify/functions/
    ├── auth.js                         signert adminsesjon
    ├── data.js                         validert Blob-lesing/-skriving
    ├── supporter-row.js                aggregert supporterteller
    ├── wc.js                           cachet VM-proxy
    ├── update-results.js               planlagt resultatoppdatering
    └── lib/competition.js              kanonisk poeng- og live-resultatlogikk
```

`shared/competition.js` videresender den samme domenemodulen som Netlify-funksjonene bruker. React og serveren kan derfor ikke drive fra hverandre i lag-normalisering, poengberegning eller live-resultatfletting.

VM-reisen, kåringen og regnearkleseren lastes ved behov. Offentlig førstevisning har et mål på under 80 KB JavaScript gzip og 30 KB CSS gzip.

## Miljøvariabler

Sett disse i Netlify for Production og Deploy Previews:

| Variabel | Bruk |
| --- | --- |
| `ADMIN_PASSWORD` | Delt adminpassord. Bruk et langt, unikt passord. |
| `ADMIN_SESSION_SECRET` | HMAC-nøkkel for admincookie, minst 32 tilfeldige tegn. Må ikke være lik passordet. |

`NETLIFY_SITE_ID` og `NETLIFY_AUTH_TOKEN` trengs bare lokalt for `npm run backup`. De skal ikke eksponeres som Vite-variabler eller committes.

## Data og API

Rotobjektet bruker `schemaVersion: 3`. Hver deltaker har eksplisitt `excluded: boolean`. Serveren genererer `revision` og `updatedAt`; klienten sender `baseRevision` ved lagring. En konkurrerende endring gir `409`, stopper autosave og lar administrator eksportere lokale endringer eller hente skyversjonen.

Viktige kontrakter:

- `POST /.netlify/functions/auth {password}` oppretter en åtte timers HMAC-signert HttpOnly-cookie.
- `GET /.netlify/functions/auth` returnerer sesjonsstatus; `DELETE` logger ut.
- `GET /.netlify/functions/data` returnerer `{data, revision, updatedAt}` og aldri et falskt tomt datasett ved lagringsfeil.
- `POST /.netlify/functions/data {data, baseRevision}` kan returnere `401`, `409`, `422` eller `503`.
- `POST /.netlify/functions/supporter-row {delta}` godtar heltall fra 1 til 10.

Offentlige svar bygges med en eksplisitt serializer. Full `bonusOrder`, skjulte bonuspoeng, quizfasit og interne metadata sendes ikke før riktig seremonifase. Adminpassord og admindata lagres aldri i `localStorage` eller `sessionStorage`.

## XLSX-import

Admin kan velge opptil 20 `.xlsx`-filer på maksimalt 5 MB hver. `read-excel-file` lastes dynamisk i nettleseren, og adapteren finner svararket fra malens overskrifter før celleadresser konverteres til 2D-rader og kolonner. Gammel `.xls` støttes ikke.

## Deploy til Netlify

1. Opprett eller koble Netlify-siden til GitHub-repositoriet.
2. Sett miljøvariablene over i riktig context.
3. Behold build command `npm run build`, publish directory `dist` og functions directory `netlify/functions` (allerede definert i `netlify.toml`).
4. Kontroller Deploy Preview: offentlig side, admininnlogging, XLSX-import, lagring, logout, kåring og livekampvisning.
5. Ta snapshot før første produksjonsdeploy og publiser deretter Deploy Previewen.

`update-results` kjører hvert 15. minutt. Både adminlagring og den planlagte oppdateringen tar automatisk backup av forrige snapshot og beholder de 20 nyeste under `competition-backups/`.

## Backup og rollback

Ta en lokal produksjonssnapshot før deploy:

```bash
NETLIFY_SITE_ID=... NETLIFY_AUTH_TOKEN=... npm run backup
```

Snapshotet skrives med filmodus `0600` til den ignorerte `backups/`-mappen. Oppbevar det sikkert og ikke legg det i Git.

Kode kan rulles tilbake ved å publisere forrige produksjonsdeploy i Netlify. Schema v3 legger til bakoverkompatible rotfelt, så dette krever normalt ikke datarollback. Hvis Blob-data må gjenopprettes, stopp adminredigering og den planlagte funksjonen, ta en ny snapshot, og gjenopprett `competition-data` kontrollert gjennom Netlify Blobs API før funksjonen aktiveres igjen.

## GitHub-praksis

Arbeid i korte branches og åpne PR-er. `quality` må passere før merge. Anbefalte repository-innstillinger:

- krev PR til `main`, oppdatert branch og bestått `quality`;
- blokker force-push og sletting av `main`;
- krev ikke ekstern godkjenning for soloarbeid;
- tillat bare squash merge og slett head-branches automatisk.

Dependabot sjekker npm og GitHub Actions ukentlig. Hemmeligheter og snapshots skal aldri committes. Se [DEPLOY.md](./DEPLOY.md) for produksjonssjekklisten.
