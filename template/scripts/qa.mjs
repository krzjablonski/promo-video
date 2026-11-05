// Checks rendered cuts: npm run qa -- [cut…] [--draft]   (no cut = every rendered cut)
//
// Writes .qa/<cut>/ with
//   sheet.jpg      storyboard: one frame per section, at the end of its last word (the settled
//                  picture for that line). Look at it.
//   cues.jpg       one frame per spoken cue (props cue/…Cue), just after the word, kept inside its
//                  scene — did the beat land? More than 16 cues continue in cues-2.jpg, cues-3.jpg…
//   report.txt     duration, loudness, alignment, frame list, warnings
// Cues are resolved exactly as src/SceneContext.tsx does (whole scene, section/word, #n, @section).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { CATALOG } from '../src/scenes/catalog.ts';
import { LEAD_SECONDS as LEAD, buildTimeline, groupSections as groupsOf } from '../src/timeline.ts';
import { CUTS, ROOT, SLUG, ffmpeg, ffprobe, hasFlag, parseCutsArg } from './lib.mjs';

const CROSSFADE = 10 / 30; // PromoCut CROSSFADE frames at 30 fps
const PER_SHEET = 16;
const [ff, ...ffPre] = ffmpeg();
const [fp, ...fpPre] = ffprobe();
const cleanWord = (w) => w.toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9'-]/g, '');

const collectCues = (o, out = []) => {
  if (Array.isArray(o)) o.forEach((v) => collectCues(v, out));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) (k === 'cue' || k.endsWith('Cue')) && typeof v === 'string' ? out.push(v) : collectCues(v, out);
  return out;
};

/** Seconds at which a cue fires, or null — mirrors useScene().cue. */
const resolveCue = (spec, ids, t) => {
  if (spec.startsWith('@')) return ids.includes(spec.slice(1)) ? t.sections[spec.slice(1)].start : null;
  const [scoped, nthRaw] = spec.split('#');
  const [sectionId, w] = scoped.includes('/') ? scoped.split('/') : [null, scoped];
  const prefix = cleanWord(w);
  const hits = t.words.filter((x) => ids.includes(x.section) && (!sectionId || x.section === sectionId) && cleanWord(x.text).startsWith(prefix));
  const hit = hits[Math.max(1, Number(nthRaw) || 1) - 1];
  return hit ? hit.start : null;
};

const qaCut = (cut) => {
  const video = join(ROOT, 'out', `${SLUG}-${cut}${hasFlag('draft') ? '.draft' : ''}.mp4`);
  if (!existsSync(video)) {
    console.warn(`[${cut}] skipped: no ${relative(ROOT, video)} (npm run render -- ${cut}${hasFlag('draft') ? ' --draft' : ''})`);
    return;
  }
  const raw = JSON.parse(readFileSync(join(ROOT, 'src', 'timings', `${cut}.json`), 'utf8'));
  // video-timeline times: the take plus any hold / minSeconds silences, as PromoCut plays it
  const { timings: t, holds } = buildTimeline(CUTS[cut].sections, raw, CUTS[cut].tail);
  const held = Object.values(holds).reduce((a, b) => a + b, 0);
  // drafts and full renders keep separate sheets, so a full-res QA doesn't erase the draft's
  const dir = join(ROOT, '.qa', hasFlag('draft') ? `${cut}.draft` : cut);
  const rel = relative(ROOT, dir);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const duration = Number(execFileSync(fp, [...fpPre, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video], { encoding: 'utf8' }).trim());
  // -vn: measure the sound only. Without it the ffmpeg bundled with Remotion prints no loudness.
  const loud = spawnSync(ff, [...ffPre, '-hide_banner', '-i', video, '-vn', '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], { encoding: 'utf8' }).stderr ?? '';
  let lufs = null;
  try {
    lufs = Number(JSON.parse(loud.slice(loud.lastIndexOf('{'), loud.lastIndexOf('}') + 1)).input_i);
  } catch {}

  const grab = (sec, file) =>
    execFileSync(ff, [...ffPre, '-y', '-loglevel', 'error', '-ss', String(Math.max(0, Math.min(sec, duration - 0.05))), '-i', video, '-frames:v', '1', '-vf', 'scale=640:-2', join(dir, file)]);
  /**
   * Tiles numbered frames (prefixNN.jpg, from `first`) into one image, 4 per row. Returns false when
   * this ffmpeg has no `tile` filter (the copy bundled with Remotion on Windows): the single frames
   * are still there to look at.
   */
  let noTile = false;
  const sheet = (prefix, first, count, out) => {
    if (!count || noTile) return false;
    const cols = Math.min(4, count);
    const rows = Math.ceil(count / cols);
    const made = spawnSync(ff, [...ffPre, '-y', '-loglevel', 'error', '-framerate', '1', '-start_number', String(first), '-i', join(dir, `${prefix}%02d.jpg`), '-vf', `tile=${cols}x${rows}:padding=6:color=white`, '-frames:v', '1', join(dir, out)], { encoding: 'utf8' });
    if (made.status === 0) return true;
    if (/tile/i.test(made.stderr ?? '')) {
      noTile = true;
      return false;
    }
    throw new Error(`ffmpeg could not make ${out}:\n${made.stderr ?? made.error}`);
  };

  // scene windows: a scene is replaced LEAD s before the next scene's first word, crossfading
  const groups = groupsOf(CUTS[cut].sections);
  const sceneStart = groups.map((g, i) => (i === 0 ? 0 : t.sections[g.sections[0].id].start - LEAD));
  const sceneEnd = groups.map((g, i) => (i + 1 < groups.length ? sceneStart[i + 1] - CROSSFADE : duration));

  const lines = [];
  const warnings = [];
  let n = 0;
  groups.forEach((g, gi) => {
    for (const s of g.sections) {
      const sec = t.sections[s.id];
      const at = Math.max(sec.start + 0.8, Math.min(sec.end, sceneEnd[gi] - 0.1));
      const f = `s${String(++n).padStart(2, '0')}.jpg`;
      grab(at, f);
      lines.push(`${f.slice(0, 3)} ${s.id.padEnd(18)} ${s.scene.padEnd(10)} @ ${at.toFixed(2)}s  "${s.text.replace(/\[[^\]]*\]\s*/g, '').slice(0, 60)}"`);
    }
  });
  const sectionCount = n;

  let c = 0;
  groups.forEach((g, gi) => {
    const ids = g.sections.map((s) => s.id);
    const seen = new Set();
    const times = [];
    for (const spec of collectCues(g.sections.map((s) => s.props ?? {}))) {
      if (seen.has(spec)) continue;
      seen.add(spec);
      const when = resolveCue(spec, ids, t);
      if (when === null) {
        warnings.push(`cue "${spec}" in ${g.scene} (${ids.join(', ')}) is not spoken — falls back to a stagger`);
        continue;
      }
      times.push({ spec, when });
      const at = Math.min(when + 0.45, sceneEnd[gi] - 0.05);
      const f = `c${String(++c).padStart(2, '0')}.jpg`;
      grab(at, f);
      const late = sceneEnd[gi] - when < 0.6 ? '  ⚠ spoken <0.6 s before the scene ends — the beat barely shows; cue an earlier word, or give the scene room (hold / minSeconds)' : '';
      if (late) warnings.push(`cue "${spec}" lands at the very end of its scene`);
      lines.push(`${f.slice(0, 3)} "${spec}" in ${g.scene} spoken at ${when.toFixed(2)}s → frame @ ${at.toFixed(2)}s${late}`);
    }
    times.sort((a, b) => a.when - b.when);
    // custom scenes animate actions (a click, a form filling) that need time; library scenes are built for quick pop-ins
    for (let k = 1; k < times.length && CATALOG[g.scene]?.library !== true; k++) {
      const gap = times[k].when - times[k - 1].when;
      if (gap > 0 && gap < 0.6) warnings.push(`cues "${times[k - 1].spec}" and "${times[k].spec}" in ${g.scene} are ${gap.toFixed(2)} s apart — the second beat has no room; give it more words`);
    }
  });

  sheet('s', 1, sectionCount, 'sheet.jpg');
  const cueSheets = [];
  for (let first = 1, k = 1; first <= c; first += PER_SHEET, k++) {
    const name = k === 1 ? 'cues.jpg' : `cues-${k}.jpg`;
    if (sheet('c', first, Math.min(PER_SHEET, c - first + 1), name)) cueSheets.push(name);
  }
  if (noTile) warnings.push('no contact sheets: this ffmpeg has no tile filter (install the full ffmpeg to get them) — look at the single frames s01.jpg, c01.jpg… instead');

  const isGuide = t.audio && t.audio.includes('.guide.');
  if (lufs !== null && !isGuide && (lufs < -18 || lufs > -13)) warnings.push(`loudness ${lufs.toFixed(1)} LUFS is outside −13…−18: re-import the take with npm run vo:import`);
  if (t.aligned && t.aligned < 0.8) warnings.push(`only ${Math.round(t.aligned * 100)}% of script words aligned — does the take match the script?`);
  if (!t.audio) warnings.push('silent: timings are estimated, no voice');
  else if (isGuide) warnings.push('guide voice, not the real take');

  const header = [
    `${cut} — ${CUTS[cut].title}`,
    `video      ${relative(ROOT, video)}`,
    `duration   ${duration.toFixed(2)} s (voice ${raw.duration}s${held ? ` + holds ${held.toFixed(2)}s` : ''} + tail ${CUTS[cut].tail}s)`,
    ...(held ? [`holds      ${Object.entries(holds).map(([id, s]) => `${id} +${s.toFixed(2)}s`).join(', ')}`] : []),
    `scenes     ${groups.map((g, i) => `${g.scene} ${((i + 1 < groups.length ? sceneStart[i + 1] : duration) - sceneStart[i]).toFixed(1)}s`).join(' · ')}`,
    `loudness   ${lufs === null ? 'n/a' : `${lufs.toFixed(1)} LUFS`}`,
    `timing     ${t.source}${t.aligned ? `, ${Math.round(t.aligned * 100)}% of script words aligned` : ''}`,
    `audio      ${t.audio ?? 'none'}`,
    noTile
      ? `frames     ${rel}/s01.jpg … (${sectionCount} sections)${c ? `, ${rel}/c01.jpg … (${c} cues)` : ''}`
      : `sheets     ${rel}/sheet.jpg (${sectionCount} sections)${cueSheets.length ? `, ${cueSheets.map((x) => `${rel}/${x}`).join(', ')} (${c} cues)` : ''}`,
    ...warnings.map((w) => `⚠ ${w}`),
    '',
  ];
  writeFileSync(join(dir, 'report.txt'), [...header, ...lines].join('\n') + '\n');
  console.log([...header, ...lines].join('\n') + '\n');
};

for (const cut of parseCutsArg()) qaCut(cut);
console.log('Inspect every sheet (or frame) listed above with the Read tool.');
