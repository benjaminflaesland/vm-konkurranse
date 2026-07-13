import { canonicalTeam } from "../../shared/competition.js";

const norm = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]/g, "");

const FLAGS = {
  "Mexico": "🇲🇽", "USA": "🇺🇸", "Canada": "🇨🇦", "Sveits": "🇨🇭", "Brasil": "🇧🇷",
  "Marokko": "🇲🇦", "Australia": "🇦🇺", "Tyskland": "🇩🇪", "Elfenbenskysten": "🇨🇮", "Haiti": "🇭🇹",
  "Nederland": "🇳🇱", "Japan": "🇯🇵", "Belgia": "🇧🇪", "Iran": "🇮🇷", "Spania": "🇪🇸", "Ecuador": "🇪🇨",
  "Uruguay": "🇺🇾", "Frankrike": "🇫🇷", "Norge": "🇳🇴", "Argentina": "🇦🇷", "Paraguay": "🇵🇾",
  "Østerrike": "🇦🇹", "Portugal": "🇵🇹", "Colombia": "🇨🇴", "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "Kroatia": "🇭🇷", "Panama": "🇵🇦", "Bolivia": "🇧🇴", "Kosovo": "🇽🇰", "Senegal": "🇸🇳", "Irak": "🇮🇶",
  "Sør-Korea": "🇰🇷", "Sør Korea": "🇰🇷", "Sør-Afrika": "🇿🇦", "Sør Afrika": "🇿🇦", "Qatar": "🇶🇦", "Tsjekkia": "🇨🇿",
  "New Zealand": "🇳🇿", "Egypt": "🇪🇬", "Kapp Verde": "🇨🇻", "Saudi Arabia": "🇸🇦", "Sverige": "🇸🇪", "Tunisia": "🇹🇳",
  "Bosnia og Herzegovina": "🇧🇦", "Skottland": "🏴", "Tyrkia": "🇹🇷", "Curacao": "🇨🇼", "Curaçao": "🇨🇼",
  "Algerie": "🇩🇿", "Jordan": "🇯🇴", "Kongo": "🇨🇩", "Uzbekistan": "🇺🇿", "Ghana": "🇬🇭",
};
const flagOf = (name) => FLAGS[name] || "";

// Emoji flags are not consistently supported on every operating system. Use the
// curated local assets and keep emoji only as a fallback for an unknown team.
const FLAG_CODES = {
  "Mexico": "mx", "USA": "us", "Canada": "ca", "Sveits": "ch", "Brasil": "br",
  "Marokko": "ma", "Australia": "au", "Tyskland": "de", "Elfenbenskysten": "ci", "Haiti": "ht",
  "Nederland": "nl", "Japan": "jp", "Belgia": "be", "Iran": "ir", "Spania": "es", "Ecuador": "ec",
  "Uruguay": "uy", "Frankrike": "fr", "Norge": "no", "Argentina": "ar", "Paraguay": "py",
  "Østerrike": "at", "Portugal": "pt", "Colombia": "co", "England": "gb-eng", "Kroatia": "hr",
  "Panama": "pa", "Bolivia": "bo", "Kosovo": "xk", "Senegal": "sn", "Irak": "iq",
  "Sør-Korea": "kr", "Sør Korea": "kr", "Sør-Afrika": "za", "Sør Afrika": "za", "Qatar": "qa", "Tsjekkia": "cz",
  "New Zealand": "nz", "Egypt": "eg", "Kapp Verde": "cv", "Saudi Arabia": "sa", "Sverige": "se", "Tunisia": "tn",
  "Bosnia og Herzegovina": "ba", "Skottland": "gb-sct", "Tyrkia": "tr", "Curacao": "cw", "Curaçao": "cw",
  "Algerie": "dz", "Jordan": "jo", "Kongo": "cd", "Uzbekistan": "uz", "Ghana": "gh",
};

// Excel answers and the live fixture feed do not always use the same spelling.
// Resolve whitespace, punctuation, Norwegian and English names before looking up
// a local SVG so a valid country never falls back to an empty flag slot.
const FLAG_NAME_ALIASES = {
  ...Object.fromEntries(Object.keys(FLAG_CODES).map((name) => [norm(name), name])),
  morocco: "Marokko",
  scotland: "Skottland",
  southafrica: "Sør Afrika",
  southkorea: "Sør Korea",
  netherlands: "Nederland",
  germany: "Tyskland",
  turkey: "Tyrkia",
  ivorycoast: "Elfenbenskysten",
  capeverde: "Kapp Verde",
  saudiarabia: "Saudi Arabia",
  congodr: "Kongo",
  drcongo: "Kongo",
  democraticrepublicofthecongo: "Kongo",
  democraticrepublicofcongo: "Kongo",
  rdcongo: "Kongo",
};

const canonicalFlagName = (name) => {
  const cleanName = String(name || "").replace(/\u00a0/g, " ").trim();
  const alias = FLAG_NAME_ALIASES[norm(cleanName)];
  if (alias) return alias;
  // Fall back to the canonical team name so Excel spelling variants
  // ("Bosnia and Herzegovina", "Bosnia & Herzegovina", \u2026) still find their flag.
  const canon = canonicalTeam(cleanName);
  if (FLAG_CODES[canon]) return canon;
  return cleanName;
};

export function Flag({ name, code, size = 18 }) {
  const countryName = canonicalFlagName(name);
  const countryCode = FLAG_CODES[countryName] || code?.toLowerCase();
  const h = Math.round(size * 0.75);
  const r = Math.max(1, Math.round(size / 10));
  if (!countryCode) {
    return (
      <span role="img" aria-label={countryName ? `${countryName} flagg` : "Flagg"} style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: size, height: h, verticalAlign: "middle", borderRadius: r,
        background: "var(--bg2)", color: "var(--text3)", fontSize: Math.max(7, Math.round(size * 0.42)), fontWeight: 800,
      }}>{flagOf(countryName) || "?"}</span>
    );
  }
  return (
    <img
      src={`/flags/${countryCode}.svg`}
      alt={countryName ? `${countryName} flagg` : "Flagg"}
      width={size}
      height={h}
      loading="lazy"
      decoding="async"
      style={{ display: "inline-block", width: size, height: h, objectFit: "cover", verticalAlign: "middle", borderRadius: r, flexShrink: 0 }}
    />
  );
}

// FIFA 3-letter codes keep prediction cards readable at desktop and mobile widths.
const CODES = {
  "Mexico": "MEX", "USA": "USA", "Canada": "CAN", "Sveits": "SUI", "Brasil": "BRA",
  "Marokko": "MAR", "Australia": "AUS", "Tyskland": "GER", "Elfenbenskysten": "CIV", "Haiti": "HAI",
  "Nederland": "NED", "Japan": "JPN", "Belgia": "BEL", "Iran": "IRN", "Spania": "ESP", "Ecuador": "ECU",
  "Uruguay": "URU", "Frankrike": "FRA", "Norge": "NOR", "Argentina": "ARG", "Paraguay": "PAR",
  "Østerrike": "AUT", "Portugal": "POR", "Colombia": "COL", "England": "ENG", "Kroatia": "CRO",
  "Panama": "PAN", "Bolivia": "BOL", "Kosovo": "KOS", "Senegal": "SEN", "Irak": "IRQ",
  "Sør-Korea": "KOR", "Sør Korea": "KOR", "Sør-Afrika": "RSA", "Sør Afrika": "RSA", "Qatar": "QAT", "Tsjekkia": "CZE",
  "New Zealand": "NZL", "Egypt": "EGY", "Kapp Verde": "CPV", "Saudi Arabia": "KSA", "Sverige": "SWE", "Tunisia": "TUN",
  "Bosnia og Herzegovina": "BIH", "Skottland": "SCO", "Tyrkia": "TUR", "Curacao": "CUW", "Curaçao": "CUW",
  "Algerie": "ALG", "Jordan": "JOR", "Kongo": "COD", "Uzbekistan": "UZB", "Ghana": "GHA",
};
export const codeOf = (name) => {
  const canonicalName = canonicalTeam(name);
  return CODES[canonicalName] || (canonicalName ? canonicalName.slice(0, 3).toUpperCase() : "");
};
