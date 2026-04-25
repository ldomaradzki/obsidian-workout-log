# New Nested Sets Format

The workout format now supports multiple sets per exercise with indented set items. Each set can have its own rep and weight values.

## Format

```
title: Workout Name
state: planned|started|completed
startDate: 2026-01-08 15:45
duration: 11m 33s
---
- [ ] Exercise Name | Duration: [180s]
  - [ ] Reps: [10] | Weight: [185] lbs
  - [ ] Reps: [8] | Weight: [185] lbs
  - [ ] Reps: [6] | Weight: [185] lbs
```

## Example: Upper Body Workout

```
title: Upper Body Strength
state: planned
startDate:
duration:
---
- [ ] Bench Press | Duration: [300s]
  - [ ] Reps: [10] | Weight: [225] lbs
  - [ ] Reps: [8] | Weight: [235] lbs
  - [ ] Reps: [6] | Weight: [245] lbs

- [ ] Barbell Rows | Duration: [300s]
  - [ ] Reps: [10] | Weight: [225] lbs
  - [ ] Reps: [8] | Weight: [235] lbs
  - [ ] Reps: [6] | Weight: [245] lbs

- [ ] Rest | Duration: [60s]
  - [ ] Duration: [60s]

- [ ] Overhead Press | Duration: [180s]
  - [ ] Reps: [8] | Weight: [155] lbs
  - [ ] Reps: [6] | Weight: [165] lbs

- [ ] Lat Pulldown | Duration: [200s]
  - [ ] Reps: [12] | Weight: [180] lbs
  - [ ] Reps: [10] | Weight: [200] lbs
  - [ ] Reps: [8] | Weight: [220] lbs
```

## Key Features

- **Exercise Header**: Parent item with exercise name and optional duration
- **Indented Sets**: Each set is an indented bulleted item (2 spaces + `- [ ]`)
- **Set Parameters**: Each set can have Reps, Weight, or other parameters
- **State Tracking**: Each set has its own checkbox state (pending, in progress, completed, skipped)
- **Editable Values**: Wrap values in brackets `[value]` to make them editable
- **Units**: Add units after values, e.g., `Weight: [185] lbs` or `Reps: [10] /arm`

## Parse/Serialize Behavior

- When parsing, each exercise automatically creates a default set from any exercise-level params (for backward compatibility)
- Exercise-level params now typically contain `Duration` for timed exercises
- Set-level params contain the actual exercise data (Reps, Weight, etc.)
- When serializing, exercise header comes first, followed by indented sets

## "+ Set" Button

When you click "+ Set" during a workout:
1. The current set is marked as completed
2. A new pending set is added to the same exercise
3. You can modify the reps/weight values for the new set
4. The "+ Next" button will move to the next exercise when all sets are done
