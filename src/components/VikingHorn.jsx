import { useState } from "react";

let hornAudioCtx = null;
let hornBuffer = null;
const HORN_DURATION_SECONDS = 2.5;
const HORN_FADE_SECONDS = 0.35;
async function playVikingHorn() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    hornAudioCtx = hornAudioCtx || new AC();
    const ctx = hornAudioCtx;
    if (ctx.state === "suspended") await ctx.resume();
    if (!hornBuffer) {
      const res = await fetch("/assets/horn.mp3");
      const ab = await res.arrayBuffer();
      hornBuffer = await ctx.decodeAudioData(ab);
    }
    const t0 = ctx.currentTime;
    const dur = Math.min(HORN_DURATION_SECONDS, hornBuffer.duration || HORN_DURATION_SECONDS);
    const fadeStart = Math.max(t0, t0 + dur - HORN_FADE_SECONDS);
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = hornBuffer;
    gain.gain.setValueAtTime(1, t0);
    gain.gain.setValueAtTime(1, fadeStart);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(gain).connect(ctx.destination);
    src.start(t0);
    src.stop(t0 + dur);
    return;
  } catch {
    _playVikingHornSynth();
  }
}
// fallback synthesis (never reached if MP3 loads)
function _playVikingHornSynth() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    hornAudioCtx = hornAudioCtx || new AC();
    const ctx = hornAudioCtx;
    if (ctx.state === "suspended") ctx.resume();
    const t0 = ctx.currentTime;
    const dur = HORN_DURATION_SECONDS;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.exponentialRampToValueAtTime(0.6, t0 + 0.07);
    master.gain.setValueAtTime(0.55, t0 + dur - 0.5);
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    master.connect(ctx.destination);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 1.5;
    filter.frequency.setValueAtTime(520, t0);
    filter.frequency.exponentialRampToValueAtTime(1950, t0 + 0.26);
    filter.connect(master);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 7;
    lfo.connect(lfoGain);

    const fundamental = 118;
    const voices = [
      { type: "sawtooth", mult: 1, detune: -8, gain: 0.5 },
      { type: "sawtooth", mult: 1, detune: 9, gain: 0.5 },
      { type: "square", mult: 1, detune: 0, gain: 0.13 },
      { type: "sawtooth", mult: 2, detune: 5, gain: 0.17 },
      { type: "sine", mult: 0.5, detune: 0, gain: 0.26 },
    ];
    for (const v of voices) {
      const osc = ctx.createOscillator();
      osc.type = v.type;
      const base = fundamental * v.mult;
      osc.frequency.setValueAtTime(base * 0.84, t0);
      osc.frequency.exponentialRampToValueAtTime(base, t0 + 0.11);
      osc.frequency.linearRampToValueAtTime(base * 0.965, t0 + dur);
      osc.detune.value = v.detune;
      lfoGain.connect(osc.detune);
      const g = ctx.createGain();
      g.gain.value = v.gain;
      osc.connect(g).connect(filter);
      osc.start(t0);
      osc.stop(t0 + dur);
    }
    lfo.start(t0);
    lfo.stop(t0 + dur);
  } catch { /* Lyd er en progressiv forbedring. */ }
}

export function VikingHorn() {
  const [blow, setBlow] = useState(0);
  const sound = () => { playVikingHorn(); setBlow((v) => v + 1); };
  return (
    <div className="viking-horn">
      <button type="button" className="viking-horn-button" onClick={sound} aria-label="Blås i vikinghornet">
        <svg key={blow} className={`viking-horn-svg${blow ? " is-blowing" : ""}`} viewBox="0 0 92 58" aria-hidden="true">
          <defs>
            <linearGradient id="vhBrass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#F2D688" />
              <stop offset="0.42" stopColor="#CB9E4B" />
              <stop offset="1" stopColor="#7C5820" />
            </linearGradient>
            <linearGradient id="vhBand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#CFA254" />
              <stop offset="1" stopColor="#6A4818" />
            </linearGradient>
            <clipPath id="vhBody">
              <path d="M28 11 C 52 5, 74 21, 82 46 C 70 39, 46 32, 32 30 C 23 28, 22 15, 28 11 Z" />
            </clipPath>
          </defs>
          {blow > 0 && (
            <g className="viking-horn-waves" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round">
              <path d="M24 16 C 17 21, 17 27, 24 32" />
              <path d="M18 11 C 8 18, 8 30, 18 37" />
              <path d="M12 6 C -1 16, -1 32, 12 42" />
            </g>
          )}
          <g className="viking-horn-body">
            <path d="M28 11 C 52 5, 74 21, 82 46 C 70 39, 46 32, 32 30 C 23 28, 22 15, 28 11 Z"
              fill="url(#vhBrass)" stroke="#5C3D14" strokeWidth="2.1" strokeLinejoin="round" />
            <path d="M32 13 C 52 9, 69 22, 77 40" fill="none" stroke="#FBEBBE" strokeWidth="1.8" strokeOpacity="0.5" strokeLinecap="round" />
            <path d="M44 22 C 55 23, 65 29, 72 38" fill="none" stroke="#5C3D14" strokeWidth="1.1" strokeOpacity="0.35" strokeLinecap="round" />
            {/* ornate collar near the mouth, clipped to the horn outline */}
            <g clipPath="url(#vhBody)">
              <path d="M26 8 L42 11 L40 34 L23 32 Z" fill="url(#vhBand)" />
              <path d="M31 9 L29 33" stroke="#46300F" strokeWidth="2.4" />
              <path d="M38 11 L36 34" stroke="#46300F" strokeWidth="2.4" />
              <g fill="#F0CE82">
                <circle cx="34" cy="15" r="1.05" />
                <circle cx="33.4" cy="20.5" r="1.05" />
                <circle cx="32.8" cy="26" r="1.05" />
                <circle cx="32.2" cy="31" r="1.05" />
              </g>
            </g>
            {/* bright rim around the mouth opening */}
            <ellipse cx="29" cy="20.5" rx="3.3" ry="9.6" transform="rotate(-14 29 20.5)" fill="#EBCC7C" stroke="#5C3D14" strokeWidth="2" />
            {/* finial tip */}
            <path d="M80 44 l3.4 -0.6 2 3.2 -2.4 3 -3.6 -1.4 Z" fill="url(#vhBand)" stroke="#46300F" strokeWidth="1.2" strokeLinejoin="round" />
            <circle cx="86.4" cy="50.4" r="2.7" fill="url(#vhBand)" stroke="#46300F" strokeWidth="1.2" />
          </g>
        </svg>
        <span className="viking-horn-label">Blås i hornet</span>
      </button>
    </div>
  );
}
