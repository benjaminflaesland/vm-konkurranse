import { useEffect } from "react";
import worldCupPrizeSilhouette from "../../assets/world-cup-prize-silhouette.webp";

const ROUNDS = [
  { key: "gruppe", label: "Gruppespill" },
  { key: "r16", label: "16-delsfinaler" },
  { key: "r8", label: "8-delsfinaler" },
  { key: "kvart", label: "Kvartfinaler" },
  { key: "semi", label: "Semifinaler" },
  { key: "bronse_finale", label: "Bronse & finale" },
];
const BONUS_LABEL = "Bonusspørsmål";
const DEFAULT_CEREMONY = { phase: "rounds", step: 0, bonusRevealed: 0 };
const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "";
const isExcludedFromCompetition = (participant) => participant?.excluded === true;

function normalizeCeremony(value) {
  const phase = ["rounds", "bonus", "winner"].includes(value?.phase) ? value.phase : DEFAULT_CEREMONY.phase;
  return {
    phase,
    step: Math.max(0, Math.min(ROUNDS.length - 1, Number(value?.step) || 0)),
    bonusRevealed: Math.max(0, Number(value?.bonusRevealed) || 0),
    bonusOrder: Array.isArray(value?.bonusOrder) ? value.bonusOrder.filter((id) => typeof id === "string") : undefined,
    revealedBonusIds: Array.isArray(value?.revealedBonusIds) ? value.revealedBonusIds.filter((id) => typeof id === "string") : undefined,
  };
}

function cumulative(participant, roundIndex) {
  let score = 0;
  for (let index = 0; index <= roundIndex; index += 1) score += participant.scores[ROUNDS[index].key] || 0;
  return score;
}

function rankingAt(participants, roundIndex) {
  return [...participants]
    .map((participant) => ({ ...participant, total: cumulative(participant, roundIndex) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

function LockIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ display: "block" }}>
      <rect x="4.75" y="10" width="14.5" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 14.25v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function LockedCeremony() {
  return (
    <main className="ceremony-lock" aria-labelledby="ceremony-lock-title">
      <div className="ceremony-grain" aria-hidden="true" />
      <div className="ceremony-prize-stage" aria-hidden="true">
        <div className="ceremony-prize-aura" />
        <div className="ceremony-prize-floor" />
        <img className="ceremony-prize" src={worldCupPrizeSilhouette} alt="" loading="lazy" decoding="async" />
      </div>

      <div className="ceremony-inner">
        <div className="ceremony-copy">
          <div className="ceremony-kicker"><LockIcon size={15} /> Kåringen er låst</div>
          <h1 id="ceremony-lock-title" className="ceremony-title">Hvem tar<br /><em>pokalen?</em></h1>
          <p className="ceremony-description">Premien venter. Vinneren avsløres når resultatet fra VM-finalen er klart.</p>
          <div className="ceremony-status"><span /> Åpner etter finalen</div>
        </div>
      </div>
    </main>
  );
}

function Present({ participants, ceremony, setCeremony, isAdmin, isLive, onExit }) {
  const competingParticipants = participants.filter((p) => !isExcludedFromCompetition(p));
  const normalizedCeremony = normalizeCeremony(ceremony);
  const { phase, step } = normalizedCeremony;
  const bonusRevealed = Math.min(normalizedCeremony.bonusRevealed, competingParticipants.length);

  const finalBase = competingParticipants.map((p) => ({
    ...p, base: ROUNDS.reduce((s, r) => s + (p.scores[r.key] || 0), 0),
  }));
  const participantById = new Map(finalBase.map((p) => [p.id, p]));
  const syncedBonusOrder = normalizedCeremony.bonusOrder
    ?.map((id) => participantById.get(id))
    .filter(Boolean);
  const publicRevealedOrder = normalizedCeremony.revealedBonusIds
    ?.map((id) => participantById.get(id))
    .filter(Boolean) || [];
  const bonusOrder = isAdmin
    ? (syncedBonusOrder?.length === competingParticipants.length
        ? syncedBonusOrder
        : [...finalBase].sort((a, b) => (a.bonus || 0) - (b.bonus || 0) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)))
    : publicRevealedOrder;

  const next = () => {
    if (phase === "rounds") {
      if (step < ROUNDS.length - 1) setCeremony({ ...normalizedCeremony, step: step + 1 });
      else setCeremony({
        ...normalizedCeremony,
        phase: "bonus",
        bonusRevealed: 0,
        bonusOrder: [...finalBase]
          .sort((a, b) => (a.bonus || 0) - (b.bonus || 0) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
          .map((participant) => participant.id),
      });
    } else if (phase === "bonus") {
      if (bonusRevealed < competingParticipants.length) setCeremony({ ...normalizedCeremony, bonusRevealed: bonusRevealed + 1 });
      else setCeremony({ ...normalizedCeremony, phase: "winner", bonusRevealed: competingParticipants.length });
    }
  };
  const prev = () => {
    if (phase === "winner") setCeremony({ ...normalizedCeremony, phase: "bonus", bonusRevealed: competingParticipants.length });
    else if (phase === "bonus") {
      if (bonusRevealed > 0) setCeremony({ ...normalizedCeremony, bonusRevealed: bonusRevealed - 1 });
      else setCeremony({ ...normalizedCeremony, phase: "rounds", step: ROUNDS.length - 1 });
    } else if (step > 0) setCeremony({ ...normalizedCeremony, step: step - 1 });
  };

  useEffect(() => {
    const onKey = (e) => {
      if (isAdmin && (e.key === "ArrowRight" || e.key === " ")) { e.preventDefault(); next(); }
      else if (isAdmin && e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      else if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // next/prev always use the same ceremony snapshot represented by these values.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, phase, step, bonusRevealed, competingParticipants.length, onExit]);

  const phaseLabel = phase === "rounds" ? ROUNDS[step].label
    : phase === "bonus" ? `${BONUS_LABEL} (${bonusRevealed}/${competingParticipants.length})`
    : "Vinner!";

  return (
    <div style={S.presentWrap}>
      {phase === "rounds" && <BumpChart participants={competingParticipants} step={step} />}
      {phase === "bonus" && (
        <BonusReveal finalBase={finalBase} bonusOrder={bonusOrder} revealed={bonusRevealed} />
      )}
      {phase === "winner" && <WinnerScreen finalBase={finalBase} />}

      {isAdmin ? (
        <div style={S.presentNav}>
          <button onClick={prev} disabled={phase === "rounds" && step === 0} style={S.navBtn}>‹ Tilbake</button>
          <div style={S.phaseLabel}>
            {!isLive && <span style={S.previewLabel}>Forhåndsvisning</span>}
            {phaseLabel}
          </div>
          <button onClick={next} disabled={phase === "winner"} style={{ ...S.navBtn, ...S.navBtnPrimary }}>
            {phase === "rounds" && step === ROUNDS.length - 1 ? "Bonusrunde ›"
              : phase === "bonus" && bonusRevealed === competingParticipants.length ? "Kår vinner ›"
              : "Neste ›"}
          </button>
        </div>
      ) : (
        <div style={S.publicCeremonyStatus} role="status">
          <span style={S.publicCeremonyDot} /> {phase === "winner" ? "Kåringen er avgjort" : `Direkte kåring · ${phaseLabel}`}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// BUMP CHART
// ─────────────────────────────────────────────
function BumpChart({ participants, step }) {
  const n = participants.length;
  const atRounds = ROUNDS.map((_, i) => rankingAt(participants, i));
  const rankOf = (pid, ri) => atRounds[ri].findIndex((p) => p.id === pid);

  const rowH = Math.min(72, Math.max(40, 560 / Math.max(n, 1)));
  const W = 1000;
  // Reserve space after the active round for the participant labels. Keeping each
  // label beside its current endpoint makes the line-to-name mapping unambiguous
  // after positions swap between rounds.
  const padL = 32, padR = 200, padT = 58, padB = 20;
  const chartH = Math.max(rowH * n, 300);
  const H = padT + chartH + padB;
  const visible = step + 1;

  const xFor = (ri) =>
    padL + (ROUNDS.length === 1 ? 0 : (ri / (ROUNDS.length - 1)) * (W - padL - padR));
  const yFor = (rank) => padT + rank * rowH + rowH / 2;

  const smoothPath = (pts) => {
    if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dx = (b.x - a.x) * 0.55;
      d += ` C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
    }
    return d;
  };

  const finalRanking = atRounds[step];

  return (
    <div style={{ ...S.chartCard, padding: "16px 12px" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>

        {Array.from({ length: n }).map((_, rank) => (
          <line key={rank}
            x1={padL} y1={yFor(rank)}
            x2={xFor(ROUNDS.length - 1) + 12} y2={yFor(rank)}
            stroke="var(--border)" strokeWidth="1" />
        ))}

        {ROUNDS.map((r, i) => (
          <g key={r.key} opacity={i < visible ? 1 : 0.25} style={{ transition: "opacity .5s" }}>
            <text x={xFor(i)} y={34} style={{ fill: i === step ? "var(--text1)" : "var(--text3)" }}
              fontSize="14" fontWeight={i === step ? 800 : 600}
              textAnchor="middle" fontFamily="'Inter', sans-serif">
              {r.short}
            </text>
            {i === step && (
              <line x1={xFor(i) - 24} y1={44} x2={xFor(i) + 24} y2={44}
                style={{ stroke: "var(--accent)" }} strokeWidth="4" strokeLinecap="round" />
            )}
          </g>
        ))}

        {participants.map((p) => {
          const pts = [];
          for (let i = 0; i < visible; i++) {
            pts.push({ x: xFor(i), y: yFor(rankOf(p.id, i)) });
          }
          const isLast = (i) => i === pts.length - 1;
          return (
            <g key={p.id}>
              <path d={smoothPath(pts)} fill="none" stroke={p.color} strokeWidth="3.5"
                strokeLinecap="round" style={{ transition: "d .7s ease" }} />
              {pts.map((pt, i) => (
                <circle key={i} cx={pt.x} cy={pt.y}
                  r={isLast(i) ? 7 : 5}
                  fill={isLast(i) ? p.color : "var(--bg3)"}
                  stroke={p.color}
                  strokeWidth={isLast(i) ? 0 : 2.5}
                  style={{ transition: "all .7s ease" }} />
              ))}
            </g>
          );
        })}

        {participants.map((p) => {
          const lastRoundIdx = visible - 1;
          const rankNow = rankOf(p.id, lastRoundIdx);
          const y = yFor(rankNow);
          const overallRank = finalRanking.findIndex((r) => r.id === p.id);
          return (
            <g key={p.id} style={{ transition: "all .7s ease" }}>
              <text x={xFor(lastRoundIdx) + 16} y={y + 5} style={{ fill: "var(--text1)" }} fontSize="14"
                fontWeight="700" fontFamily="'Inter', sans-serif">
                {firstName(p.name)}
                <tspan style={{ fill: "var(--text3)" }} fontSize="11" fontWeight="600" dx="5">#{overallRank + 1}</tspan>
              </text>
            </g>
          );
        })}

      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────
// BONUS REVEAL
// ─────────────────────────────────────────────
function BonusReveal({ finalBase, bonusOrder, revealed }) {
  const revealedIds = new Set(bonusOrder.slice(0, revealed).map((p) => p.id));
  const current = finalBase.map((p) => ({
    ...p,
    shown: p.base + (revealedIds.has(p.id) ? p.bonus || 0 : 0),
    bonusShown: revealedIds.has(p.id),
  }));
  const sorted = [...current].sort((a, b) => b.shown - a.shown || a.name.localeCompare(b.name));
  const justRevealed = revealed > 0 ? bonusOrder[revealed - 1] : null;
  const rowH = Math.min(56, Math.max(36, 500 / Math.max(sorted.length, 1)));

  return (
    <div style={S.chartCard}>
      <div style={S.bonusHeader}>
        {BONUS_LABEL}
        {justRevealed && (
          <span key={justRevealed.id} className="bonus-pop" style={S.bonusPop}>
            {firstName(justRevealed.name)} +{justRevealed.bonus || 0}
          </span>
        )}
      </div>
      <div style={{ position: "relative", height: sorted.length * rowH + 8 }}>
        {sorted.map((p, i) => (
          <div key={p.id}
            style={{
              ...S.bonusRow, top: i * rowH, height: rowH - 7,
              borderLeft: `5px solid ${p.color}`,
              background: p.bonusShown ? "var(--bg4)" : "var(--bg0)",
            }}>
            <span style={S.bonusRank}>{i + 1}</span>
            <span style={S.bonusName}>{firstName(p.name)}</span>
            {p.bonusShown && (p.bonus || 0) > 0 && (
              <span className="bonus-star" style={S.bonusStar}>+{p.bonus}</span>
            )}
            <span style={S.bonusScore}>{p.shown}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// WINNER
// ─────────────────────────────────────────────
function WinnerScreen({ finalBase }) {
  const sorted = [...finalBase]
    .map((p) => ({ ...p, total: p.base + (p.bonus || 0) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const [w, second, third] = sorted;

  return (
    <div style={S.winnerCard}>
      <Confetti />
      <div style={S.podiumWrap}>
        {second && <Podium place={2} p={second} height={140} delay={0.2} />}
        {w && <Podium place={1} p={w} height={200} delay={0} winner />}
        {third && <Podium place={3} p={third} height={100} delay={0.4} />}
      </div>
      <div style={S.winnerTitle}>{firstName(w?.name)}</div>
      <div style={S.winnerSub}>Avdelingens fremste fotballekspert · {w?.total} poeng</div>
      {sorted.length > 3 && (
        <ol style={S.restList}>
          {sorted.slice(3).map((p, i) => (
            <li key={p.id} style={S.restItem}>
              <span style={S.restRank}>{i + 4}.</span>
              <span style={{ ...S.dot, background: p.color }} />
              <span style={{ flex: 1 }}>{firstName(p.name)}</span>
              <span style={{ fontWeight: 800, color: "#00DC64" }}>{p.total} p</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Podium({ place, p, height, delay, winner }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", animationDelay: `${delay}s` }}
      className="podium-rise">
      <div style={{ width: 34, height: 34, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6,
        background: place === 1 ? "var(--accent)" : "var(--bg4)", color: place === 1 ? "var(--accent-fg)" : "var(--text2)",
        fontWeight: 800, fontSize: 16 }}>{place}</div>
      <div style={{ fontWeight: 800, fontSize: winner ? 21 : 16, color: "var(--text1)", marginBottom: 2, textAlign: "center" }}>
        {firstName(p.name)}
      </div>
      <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 8 }}>{p.total} p</div>
      <div style={{
        width: 116, height, borderRadius: "10px 10px 0 0",
        background: `linear-gradient(180deg, ${p.color}, ${p.color}99)`,
        display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 8,
        boxShadow: winner ? `0 0 40px ${p.color}66` : "none",
      }}>
        <span style={{ fontSize: 38, fontWeight: 800, color: "var(--text1)", opacity: 0.85 }}>{place}</span>
      </div>
    </div>
  );
}

function Confetti() {
  const colors = ["#00DC64", "#3D7EF5", "#E8334A", "#F5A623", "#A855F7", "#06B6D4"];
  return (
    <div style={S.confetti}>
      {Array.from({ length: 60 }).map((_, i) => (
        <span key={i} className="confetti-piece"
          style={{
            left: `${Math.random() * 100}%`,
            background: colors[i % colors.length],
            animationDelay: `${Math.random() * 3}s`,
            animationDuration: `${2.5 + Math.random() * 2}s`,
          }} />
      ))}
    </div>
  );
}

const S = {
  dot: { display: "inline-block", width: 10, height: 10, borderRadius: "50%", marginRight: 9, verticalAlign: "middle" },
  presentWrap: { flex: 1, display: "flex", flexDirection: "column", padding: 16, maxWidth: 1280, margin: "0 auto", width: "100%", boxSizing: "border-box" },
  chartCard: { flex: 1, background: "var(--bg3)", borderRadius: 20, padding: 18, display: "flex", flexDirection: "column", justifyContent: "center" },
  presentNav: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, gap: 12 },
  phaseLabel: { fontSize: 17, color: "var(--text1)", fontWeight: 900, textAlign: "center", display: "flex", alignItems: "center", gap: 8 },
  previewLabel: { display: "inline-block", padding: "3px 7px", borderRadius: 6, color: "#D8B15A", background: "#D8B15A1A", fontSize: 9.5, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase" },
  publicCeremonyStatus: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 18, color: "var(--text3)", fontSize: 13, fontWeight: 700 },
  publicCeremonyDot: { width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 0 4px color-mix(in srgb, var(--accent) 14%, transparent)" },
  navBtn: { background: "transparent", border: "1px solid var(--border)", color: "var(--text1)", padding: "12px 18px", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 700 },
  navBtnPrimary: { background: "var(--accent)", color: "var(--accent-fg)", border: "none", borderRadius: 50, padding: "14px 20px" },
  bonusHeader: { fontSize: 24, color: "var(--text1)", textAlign: "center", marginBottom: 22, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" },
  bonusPop: { background: "var(--accent)", color: "var(--accent-fg)", padding: "5px 16px", borderRadius: 50, fontSize: 15, fontWeight: 800 },
  bonusRow: { position: "absolute", left: 0, right: 0, display: "flex", alignItems: "center", gap: 12, padding: "0 16px", borderRadius: 12, transition: "top .8s cubic-bezier(.34,1.2,.64,1), background .4s", background: "var(--bg0)" },
  bonusRank: { width: 28, fontWeight: 800, color: "var(--text3)", fontSize: 15 },
  bonusName: { flex: 1, fontSize: 16, fontWeight: 700, color: "var(--text1)" },
  bonusStar: { color: "#F5A623", fontWeight: 800, fontSize: 14 },
  bonusScore: { fontSize: 20, fontWeight: 900, color: "var(--text1)", minWidth: 44, textAlign: "right" },
  winnerCard: { flex: 1, background: "var(--bg3)", borderRadius: 20, padding: 24, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" },
  podiumWrap: { display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 16, marginBottom: 28, minHeight: 270 },
  winnerTitle: { fontSize: 30, fontWeight: 900, color: "var(--text1)", textAlign: "center" },
  winnerSub: { fontSize: 14, color: "var(--text3)", marginTop: 6 },
  restList: { listStyle: "none", margin: "20px 0 0", padding: 0, width: "100%", maxWidth: 440 },
  restItem: { display: "flex", alignItems: "center", gap: 8, padding: "11px 0", fontSize: 15, borderBottom: "1px solid var(--border)" },
  restRank: { width: 28, color: "var(--text3)", fontWeight: 800 },
  confetti: { position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" },
};

export default function Ceremony({ unlocked, ...props }) {
  return unlocked ? <Present {...props} /> : <LockedCeremony />;
}
