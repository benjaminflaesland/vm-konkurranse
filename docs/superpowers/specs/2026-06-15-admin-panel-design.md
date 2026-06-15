# Admin-panel + delt datalagring — Design

## Oversikt

Appen deles i en public-visning og en skjult admin-visning. Data lagres i Netlify Blobs så alle enheter deler samme tilstand.

## Public-visning (alle)

- **Stilling**: Leaderboard med poeng per runde. Kun lesing, ingen redigering.
- **Fasit**: Viser fasit-data uten input-felter — ren tekstvisning av gruppe-resultater, kampvinnere og quiz-svar.

Deltakere-, Kåring- og Fasit-redigering er ikke synlig for vanlige brukere.

## Admin-visning (låst)

### Tilgang
- Klikk ⚽-logoen **5 ganger raskt** for å trigge passord-modal.
- Passord sjekkes mot `ADMIN_PASSWORD` miljøvariabel via Netlify-funksjon (`auth.js`).
- Admin-modus lagres i `sessionStorage` — forsvinner når fanen lukkes.
- Ingen synlig admin-knapp eller lenke i UI.

### Admin-faner
- **Deltakere**: Import av Excel-filer, manuell redigering av deltakere og poeng, beregn poeng fra fasit.
- **Fasit**: Full redigeringsvisning med dropdowns, input-felter og "Oppdater resultater"-knapp.
- **Kåring**: Animert bump-chart og podium-presentasjon.

## Datalagring (Netlify Blobs)

Alle enheter deler samme data via server-side lagring.

- **GET** `/api/data` — returnerer `{ participants, fasit }`. Åpent for alle.
- **POST** `/api/data` — lagrer ny state. Krever `Authorization: Bearer <passord>` header.
- App laster data fra server ved oppstart. Lagrer til server etter hver endring (admin).
- `localStorage` beholdes som fallback hvis server er utilgjengelig.

## Nye Netlify-funksjoner

| Fil | Formål |
|-----|--------|
| `netlify/functions/auth.js` | POST — sjekker passord mot `ADMIN_PASSWORD` env var, returnerer `{ ok: true/false }` |
| `netlify/functions/data.js` | GET — henter Blob-data; POST — lagrer Blob-data (krever gyldig passord i header) |

## Miljøvariabler (Netlify Dashboard)

| Variabel | Beskrivelse |
|----------|-------------|
| `ADMIN_PASSWORD` | Passordet for admin-tilgang |

## Endringer i App.jsx

- Ny state: `isAdmin` (boolean, fra sessionStorage).
- Ny state: `logoClicks` (teller, nullstilles etter 2 sek uten klikk).
- Passord-modal: vises når `logoClicks >= 5`, kaller `auth.js`.
- Tabs i header viser kun Stilling + Fasit (read-only) for vanlige brukere.
- Admin ser i tillegg: Deltakere, redigerbar Fasit, Kåring.
- `loadData()` henter fra `/.netlify/functions/data` ved oppstart.
- `saveData()` POSTer til `/.netlify/functions/data` med passord i header (admin) eller skriver til localStorage (fallback).
