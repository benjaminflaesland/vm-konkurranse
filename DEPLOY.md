# Produksjonsdeploy og rollback

## Før merge

- Kjør `npm run check`.
- Kontroller at Deploy Preview bruker Node 24 og riktige, separate preview-hemmeligheter.
- Test offentlig visning, admininnlogging, XLSX-import, autosave, konfliktvalg og logout.
- Test seremonifasene; offentlig klient skal bare få avslørte bonuser.
- Kontroller supporterbatching og livekampvisning i desktop- og mobilbredde.

## Før første produksjonsdeploy

```bash
NETLIFY_SITE_ID=... NETLIFY_AUTH_TOKEN=... npm run backup
```

Bekreft at snapshotfilen finnes lokalt og oppbevares sikkert utenfor Git. Kontroller også at `ADMIN_PASSWORD` og `ADMIN_SESSION_SECRET` er satt i Production-context, og at session secret er minst 32 tilfeldige tegn.

## Deploy

1. Squash-merge PR-en etter at `quality` passerer.
2. Vent på Netlify production deploy.
3. Gjør en kort smoke-test: innlogging, import, lagring, offentlig resultat, kåring og planlagt resultatfunksjon.
4. Kontroller Functions-loggene for `401`, `409`, `422` og `503` som ikke er forventet.

## Rollback

Publiser forrige fungerende production deploy fra Netlify. Schema v3 er bakoverkompatibelt, så kode-rollback skal normalt ikke endre Blob-data. Ved datakorrupsjon: stopp redigering og schedule, ta snapshot av nåtilstanden, gjenopprett valgt snapshot via Netlify Blobs API og verifiser `competition-data` før schedule slås på igjen.
