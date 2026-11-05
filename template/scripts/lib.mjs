import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUTS, CUT_IDS, SLUG, VOICE, elevenLabsText, spokenText } from '../src/script.ts';

// fileURLToPath, not `.pathname`: on Windows `.pathname` gives "/C:/…", which breaks every path.
export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const PUBLIC = join(ROOT, 'public');

/** whisper.cpp build + model, shared by every promo-video project on this machine. */
export const WHISPER_DIR = process.env.PROMO_WHISPER_DIR ?? join(homedir(), '.cache', 'promo-video', 'whisper');

const usage = (extra = '') => {
  console.error(`Usage: npm run <script> -- <${CUT_IDS.join('|')}> ${extra}`);
  process.exit(1);
};

/** Positional args that are not flags or flag values. */
export const positionals = (valueFlags = []) => {
  const out = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      if (valueFlags.includes(argv[i].slice(2))) i++;
      continue;
    }
    out.push(argv[i]);
  }
  return out;
};

export const parseCutArg = (extra = '', valueFlags = []) => {
  const cut = positionals(valueFlags)[0];
  if (!cut || !CUT_IDS.includes(cut)) usage(extra);
  return cut;
};

/** Cuts named on the command line, or all of them. */
export const parseCutsArg = (valueFlags = []) => {
  const named = positionals(valueFlags).filter((a) => CUT_IDS.includes(a));
  const unknown = positionals(valueFlags).filter((a) => !CUT_IDS.includes(a));
  if (unknown.length) usage(`(unknown cut: ${unknown.join(', ')})`);
  return named.length ? named : CUT_IDS;
};

export const hasFlag = (name) => process.argv.includes(`--${name}`);
export const flagValue = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

/**
 * The Remotion command-line tool, started with this same Node. Not `npx remotion`: on Windows `npx`
 * is a .cmd file, and Node cannot start a .cmd file without a shell.
 */
export const REMOTION_CLI = [process.execPath, join(ROOT, 'node_modules', '@remotion', 'cli', 'remotion-cli.js')];

/** On Windows, `npm ci` installs Remotion's own ffmpeg.exe and ffprobe.exe in this folder. */
const REMOTION_WIN_BIN = join(ROOT, 'node_modules', '@remotion', 'compositor-win32-x64-msvc');

/** First file called `name` (`name.exe` on Windows) in one of the PATH folders, or null. */
const onPath = (name) => {
  const file = process.platform === 'win32' ? `${name}.exe` : name;
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (dir && existsSync(join(dir, file))) return join(dir, file);
  }
  return null;
};

/**
 * ffmpeg / ffprobe: the system one if installed (it has every filter), else the copy bundled with
 * Remotion. Returns [program, ...first arguments].
 */
const tool = (name) => {
  for (const dir of ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']) {
    if (existsSync(`${dir}/${name}`)) return [`${dir}/${name}`];
  }
  const system = onPath(name);
  if (system) return [system];
  const bundledExe = join(REMOTION_WIN_BIN, `${name}.exe`);
  if (process.platform === 'win32' && existsSync(bundledExe)) return [bundledExe];
  return [...REMOTION_CLI, name];
};
export const ffmpeg = () => tool('ffmpeg');
export const ffprobe = () => tool('ffprobe');

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

const numberToWords = (n) => {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ONES[n % 10] : '');
  return String(n);
};

/** Lower-case alphanumerics only, so "Re-typing," and "retyping" compare equal. */
export const normalize = (word) => word.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]/g, '');

/** Whisper writes "25%" where the script says "twenty-five percent": expand to comparable keys. */
export const transcriptKeys = (raw) => {
  const keys = [];
  for (const part of raw.trim().split(/\s+/)) {
    const m = part.match(/^(\d{1,2})(%?)$/) ?? part.match(/^(\d{1,2})(%)/);
    if (m) {
      keys.push(numberToWords(Number(m[1])));
      if (m[2]) keys.push('percent');
      continue;
    }
    const key = normalize(part);
    if (key) keys.push(key);
  }
  return keys;
};

/** Every spoken word of a cut, in order, tagged with its section. */
export const scriptWords = (cut) =>
  CUTS[cut].sections.flatMap((section) =>
    spokenText(section.text)
      .split(' ')
      .filter((w) => normalize(w))
      .map((text) => ({ text, key: normalize(text), section: section.id })),
  );

/** Pause cues inside the raw section text, used by the estimator and the guide voice. */
export const pauseAfter = (word) => (/\.\.\.$/.test(word) ? 0.35 : /[.?!]$/.test(word) ? 0.25 : /,$/.test(word) ? 0.12 : 0);

/**
 * Rough spoken length of a cut. Calibrated on an Eleven v4 narrator take (231 words → 96.8 s):
 * ~2.9 words/s plus most of the written pauses.
 */
export const estimateSeconds = (cut) => {
  const words = scriptWords(cut);
  const pauses = words.reduce((s, w) => s + pauseAfter(w.text), 0);
  const breaks = CUTS[cut].sections.reduce((s, sec, i) => s + (i && sec.para ? 0.6 : 0) + (/\[(short )?pause\]/i.test(sec.text) ? 0.35 : 0), 0);
  return words.length / 2.9 + 0.8 * (pauses + breaks);
};

export { CUTS, CUT_IDS, SLUG, VOICE, elevenLabsText, spokenText };
