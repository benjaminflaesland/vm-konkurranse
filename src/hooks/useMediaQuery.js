import { useEffect, useState } from "react";

export function useMediaQuery(query) {
  const getMatch = () => typeof window !== "undefined" && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(getMatch);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}

export function useIsMobile(breakpoint = 640) {
  return useMediaQuery(`(max-width: ${breakpoint - 0.02}px)`);
}
