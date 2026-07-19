// Flat gold crown (solid body + detached base bar) marking the current leader.
export function CrownIcon({ size = 16, style, ...svgProps }) {
  return (
    <svg {...svgProps} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"
      style={{ display: "block", ...style }}>
      <path d="M4 7 L8.6 10.8 L12 4.6 L15.4 10.8 L20 7 L20 15 L4 15 Z"
        fill="#EAB948" stroke="#EAB948" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
      <rect x="5" y="17.3" width="14" height="2.9" rx="1.45" fill="#EAB948" />
    </svg>
  );
}
