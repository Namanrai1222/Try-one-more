import { DeathCause } from '@jom/engine';

/**
 * Taunt engine v1 (PRD.md §4.7). Mock the situation and the performance, never the person
 * (DESIGNING.md §4, SECURITY.md §6). Presentation only — it never touches the simulation,
 * so it may use Math.random.
 */
export type TauntTag =
  'early' | 'repeated' | 'close' | 'fall' | 'spike' | 'saw' | 'crush' | 'greed' | 'door' | 'any';

interface Taunt {
  text: string;
  tags: readonly TauntTag[];
  weight: number;
}

export const TAUNTS: readonly Taunt[] = [
  { text: 'Already? That was the tutorial.', tags: ['early'], weight: 1 },
  { text: "That wasn't even the warm-up.", tags: ['early'], weight: 1 },
  { text: 'A strong start. For someone else.', tags: ['early'], weight: 1 },
  { text: '{n} times. Impressive commitment.', tags: ['repeated'], weight: 2 },
  { text: 'Maybe watch a tutorial.', tags: ['repeated'], weight: 1 },
  { text: 'The level is not getting easier. You might be.', tags: ['repeated'], weight: 1 },
  { text: 'Persistence noted. Skill pending.', tags: ['repeated'], weight: 1 },
  { text: 'So close. So far.', tags: ['close'], weight: 2 },
  { text: 'The door was laughing at you.', tags: ['close'], weight: 1 },
  { text: 'You could almost touch it. Almost.', tags: ['close'], weight: 1 },
  { text: 'Gravity: still working.', tags: ['fall'], weight: 1 },
  { text: 'The floor had other plans.', tags: ['fall'], weight: 1 },
  { text: 'That tile was more of a suggestion.', tags: ['fall'], weight: 1 },
  { text: 'Those were visible. Very visible.', tags: ['spike'], weight: 1 },
  { text: 'Spikes are sharp. Noted for next time?', tags: ['spike'], weight: 1 },
  { text: 'You walked into that one on purpose, right?', tags: ['spike'], weight: 1 },
  { text: 'It came from above. They usually do.', tags: ['saw'], weight: 1 },
  { text: 'You trusted the ceiling.', tags: ['saw'], weight: 1 },
  { text: 'The saw sends its regards.', tags: ['saw'], weight: 1 },
  { text: 'The ceiling had a schedule. You did not.', tags: ['crush'], weight: 1 },
  { text: 'Pressed for time. Literally.', tags: ['crush'], weight: 1 },
  { text: 'It was a coin. It was always going to be a coin.', tags: ['greed'], weight: 1 },
  { text: 'Greed: 1. You: 0.', tags: ['greed'], weight: 1 },
  { text: 'Right door. Wrong day.', tags: ['door'], weight: 1 },
  { text: 'That door was mostly decorative.', tags: ['door'], weight: 1 },
  { text: 'Just one more.', tags: ['any'], weight: 2 },
  { text: 'Again. Obviously.', tags: ['any'], weight: 1 },
  { text: 'That was a choice.', tags: ['any'], weight: 1 },
  { text: 'Bold. Wrong, but bold.', tags: ['any'], weight: 1 },
  { text: 'The game remembers. Unfortunately.', tags: ['any'], weight: 1 },
  { text: 'You chose that, all by yourself.', tags: ['any'], weight: 1 },
];

export interface DeathContext {
  /** Deaths on this level so far, including this one. */
  deaths: number;
  cause: number;
  distanceToGoalPx: number;
}

const CAUSE_TAG: Partial<Record<number, TauntTag>> = {
  [DeathCause.Fall]: 'fall',
  [DeathCause.Spike]: 'spike',
  [DeathCause.Saw]: 'saw',
  [DeathCause.Crush]: 'crush',
  [DeathCause.Greed]: 'greed',
  [DeathCause.FakeDoor]: 'door',
};

export function tagsFor(ctx: DeathContext): Set<TauntTag> {
  const tags = new Set<TauntTag>(['any']);
  if (ctx.deaths <= 2) tags.add('early');
  if (ctx.deaths >= 5) tags.add('repeated');
  if (ctx.distanceToGoalPx < 140) tags.add('close');
  const cause = CAUSE_TAG[ctx.cause];
  if (cause) tags.add(cause);
  return tags;
}

/**
 * Weighted pick. Lines that match the context weigh 3× the generic ones, so dying next to
 * the door gets a door line. Never the same line twice in a row.
 */
export function pickTaunt(
  ctx: DeathContext,
  previous: string | null,
  overrides: readonly string[] = [],
  rand: () => number = Math.random,
): string {
  const active = tagsFor(ctx);
  const pool = [
    ...overrides.map((text): Taunt => ({ text, tags: ['early'], weight: 2 })),
    ...TAUNTS,
  ]
    .filter((t) => t.tags.some((tag) => active.has(tag)))
    .map((t) => ({
      text: t.text.replace('{n}', String(ctx.deaths)),
      weight: t.tags.includes('any') ? t.weight : t.weight * 3,
    }))
    .filter((t) => t.text !== previous);

  let r = rand() * pool.reduce((sum, t) => sum + t.weight, 0);
  for (const t of pool) {
    r -= t.weight;
    if (r < 0) return t.text;
  }
  return pool[pool.length - 1]!.text;
}
