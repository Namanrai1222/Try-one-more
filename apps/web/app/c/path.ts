/**
 * Challenge links (PRD.md §4.7): `/c/rage-<level>-<deaths>`, e.g. /c/rage-7-23. Stateless —
 * the numbers ride in the link, so no server is needed; a forged count only fools the forger's
 * friends (trust tier 0, SECURITY.md §4.1). Deaths are capped so the set of possible OG images
 * stays bounded. Dependency-free: the play host imports it into client JS.
 */
export const MAX_CHALLENGE_DEATHS = 9999;

export const challengePath = (level: number, deaths: number) =>
  `/c/rage-${level}-${Math.min(Math.max(0, Math.trunc(deaths)), MAX_CHALLENGE_DEATHS)}`;
