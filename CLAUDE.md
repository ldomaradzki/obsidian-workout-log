# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm install          # Install dependencies
npm run dev          # Watch mode (rebuilds on changes)
npm run build        # Production build (type-check + minified bundle)
```

Output: `main.js` (bundled by esbuild)

## Deployment

Copy these files to Obsidian vault's `.obsidian/plugins/workout-log/`:
- `main.js`
- `manifest.json`
- `styles.css`

## Architecture

This is an Obsidian plugin that renders `workout` code blocks as interactive workout trackers with timers.

### Core Flow

1. **main.ts** - Plugin entry, registers `registerMarkdownCodeBlockProcessor('workout', ...)`
2. **parser/** - Parses markdown source into `ParsedWorkout` (metadata + exercises)
3. **renderer/** - Renders HTML UI from parsed data, wires up event handlers
4. **timer/manager.ts** - Plugin-level timer state (survives re-renders)
5. **file/updater.ts** - Writes changes back to markdown via `app.vault.process()`
6. **serializer.ts** - Converts `ParsedWorkout` back to markdown string

### Key Design Decisions

- **Timer persistence**: Timers stored in `Map<workoutId, TimerInstance>` at plugin level, not per-render. When Obsidian re-renders a code block, the new render subscribes to existing timer.
- **workoutId**: `${sourcePath}:${sectionLineStart}` uniquely identifies each workout block
- **File updates**: Always modify timer state BEFORE `updateFile()` to ensure re-render sees correct state
- **Stale render detection**: Callbacks check `timerManager.getActiveExerciseIndex()` against captured index to bail if stale

### Workout Format

```
title: Workout Name
state: planned|started|completed
startDate: 2026-01-08 15:45
duration: 11m 33s
---
- [ ] Exercise | Key: [value] unit | Duration: [60s]
```

- `[ ]` pending, `[\]` in progress, `[x]` completed, `[-]` skipped
- `[value]` = editable, `value` = locked
- `Duration: [Xs]` = countdown timer, no Duration = count-up timer
