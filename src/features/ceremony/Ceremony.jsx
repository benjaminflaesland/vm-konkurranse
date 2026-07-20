import { useEffect } from "react";
import { rankByScore } from "../../../shared/competition.js";
import worldCupPrizeSilhouette from "../../assets/world-cup-prize-silhouette.webp";
import { CrownIcon } from "../../components/CrownIcon.jsx";
import { useIsMobile } from "../../hooks/useMediaQuery.js";

const ROUNDS = [
  { key: "gruppe", label: "Gruppespill", short: "Gruppe", afterLabel: "gruppespillet" },
  { key: "r16", label: "16-delsfinaler", short: "16-del", afterLabel: "16-delsfinalene" },
  { key: "r8", label: "8-delsfinaler", short: "8-del", afterLabel: "8-delsfinalene" },
  { key: "kvart", label: "Kvartfinaler", short: "Kvart", afterLabel: "kvartfinalene" },
  { key: "semi", label: "Semifinaler", short: "Semi", afterLabel: "semifinalene" },
  { key: "bronse_finale", label: "Bronse & finale", short: "Finaler", afterLabel: "bronsefinalen og finalen" },
];
const BONUS_LABEL = "Bonusspørsmål";
const BONUS_REVEAL_BATCH_SIZE = 4;
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
  return rankByScore(
    participants.map((participant) => ({ ...participant, total: cumulative(participant, roundIndex) })),
    (participant) => participant.total,
  );
}

function norwegianNameList(names) {
  if (names.length < 2) return names[0] || "";
  if (names.length === 2) return `${names[0]} og ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} og ${names[names.length - 1]}`;
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

function CeremonyIntro({ onStart }) {
  return (
    <main className="ceremony-intro" aria-labelledby="ceremony-intro-title">
      <div className="ceremony-intro-grain" aria-hidden="true" />
      <div className="ceremony-intro-prize-stage" aria-hidden="true">
        <div className="ceremony-intro-prize-aura" />
        <div className="ceremony-intro-prize-floor" />
        <img className="ceremony-intro-prize" src={worldCupPrizeSilhouette} alt="" decoding="async" />
      </div>

      <div className="ceremony-intro-inner">
        <div className="ceremony-intro-copy">
          <div className="ceremony-intro-kicker"><span /> VM 2026 · Konkurransen er avgjort</div>
          <h1 id="ceremony-intro-title" className="ceremony-intro-title" aria-label="Hvem tok pokalen?">Hvem tok<br /><em>pokalen?</em></h1>
          <p className="ceremony-intro-description">
            Alle kampene er spilt og poengene er telt. Nå avslører vi hvem som vant tippekonkurransen – runde for runde.
          </p>
          <div className="ceremony-intro-route" aria-label="Kåringens steg">
            <span>Gruppespill</span><b>·</b><span>Sluttspill</span><b>·</b><span>Bonus</span><b>·</b><span>Vinner</span>
          </div>
          <button type="button" className="ceremony-intro-start" onClick={onStart}>
            Start kåringen <span aria-hidden="true">›</span>
          </button>
          <p className="ceremony-intro-hint">Du kan lukke vinduet og fortsette fra «Kåring» senere.</p>
        </div>
      </div>
    </main>
  );
}

function Present({ participants, ceremony, setCeremony, isAdmin, isLive, selfGuided = false, standalone = false, onExit }) {
  const isMobile = useIsMobile(700);
  const competingParticipants = participants.filter((p) => !isExcludedFromCompetition(p));
  const normalizedCeremony = normalizeCeremony(ceremony);
  const { phase, step } = normalizedCeremony;
  const bonusRevealed = Math.min(normalizedCeremony.bonusRevealed, competingParticipants.length);
  const bonusRemaining = Math.max(0, competingParticipants.length - bonusRevealed);
  const nextBonusRevealCount = Math.min(BONUS_REVEAL_BATCH_SIZE, bonusRemaining);
  const canControl = isAdmin || selfGuided;

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
  const bonusOrder = canControl
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
      if (bonusRevealed < competingParticipants.length) {
        setCeremony({ ...normalizedCeremony, bonusRevealed: bonusRevealed + nextBonusRevealCount });
      }
      else setCeremony({ ...normalizedCeremony, phase: "winner", bonusRevealed: competingParticipants.length });
    }
  };
  const prev = () => {
    if (phase === "winner") setCeremony({ ...normalizedCeremony, phase: "bonus", bonusRevealed: competingParticipants.length });
    else if (phase === "bonus") {
      if (bonusRevealed > 0) setCeremony({ ...normalizedCeremony, bonusRevealed: Math.max(0, bonusRevealed - BONUS_REVEAL_BATCH_SIZE) });
      else setCeremony({ ...normalizedCeremony, phase: "rounds", step: ROUNDS.length - 1 });
    } else if (step > 0) setCeremony({ ...normalizedCeremony, step: step - 1 });
  };

  useEffect(() => {
    const onKey = (e) => {
      if (canControl && (e.key === "ArrowRight" || e.key === " ")) { e.preventDefault(); next(); }
      else if (canControl && e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      else if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // next/prev always use the same ceremony snapshot represented by these values.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canControl, phase, step, bonusRevealed, competingParticipants.length, onExit]);

  const phaseLabel = phase === "rounds" ? ROUNDS[step].label
    : phase === "bonus" ? `${BONUS_LABEL} (${bonusRevealed}/${competingParticipants.length})`
    : "Vinner!";
  const showPhaseLabel = phase !== "rounds" || (isAdmin && !isLive);
  const mobileNav = isMobile ? {
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gridTemplateAreas: showPhaseLabel ? '"phase phase" "back next"' : '"back next"',
    gap: "8px 10px",
    marginTop: 8,
  } : {};
  const mobileNavButton = isMobile ? {
    width: "100%",
    minWidth: 0,
    padding: "11px 12px",
    fontSize: 13,
    whiteSpace: "nowrap",
  } : {};

  return (
    <div className={`ceremony-present${standalone ? " ceremony-present--standalone" : ""}`} style={S.presentWrap}>
      {phase === "rounds" && <BumpChart participants={competingParticipants} step={step} />}
      {phase === "bonus" && (
        <BonusReveal finalBase={finalBase} bonusOrder={bonusOrder} revealed={bonusRevealed} />
      )}
      {phase === "winner" && <WinnerScreen finalBase={finalBase} />}

      {canControl ? (
        <div className="ceremony-present-nav" style={{ ...S.presentNav, ...mobileNav }}>
          <button type="button" onClick={prev} disabled={phase === "rounds" && step === 0} style={{
            ...S.navBtn,
            justifySelf: "start",
            ...(isMobile ? { ...mobileNavButton, gridArea: "back" } : {}),
          }}>‹ Tilbake</button>
          <div className="ceremony-phase-label" style={{
            ...S.phaseLabel,
            ...(isMobile && !showPhaseLabel ? { display: "none" } : {}),
            ...(isMobile && showPhaseLabel ? {
              gridArea: "phase",
              minWidth: 0,
              fontSize: 14,
              lineHeight: 1.2,
              justifyContent: "center",
              flexWrap: "wrap",
            } : {}),
          }}>
            {isAdmin && !isLive && <span style={S.previewLabel}>Forhåndsvisning</span>}
            {phase !== "rounds" ? phaseLabel : null}
          </div>
          {phase === "winner" ? <span aria-hidden="true" style={isMobile ? { gridArea: "next" } : undefined} /> : (
            <button type="button" onClick={next} style={{
              ...S.navBtn,
              ...S.navBtnPrimary,
              ...(isMobile ? {
                ...mobileNavButton,
                gridArea: "next",
                justifySelf: "stretch",
                borderRadius: 12,
              } : {}),
            }}>
              {phase === "rounds" && step === ROUNDS.length - 1 ? "Bonusrunde ›"
                : phase === "bonus" && bonusRevealed === competingParticipants.length ? "Kår vinner ›"
                : phase === "bonus" ? `Vis neste ${nextBonusRevealCount} ›`
                : "Neste ›"}
            </button>
          )}
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
  const isMobile = useIsMobile(700);
  const n = participants.length;
  const atRounds = ROUNDS.map((_, i) => rankingAt(participants, i));
  const rankOf = (pid, ri) => atRounds[ri].findIndex((p) => p.id === pid);

  const rowH = Math.min(72, Math.max(40, 560 / Math.max(n, 1)));
  const W = isMobile ? 520 : 1000;
  // Reserve space after the active round for the participant labels. Keeping each
  // label beside its current endpoint makes the line-to-name mapping unambiguous
  // after positions swap between rounds.
  const padL = isMobile ? 44 : 32;
  const padR = isMobile ? 190 : 220;
  const padT = 58, padB = 20;
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
    <div className="ceremony-chart-card" style={{ ...S.chartCard, padding: "16px 12px" }}>
      <header className="ceremony-chart-heading" aria-live="polite">
        <span>Stillingen etter</span>
        <h2>{ROUNDS[step].afterLabel}</h2>
      </header>
      <svg className="ceremony-chart-svg" viewBox={`0 0 ${W} ${H}`} style={{ flex: "1 1 auto", minHeight: 0, width: "100%", height: "100%", display: "block" }}>

        {Array.from({ length: n }).map((_, rank) => (
          <line key={rank} className="ceremony-rank-guide"
            x1={padL} y1={yFor(rank)}
            x2={xFor(step)} y2={yFor(rank)}
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
                <circle key={i} className={isLast(i) ? "ceremony-active-node" : undefined} cx={pt.x} cy={pt.y}
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
          const overallRank = finalRanking.find((rankedParticipant) => rankedParticipant.id === p.id)?.rank || 1;
          const scoreNow = cumulative(p, lastRoundIdx);
          const isLeader = overallRank === 1;
          const crownSize = isMobile ? 15 : 16;
          const labelX = xFor(lastRoundIdx) + 16;
          return (
            <g key={p.id} style={{ transition: "all .7s ease" }}>
              {isLeader && (
                <CrownIcon className="ceremony-leader-crown" size={crownSize} x={labelX} y={y - crownSize / 2 - 1} />
              )}
              <text className="ceremony-participant-label" x={labelX + (isLeader ? crownSize + 4 : 0)} y={y + 5} style={{ fill: "var(--text1)" }} fontSize={isMobile ? 13 : 14}
                fontWeight="700" fontFamily="'Inter', sans-serif">
                {firstName(p.name)}
                <tspan style={{ fill: "var(--text3)" }} fontSize={isMobile ? 10 : 11} fontWeight="600" dx="4">
                  #{overallRank} · {scoreNow} p
                </tspan>
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
  const isMobile = useIsMobile(700);
  const revealedIds = new Set(bonusOrder.slice(0, revealed).map((p) => p.id));
  const current = finalBase.map((p) => ({
    ...p,
    shown: p.base + (revealedIds.has(p.id) ? p.bonus || 0 : 0),
    bonusShown: revealedIds.has(p.id),
  }));
  const sorted = rankByScore(current, (participant) => participant.shown);
  const revealedBatchSize = revealed > 0
    ? (revealed % BONUS_REVEAL_BATCH_SIZE || Math.min(BONUS_REVEAL_BATCH_SIZE, revealed))
    : 0;
  const justRevealedBatch = bonusOrder.slice(Math.max(0, revealed - revealedBatchSize), revealed);
  const rowH = Math.min(56, Math.max(36, 500 / Math.max(sorted.length, 1)));

  return (
    <div style={{ ...S.chartCard, ...(isMobile ? { padding: 12 } : {}) }}>
      <div style={{
        ...S.bonusHeader,
        ...(isMobile ? { flexDirection: "column", gap: 8, fontSize: 20, marginBottom: 14 } : {}),
      }}>
        {BONUS_LABEL}
        {justRevealedBatch.length > 0 && (
          <span key={justRevealedBatch.map((participant) => participant.id).join(":")}
            className="bonus-pop ceremony-bonus-reveal-batch" style={{
            ...S.bonusPop,
            ...(isMobile ? { padding: "7px 12px", fontSize: 13 } : {}),
          }} aria-live="polite">
            {justRevealedBatch.map((participant) => (
              <span key={participant.id} className="ceremony-bonus-reveal-item" style={S.bonusPopItem}>
                {firstName(participant.name)} +{participant.bonus || 0}
              </span>
            ))}
          </span>
        )}
      </div>
      <div className="ceremony-bonus-list" style={S.bonusList}>
        <div style={{ position: "relative", height: sorted.length * rowH + 8 }}>
          {sorted.map((p, i) => (
            <div key={p.id}
              style={{
                ...S.bonusRow,
                ...(isMobile ? { gap: 8, padding: "0 10px" } : {}),
                top: i * rowH,
                height: rowH - 7,
                borderLeft: `5px solid ${p.color}`,
                background: p.bonusShown ? "var(--bg4)" : "var(--bg0)",
              }}>
              <span style={{ ...S.bonusRank, ...(isMobile ? { width: 24, fontSize: 14 } : {}) }}>{p.rank}</span>
              <span className="ceremony-bonus-name" style={{ ...S.bonusName, ...(isMobile ? { fontSize: 15 } : {}) }}>{firstName(p.name)}</span>
              {p.bonusShown && (p.bonus || 0) > 0 && (
                <span className="bonus-star" style={S.bonusStar}>+{p.bonus}</span>
              )}
              <span style={{ ...S.bonusScore, ...(isMobile ? { fontSize: 18, minWidth: 36 } : {}) }}>{p.shown}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// WINNER
// ─────────────────────────────────────────────
function WinnerScreen({ finalBase }) {
  const isMobile = useIsMobile(700);
  const sorted = rankByScore(
    finalBase.map((p) => ({ ...p, total: p.base + (p.bonus || 0) })),
    (participant) => participant.total,
  );
  const winners = sorted.filter((participant) => participant.rank === 1);
  const sharedFirst = winners.length > 1;
  const topThree = sorted.slice(0, 3);
  const podiumEntries = sharedFirst
    ? topThree
    : [topThree[1], topThree[0], topThree[2]].filter(Boolean);
  const winnerNames = winners.map((participant) => firstName(participant.name));
  const winnerLabel = winnerNames.length > 3
    ? `${winnerNames.length} delte vinnere`
    : norwegianNameList(winnerNames);
  const winnerScore = winners[0]?.total;
  const crowded = sorted.length > 8;
  const podiumHeight = (rank) => isMobile
    ? ((crowded ? { 1: 120, 2: 90, 3: 65 } : { 1: 150, 2: 105, 3: 78 })[rank] || 65)
    : ((crowded ? { 1: 150, 2: 105, 3: 75 } : { 1: 200, 2: 140, 3: 100 })[rank] || 75);

  return (
    <div
      className="ceremony-winner-card"
      style={{
        ...S.winnerCard,
        ...(crowded ? {
          justifyContent: "flex-start",
          overflowY: "auto",
          padding: isMobile ? 14 : 18,
        } : {}),
      }}>
      <Confetti />
      <div style={{
        ...S.podiumWrap,
        ...(isMobile ? { gap: 8, minHeight: 220, marginBottom: 18 } : {}),
        ...(crowded ? {
          gap: isMobile ? 6 : 12,
          minHeight: isMobile ? 190 : 220,
          marginBottom: 12,
          flexShrink: 0,
        } : {}),
      }}>
        {podiumEntries.map((participant, index) => (
          <Podium
            key={participant.id}
            place={participant.rank}
            p={participant}
            height={podiumHeight(participant.rank)}
            delay={index * 0.2}
            winner={participant.rank === 1}
            compact={isMobile}
          />
        ))}
      </div>
      <div style={{
        ...S.winnerTitle,
        ...(isMobile ? { width: "100%", padding: "0 4px", fontSize: 22, lineHeight: 1.15, flexWrap: "wrap" } : {}),
      }}>
        <CrownIcon className="ceremony-winner-crown" size={isMobile ? 22 : 26} />
        {winnerLabel}
      </div>
      <div style={{ ...S.winnerSub, textAlign: "center" }}>
        {sharedFirst
          ? `Deler førsteplassen · ${winnerScore} poeng hver`
          : `Avdelingens fremste fotballekspert · ${winnerScore} poeng`}
      </div>
      {sorted.length > 3 && (
        <ol
          className="ceremony-winner-rest"
          style={{
            ...S.restList,
            ...(crowded ? {
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
              columnGap: 32,
              maxWidth: isMobile ? 440 : 820,
              marginTop: 12,
              flexShrink: 0,
            } : {}),
          }}>
          {sorted.slice(3).map((p) => (
            <li key={p.id} style={{
              ...S.restItem,
              ...(crowded ? { padding: isMobile ? "8px 0" : "7px 0", fontSize: isMobile ? 13 : 14 } : {}),
            }}>
              <span style={S.restRank}>{p.rank}.</span>
              <span style={{ ...S.dot, background: p.color }} />
              <span className="ceremony-rest-name" style={S.restName}>{firstName(p.name)}</span>
              <span style={{ flexShrink: 0, fontWeight: 800, color: "#00DC64" }}>{p.total} p</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Podium({ place, p, height, delay, winner, compact = false }) {
  const compactWidth = "clamp(70px, 23vw, 88px)";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0, animationDelay: `${delay}s` }}
      className="podium-rise">
      <div style={{ width: 34, height: 34, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6,
        background: place === 1 ? "var(--accent)" : "var(--bg4)", color: place === 1 ? "var(--accent-fg)" : "var(--text2)",
        fontWeight: 800, fontSize: 16 }}>{place}</div>
      <div className="ceremony-podium-name" style={{
        width: compact ? compactWidth : 116,
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        fontWeight: 800,
        fontSize: compact ? (winner ? 17 : 14) : (winner ? 21 : 16),
        color: "var(--text1)",
        marginBottom: 2,
        textAlign: "center",
      }}>
        {firstName(p.name)}
      </div>
      <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 8 }}>{p.total} p</div>
      <div style={{
        width: compact ? compactWidth : 116, height, borderRadius: "10px 10px 0 0",
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
  presentWrap: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: 16, maxWidth: 1280, margin: "0 auto", width: "100%", boxSizing: "border-box" },
  chartCard: { flex: 1, minHeight: 0, background: "var(--bg3)", borderRadius: 20, padding: 18, display: "flex", flexDirection: "column", justifyContent: "flex-start", overflow: "hidden" },
  presentNav: { flexShrink: 0, display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", marginTop: 10, gap: 12 },
  phaseLabel: { fontSize: 17, color: "var(--text1)", fontWeight: 900, textAlign: "center", display: "flex", alignItems: "center", gap: 8 },
  previewLabel: { display: "inline-block", padding: "3px 7px", borderRadius: 6, color: "#D8B15A", background: "#D8B15A1A", fontSize: 9.5, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase" },
  publicCeremonyStatus: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 18, color: "var(--text3)", fontSize: 13, fontWeight: 700 },
  publicCeremonyDot: { width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 0 4px color-mix(in srgb, var(--accent) 14%, transparent)" },
  navBtn: { background: "transparent", border: "1px solid var(--border)", color: "var(--text1)", padding: "12px 18px", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 700 },
  navBtnPrimary: { background: "var(--accent)", color: "var(--accent-fg)", border: "none", borderRadius: 50, padding: "14px 20px", justifySelf: "end" },
  bonusHeader: { fontSize: 24, color: "var(--text1)", textAlign: "center", marginBottom: 22, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" },
  bonusPop: { maxWidth: "100%", boxSizing: "border-box", background: "var(--accent)", color: "var(--accent-fg)", padding: "5px 16px", borderRadius: 18, fontSize: 15, fontWeight: 800, display: "flex", justifyContent: "center", gap: "3px 10px", flexWrap: "wrap" },
  bonusPopItem: { whiteSpace: "nowrap" },
  bonusList: { flex: "1 1 auto", minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", paddingRight: 2 },
  bonusRow: { position: "absolute", left: 0, right: 0, display: "flex", alignItems: "center", gap: 12, padding: "0 16px", borderRadius: 12, transition: "top .8s cubic-bezier(.34,1.2,.64,1), background .4s", background: "var(--bg0)" },
  bonusRank: { width: 28, fontWeight: 800, color: "var(--text3)", fontSize: 15 },
  bonusName: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 16, fontWeight: 700, color: "var(--text1)" },
  bonusStar: { flexShrink: 0, color: "#F5A623", fontWeight: 800, fontSize: 14 },
  bonusScore: { flexShrink: 0, fontSize: 20, fontWeight: 900, color: "var(--text1)", minWidth: 44, textAlign: "right" },
  winnerCard: { flex: 1, background: "var(--bg3)", borderRadius: 20, padding: 24, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" },
  podiumWrap: { display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 16, marginBottom: 28, minHeight: 270 },
  winnerTitle: { display: "flex", alignItems: "center", justifyContent: "center", gap: 9, fontSize: 30, fontWeight: 900, color: "var(--text1)", textAlign: "center" },
  winnerSub: { fontSize: 14, color: "var(--text3)", marginTop: 6 },
  restList: { listStyle: "none", margin: "20px 0 0", padding: 0, width: "100%", maxWidth: 440 },
  restItem: { display: "flex", alignItems: "center", gap: 8, padding: "11px 0", fontSize: 15, borderBottom: "1px solid var(--border)" },
  restRank: { flexShrink: 0, width: 28, color: "var(--text3)", fontWeight: 800 },
  restName: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  confetti: { position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" },
};

export default function Ceremony({ unlocked, showIntro = false, onStart, ...props }) {
  if (!unlocked) return <LockedCeremony />;
  if (showIntro) return <CeremonyIntro onStart={onStart} />;
  return <Present {...props} />;
}
