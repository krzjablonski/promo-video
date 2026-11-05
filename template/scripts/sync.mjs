// Times cuts to their voiceover: npm run sync -- [cut…] [--estimate]   (no cut = all cuts)
//
// Picks the first audio file found of public/voiceover/<cut>.{mp3,wav,m4a}, then <cut>.guide.mp3,
// transcribes it locally with whisper.cpp (built once into ~/.cache/promo-video/whisper, shared by
// all projects), aligns the transcript against src/script.ts and writes src/timings/<cut>.json:
// when every section and every word starts, and where the pauses are (so src/timeline.ts can split
// the take for `hold` / `holdAfter` / `minSeconds`). Scenes and captions are driven by that file.
// Also rewrites src/timings/index.ts so Remotion picks up every synced cut.
//
// --estimate skips the audio and guesses timings from word lengths (no sound in the render).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { downloadWhisperModel, installWhisperCpp, toCaptions, transcribe } from '@remotion/install-whisper-cpp';
import { CUTS, ROOT, VOICE, WHISPER_DIR, ffmpeg, hasFlag, parseCutsArg, pauseAfter, scriptWords, transcriptKeys } from './lib.mjs';

// 1.5.5 is the last whisper.cpp release that builds with plain `make`; 1.7.4+ needs cmake.
// (On Windows nothing is built: a ready-made whisper.cpp is downloaded.)
const WHISPER_VERSION = '1.5.5';
// Language of the voiceover: VOICE.language in src/script.ts (e.g. 'pl'), default English.
// PROMO_WHISPER_LANGUAGE / PROMO_WHISPER_MODEL override both for one run.
const WHISPER_LANGUAGE = process.env.PROMO_WHISPER_LANGUAGE ?? VOICE.language ?? 'en';
// base.en knows English only. For other languages, 'small' is multilingual and aligned a Polish
// take at 98%; it is a bigger one-time download (~470 MB).
const WHISPER_MODEL = process.env.PROMO_WHISPER_MODEL ?? (WHISPER_LANGUAGE === 'en' ? 'base.en' : 'small');

const findAudio = (cut) => {
  // a format copy (e.g. vertical) of another cut uses that cut's recording
  if (CUTS[cut].voiceFrom) cut = CUTS[cut].voiceFrom;
  const candidates = ['mp3', 'wav', 'm4a'].map((ext) => `voiceover/${cut}.${ext}`).concat(`voiceover/${cut}.guide.mp3`);
  return candidates.find((rel) => existsSync(join(ROOT, 'public', rel))) ?? null;
};

const levenshtein = (a, b) => {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
};

const similar = (a, b) =>
  a === b || (Math.min(a.length, b.length) >= 4 && levenshtein(a, b) <= Math.max(1, Math.floor(Math.min(a.length, b.length) / 4)));

/**
 * Global alignment (edit distance) of script words against transcript words. A diagonal move —
 * match or substitution — gives the script word that transcript word's time; whisper mishearing
 * "Kora" as "Cora" still lands in the right place. Returns per-script-word times or null.
 */
const align = (script, transcript) => {
  const n = script.length;
  const m = transcript.length;
  const D = Array.from({ length: n + 1 }, (_, i) => new Float64Array(m + 1).fill(0).map((_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diag = D[i - 1][j - 1] + (similar(script[i - 1].key, transcript[j - 1].key) ? 0 : 1);
      D[i][j] = Math.min(diag, D[i - 1][j] + 1, D[i][j - 1] + 1);
    }
  }
  const times = new Array(n).fill(null);
  let matched = 0;
  for (let i = n, j = m; i > 0 && j > 0; ) {
    const same = similar(script[i - 1].key, transcript[j - 1].key);
    if (D[i][j] === D[i - 1][j - 1] + (same ? 0 : 1)) {
      times[i - 1] = { start: transcript[j - 1].start, end: transcript[j - 1].end };
      if (same) matched++;
      i--;
      j--;
    } else if (D[i][j] === D[i - 1][j] + 1) {
      i--;
    } else {
      j--;
    }
  }
  return { times, matched };
};

/** Script words whisper skipped get times spread evenly across the gap between their neighbours. */
const fillGaps = (times, duration) => {
  const known = times.map((t, i) => (t ? i : -1)).filter((i) => i >= 0);
  if (known.length === 0) throw new Error('No words could be aligned — does the audio match the script?');
  const out = [...times];
  const spread = (from, to, startT, endT) => {
    const count = to - from;
    const step = Math.max(0.05, (endT - startT) / count);
    for (let k = 0; k < count; k++) out[from + k] = { start: startT + k * step, end: startT + (k + 1) * step };
  };
  if (known[0] > 0) spread(0, known[0], Math.max(0, out[known[0]].start - 0.3 * known[0]), out[known[0]].start);
  for (let k = 0; k + 1 < known.length; k++) {
    const a = known[k];
    const b = known[k + 1];
    if (b - a > 1) spread(a + 1, b, out[a].end, out[b].start);
  }
  const last = known[known.length - 1];
  if (last < out.length - 1) spread(last + 1, out.length, out[last].end, Math.min(duration, out[last].end + 0.3 * (out.length - 1 - last)));
  // keep word starts monotonic
  for (let k = 1; k < out.length; k++) {
    if (out[k].start < out[k - 1].start) out[k] = { start: out[k - 1].start, end: Math.max(out[k].end, out[k - 1].start) };
  }
  return out;
};

const estimate = (cut, words) => {
  let t = 0.4;
  let section = null;
  const sectionsById = Object.fromEntries(CUTS[cut].sections.map((s) => [s.id, s]));
  return words.map((w) => {
    if (w.section !== section) {
      const s = sectionsById[w.section];
      if (section) t += s.para ? 0.6 : 0.2;
      if (/^\s*\[(short )?pause\]/i.test(s.text)) t += 0.35;
      section = w.section;
    }
    const start = t;
    t += Math.max(0.16, 0.055 * w.key.length + 0.09);
    const end = t;
    t += pauseAfter(w.text);
    return { start, end };
  });
};

/** Pauses in the take (ffmpeg silencedetect), as [{ start, end }] in seconds. */
const findSilences = (wav, duration) => {
  const [bin, ...pre] = ffmpeg();
  const log = spawnSync(bin, [...pre, '-hide_banner', '-i', wav, '-af', 'silencedetect=noise=-40dB:d=0.08', '-f', 'null', '-'], { encoding: 'utf8' }).stderr ?? '';
  const out = [];
  for (const m of log.matchAll(/silence_(start|end): (-?[\d.]+)/g)) {
    if (m[1] === 'start') out.push({ start: Math.max(0, Number(m[2])), end: duration });
    else if (out.length) out[out.length - 1].end = Number(m[2]);
  }
  return out;
};

const transcribeAudio = async (audioRel) => {
  const tmp = mkdtempSync(join(tmpdir(), 'promo-sync-'));
  try {
    const wav = join(tmp, 'vo.wav');
    const [bin, ...pre] = ffmpeg();
    execFileSync(bin, [...pre, '-y', '-loglevel', 'error', '-i', join(ROOT, 'public', audioRel), '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    const duration = (statSync(wav).size - 44) / (16000 * 2);
    const silences = findSilences(wav, duration);

    await installWhisperCpp({ to: WHISPER_DIR, version: WHISPER_VERSION, printOutput: false });
    await downloadWhisperModel({ model: WHISPER_MODEL, folder: WHISPER_DIR, printOutput: false });
    const output = await transcribe({
      inputPath: wav,
      whisperPath: WHISPER_DIR,
      whisperCppVersion: WHISPER_VERSION,
      model: WHISPER_MODEL,
      tokenLevelTimestamps: true,
      language: WHISPER_LANGUAGE,
      printOutput: false,
    });
    const { captions: tokens } = toCaptions({ whisperCppOutput: output });
    // whisper splits words into pieces (" Pr" + "anie", " re" + "typing"). A piece with no space in
    // front continues the word before it, so glue the pieces back into whole words. Without this a
    // Polish take aligned only ~45% of the script; with it, 98%.
    const captions = [];
    for (const token of tokens) {
      const last = captions[captions.length - 1];
      if (last && !/^\s/.test(token.text)) {
        last.text += token.text;
        last.endMs = token.endMs;
      } else captions.push({ ...token });
    }
    const transcript = captions.flatMap((c) => {
      const keys = transcriptKeys(c.text);
      const span = (c.endMs - c.startMs) / 1000 / Math.max(1, keys.length);
      return keys.map((key, k) => ({ key, start: c.startMs / 1000 + k * span, end: c.startMs / 1000 + (k + 1) * span }));
    });
    return { transcript, duration, silences };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
};

const round = (x) => Math.round(x * 1000) / 1000;

const writeIndex = () => {
  const dir = join(ROOT, 'src', 'timings');
  const cuts = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
  const ident = (c) => `t_${c.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const body =
    '// Generated by `npm run sync`. Do not edit.\n' +
    cuts.map((c) => `import ${ident(c)} from './${c}.json';`).join('\n') +
    `\n\nexport default { ${cuts.map((c) => `${JSON.stringify(c)}: ${ident(c)}`).join(', ')} };\n`;
  writeFileSync(join(dir, 'index.ts'), body);
};

const syncCut = async (cut) => {
  const words = scriptWords(cut);
  const audio = hasFlag('estimate') ? null : findAudio(cut);
  let times;
  let duration;
  let source;
  let aligned = null;
  let silences = [];

  if (audio) {
    console.log(`[${cut}] Transcribing public/${audio} with whisper.cpp ${WHISPER_VERSION} (${WHISPER_MODEL}, language: ${WHISPER_LANGUAGE})…`);
    const result = await transcribeAudio(audio);
    const { times: al, matched } = align(words, result.transcript);
    duration = result.duration;
    silences = result.silences;
    times = fillGaps(al, duration);
    source = `whisper.cpp ${WHISPER_VERSION} ${WHISPER_MODEL}`;
    aligned = Math.round((matched / words.length) * 1000) / 1000;
    console.log(`[${cut}] Aligned ${matched}/${words.length} script words (${Math.round(aligned * 100)}%).`);
    if (aligned < 0.7) {
      console.warn(`[${cut}] ⚠ Under 70% of the script was recognised. Check the audio is this cut, read from the current src/script.ts, and that VOICE.language in src/script.ts is the language of the take (now: ${WHISPER_LANGUAGE}).`);
    }
  } else {
    console.log(hasFlag('estimate') ? `[${cut}] Estimating timings from the script.` : `[${cut}] No public/voiceover/${cut}.(mp3|wav|m4a) or ${cut}.guide.mp3 — estimating timings (silent).`);
    times = estimate(cut, words);
    duration = times[times.length - 1].end + 0.5;
    source = 'estimate';
  }

  const sections = {};
  words.forEach((w, i) => {
    const s = (sections[w.section] ??= { start: times[i].start, end: times[i].end });
    s.end = times[i].end;
  });
  for (const s of Object.values(sections)) {
    s.start = round(s.start);
    s.end = round(s.end);
  }

  const timings = {
    audio,
    source,
    aligned,
    duration: round(duration),
    sections,
    words: words.map((w, i) => ({ text: w.text, section: w.section, start: round(times[i].start), end: round(times[i].end) })),
    silences: silences.map((x) => [round(x.start), round(x.end)]),
  };
  writeFileSync(join(ROOT, 'src', 'timings', `${cut}.json`), JSON.stringify(timings, null, 2) + '\n');
  console.log(`[${cut}] Wrote src/timings/${cut}.json — ${CUTS[cut].sections.length} sections, ${round(duration)}s of voice.`);
};

const main = async () => {
  for (const cut of parseCutsArg()) await syncCut(cut);
  writeIndex();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
