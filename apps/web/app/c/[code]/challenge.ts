import { LEVELS } from '@jom/game-rage/levels';
import { z } from 'zod';

/** The route param is untrusted input: validated with Zod at the boundary (SECURITY.md §7). */
const Code = z
  .string()
  .max(16)
  .regex(/^rage-([1-9]\d?)-(0|[1-9]\d{0,3})$/)
  .transform((code) => {
    const [, level, deaths] = code.split('-');
    return { level: Number(level), deaths: Number(deaths) };
  })
  .refine((c) => c.level <= LEVELS.length);

export interface Challenge {
  /** 1-based level number. */
  level: number;
  deaths: number;
  name: string;
}

export function parseChallenge(code: string): Challenge | null {
  const parsed = Code.safeParse(code);
  if (!parsed.success) return null;
  return { ...parsed.data, name: LEVELS[parsed.data.level - 1]!.file.name };
}

export const challengeLine = ({ level, deaths }: Challenge) =>
  deaths === 0
    ? `A friend cleared level ${level} first try.`
    : `A friend died ${deaths === 1 ? 'once' : `${deaths} times`} on level ${level}.`;
