# promo-video — Claude Code skill

Turns a software product (its codebase, website and brand) into narrated, voice-synced promo
videos: interview → research → ElevenLabs v4 script and voice brief → Remotion motion graphics
timed to the voice → MP4 renders (hero, 30 s, 15 s, vertical) → QA contact sheets.

The instructions Claude follows are in [`SKILL.md`](SKILL.md); the scene catalogue, ElevenLabs
writing guide and script structure are in [`references/`](references/); the Remotion project that
gets copied into each product repo is in [`template/`](template/).

## Install

Personal (all your projects):

```bash
git clone git@github.com:krzjablonski/promo-video.git ~/.claude/skills/promo-video
```

Per repo (everyone who opens that repo in Claude Code gets it):

```bash
git clone git@github.com:krzjablonski/promo-video.git .claude/skills/promo-video
rm -rf .claude/skills/promo-video/.git   # or add it as a submodule instead
```

Update with `git -C ~/.claude/skills/promo-video pull`.

## Use

In any project: `/promo-video`, or just ask Claude for a promo/explainer video.

## Requirements

- Node 22.18+ and npm
- ffmpeg (falls back to Remotion's bundled copy)
- `git` + `make` — the first `npm run sync` builds whisper.cpp into `~/.cache/promo-video/whisper`
  (~1 minute, shared by all projects). On Windows no `make` is needed: a ready-made whisper.cpp
  is downloaded instead
- macOS for the robotic preview voice (`say`); elsewhere (Windows, Linux) previews use estimated
  timing
- Voiceover in English by default. For another language set `VOICE.language` in `src/script.ts`
  (e.g. `'pl'`): `npm run sync` then uses the multilingual whisper model `small` (~470 MB, once)
- An ElevenLabs account. If your Claude session has an ElevenLabs MCP server/connector, Claude asks
  whether to generate the takes through it; otherwise it gives you the v4 text and settings per
  cut, you generate the take in elevenlabs.io and hand over the MP3 (no API key needed either way)

Claude also asks for reference films or scenes you want to emulate; they take priority over the
generic example in `references/examples/`.

## Licensing

Remotion is free for individuals and companies with up to 3 employees; larger companies need a
[Remotion Company License](https://www.remotion.pro/license) for commercial use. ElevenLabs
output rights depend on your plan.
