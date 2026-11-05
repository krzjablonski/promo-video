// Renders cuts to out/<SLUG>-<cut>.mp4: npm run render -- [cut…] [--draft]
//   --draft  half resolution, faster, for review (out/<SLUG>-<cut>.draft.mp4)
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CUTS, REMOTION_CLI, ROOT, SLUG, hasFlag, parseCutsArg } from './lib.mjs';

const draft = hasFlag('draft');
for (const cut of parseCutsArg()) {
  if (!existsSync(join(ROOT, 'src', 'timings', `${cut}.json`))) {
    console.warn(`[${cut}] skipped: not synced (npm run sync -- ${cut})`);
    continue;
  }
  const out = `out/${SLUG}-${cut}${draft ? '.draft' : ''}.mp4`;
  console.log(`[${cut}] rendering ${CUTS[cut].composition} → ${out}`);
  const [node, ...cli] = REMOTION_CLI; // not `npx`, so it also runs on Windows
  execFileSync(node, [...cli, 'render', CUTS[cut].composition, out, ...(draft ? ['--scale=0.5', '--crf=26'] : [])], { cwd: ROOT, stdio: 'inherit' });
}
