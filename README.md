# Workout Log

An Obsidian plugin for tracking fitness workouts using simple markdown.

## Overview

Track your workouts directly in Obsidian with interactive timers, editable values, and automatic progress tracking. All data is stored as plain markdown - easy to analyze, backup, and own forever.

<!-- GIF: Plugin showcase -->

## Features

- **Timers**: Count-up for exercises, countdown for rest periods with auto-advance
- **Editable values**: Click to edit weight, reps, or duration during workout
- **Add Set / Add Rest**: Quickly add extra sets or rest periods on the fly
- **Skip / Pause / Resume**: Full control over your workout flow
- **Copy as Template**: Reuse completed workouts as templates
- **Undo support**: Ctrl+Z works - syncs timer state with file changes

## Installation

### Manual
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create folder: `<vault>/.obsidian/plugins/workout-log/`
3. Copy the files into the folder
4. Enable the plugin in Obsidian settings

### From Community Plugins
Coming soon.

## Usage

Create a code block with the `workout` language:

````markdown
```workout
title: Morning Workout
state: planned
startDate:
duration:
restDuration: 45s
---
- [ ] Squats | Weight: [60] kg | Reps: [10]
- [ ] Rest | Duration: [45s]
- [ ] Bench Press | Weight: [40] kg | Reps: [8]
- [ ] Plank | Duration: [60s]
```
````


### Metadata

| Field | Description |
|-------|-------------|
| `title` | Workout name (displayed in header) |
| `state` | `planned`, `started`, or `completed` |
| `startDate` | Auto-filled when workout starts |
| `duration` | Auto-filled when workout completes |
| `restDuration` | Default duration for "+ Rest" button |

### Exercise Format

```
- [ ] Exercise Name | Key: [value] unit | Key: value
```

- `[ ]` pending, `[\]` in progress, `[x]` completed, `[-]` skipped
- `[value]` = editable, `value` = locked
- `Duration: [60s]` = countdown timer

## Examples

### Strength Training

```workout
title: Push Day
state: planned
startDate:
duration:
restDuration: 90s
---
- [ ] Bench Press | Weight: [60] kg | Reps: [8]
- [ ] Overhead Press | Weight: [30] kg | Reps: [10]
- [ ] Tricep Dips | Reps: [12]
```

### HIIT / Timed Workout

```workout
title: Quick HIIT
state: planned
startDate:
duration:
---
- [ ] Jumping Jacks | Duration: [30s]
- [ ] Rest | Duration: [10s]
- [ ] Burpees | Duration: [30s]
- [ ] Rest | Duration: [10s]
- [ ] Mountain Climbers | Duration: [30s]
```

## Screenshots

### Planned
![Planned workout](readme-files/workout-log-planned.png)

### In Progress
![Workout in progress with markdown source view](readme-files/workout-log-ongoing-markdown.png)

### Completed
![Completed workout](readme-files/workout-log-completed.png)

## Building from Source

```bash
npm install
npm run build    # Production build
npm run dev      # Watch mode
```

## License

MIT
