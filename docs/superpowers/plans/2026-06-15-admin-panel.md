# Admin-panel + Netlify Blobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Legg til skjult admin-panel (5x logoklikk + passord), public stilling/fasit-visning, og delt datalagring via Netlify Blobs.

**Architecture:** App.jsx splittes i public-tabs (Stilling + FasitView) og admin-tabs (Deltakere, Fasit, Kåring). Admin-modus trigges ved 5x logoklikk, sjekkes mot `ADMIN_PASSWORD` env var via Netlify-funksjon. Data lagres i Netlify Blobs og hentes ved oppstart.

**Tech Stack:** React 18, Vite, Netlify Functions (ESM), @netlify/blobs, sessionStorage

---

## Filstruktur

| Fil | Endring |
|-----|---------|
| `netlify/functions/auth.js` | Ny — POST, sjekker passord mot env var |
| `netlify/functions/data.js` | Ny — GET/POST Netlify Blobs |
| `netlify.toml` | Oppdater — legg til auth + data funksjonskonfig |
| `src/App.jsx` | Oppdater — admin-state, logoklikkeller, modal, betingede tabs, async data load/save |
| `package.json` | Oppdater — legg til @netlify/blobs |

---

## Task 1: Installer @netlify/blobs

**Files:**
- Modify: `package.json`

- [ ] **Installer pakken**

```bash
cd /Users/ben/Projects/vm_konkurranse/mnt/user-data/outputs/vm-konkurranse
npm install @netlify/blobs
```

- [ ] **Verifiser at den er lagt til**

```bash
grep netlify/blobs package.json
```

Forventet output: `"@netlify/blobs": "^8.x.x"` (eller tilsvarende versjon)

- [ ] **Commit**

```bash
git add package.json package-lock.json
git commit -m "Legg til @netlify/blobs"
```

---

## Task 2: Netlify-funksjon — auth.js

**Files:**
- Create: `netlify/functions/auth.js`

- [ ] **Opprett filen**

```js
// netlify/functions/auth.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();

  const { password } = req.body || {};
  const ok = !!process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD;
  res.json({ ok });
}
```

- [ ] **Commit**

```bash
git add netlify/functions/auth.js
git commit -m "Legg til auth.js Netlify-funksjon"
```

---

## Task 3: Netlify-funksjon — data.js

**Files:**
- Create: `netlify/functions/data.js`

- [ ] **Opprett filen**

```js
// netlify/functions/data.js
import { getStore } from "@netlify/blobs";

const BLOB_KEY = "competition-data";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();

  const store = getStore("vm2026");

  if (req.method === "GET") {
    try {
      const data = await store.get(BLOB_KEY, { type: "json" });
      return res.json(data || {});
    } catch {
      return res.json({});
    }
  }

  if (req.method === "POST") {
    const auth = req.headers.authorization || "";
    const password = auth.replace("Bearer ", "");
    if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Uautorisert" });
    }
    try {
      await store.setJSON(BLOB_KEY, req.body);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).end();
}
```

- [ ] **Commit**

```bash
git add netlify/functions/data.js
git commit -m "Legg til data.js Netlify-funksjon med Blobs"
```

---

## Task 4: Oppdater netlify.toml

**Files:**
- Modify: `netlify.toml`

- [ ] **Erstatt innholdet i netlify.toml**

```toml
[build]
  command = "npm run build"
  publish = "dist"

[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"

[functions."wc"]
  timeout = 30

[functions."auth"]
  timeout = 10

[functions."data"]
  timeout = 15
```

- [ ] **Commit**

```bash
git add netlify.toml
git commit -m "Legg til auth og data i netlify.toml"
```

---

## Task 5: Async loadData og saveData i App.jsx

Erstatt de eksisterende `saveData` og `loadData` funksjonene med async versjoner som bruker serveren.

**Files:**
- Modify: `src/App.jsx` (rundt linje 84–93)

- [ ] **Erstatt loadData og saveData**

Finn og erstatt hele blokken:
```js
function saveData(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  catch (e) { console.error("Kunne ikke lagre:", e); }
}
function loadData() {
  try {
    const d = localStorage.getItem(STORAGE_KEY);
    return d ? JSON.parse(d) : null;
  } catch { return null; }
}
```

Med:
```js
async function saveData(data, adminPassword) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
  if (!adminPassword) return;
  try {
    await fetch("/.netlify/functions/data", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminPassword}`,
      },
      body: JSON.stringify(data),
    });
  } catch (e) { console.error("Kunne ikke lagre til server:", e); }
}

async function loadData() {
  try {
    const res = await fetch("/.netlify/functions/data");
    if (res.ok) {
      const d = await res.json();
      if (d?.participants) return d;
    }
  } catch {}
  try {
    const d = localStorage.getItem(STORAGE_KEY);
    return d ? JSON.parse(d) : null;
  } catch { return null; }
}
```

- [ ] **Commit**

```bash
git add src/App.jsx
git commit -m "Gjør loadData/saveData async med Netlify Blobs"
```

---

## Task 6: Admin-state, logoklikkeller og passord-modal i App

**Files:**
- Modify: `src/App.jsx` — `App`-komponenten

- [ ] **Erstatt App-komponentens state-blokk og useEffect**

Finn:
```js
export default function App() {
  const [participants, setParticipants] = useState([]);
  const [fasit, setFasit] = useState(emptyFasit());
  const [mode, setMode] = useState("deltakere");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const _d = loadData(); (() => { const d = _d;
      if (d?.participants) setParticipants(d.participants);
      if (d?.fasit) setFasit({ ...emptyFasit(), ...d.fasit });
      setLoaded(true);
    })();
  }, []);
  useEffect(() => {
    if (loaded) saveData({ participants, fasit });
  }, [participants, fasit, loaded]);
```

Erstatt med:
```js
export default function App() {
  const [participants, setParticipants] = useState([]);
  const [fasit, setFasit] = useState(emptyFasit());
  const [mode, setMode] = useState("stilling");
  const [loaded, setLoaded] = useState(false);
  const [isAdmin, setIsAdmin] = useState(() => sessionStorage.getItem("vm_admin") === "1");
  const [adminPassword, setAdminPassword] = useState(() => sessionStorage.getItem("vm_pw") || "");
  const [logoClicks, setLogoClicks] = useState(0);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const logoClickTimer = useRef(null);

  useEffect(() => {
    loadData().then((d) => {
      if (d?.participants) setParticipants(d.participants);
      if (d?.fasit) setFasit({ ...emptyFasit(), ...d.fasit });
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded && isAdmin) saveData({ participants, fasit }, adminPassword);
  }, [participants, fasit, loaded]);

  const handleLogoClock = () => {
    clearTimeout(logoClickTimer.current);
    setLogoClicks((prev) => {
      const next = prev + 1;
      if (next >= 5) {
        setShowPasswordModal(true);
        return 0;
      }
      logoClickTimer.current = setTimeout(() => setLogoClicks(0), 2000);
      return next;
    });
  };

  const handlePasswordSubmit = async () => {
    const res = await fetch("/.netlify/functions/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: passwordInput }),
    });
    const { ok } = await res.json();
    if (ok) {
      setIsAdmin(true);
      setAdminPassword(passwordInput);
      sessionStorage.setItem("vm_admin", "1");
      sessionStorage.setItem("vm_pw", passwordInput);
      setShowPasswordModal(false);
      setPasswordInput("");
      setPasswordError(false);
      setMode("deltakere");
    } else {
      setPasswordError(true);
    }
  };
```

- [ ] **Commit**

```bash
git add src/App.jsx
git commit -m "Legg til admin-state og logoklikkeller"
```

---

## Task 7: Passord-modal og betingede tabs i header

**Files:**
- Modify: `src/App.jsx` — `return`-blokken i `App`

- [ ] **Erstatt laste-skjermen og header-return i App**

Finn:
```js
  if (!loaded) {
    return (
      <div style={{ ...S.app, alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>Laster …</div>
      </div>
    );
  }

  return (
    <div style={S.app}>
      <style>{CSS}</style>
      <header style={S.header}>
        <div style={S.logo}>
          <span style={S.ball}>⚽</span>
          <div>
            <div style={S.title}>VM 2026</div>
            <div style={S.subtitle}>Tippekonkurranse</div>
          </div>
        </div>
        <div style={S.modeToggle}>
          {[
            ["deltakere", "Deltakere"],
            ["fasit", "Fasit"],
            ["present", "Kåring"],
          ].map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)}
              disabled={m === "present" && participants.length < 2}
              style={{ ...S.modeBtn, ...(mode === m ? S.modeBtnActive : {}) }}>
              {label}
            </button>
          ))}
        </div>
      </header>

      {mode === "deltakere" && (
        <Deltakere participants={participants} setParticipants={setParticipants} fasit={fasit} />
      )}
      {mode === "fasit" && <Fasit fasit={fasit} setFasit={setFasit} />}
      {mode === "present" && <Present participants={participants} onExit={() => setMode("deltakere")} />}
    </div>
  );
```

Erstatt med:
```js
  if (!loaded) {
    return (
      <div style={{ ...S.app, alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>Laster …</div>
      </div>
    );
  }

  const publicTabs = [["stilling", "Stilling"], ["fasit-view", "Fasit"]];
  const adminTabs = [["deltakere", "Deltakere"], ["fasit", "Fasit"], ["present", "Kåring"]];
  const tabs = isAdmin ? [...publicTabs, ...adminTabs] : publicTabs;

  return (
    <div style={S.app}>
      <style>{CSS}</style>

      {showPasswordModal && (
        <div style={S.modalOverlay}>
          <div style={S.modal}>
            <div style={S.modalTitle}>🔐 Admin-tilgang</div>
            <input
              type="password"
              autoFocus
              value={passwordInput}
              onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(false); }}
              onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
              placeholder="Passord"
              style={{ ...S.input, marginBottom: 8 }}
            />
            {passwordError && <div style={{ color: "#E8334A", fontSize: 13, marginBottom: 8 }}>Feil passord</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handlePasswordSubmit} style={S.calcBtn}>Logg inn</button>
              <button onClick={() => { setShowPasswordModal(false); setPasswordInput(""); setPasswordError(false); }}
                style={{ ...S.addBtn }}>Avbryt</button>
            </div>
          </div>
        </div>
      )}

      <header style={S.header}>
        <div onClick={handleLogoClock} style={{ ...S.logo, cursor: "default", userSelect: "none" }}>
          <span style={S.ball}>⚽</span>
          <div>
            <div style={S.title}>VM 2026</div>
            <div style={S.subtitle}>Tippekonkurranse</div>
          </div>
        </div>
        <div style={S.modeToggle}>
          {tabs.map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)}
              disabled={m === "present" && participants.length < 2}
              style={{ ...S.modeBtn, ...(mode === m ? S.modeBtnActive : {}) }}>
              {label}
            </button>
          ))}
        </div>
      </header>

      {mode === "stilling" && <Stilling participants={participants} />}
      {mode === "fasit-view" && <FasitView fasit={fasit} />}
      {mode === "deltakere" && (
        <Deltakere participants={participants} setParticipants={setParticipants} fasit={fasit} />
      )}
      {mode === "fasit" && <Fasit fasit={fasit} setFasit={setFasit} />}
      {mode === "present" && <Present participants={participants} onExit={() => setMode("stilling")} />}
    </div>
  );
```

- [ ] **Legg til modal-stiler i S-objektet** (etter `confetti`-linjen i `S`):

```js
  modalOverlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
  },
  modal: {
    background: "#1C1C1E", borderRadius: 20, padding: 28, width: "100%", maxWidth: 340,
    display: "flex", flexDirection: "column", gap: 4,
  },
  modalTitle: { fontSize: 18, fontWeight: 800, marginBottom: 12, color: "#fff" },
```

- [ ] **Commit**

```bash
git add src/App.jsx
git commit -m "Legg til passord-modal og betingede tabs"
```

---

## Task 8: Stilling-komponent (public leaderboard)

Legg til `Stilling`-komponenten rett etter `Deltakere`-komponenten i `App.jsx`.

**Files:**
- Modify: `src/App.jsx`

- [ ] **Legg til Stilling-komponenten** (etter avsluttende `}` for `Deltakere`-funksjonen):

```js
// ─────────────────────────────────────────────
// STILLING — public leaderboard
// ─────────────────────────────────────────────
function Stilling({ participants }) {
  const ranked = rankingAt(participants, ROUNDS.length - 1);
  const withTotal = ranked.map((p) => ({
    ...p,
    total: ROUNDS.reduce((s, r) => s + (p.scores[r.key] || 0), 0) + (p.bonus || 0),
  }));

  if (participants.length === 0) {
    return (
      <div style={S.adminWrap}>
        <div style={S.empty}>Konkurransen er ikke startet ennå.</div>
      </div>
    );
  }

  return (
    <div style={S.adminWrap}>
      <div style={{ ...S.importCard, marginBottom: 14 }}>
        <div style={S.importTitle}>🏆 Stilling</div>
        <div style={S.importDesc}>Oppdateres av administrator etter hver kampdag.</div>
      </div>
      <div style={{ background: "#1C1C1E", borderRadius: 16, overflow: "hidden" }}>
        {withTotal.map((p, i) => (
          <div key={p.id} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "16px 20px", borderBottom: i < withTotal.length - 1 ? "1px solid #2C2C2E" : "none",
          }}>
            <span style={{ width: 28, fontWeight: 800, fontSize: 18, color: i < 3 ? "#00DC64" : "#8E8E93" }}>
              {i + 1}
            </span>
            <span style={{ ...S.dot, background: p.color, width: 12, height: 12 }} />
            <span style={{ flex: 1, fontWeight: 700, fontSize: 16 }}>{p.name}</span>
            {ROUNDS.map((r) => (
              <span key={r.key} style={{ fontSize: 12, color: "#8E8E93", minWidth: 36, textAlign: "right" }}>
                <span style={{ color: "#fff", fontWeight: 600 }}>{p.scores[r.key] || 0}</span>
                <span style={{ fontSize: 10 }}> {r.short}</span>
              </span>
            ))}
            <span style={{ fontWeight: 900, fontSize: 20, color: "#00DC64", minWidth: 44, textAlign: "right" }}>
              {p.total}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Commit**

```bash
git add src/App.jsx
git commit -m "Legg til Stilling-komponent (public leaderboard)"
```

---

## Task 9: FasitView-komponent (read-only fasit)

**Files:**
- Modify: `src/App.jsx`

- [ ] **Legg til FasitView etter Stilling-komponenten**

```js
// ─────────────────────────────────────────────
// FASIT VIEW — read-only fasit
// ─────────────────────────────────────────────
function FasitView({ fasit }) {
  const row = (label, value) => value ? (
    <div style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: "1px solid #161618" }}>
      <span style={{ ...S.fasitMatchLabel, color: "#8E8E93" }}>{label}</span>
      <span style={{ fontWeight: 700, color: "#fff" }}>{value}</span>
    </div>
  ) : null;

  const anyGroupData = GROUP_KEYS.some((g) => fasit.groups[g].first);
  const anyMatchData = Object.values(fasit.matches).some(Boolean);

  return (
    <div style={S.adminWrap}>
      {!anyGroupData && !anyMatchData ? (
        <div style={S.empty}>Fasit er ikke lagt inn ennå.</div>
      ) : (
        <>
          {anyGroupData && (
            <div style={S.fasitSection}>
              <div style={S.fasitSectionTitle}>Gruppespill</div>
              <div style={S.fasitGrid}>
                {GROUP_KEYS.map((g) => {
                  const { first, second } = fasit.groups[g];
                  if (!first && !second) return null;
                  return (
                    <div key={g} style={S.fasitGroupCard}>
                      <div style={S.fasitGroupName}>Gruppe {g}</div>
                      {first && <div style={{ color: "#fff", fontSize: 13, padding: "3px 0" }}>1. {first}</div>}
                      {second && <div style={{ color: "#fff", fontSize: 13, padding: "3px 0" }}>2. {second}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {anyMatchData && (
            <div style={S.fasitSection}>
              <div style={S.fasitSectionTitle}>Sluttspill</div>
              {Object.entries(fasit.matches).filter(([, v]) => v).map(([m, v]) =>
                row(`M${m}`, v)
              )}
              {fasit.bronse && row("Bronse", fasit.bronse)}
              {fasit.finale && row("🏆 Mester", fasit.finale)}
            </div>
          )}

          {fasit.quiz.some(Boolean) && (
            <div style={S.fasitSection}>
              <div style={S.fasitSectionTitle}>VM-quiz fasit</div>
              {QUIZ_QUESTIONS.map((q, i) =>
                fasit.quiz[i] ? (
                  <div key={i} style={{ ...S.fasitRow, marginBottom: 8 }}>
                    <span style={{ ...S.fasitMatchLabel, width: "auto", flex: 1, whiteSpace: "normal", fontSize: 13 }}>
                      {i + 1}. {q}
                    </span>
                    <span style={{ fontWeight: 700, color: "#00DC64", minWidth: 120, textAlign: "right" }}>
                      {fasit.quiz[i]}
                    </span>
                  </div>
                ) : null
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Commit**

```bash
git add src/App.jsx
git commit -m "Legg til FasitView-komponent (read-only)"
```

---

## Task 10: Push og sett ADMIN_PASSWORD i Netlify

**Files:** ingen kodeendringer

- [ ] **Push til GitHub**

```bash
git push
```

- [ ] **Sett miljøvariabel i Netlify**

1. Gå til [app.netlify.com](https://app.netlify.com) → ditt prosjekt
2. **Project configuration** → **Environment variables**
3. Klikk **Add a variable**
4. Name: `ADMIN_PASSWORD`, Value: velg et passord
5. Klikk **Save**
6. Gå til **Deploys** → klikk **Trigger deploy** → **Deploy site**

- [ ] **Test public-visning**

Åpne `https://spiffy-panda-6facf7.netlify.app`. Du skal se kun **Stilling** og **Fasit**-tabs.

- [ ] **Test admin-tilgang**

Klikk ⚽-logoen 5 ganger raskt. Passord-modal skal dukke opp. Skriv inn passordet du satte. Du skal nå se alle tabs inkludert **Deltakere** og **Kåring**.

- [ ] **Test datalagring**

1. Logg inn som admin
2. Importer en Excel-fil under Deltakere
3. Åpne appen i en annen nettleser/enhet — deltakeren skal vises i Stilling-fanen
