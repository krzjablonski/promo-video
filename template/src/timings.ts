import { CUTS, type CutId } from './script';
import GENERATED from './timings/index';

export interface WordTiming {
  text: string;
  section: string;
  start: number;
  end: number;
}

/**
 * Written by `npm run sync -- <cut>`. All times in seconds from the start of the voiceover take;
 * buildTimeline (src/timeline.ts) moves them onto the video timeline.
 */
export interface CutTimings {
  audio: string | null;
  source: string;
  duration: number;
  sections: Record<string, { start: number; end: number }>;
  words: WordTiming[];
  /** Pauses in the take, [start, end]; where src/timeline.ts may split it for a hold. */
  silences?: [number, number][];
}

// Through `unknown`: TypeScript reads "silences" in the JSON as number[][], not [number, number][].
export const TIMINGS = GENERATED as unknown as Record<string, CutTimings>;

/** Fails loudly when src/script.ts was edited without re-running the sync. */
export const assertTimingsMatchScript = (cut: CutId): void => {
  const t = TIMINGS[cut];
  if (!t) throw new Error(`No src/timings/${cut}.json yet. Run: npm run sync -- ${cut}`);
  const missing = CUTS[cut].sections.filter((s) => !t.sections[s.id]).map((s) => s.id);
  if (missing.length > 0) {
    throw new Error(`src/timings/${cut}.json has no timing for section(s) ${missing.join(', ')}. Run: npm run sync -- ${cut}`);
  }
};
