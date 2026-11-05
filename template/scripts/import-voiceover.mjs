// Brings a voiceover take into the project, loudness-normalised for web/social playback:
//   npm run vo:import -- <cut> <path/to/take.mp3> [--lufs -16]
//
// ElevenLabs exports land around −22 LUFS, quieter than the −14 to −16 LUFS that LinkedIn,
// YouTube and social feeds play at. Two-pass loudnorm hits the target without changing timing.
// Writes public/voiceover/<cut>.mp3 (the original file is left untouched).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT, ffmpeg, flagValue, parseCutArg, positionals } from './lib.mjs';

const cut = parseCutArg('<path/to/take.mp3> [--lufs -16]', ['lufs']);
const src = positionals(['lufs'])[1];
if (!src || !existsSync(resolve(src))) {
  console.error(`Usage: npm run vo:import -- ${cut} <path/to/take.mp3>  (file not found: ${src ?? '—'})`);
  process.exit(1);
}
const lufs = Number(flagValue('lufs', '-16'));
const [bin, ...pre] = ffmpeg();
const out = join(ROOT, 'public', 'voiceover', `${cut}.mp3`);

// pass 1: measure (loudnorm prints its JSON report on stderr). -vn: sound only, so a cover picture
// in the file cannot stop the ffmpeg bundled with Remotion (it has no picture encoders).
const run = spawnSync(bin, [...pre, '-hide_banner', '-i', resolve(src), '-vn', '-af', `loudnorm=I=${lufs}:TP=-1.5:LRA=11:print_format=json`, '-f', 'null', '-'], { encoding: 'utf8' });
const log = run.stderr ?? '';
const m = JSON.parse(log.slice(log.lastIndexOf('{'), log.lastIndexOf('}') + 1));
// pass 2: apply with measured values (linear, so timing and dynamics are preserved)
const filter = `loudnorm=I=${lufs}:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
execFileSync(bin, [...pre, '-y', '-loglevel', 'error', '-i', resolve(src), '-vn', '-af', filter, '-ar', '44100', '-ac', '1', '-b:a', '192k', out], { stdio: 'inherit' });
console.log(`[${cut}] ${src} → public/voiceover/${cut}.mp3 (was ${m.input_i} LUFS, now ~${lufs}). Next: npm run sync -- ${cut}`);
