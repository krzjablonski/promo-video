---
name: promo-video
description: Make a narrated marketing/promo video for a software product from its codebase, website and brand. Runs an interview, researches the product, writes an ElevenLabs v4 voiceover script with prompts and settings, then builds voice-synced motion-graphics cuts (hero ~60–90 s, 30 s, 15 s, vertical) with Remotion, renders MP4s and QA-checks them. Use when the user asks for a promo, explainer, product, launch or marketing video, an ElevenLabs voiceover script for a video, or to update/re-voice/re-cut an existing promo-video project.
---

# Promo video

Turns a product (its code, website, brand) into finished, voice-synced promo videos. The machinery
is a Remotion project scaffolded from `template/`: `src/script.ts` holds the voiceover split into
sections, each section drives a scene from a props-configured library, and the edit re-times
itself to whatever voice recording is dropped in.

```
interview → research → scaffold + brand → script + storyboard ─✋→ voice → sync → render → QA ─✋→ deliver
```

Two approval points (✋) are mandatory. Never skip them to "save time".

**Paths**: `SKILL_DIR` = the directory of this file. Project lives in the user's repo, default
`marketing/promo-video/` (ask if the repo isn't the product's). All `npm run` commands run there.

**Read before writing anything**: `references/script-writing.md` (story shapes, rules),
`references/custom-scenes.md` (the quality bar — **the film is won in the custom scenes**),
`references/scenes.md` (library scene props and the cue syntax), `references/elevenlabs-v4.md`
(how to write for the voice). Read them in full. Then calibrate what "good" looks like: first on
the **user's own reference examples** from the interview (they take priority), then on the
generic example scenes in `references/examples/asset-integrity/`.

**Library scenes are connective tissue, not the film.** A hero built only from library scenes is
generic and is not acceptable: it needs a world opener and ≥2 product screens built for *this*
product (`npm run check` enforces it). Budget most of the build time for those scenes.

---

## 0. Resume or start

Look for an existing project (`**/promo-video/package.json`, `brief.md`). If one exists, read its
`brief.md` — the **Status** checklist at the bottom says which phase is next — and continue there.
For a change request ("make the 30 s punchier", "new voice take") jump to the matching phase.

## 1. Interview

First gather what the repo and website already answer (README, landing pages, package metadata,
`<title>`, marketing copy in docs). Then ask the user only what's missing, with `AskUserQuestion`
(≤4 questions per call, recommended option first). Cover:

- **Goal and audience**: who should feel what, and do what after watching (book a demo, sign up)?
- **Cuts and formats**: default hero ~60–90 s (landscape, no captions) + 30 s and 15 s
  (landscape, captions on) + 15 s vertical. Where will they run?
- **Message inputs**: claims and numbers they can stand behind (with source), existing taglines,
  CTA text and contact/URL, words to avoid, competitors never to name.
- **Reference examples**: films, scenes or styles they want this one to resemble (links, video
  files, their earlier promos, a project with custom scenes), and what they like in each. These
  take priority over the generic examples in `references/examples/`; record them in `brief.md`.
  None → use the generic example.
- **Voice**: existing ElevenLabs voice (name/ID)? Accent/gender/tone. Never ask for an API key.
- **How the takes get made**: first check whether this session has an ElevenLabs MCP server or
  connector (a text-to-speech / generate-speech tool and a list-voices tool; load deferred tools
  with ToolSearch, e.g. "elevenlabs speech voice"). If one exists, ask: *generate the takes
  through the connector* (recommended) or *generate them yourself in elevenlabs.io*. If none
  exists, don't ask: the user generates them in elevenlabs.io. Record the choice in `brief.md`.
- **Assets**: logo files (colour + white), brand colours/fonts if not in the code, can the app be
  run locally with demo data for screenshots, any footage/music they own.

Write answers into `brief.md` as you go (template below).

## 2. Research

Delegate a read-only sweep to an `Explore` subagent (keeps this context lean). Research takes
several minutes; scaffolding takes seconds, so start the subagent in the background, do phase 3
meanwhile, then wait for its result (if you can't run it in the background, just run it first).
**You** save its findings to `research.md`. Ask it to return, with file paths as evidence:
- what the product does, for whom, in one paragraph; the core workflow/loop and its real stage
  names; roles/personas in the code (permissions, inbox types, user types);
- 5–10 distinctive capabilities that can be *shown*; the vocabulary the UI uses (menu items,
  entity names);
- **material to recreate the 3–5 key screens**: for each, the component/template file paths, the
  layout regions, column headers, status/stage names, buttons, and the format of IDs and values
  (e.g. `DEF-0391`, `JP-4812`, thickness in mm) — enough to rebuild it faithfully with invented data;
- **the customer's world**: where the work physically happens (offshore platform, factory floor,
  warehouse, clinic…) and the concrete objects the product manages (a pressure vessel and its
  welds, a pallet, a patient record), with their realistic attributes;
- brand: colour variables (SCSS/CSS/Tailwind/theme files), fonts, logo files (SVG/PNG, colour and
  white variants), favicon/mark;
- public claims and numbers in the repo/docs/website, each with its source;
- whether the app runs locally with seed/demo data (for screenshots);
- every name the product goes by (repo, package, page title, website) and which one users see.

If the user gave a website, read it too (web-fetch agent). Save the findings to
`research.md` in the project folder. Facts only; mark anything inferred.

## 3. Scaffold and brand

```bash
"$SKILL_DIR/bin/new-project.sh" marketing/promo-video     # copies template, npm ci
```
Then:
- `src/brand.ts`: colours mapped to roles (from the product's own tokens — never invent when
  they exist; if the product UI and the company brand differ, ask which, default to the product UI;
  colours must be `#rrggbb`), display font import, `BRAND` names/URL/CTA, app chrome
  menu (real menu items), `captionReplace` for names spelled for the voice.
- Logos into `public/brand/` (convert SVG → PNG ≥2000 px wide if needed:
  `npx @resvg/resvg-js-cli` or `rsvg-convert -w 2400`, or `sips` for raster). No logo file → leave
  `null`; a typeset wordmark is used.
- `SLUG` in `src/script.ts`.
- Optional screenshots: if the app runs locally with **demo data only**, capture 1600×1000 PNGs of
  2–4 key screens into `public/screens/` (browser pane: resize the window, screenshot). Never
  capture real client data.

## 4. Script + storyboard → ✋ approval 1

0. **Plan the picture before the words settle.** For each beat of the hero, decide: world opener,
   product screen (which real screen, which moment), mechanism, or library connective tissue.
   Write that plan into `brief.md` (a table: section → scene → custom/library → what it shows).
   At least a world opener and two product screens are custom (references/custom-scenes.md).
1. Write `src/script.ts` `CUTS` (and `VOICE`; set `VOICE.language` to the voiceover's language code,
   e.g. `'pl'`, when it is not English, or `sync` cannot align the take): sections with ElevenLabs-ready text, a scene and
   props each, cues on the nouns the picture shows. Follow `references/script-writing.md`.
   Props of consecutive same-scene sections merge shallowly: put list props (`items`, `steps`,
   `people`…) once in the scene's first section; use `break: true` for a separate shot.
   A scene whose animation needs more time than its line gets `minSeconds` (or `hold`, or
   `holdAfter: { word: s }` for a beat mid-line): silence is inserted into the one take, never a
   separate recording per scene.
2. Fill `brief.md` including the **where the lines come from** table.
2b. **Build the custom scenes** in `src/scenes/custom/` following `references/custom-scenes.md`:
   recreate the product's real screens from its components with realistic invented data, draw
   the world in SVG on `WorldBackdrop`, use the kit (`Callout`, `Stamp`, `RiskMatrix`,
   `AuditLog`, `DeviceFrame`). Typecheck and look at a still of each before moving on.
3. `npm run check` — fix every ✗, and every ⚠ you can (length vs target, digits, acronyms,
   custom-scene minimum).
4. Make a preview with a robotic guide voice so the user sees the edit before paying for a take:
   ```bash
   npm run vo:guide          # macOS `say`; elsewhere: npm run sync -- --estimate (silent)
   npm run sync
   npm run render -- --draft
   npm run qa -- --draft
   ```
5. **Look at** every sheet `qa` lists (`.qa/<cut>.draft/sheet.jpg`, `cues.jpg`, `cues-2.jpg`…) with the
   Read tool, and act on every ⚠ line in its report. Then run the **specificity test** on the
   hero storyboard: for each frame, "could this appear unchanged in a competitor's video?" If
   more than about a third of the frames could, replace the weakest library scenes with custom
   ones before showing the user. Check: nothing
   overlaps or is cut off, text is readable, every cue frame shows its beat, no empty frames,
   scenes alternate tone. Fix and re-render until clean (see Troubleshooting).
6. Present to the user: the ElevenLabs text of each cut (`npm run script -- <cut>`), the
   storyboard image `.qa/<cut>.draft/sheet.jpg` (one settled frame per line), the sources table, and
   the draft MP4s — via `SendUserFile` when available, otherwise give their paths. Say clearly it's a robotic guide voice. Ask for
   approval or changes. Loop until approved.

## 5. Voice

Follow the route chosen in the interview (`brief.md` → Voice). Never ask for an API key and never
call the ElevenLabs API directly (no curl, no scripts) — only through a connector the session
already has.

**Through the connector**:
- Find the voice with the connector's list-voices tool (by the name/ID from the brief, or one
  matching the brief's accent/gender/tone) and set `VOICE.voiceId`. Never invent a voice ID.
- Generate each cut in one request from `npm run script -- <cut>` (model `eleven_v4`, settings
  from `VOICE`). Make 3–4 takes per cut when the tool allows; pick by highest `sync` alignment +
  no tag read aloud, or let the user pick by ear.
- Get the audio onto disk: if the tool saves a file or returns a downloadable URL, save the MP3
  outside `public/` (e.g. `.qa/takes/`) and import it. If it only plays inline and gives no file,
  ask the user to download the chosen take and send its path.
- If the connector fails, lacks v4 or can't reach the voice, tell the user and fall back to the
  manual route.

**By hand in elevenlabs.io**:
- Give the user, per cut, the text in a fenced block (ready to paste) plus model/voice/settings
  — `npm run script -- <cut>` prints both. Suggest 3–4 takes per cut and ask them to send the
  chosen MP3 (or several, and you pick by highest `sync` alignment + no tag read aloud). Wait for
  the files.

Then, either way:
- Import each chosen take (normalises loudness to −16 LUFS; never edit their original):
  `npm run vo:import -- <cut> <path>`, then `npm run sync -- <cut>`.
- Alignment < 80%: transcribe-check the take (does it match the current script? any tag read
  aloud? brand name spelled out?) and tell the user what to regenerate.

## 6. Render, QA → ✋ approval 2

```bash
npm run render -- <cut…>        # full 1080p (only the cuts named; no name = all)
npm run qa -- <cut…>
```
Read `report.txt` (loudness −13…−18 LUFS, alignment, real voice not guide, `scenes` lengths) and
look at both contact sheets again — the real voice re-times everything. A scene cut off before its
animation finishes → `minSeconds`/`hold` on its section and re-render (no new take, no re-sync). Fix, re-render. Then send the MP4s
(`SendUserFile` when available) with a short summary: length, what changed, anything they must do (licences,
remaining takes). Ask for sign-off.

## 7. Wrap up

Update `brief.md` Status and the project README "how to re-voice / re-cut" if anything changed.
Offer to commit (on a branch); don't commit or push without being asked. `out/` is git-ignored;
the voice takes in `public/voiceover/` are committed so renders are reproducible.

---

## brief.md template

```markdown
# <Product> promo video — brief
## Goal & audience
## Key message (one sentence)
## Cuts
| Cut | Length | Format | Captions | Where it runs |
## Reference examples
| Example | What to take from it |
## Voice
Model eleven_v4 · voice <name> (<id>) · stability … · similarity … · seed …
Takes generated: connector | by hand in elevenlabs.io
## Where the lines come from
| Line | Source |
## Kept out on purpose
## Status
- [ ] interview  - [ ] research  - [ ] scaffold/brand  - [ ] script approved
- [ ] voice: hero / cut30 / cut15   - [ ] final renders approved
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `check`: cue never spoken | Cue must be the *start* of a spoken word in that scene's sections; scope with `section/word`. |
| Scene empty on its first frames | Its first element waits for a late cue: drop that cue, or move the cue earlier. |
| QA ⚠ "spoken <0.6 s before the scene ends" | The beat is on the last word; cue an earlier word, split the section, or `hold`/`minSeconds` on it. |
| Scene cut off before its animation ends | `minSeconds: <s>` (or `hold`) on its section → re-render. Never generate the voice per scene. |
| Hold sounds clipped / starts mid-word | Re-run `npm run sync -- <cut>` (older timings have no pause points); check the take has a pause there. |
| Text overflows / overlaps | Shorten on-screen text (2–6 words); fewer items; check portrait separately. |
| Timings stale error in render | Script changed after sync → re-guide/re-record, `npm run sync`. |
| Low alignment with a real take | Take doesn't match the script, or a tag was read aloud. Regenerate. |
| whisper build fails | Needs `git` + `make` (Xcode CLT on macOS; Windows downloads a ready-made build, no `make`). Or `npm run sync -- --estimate` meanwhile. |
| Low alignment, take not in English | Set `VOICE.language` in `src/script.ts` (e.g. `'pl'`) → `npm run sync` uses the multilingual model. |
| QA: "no contact sheets" | The ffmpeg bundled with Remotion (Windows) has no `tile` filter. Read the single frames `s01.jpg`, `c01.jpg`… instead, or install the full ffmpeg. |
| Font/logo looks wrong | `brand.ts` font import; logo PNG must have transparent background. |

## Licensing

Remotion is free for individuals and companies with ≤3 employees; larger companies need a
[Remotion Company License](https://www.remotion.pro/license) before commercial use. Tell the user
once, in the first delivery. ElevenLabs output rights depend on their plan. Music and footage need
licences the user holds.
