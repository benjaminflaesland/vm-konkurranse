import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toNorwegian } from "../../../shared/competition.js";
import { Flag, codeOf } from "../../components/Flag.jsx";
import { formatCountdown, parseGameDate, useLiveGames } from "../live-games.js";
import { useIsMobile } from "../../hooks/useMediaQuery.js";
import norseKnitBand from "../../assets/norse-knit-band.webp";
import roadVm1998 from "../../assets/road-vm-1998.webp";
import roadVmOpening from "../../assets/road-vm-opening.webp";
import roadVmItaly from "../../assets/road-vm-italy.webp";
import roadVmMoldova from "../../assets/road-vm-moldova.webp";
import roadVmNovember from "../../assets/road-vm-november.webp";
import roadVmMilan from "../../assets/road-vm-milan.webp";
import roadVmArrived from "../../assets/road-vm-arrived.webp";
import vmMatchIraq from "../../assets/vm-match-iraq.webp";
import vmMatchSenegal from "../../assets/vm-match-senegal.webp";
import vmMatchFrance from "../../assets/vm-match-france.webp";
import vmMatchIvoryCoast from "../../assets/vm-match-ivory-coast.webp";

const NORGE_VM_STOPS = [
  {
    id: "1998", date: "23. juni 1998", score: "Norge 2–1 Brasil", image: roadVm1998,
    title: "Da Norge skrev historie",
    body: [
      "En regntung kveld i Marseille slo Norge de regjerende verdensmesterne. Kjetil Rekdals sene straffe sendte Norge videre fra gruppespillet.",
      "Seieren over Brasil ble stående som det siste store VM-minnet — og starten på en 28 år lang ventetid.",
    ],
  },
  {
    id: "avspark", date: "Mars 2025", score: "Kvalifiseringen starter", image: roadVmOpening,
    title: "Et nytt avspark",
    body: [
      "En ny generasjon tok fatt på kvalifiseringen med den samme drømmen: å føre Norge tilbake til verdens største scene.",
      "Kampanjen åpnet med retning, tempo og en tro på at denne gangen kunne reisen gå hele veien.",
    ],
  },
  {
    id: "italia-oslo", date: "6. juni 2025", score: "Norge 3–0 Italia", image: roadVmItaly, focus: "center 60%",
    title: "Italia lagt bak",
    body: [
      "På Ullevaal kom en kveld som endret tyngden i gruppa. Norge slo Italia klart og ga kvalifiseringsløpet en helt ny form.",
      "Plutselig var ikke drømmen bare mulig. Norge hadde lagt et fundament som kunne bære helt til VM.",
    ],
  },
  {
    id: "moldova", date: "9. september 2025", score: "Norge 11–1 Moldova", image: roadVmMoldova,
    title: "En rekord som runget",
    body: [
      "Elleve mål ble et voldsomt bevis på hvor høyt nivået var blitt. Norge slo ikke bare motstanderen — de bygget en målforskjell som ga trygghet i innspurten.",
      "Angrepskraften ble selve seilet i ferden: mål etter mål, og stadig mer kontroll på veien videre.",
    ],
  },
  {
    id: "november", date: "13. november 2025", score: "Norge 4–1 Estland", image: roadVmNovember,
    title: "Nærmere enn på 28 år",
    body: [
      "Hjemme mot Estland fortsatte Norge den perfekte rekka. Fire nye mål gjorde at VM-plassen var innen rekkevidde.",
      "Før siste stopp i Milano var kursen satt. Bare et helt usannsynlig sammenbrudd kunne stanse reisen.",
    ],
  },
  {
    id: "milan", date: "16. november 2025", score: "Italia 1–4 Norge", image: roadVmMilan,
    title: "Billetten til VM",
    body: [
      "Norge snudde kampen i Milano og avsluttet kvalifiseringen med åtte seire av åtte. Etter 28 år var ventetiden over.",
      "Langskipet nådde havn: Norge vant Gruppe I, Haaland scoret 16 kvalifiseringsmål, og veien gikk videre til VM 2026.",
    ],
  },
];

const VOYAGE_CORE_NODES = [
  ...NORGE_VM_STOPS.map((s) => ({ ...s, phase: "kval" })),
  {
    id: "ankomst", phase: "arrival", date: "Juni 2026", title: "Norge har landet i USA",
    body: "Ferden over Atlanteren er fullført. Norge har gått i land i Amerika, og VM 2026 kan endelig begynne.",
    image: roadVmArrived,
  },
];

// ISO 3166 alpha-2 → flag emoji (regional indicators)
const codeToFlag = (cc) =>
  cc ? cc.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0))) : "";

const knockoutRound = (id) => {
  const gameId = Number(id);
  if (gameId >= 73 && gameId <= 88) return "16-delsfinale";
  if (gameId >= 89 && gameId <= 96) return "8-delsfinale";
  if (gameId >= 97 && gameId <= 100) return "Kvartfinale";
  if (gameId >= 101 && gameId <= 102) return "Semifinale";
  if (gameId === 103) return "Bronsefinale";
  if (gameId === 104) return "Finale";
  return "Sluttspill";
};

const VM_MATCH_STORIES = {
  18: {
    label: "VM-comebacket",
    title: "Haaland tente returen",
    body: "Første VM-kamp på 28 år ble jevnere enn 4–1 tilsier. Irak utlignet før pause og presset Norge, men Haaland straffet en keeperfeil, Østigård headet inn treeren og et sent selvmål ga en perfekt start.",
    visual: "Haaland x2",
    outcome: "Tre poeng og viktig målforskjell i åpningskampen.",
    image: vmMatchIraq,
    focus: "46% 46%",
    focusMobile: "44% 46%",
    focusDesktop: "47% 46%",
  },
  42: {
    label: "Nøkkelkampen",
    title: "Haaland avgjorde kaoskampen",
    body: "Marcus Pedersen kom tidlig inn fra benken og svarte med sitt første landslagsmål. Etter pause satte Haaland to, men Ismaïla Sarrs dobbel gjorde sluttminuttene ville før Norge rodde av stormen.",
    visual: "Knockout klar",
    outcome: "Avansementet var sikret før gruppefinalen mot Frankrike.",
    image: vmMatchSenegal,
    focus: "41% 4%",
    focusMobile: "41% 0%",
    focusDesktop: "43% 4%",
    imageHeightMobile: 250,
  },
  62: {
    label: "Gruppefinalen",
    title: "Dembélé ødela gruppefinalen",
    body: "Norge hvilte flere profiler og fikk en brutal lærepenge. Ousmane Dembélé avgjorde kampen med et hat trick før halvtimen var spilt, og en reddet Strand Larsen-straffe fjernet siste håp om comeback.",
    visual: "Varsko",
    outcome: "Andreplass i gruppa - videre, men med tydelig varsel.",
    image: vmMatchFrance,
    focus: "43% 52%",
    focusMobile: "41% 52%",
    focusDesktop: "39% 52%",
    imageHeightMobile: 250,
    imageHeightDesktop: 292,
  },
  78: {
    label: "Utslagsdramaet",
    title: "Nusa åpnet, Haaland lukket",
    body: "Antonio Nusa sendte Norge foran med et soloraid, før Amad Diallo både reddet på streken og utlignet. Fire minutter før slutt kom Bobb og Berg fri på høyresiden, og Haaland dyttet Norge videre.",
    visual: "Videre!",
    outcome: "Første norske VM-sluttspillseier. Brasil venter i åttedelsfinalen.",
    image: vmMatchIvoryCoast,
    focus: "62% 43%",
    focusMobile: "63% 43%",
    focusDesktop: "61% 43%",
    imageHeightMobile: 244,
  },
};

function matchStoryForGame(game, result, opponent) {
  if (!result) return null;
  const known = VM_MATCH_STORIES[Number(game.id)];
  if (known) return known;
  const won = result === "W";
  const drawn = result === "D";
  return {
    label: game.type === "group" ? "VM-kamp" : knockoutRound(game.id),
    title: won ? "Norge tok neste steg" : drawn ? "Alt er fortsatt åpent" : "Norge må reise seg igjen",
    body: won
      ? `Seieren mot ${opponent} ga Norge mer fart på VM-reisen og flyttet laget videre langs ruten.`
      : drawn
        ? `Uavgjort mot ${opponent} holdt spenningen levende og gjorde neste kamp enda viktigere.`
        : `Tapet mot ${opponent} ble et stopp i marsjen, men ruten videre er ikke ferdig skrevet.`,
    visual: won ? "Seier" : drawn ? "Uavgjort" : "Tap",
  };
}

function gameToVoyageNode(game) {
  const norwayHome = game.home_team_name_en === "Norway";
  const opponent = toNorwegian(norwayHome ? game.away_team_name_en : game.home_team_name_en);
  const kickoff = parseGameDate(game);
  const finished = String(game.finished).toUpperCase() === "TRUE";
  const homeScore = Number(game.home_score);
  const awayScore = Number(game.away_score);
  const hasScore = finished && game.home_score !== "" && game.away_score !== "" && Number.isFinite(homeScore) && Number.isFinite(awayScore);
  const norwayScore = norwayHome ? homeScore : awayScore;
  const opponentScore = norwayHome ? awayScore : homeScore;
  const result = !hasScore ? null : norwayScore > opponentScore ? "W" : norwayScore < opponentScore ? "L" : "D";
  const kind = game.type === "group" ? "group" : "knockout";

  return {
    id: `vm-${game.id}`,
    phase: "vm",
    kind,
    round: kind === "group" ? "Gruppespill" : knockoutRound(game.id),
    date: kickoff ? kickoff.toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" }) : "Tidspunkt kommer",
    opponent,
    oppCode: null,
    kickoff: kickoff ? kickoff.toISOString() : null,
    score: hasScore ? `${norwayScore}–${opponentScore}` : null,
    result,
    story: matchStoryForGame(game, result, opponent),
  };
}

function liveVoyageNodes(games) {
  let groupMatchesPlayed = 0;
  let groupPoints = 0;
  return (games || [])
    .filter((game) => game.home_team_name_en === "Norway" || game.away_team_name_en === "Norway")
    .map((game) => ({ node: gameToVoyageNode(game), kickoff: parseGameDate(game), id: Number(game.id) || Infinity }))
    .sort((a, b) => (a.kickoff?.getTime() ?? Infinity) - (b.kickoff?.getTime() ?? Infinity) || a.id - b.id)
    .map(({ node }) => {
      if (node.kind !== "group" || !node.result) return node;
      groupMatchesPlayed += 1;
      groupPoints += node.result === "W" ? 3 : node.result === "D" ? 1 : 0;
      return { ...node, groupMatchesPlayed, groupPoints };
    });
}

// Catmull-Rom spline through points → one smooth cubic-bezier path string
function smoothPath(pts) {
  if (pts.length < 2) return "";
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

const nodeIsDone = (n) => n.phase === "kval" || n.phase === "arrival" || !!n.score;

// One ornate "saga wave" — a cresting wave that breaks and curls into a spiral,
// in the spirit of old Norse scrollwork / Hokusai line waves. Drawn around origin.
const SAGA_WAVE = "M-16,4 C-12,4.5 -10,-1.5 -5,-5 C-1,-7.6 5,-7 8,-2.6 C10.6,1.4 7.6,6.2 2.2,5.4 C-1.8,4.8 -2.4,0.6 0.4,-0.8 C2.4,-1.8 4,0.4 2.6,2";

// Top-down longship, drawn pointing +x (rotated to the path tangent by the caller).
function Longship() {
  return (
    <g className="voyage-bob">
      <path d="M-30,0 C-21,-8 0,-10 15,-8 C28,-6 36,-3 43,0 C36,3 28,6 15,8 C0,10 -21,8 -30,0 Z" fill="#6B431F" stroke="#C7A75D" strokeWidth="1.4" />
      <path d="M-28,0 L40,0" stroke="#C7A75D" strokeWidth="0.8" opacity="0.55" />
      <g stroke="#C7A75D" strokeWidth="1.5" strokeLinecap="round">
        <path d="M-16,-8 L-20,-15" /><path d="M-16,8 L-20,15" />
        <path d="M-4,-9 L-7,-16" /><path d="M-4,9 L-7,16" />
        <path d="M8,-9 L6,-16" /><path d="M8,9 L6,16" />
        <path d="M18,-8 L17,-15" /><path d="M18,8 L17,15" />
      </g>
      <g aria-label="Norsk flagg">
        <defs><clipPath id="longship-flag-banner"><path d="M-2,-20 C3,-22 9,-21 14,-17 L14,17 C9,21 3,22 -2,19 Z" /></clipPath></defs>
        <path d="M-2,-20 C3,-22 9,-21 14,-17 L14,17 C9,21 3,22 -2,19 Z" fill="#BA1B2D" />
        <g clipPath="url(#longship-flag-banner)">
          <rect x="2" y="-22" width="5" height="44" fill="#FFFFFF" />
          <rect x="-4" y="-5" width="20" height="7" fill="#FFFFFF" />
          <rect x="3.1" y="-22" width="2.8" height="44" fill="#11296B" />
          <rect x="-4" y="-3" width="20" height="3" fill="#11296B" />
        </g>
        <path d="M-2,-20 C3,-22 9,-21 14,-17 L14,17 C9,21 3,22 -2,19 Z" fill="none" stroke="#D8B06A" strokeWidth="1" strokeLinejoin="round" />
      </g>
      <rect x="0" y="-11" width="7" height="22" rx="2" fill="#8A1D2D" stroke="#D8B06A" strokeWidth="1" />
      <circle cx="3.5" cy="0" r="1.8" fill="#D8B06A" />
      <path d="M43,0 c5,-1 8,-4 4,-7" fill="none" stroke="#C7A75D" strokeWidth="1.5" />
    </g>
  );
}

export default function NorgesVeiTilVM() {
  const isMobile = useIsMobile();
  // Kort stables (bilde over, info under) tidligere enn lane-bruddet — så side-ved-side
  // bare i full bredde, og under bildet når vinduet blir smalere.
  const cardMobile = useIsMobile(1024);
  const LANE_W = isMobile ? 58 : 188;
  const AMP = isMobile ? 13 : 44;
  const CX = LANE_W / 2;
  const GAP = isMobile ? 12 : 18;
  const liveGames = useLiveGames();
  const vmNodes = liveVoyageNodes(liveGames);
  const voyageNodes = [...VOYAGE_CORE_NODES, ...vmNodes];
  const hasConfirmedFinal = voyageNodes.some((node) => node.round === "Finale" && node.kind === "knockout");

  const containerRef = useRef(null);
  const cardRefs = useRef([]);
  const baseRef = useRef(null);
  const fillRef = useRef(null);
  const shipRef = useRef(null);
  const lutRef = useRef(null);
  const sceneMetricsRef = useRef({ pageTop: 0, maxScroll: 0 });

  const [geo, setGeo] = useState({ pathD: "", height: 0, nodes: [], waves: [] });
  const [activeIdx, setActiveIdx] = useState(0);
  const geoRef = useRef(geo);
  geoRef.current = geo;

  // Re-place the ship and green fill from the current scroll position.
  function update() {
    const L = lutRef.current, cont = containerRef.current, g = geoRef.current;
    if (!L || !cont) return;
    const metrics = sceneMetricsRef.current;
    const anchor = window.innerHeight * 0.46;
    const lastNodeY = g.nodes.length ? g.nodes[g.nodes.length - 1].y : g.height;
    // Keep the whole longship inside the rail at the final stop, rather than
    // allowing its prow or flag to clip beyond the bottom edge.
    const boatHalfHeight = isMobile ? 23 : 30;
    const dockY = Math.max(0, Math.min(lastNodeY, g.height - boatHalfHeight));
    const naturalY = Math.max(0, Math.min(dockY, anchor + window.scrollY - metrics.pageTop));
    // A moderately longer final approach feels calmer without pulling the ship
    // down to the last node too early while it is still in the viewport.
    const dockingRange = Math.min(isMobile ? 500 : 440, metrics.maxScroll);
    const dockingProgress = dockingRange ? Math.max(0, Math.min(1, (dockingRange - (metrics.maxScroll - window.scrollY)) / dockingRange)) : 1;
    const easedDocking = dockingProgress * dockingProgress * (3 - 2 * dockingProgress);
    const y = naturalY + (dockY - naturalY) * easedDocking;
    let lo = 0, hi = L.lut.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (L.lut[m].y < y) lo = m + 1; else hi = m; }
    // Interpolate between lookup samples. Choosing the next sample directly
    // made the ship advance in visible steps on the tall mobile journey.
    const next = L.lut[lo], prev = L.lut[Math.max(0, lo - 1)];
    const span = next.y - prev.y;
    const t = span > 0 ? Math.max(0, Math.min(1, (y - prev.y) / span)) : 0;
    const e = {
      x: prev.x + (next.x - prev.x) * t,
      y: prev.y + (next.y - prev.y) * t,
      len: prev.len + (next.len - prev.len) * t,
      angle: prev.angle + (next.angle - prev.angle) * t,
    };
    if (shipRef.current) {
      shipRef.current.setAttribute("transform", `translate(${e.x.toFixed(1)},${e.y.toFixed(1)}) rotate(${e.angle.toFixed(1)})`);
    }
    if (fillRef.current) fillRef.current.setAttribute("stroke-dasharray", `${e.len.toFixed(1)} ${(L.total + 12).toFixed(1)}`);
    let bi = 0, bd = Infinity;
    g.nodes.forEach((n) => { const d = Math.abs(n.y - y); if (d < bd) { bd = d; bi = n.i; } });
    setActiveIdx((prev) => (prev === bi ? prev : bi));
  }

  // Measure each card's centre → node points → the curvy path that threads them.
  useLayoutEffect(() => {
    const measure = () => {
      const cont = containerRef.current;
      if (!cont) return;
      const rect = cont.getBoundingClientRect();
      sceneMetricsRef.current = {
        pageTop: rect.top + window.scrollY,
        maxScroll: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
      };
      const h = cont.offsetHeight;
      const nodes = [];
      const pts = [{ x: CX, y: Math.min(28, h) }];
      cardRefs.current.forEach((el, i) => {
        if (!el) return;
        const y = el.offsetTop + el.offsetHeight / 2;
        const x = CX + AMP * Math.sin(i * 0.95 + 0.4);
        nodes.push({ x, y, i });
        pts.push({ x, y });
      });
      const waveRows = [];
      const STEP = isMobile ? 26 : 32, ROWH = isMobile ? 34 : 40, GAPW = STEP * 1.6;
      let row = 0;
      for (let wy = 26; wy < h - 6; wy += ROWH, row++) {
        if (row % 3 === 1) continue; // leave some lines as open water
        const odd = row % 2 === 1;
        // Deterministic variation gives each row its own tide without changing
        // pattern every time ResizeObserver runs.
        const seed = ((row * 37 + 17) % 97) / 97;
        const speedSeed = ((row * 53 + 11) % 89) / 89;
        const waveRow = {
          y: wy, flip: odd,
          drift: Math.round((isMobile ? 16 : 28) + seed * (isMobile ? 16 : 22)),
          duration: 5.2 + speedSeed * 3.8,
          delay: -(row * 0.73 + seed * 1.8),
          waves: [],
        };
        const run = odd ? 5 : 4; // a group of 4–5 waves, then a horizontal gap, then more
        // Extend the pattern beyond the clipping rail so its gentle sideways
        // drift never reveals a hard edge or makes a new wave pop into view.
        let x = (odd ? STEP / 2 : 0) - 64, n = 0;
        while (x < LANE_W + 64) {
          waveRow.waves.push({ x, deep: odd });
          n++;
          x += (n % run === 0) ? GAPW : STEP;
        }
        waveRows.push(waveRow);
      }
      setGeo({ pathD: smoothPath(pts), height: h, nodes, waves: waveRows });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [isMobile, CX, AMP, vmNodes.length]);

  // Build a length→point lookup table from the rendered path (before paint, no flash).
  useLayoutEffect(() => {
    const p = baseRef.current;
    if (!p || !geo.pathD) return;
    let total = 0;
    try { total = p.getTotalLength(); } catch { return; }
    const N = 260, lut = [];
    for (let i = 0; i <= N; i++) {
      const len = (total * i) / N;
      const pt = p.getPointAtLength(len);
      lut.push({ len, x: pt.x, y: pt.y, angle: 0 });
    }
    for (let i = 0; i < lut.length; i++) {
      const a = lut[Math.max(0, i - 1)], b = lut[Math.min(lut.length - 1, i + 1)];
      lut[i].angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    }
    lutRef.current = { lut, total };
    update();
  }, [geo.pathD]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drive the ship with page scroll. Attached once; reads fresh geometry via refs.
  useEffect(() => {
    let raf = 0;
    const onScroll = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; update(); }); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ padding: 16, maxWidth: 1280, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
      <div style={{ margin: "4px 0 18px", maxWidth: 720 }}>
        <div style={{ color: "var(--accent)", fontSize: 11, fontWeight: 900, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>Landslagsskipets rute</div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <h1 style={{ margin: 0, color: "var(--text1)", fontSize: isMobile ? 27 : 36, lineHeight: 1.08, letterSpacing: -0.9 }}>Norges vei til VM</h1>
          <div style={{ flexShrink: 0 }}><VikingHorn /></div>
        </div>
        <p style={{ margin: "10px 0 0", color: "var(--text2)", fontSize: 15, lineHeight: 1.55, maxWidth: 640 }}>
          Fra Marseille i 1998 til verdens største scene i USA. Skroll deg nedover og følg langskipet over havet — fra kvalifiseringen til VM 2026.
        </p>
      </div>

      <div ref={containerRef} style={{ position: "relative", maxWidth: isMobile ? "none" : LANE_W + GAP + 960 }}>
        <svg aria-hidden="true" width={LANE_W} height={geo.height || 1} viewBox={`0 0 ${LANE_W} ${geo.height || 1}`}
          style={{ position: "absolute", left: 0, top: 0, overflow: "hidden" }}>
          <defs><clipPath id="laneClip"><rect x="0" y="0" width={LANE_W} height={geo.height || 1} rx="16" /></clipPath></defs>
          <rect x="0" y="0" width={LANE_W} height={geo.height || 1} rx="16" fill="#0A1E3C" />
          <g clipPath="url(#laneClip)">
            {geo.waves.map((row, rowIndex) => (
              <g key={rowIndex} className="voyage-wave-line" style={{
                "--wave-from": `${-row.drift}px`, "--wave-to": `${row.drift}px`,
                animationDuration: `${row.duration.toFixed(2)}s`, animationDelay: `${row.delay.toFixed(2)}s`,
              }}>
                {row.waves.map((wave, waveIndex) => (
                  <path key={waveIndex} d={SAGA_WAVE}
                    transform={`translate(${wave.x.toFixed(1)},${row.y.toFixed(1)})${row.flip ? " scale(-1,1)" : ""}`}
                    fill="none" stroke={wave.deep ? "#2F537E" : "#4C77A6"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
                ))}
              </g>
            ))}
          </g>
          {geo.pathD && <g clipPath="url(#laneClip)">
            <path ref={baseRef} d={geo.pathD} fill="none" stroke="#3A557E" strokeWidth="2.4" strokeDasharray="2 8" strokeLinecap="round" opacity="0.85" />
            <path ref={fillRef} d={geo.pathD} fill="none" stroke="#45D17F" strokeWidth="3.2" strokeLinecap="round" />
          </g>}
          {geo.nodes.map((n) => {
            const node = voyageNodes[n.i];
            const done = nodeIsDone(node);
            const gold = node.kind === "knockout" || node.phase === "arrival";
            const ring = gold ? "#C7A75D" : done ? "#45D17F" : "#7E9BC6";
            return (
              <g key={node.id}>
                <line x1={n.x} y1={n.y} x2={LANE_W} y2={n.y} stroke={ring} strokeWidth="1" opacity={n.i === activeIdx ? 0.5 : 0.2} />
                {n.i === activeIdx && <circle cx={n.x} cy={n.y} r="11" fill="none" stroke={ring} strokeWidth="1.5" opacity="0.5" />}
                <circle cx={n.x} cy={n.y} r="5.5" fill={done ? ring : "#0A1E3C"} stroke={ring} strokeWidth="2.2" />
              </g>
            );
          })}
          {geo.height > 0 && <>
            <g transform={`translate(${CX - 12}, 11)`}>
              <rect width="24" height="17" rx="1.5" fill="#BA1B2D" /><rect x="8" width="5" height="17" fill="#fff" /><rect y="6" width="24" height="5" fill="#fff" /><rect x="9.5" width="2.5" height="17" fill="#11296B" /><rect y="7.2" width="24" height="2.5" fill="#11296B" />
            </g>
            {hasConfirmedFinal && <g transform={`translate(${CX - 13}, ${geo.height - 30})`}>
              <rect width="26" height="17" rx="1.5" fill="#B22234" /><rect y="2.4" width="26" height="2.4" fill="#fff" /><rect y="7.3" width="26" height="2.4" fill="#fff" /><rect y="12.1" width="26" height="2.4" fill="#fff" /><rect width="11" height="9" fill="#3C3B6E" />
            </g>}
          </>}
          {geo.pathD && <g ref={shipRef}><Longship /></g>}
        </svg>

        <div style={{ marginLeft: LANE_W + GAP }}>
          {voyageNodes.map((node, i) => (
            <div key={node.id} ref={(el) => (cardRefs.current[i] = el)} style={{ padding: isMobile ? "9px 0" : "13px 0" }}>
              <VoyageCard node={node} active={i === activeIdx} isMobile={cardMobile} imageOnRight={i % 2 === 1} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MatchPicture({ node, isMobile, resColor }) {
  const opponent = node.opponent || "Motstander";
  const label = node.story?.visual || node.story?.label || node.round;
  const image = node.story?.image;
  const story = node.story || {};
  const imageHeight = isMobile
    ? story.imageHeightMobile || 232
    : story.imageHeightDesktop || 276;
  const imageFocus = isMobile
    ? story.focusMobile || story.focus || "center"
    : story.focusDesktop || story.focus || "center";
  const imageScale = story.scale || 1;
  return (
    <div style={{
      position: "relative", minHeight: imageHeight, height: "100%", overflow: "hidden",
      backgroundColor: "#071C42",
    }}>
      {image ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", objectPosition: imageFocus,
            transform: `scale(${imageScale})`,
          }}
        />
      ) : null}
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0,
        background: `
          linear-gradient(90deg, rgba(0,0,0,0.72), rgba(0,0,0,0.22) 48%, rgba(0,0,0,0.78)),
          linear-gradient(0deg, rgba(0,0,0,0.46), transparent 44%),
          radial-gradient(circle at 18% 22%, color-mix(in srgb, ${resColor} 24%, transparent), transparent 32%)
        `,
      }} />
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0, opacity: 0.14,
        backgroundImage: `url(${norseKnitBand})`,
        backgroundRepeat: "repeat",
        backgroundSize: "96px 96px",
        mixBlendMode: "screen",
      }} />

      <div style={{ position: "relative", zIndex: 1, height: "100%", minHeight: imageHeight, padding: isMobile ? 16 : 20, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
            <Flag name="Norge" size={isMobile ? 30 : 38} />
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "rgba(255,255,255,0.68)", fontSize: 10, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase" }}>Norge</div>
              <div style={{ color: "#FFFFFF", fontSize: isMobile ? 16 : 19, fontWeight: 900, whiteSpace: "nowrap" }}>{node.score}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0, justifyContent: "flex-end" }}>
            <div style={{ minWidth: 0, textAlign: "right" }}>
              <div style={{ color: "rgba(255,255,255,0.68)", fontSize: 10, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase" }}>{codeOf(opponent)}</div>
              <div style={{ color: "#FFFFFF", fontSize: isMobile ? 13 : 15, fontWeight: 850, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: isMobile ? 126 : 150 }}>{opponent}</div>
            </div>
            <Flag name={opponent} code={node.oppCode} size={isMobile ? 30 : 38} />
          </div>
        </div>

        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 9px", borderRadius: 8, background: "rgba(0,0,0,0.34)", border: "1px solid rgba(255,255,255,0.13)" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: resColor, boxShadow: `0 0 0 4px color-mix(in srgb, ${resColor} 18%, transparent)` }} />
            <span style={{ color: "#FFFFFF", fontSize: 10.5, fontWeight: 900, letterSpacing: 1.1, textTransform: "uppercase" }}>{label}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function VoyageCard({ node, active, isMobile, imageOnRight }) {
  const splitDirection = isMobile ? "column" : imageOnRight ? "row-reverse" : "row";
  const base = {
    background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 16,
    boxShadow: active ? "0 0 0 1.5px var(--accent)" : "none",
    transition: "box-shadow .25s ease", overflow: "hidden",
    maxWidth: isMobile ? "none" : 600,
  };

  if (node.phase === "kval") {
    return (
      <article style={{ ...base, maxWidth: isMobile ? "none" : 960 }}>
        <div style={{ display: "flex", flexDirection: splitDirection, alignItems: "stretch" }}>
          <div style={{ position: "relative", flex: isMobile ? "0 0 auto" : "0 0 56%", aspectRatio: isMobile ? "3 / 2" : "auto", minHeight: isMobile ? 0 : 320, background: "#07101F", overflow: "hidden" }}>
            <img src={node.image} alt="" loading="lazy" decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: node.focus || "center" }} />
          </div>
          <div style={{ flex: isMobile ? "0 0 auto" : "1 1 44%", padding: isMobile ? "13px 15px 16px" : "22px 26px", display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
            <div style={{ color: "var(--text3)", fontSize: 11, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase" }}>{node.date}</div>
            <div style={{ marginTop: 3, color: "var(--accent)", fontSize: 16, fontWeight: 900 }}>{node.score}</div>
            <h3 style={{ margin: "6px 0 0", color: "var(--text1)", fontSize: isMobile ? 20 : 24, letterSpacing: -0.4 }}>{node.title}</h3>
            <div style={{ marginTop: 9, color: "var(--text2)", fontSize: 14, lineHeight: 1.6 }}>
              {node.body.map((p) => <p key={p} style={{ margin: "0 0 8px" }}>{p}</p>)}
            </div>
          </div>
        </div>
      </article>
    );
  }

  if (node.phase === "arrival") {
    return (
      <article style={{ ...base, maxWidth: isMobile ? "none" : 960 }}>
        <div style={{ display: "flex", flexDirection: splitDirection, alignItems: "stretch" }}>
          <div style={{ position: "relative", flex: isMobile ? "0 0 auto" : "0 0 56%", aspectRatio: isMobile ? "16 / 9" : "auto", minHeight: isMobile ? 0 : 320, background: "#07101F", overflow: "hidden" }}>
            <img src={node.image} alt="" loading="lazy" decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <div style={{ flex: isMobile ? "0 0 auto" : "1 1 44%", padding: isMobile ? "13px 15px 16px" : "22px 26px", display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
            <div style={{ color: "#C7A75D", fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase" }}>{codeToFlag("US")} Ankomst · VM 2026</div>
            <h3 style={{ margin: "6px 0 0", color: "var(--text1)", fontSize: isMobile ? 20 : 24, letterSpacing: -0.4 }}>{node.title}</h3>
            <p style={{ margin: "9px 0 0", color: "var(--text2)", fontSize: 14, lineHeight: 1.6 }}>{node.body}</p>
          </div>
        </div>
      </article>
    );
  }

  const played = !!node.score;
  const placeholder = node.kind === "knockout" && !node.opponent && !node.score;
  const resColor = node.result === "W" ? "var(--accent)" : node.result === "L" ? "#E0564F" : "#E0A106";
  const resLabel = node.result === "W" ? "Seier" : node.result === "L" ? "Tap" : node.result === "D" ? "Uavgjort" : "";
  const kickoff = node.kickoff ? new Date(node.kickoff) : null;
  const upcomingFixture = !played && !placeholder && Boolean(node.opponent);
  const campaignLabel = placeholder ? "Mulig videre vei" : upcomingFixture ? "Neste kamp" : resLabel;
  const campaignTitle = placeholder
    ? "Kun ved avansement"
    : upcomingFixture
      ? kickoff ? formatCountdown(kickoff) : "Kampdato kommer"
      : node.kind === "knockout"
        ? node.result === "W" ? "Videre" : node.result === "D" ? "Ekstra nerve" : "Stopp"
        : node.result === "W" ? "3 poeng" : node.result === "D" ? "1 poeng" : "0 poeng";
  const perfectGroupStart = node.kind === "group" && node.result === "W" && node.groupMatchesPlayed === 2 && node.groupPoints === 6;
  const campaignCopy = placeholder
    ? "Motstander og kampdato fastsettes etter gruppespillet."
    : upcomingFixture
      ? kickoff
        ? `${kickoff.toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long" })} · ${kickoff.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })} norsk tid`
        : "Tidspunktet er ikke fastsatt ennå."
      : node.kind === "knockout"
        ? node.result === "W" ? "Norge lever videre i sluttspillet." : "VM-reisen stopper her."
        : node.result === "W" ? perfectGroupStart ? "Seks poeng av seks — Norge står med full pott etter to kamper." : "En sterk start på VM-reisen." : node.result === "D" ? "Alt er fortsatt åpent i gruppa." : "Norge må slå tilbake i neste kamp.";
  const panelColor = placeholder ? "#C7A75D" : upcomingFixture ? "var(--accent)" : resColor;

  if (played) {
    const story = node.story || matchStoryForGame({ id: node.id, type: node.kind }, node.result, node.opponent);
    return (
      <article style={{ ...base, maxWidth: isMobile ? "none" : 960, borderColor: `color-mix(in srgb, ${resColor} 45%, var(--border))` }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "42% 58%", alignItems: "stretch" }}>
          <MatchPicture node={node} isMobile={isMobile} resColor={resColor} />
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 216px", minWidth: 0 }}>
            <div style={{ padding: isMobile ? "14px 15px 16px" : "19px 22px", minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <span style={{ color: "var(--text3)", fontSize: 11, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase" }}>
                  {node.round}{node.date && node.date !== "Sluttspill" ? ` · ${node.date}` : ""}
                </span>
                <span style={{ color: resColor, fontSize: 11.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.4 }}>{resLabel}</span>
              </div>

              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 800, color: "var(--text1)" }}>
                  <Flag name="Norge" size={19} /> Norge
                </span>
                <span style={{ fontSize: 16, fontWeight: 900, color: resColor, minWidth: 46, textAlign: "center", padding: "2px 9px", borderRadius: 8, background: "var(--bg2)" }}>
                  {node.score}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 800, color: "var(--text1)", minWidth: 0 }}>
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{node.opponent}</span>
                  <Flag name={node.opponent} code={node.oppCode} size={19} />
                </span>
              </div>

              <div style={{ marginTop: 14, color: resColor, fontSize: 10.5, fontWeight: 900, letterSpacing: 1.1, textTransform: "uppercase" }}>{story.label}</div>
              <h3 style={{ margin: "5px 0 0", color: "var(--text1)", fontSize: isMobile ? 20 : 22, lineHeight: 1.12, fontWeight: 900, letterSpacing: -0.45 }}>{story.title}</h3>
              <p style={{ margin: "8px 0 0", color: "var(--text2)", fontSize: 13.5, lineHeight: 1.55, fontWeight: 600 }}>{story.body}</p>
            </div>
            <aside style={{
              display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0,
              padding: isMobile ? "13px 15px 15px" : "19px 20px",
              borderTop: isMobile ? "1px solid var(--border)" : "none",
              borderLeft: isMobile ? "none" : "1px solid var(--border)",
              background: `linear-gradient(135deg, color-mix(in srgb, ${panelColor} 10%, var(--bg3)), var(--bg3))`,
            }}>
              <div style={{ color: panelColor, fontSize: 10.5, fontWeight: 900, letterSpacing: 1.1, textTransform: "uppercase" }}>{campaignLabel}</div>
              <div style={{ marginTop: 5, color: "var(--text1)", fontSize: isMobile ? 19 : 23, fontWeight: 900, letterSpacing: -0.5 }}>{campaignTitle}</div>
              <div style={{ marginTop: 5, color: "var(--text3)", fontSize: 13, fontWeight: 650, lineHeight: 1.45 }}>{story.outcome || campaignCopy}</div>
            </aside>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article style={{ ...base, maxWidth: isMobile ? "none" : 960, borderColor: played ? `color-mix(in srgb, ${resColor} 45%, var(--border))` : "var(--border)" }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "56% 44%" }}>
        <div style={{ padding: isMobile ? "14px 15px" : "19px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span style={{ color: placeholder ? "#C7A75D" : "var(--text3)", fontSize: 11, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase" }}>
              {node.round}{node.date && node.date !== "Sluttspill" ? ` · ${node.date}` : ""}
            </span>
            {played && <span style={{ color: resColor, fontSize: 11.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.4 }}>{resLabel}</span>}
            {!played && !placeholder && kickoff && <span style={{ color: "var(--text3)", fontSize: 11.5, fontWeight: 700 }}>{formatCountdown(kickoff)}</span>}
          </div>

          {placeholder ? (
            <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 8, color: "var(--text3)", fontSize: 13.5, fontWeight: 700 }}>
              <span style={{ fontSize: 16 }}>🏆</span> Venter på lagene
            </div>
          ) : (
            <div style={{ marginTop: 9, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 800, color: "var(--text1)" }}>
                <Flag name="Norge" size={19} /> Norge
              </span>
              <span style={{ fontSize: 16, fontWeight: 900, color: played ? resColor : "var(--text3)", minWidth: 46, textAlign: "center", padding: "2px 9px", borderRadius: 8, background: "var(--bg2)" }}>
                {played ? node.score : "vs"}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 800, color: "var(--text1)" }}>
                {node.opponent} <Flag name={node.opponent} code={node.oppCode} size={19} />
              </span>
            </div>
          )}
        </div>
        <aside style={{
          display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0,
          padding: isMobile ? "13px 15px 15px" : "19px 24px",
          borderTop: isMobile ? "1px solid var(--border)" : "none",
          borderLeft: isMobile ? "none" : "1px solid var(--border)",
          background: `linear-gradient(135deg, color-mix(in srgb, ${panelColor} 10%, var(--bg3)), var(--bg3))`,
        }}>
          <div style={{ color: panelColor, fontSize: 10.5, fontWeight: 900, letterSpacing: 1.1, textTransform: "uppercase" }}>{campaignLabel}</div>
          <div style={{ marginTop: 5, color: "var(--text1)", fontSize: isMobile ? 19 : 23, fontWeight: 900, letterSpacing: -0.5 }}>{campaignTitle}</div>
          <div style={{ marginTop: 5, color: "var(--text3)", fontSize: 13, fontWeight: 650, lineHeight: 1.45 }}>{campaignCopy}</div>
        </aside>
      </div>
    </article>
  );
}
