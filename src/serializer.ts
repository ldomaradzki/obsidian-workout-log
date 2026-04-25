/**
 * Serialization layer: Convert parsed workout data structures back to markdown format.
 *
 * Responsibilities:
 * - Convert ParsedWorkout objects back to markdown strings
 * - Manage system totals (~time and ~rest) for exercises and sets
 * - Enrich completed sets/exercises with their calculated totals
 * - Support workflow operations: state changes, param updates, adding sets/exercises
 * - Generate templates for copying/reuse
 *
 * System Totals:
 * - ~time: Accumulated duration for completed set or exercise
 * - ~rest: Accumulated rest time for completed set or exercise
 * - Automatically calculated from set-level totals when exercise completes
 * - Stripped on parse to avoid parse-induced changes
 * - Restored on serialize for display/export
 *
 * Key Design Patterns:
 * - Always use structuredClone() for immutability
 * - Parameter updates maintain editable state (editable params keep [brackets])
 * - Recorded times separate from display/target Duration params
 * - Sample workouts used for template generation and UI demos
 */

import { ParsedWorkout, Exercise, ExerciseState, ExerciseSet, ExerciseParam } from './types';
import { serializeMetadata } from './parser/metadata';
import { serializeExercise, serializeSet, getStateChar, formatDurationHuman, parseDurationToSeconds } from './parser/exercise';

/**
 * Convert a parsed workout back to markdown format.
 *
 * Process:
 * 1. Serialize metadata (title, state, dates, duration)
 * 2. Add separator (---)
 * 3. Enrich exercises with their set totals
 * 4. Serialize each exercise and its sets
 *
 * Returns: Complete markdown string ready to write back to file
 */
export function serializeWorkout(parsed: ParsedWorkout): string {
	const lines: string[] = [];

	// Serialize metadata (title, state, dates, duration)
	const metadataLines = serializeMetadata(parsed.metadata);
	lines.push(...metadataLines);

	// Add separator between metadata and exercises
	lines.push('---');

	// Serialize exercises with their sets
	for (const exercise of parsed.exercises) {
		// Enrich sets with their own totals, then use those to compute exercise totals
		const enrichedExercise = enrichExerciseWithSetTotals(exercise);
		lines.push(serializeExercise(enrichedExercise));
		
		// Serialize enriched sets under the exercise
		for (const set of enrichedExercise.sets) {
			lines.push(serializeSet(set));
		}
	}

	return lines.join('\n');
}

/**
 * Enrich an exercise with system totals (~time, ~rest) based on completed sets.
 *
 * Process for INCOMPLETE exercises:
 * - Strip any existing ~time and ~rest params
 * - Keep other exercise-level params unchanged
 * - Don't add totals (nothing to total yet)
 *
 * Process for COMPLETED exercises:
 * - Strip any existing ~time and ~rest params
 * - Enrich all sets with their own totals (recordedTime/recordedRest)
 * - Sum set-level totals to create exercise-level totals
 * - Add exercise ~time and ~rest params
 *
 * Used during serialization to ensure totals are accurate and up-to-date.
 *
 * Parameters:
 * - exercise: Exercise with potentially stale totals from previous serialize
 *
 * Returns: Enriched exercise with fresh totals
 */
function enrichExerciseWithSetTotals(exercise: Exercise): Exercise {
	// First, enrich each set with its own totals
	const enrichedSets = exercise.sets.map(set => enrichSetWithTotals(set));

	// Remove old exercise totals (will recalculate if needed)
	const paramsWithoutTotals = exercise.params.filter(
		p => p.key.toLowerCase() !== '~time' && p.key.toLowerCase() !== '~rest'
	);

	// If exercise is incomplete, don't add totals (nothing finalized yet)
	if (exercise.state !== 'completed') {
		return {
			...exercise,
			sets: enrichedSets,
			params: paramsWithoutTotals,
		};
	}

	// For completed exercises, compute totals from set-level totals
	const totalRest = sumSetTotals(enrichedSets, '~rest');
	const totalTime = sumSetTotals(enrichedSets, '~time');

	// Add exercise-level totals (if any sets recorded values)
	if (totalRest) {
		paramsWithoutTotals.push({
			key: '~rest',
			value: totalRest,
			editable: false,
			unit: '',
		});
	}

	if (totalTime) {
		paramsWithoutTotals.push({
			key: '~time',
			value: totalTime,
			editable: false,
			unit: '',
		});
	}

	return {
		...exercise,
		sets: enrichedSets,
		params: paramsWithoutTotals,
	};
}

/**
 * Enrich an individual set with system totals (~time, ~rest).
 *
 * System Totals:
 * - ~time: Comes from set.recordedTime (actual elapsed time during exercise)
 * - ~rest: Comes from set.recordedRest (actual elapsed time during rest period)
 *
 * Process for INCOMPLETE sets:
 * - Strip any existing ~time and ~rest params
 * - Keep other set params
 * - Don't add totals
 *
 * Process for COMPLETED sets:
 * - Strip any existing ~time and ~rest params
 * - Add ~time param if recordedTime exists
 * - Add ~rest param if recordedRest exists
 * - Mark both as non-editable (locked)
 *
 * Parameters:
 * - set: Set potentially with stale totals
 *
 * Returns: Set with fresh system totals
 */
function enrichSetWithTotals(set: ExerciseSet): ExerciseSet {
	// Remove old set totals (will recalculate if needed)
	const paramsWithoutTotals = set.params.filter(
		p => p.key.toLowerCase() !== '~time' && p.key.toLowerCase() !== '~rest'
	);

	// If set is incomplete, don't add totals
	if (set.state !== 'completed') {
		return {
			...set,
			params: paramsWithoutTotals,
		};
	}

	// For completed sets, use recorded times as totals
	if (set.recordedTime) {
		paramsWithoutTotals.push({
			key: '~time',
			value: set.recordedTime,
			editable: false,
			unit: '',
		});
	}

	if (set.recordedRest) {
		paramsWithoutTotals.push({
			key: '~rest',
			value: set.recordedRest,
			editable: false,
			unit: '',
		});
	}

	return {
		...set,
		params: paramsWithoutTotals,
	};
}

/**
 * Sum a specific system total parameter (~time or ~rest) across all sets.
 *
 * Process:
 * - Find all params matching the key (case-insensitive) across all sets
 * - Parse duration string (e.g., "3m 45s") to seconds
 * - Sum all seconds
 * - Format back to human-readable duration string
 *
 * Parameters:
 * - sets: Array of completed sets with totals
 * - paramKey: System total key ("~time" or "~rest")
 *
 * Returns: Formatted duration string (e.g., "12m 33s") or empty string if no totals
 */
function sumSetTotals(sets: ExerciseSet[], paramKey: string): string {
	let totalSeconds = 0;

	for (const set of sets) {
		const param = set.params.find(p => p.key.toLowerCase() === paramKey.toLowerCase());
		if (param?.value) {
			totalSeconds += parseDurationToSeconds(param.value);
		}
	}

	return totalSeconds > 0 ? formatDurationHuman(totalSeconds) : '';
}

/**
 * Update an exercise-level parameter value.
 *
 * Finds the param by key and updates its value, maintaining editable state.
 * Creates a deep clone to avoid mutations.
 *
 * Parameters:
 * - parsed: Complete workout state
 * - exerciseIndex: Index of exercise to modify
 * - paramKey: Parameter key to update
 * - newValue: New value (with or without brackets - caller's responsibility)
 *
 * Returns: New ParsedWorkout with updated param (or original if exercise not found)
 */
export function updateParamValue(
	parsed: ParsedWorkout,
	exerciseIndex: number,
	paramKey: string,
	newValue: string
): ParsedWorkout {
	const newParsed = structuredClone(parsed);
	const exercise = newParsed.exercises[exerciseIndex];
	if (!exercise) return parsed;

	const param = exercise.params.find(p => p.key === paramKey);
	if (param) {
		param.value = newValue;
	}

	return newParsed;
}

/**
 * Update a set-level parameter value.
 *
 * Finds the param in the specified set by key and updates its value.
 * Creates a deep clone to avoid mutations.
 *
 * Parameters:
 * - parsed: Complete workout state
 * - exerciseIndex: Index of exercise containing the set
 * - setIndex: Index of set to modify
 * - paramKey: Parameter key to update
 * - newValue: New value (with or without brackets - caller's responsibility)
 *
 * Returns: New ParsedWorkout with updated param (or original if not found)
 */
export function updateSetParamValue(
	parsed: ParsedWorkout,
	exerciseIndex: number,
	setIndex: number,
	paramKey: string,
	newValue: string
): ParsedWorkout {
	const newParsed = structuredClone(parsed);
	const exercise = newParsed.exercises[exerciseIndex];
	if (!exercise) return parsed;

	const set = exercise.sets[setIndex];
	if (!set) return parsed;

	const param = set.params.find(p => p.key === paramKey);
	if (param) {
		param.value = newValue;
	}

	return newParsed;
}

/**
 * Update an exercise's completion state.
 *
 * Changes the state from pending → in-progress → completed (or skipped).
 * State determines whether system totals (~time, ~rest) are calculated on serialize.
 * Creates a deep clone to avoid mutations.
 *
 * Parameters:
 * - parsed: Complete workout state
 * - exerciseIndex: Index of exercise to update
 * - newState: New state ('pending' | 'in-progress' | 'completed' | 'skipped')
 *
 * Returns: New ParsedWorkout with updated exercise state
 */
export function updateExerciseState(
	parsed: ParsedWorkout,
	exerciseIndex: number,
	newState: ExerciseState
): ParsedWorkout {
	const newParsed = structuredClone(parsed);
	const exercise = newParsed.exercises[exerciseIndex];
	if (!exercise) return parsed;

	exercise.state = newState;
	return newParsed;
}

/**
 * Update a set's completion state.
 *
 * Changes the state from pending → in-progress → completed (or skipped).
 * When set reaches completed state, its recordedTime/recordedRest are included in totals.
 * Creates a deep clone to avoid mutations.
 *
 * Parameters:
 * - parsed: Complete workout state
 * - exerciseIndex: Index of exercise containing the set
 * - setIndex: Index of set to update
 * - newState: New state ('pending' | 'in-progress' | 'completed' | 'skipped')
 *
 * Returns: New ParsedWorkout with updated set state
 */
export function updateSetState(
	parsed: ParsedWorkout,
	exerciseIndex: number,
	setIndex: number,
	newState: ExerciseState
): ParsedWorkout {
	const newParsed = structuredClone(parsed);
	const exercise = newParsed.exercises[exerciseIndex];
	if (!exercise) return parsed;

	const set = exercise.sets[setIndex];
	if (!set) return parsed;

	set.state = newState;
	return newParsed;
}

/**
 * Lock all editable parameters across all exercises and sets.
 *
 * Removes [brackets] notation from all parameter values by setting editable=false.
 * Used to create "static" workouts that can't be modified in the UI.
 * Creates a deep clone to avoid mutations.
 *
 * Parameters:
 * - parsed: Complete workout state
 *
 * Returns: New ParsedWorkout with all params marked non-editable
 */
export function lockAllFields(parsed: ParsedWorkout): ParsedWorkout {
	const newParsed = structuredClone(parsed);

	for (const exercise of newParsed.exercises) {
		for (const param of exercise.params) {
			param.editable = false;
		}
		for (const set of exercise.sets) {
			for (const param of set.params) {
				param.editable = false;
			}
		}
	}

	return newParsed;
}

/**
 * Insert a rest exercise after a specified exercise.
 *
 * Creates a new Rest exercise with countdown duration.
 * Rest exercises are single-set exercises used for scheduled rest periods between exercises.
 * Updates line indices for all subsequent exercises.
 * Creates a deep clone to avoid mutations.
 *
 * Parameters:
 * - parsed: Complete workout state
 * - exerciseIndex: Index of exercise after which to insert rest
 * - restDuration: Rest duration in seconds
 *
 * Returns: New ParsedWorkout with rest exercise inserted
 */
export function addRest(parsed: ParsedWorkout, exerciseIndex: number, restDuration: number): ParsedWorkout {
	const newParsed = structuredClone(parsed);
	const currentExercise = newParsed.exercises[exerciseIndex];
	if (!currentExercise) return parsed;

	// Create a Rest exercise with countdown duration
	const restExercise: Exercise = {
		state: 'pending',
		name: 'Rest',
		params: [{
			key: 'Duration',
			value: `${restDuration}s`,
			editable: true
		}],
		sets: [],
		targetDuration: restDuration,
		lineIndex: currentExercise.lineIndex + 1
	};

	// Insert after current exercise
	newParsed.exercises.splice(exerciseIndex + 1, 0, restExercise);

	// Update line indices for subsequent exercises
	for (let i = exerciseIndex + 2; i < newParsed.exercises.length; i++) {
		const ex = newParsed.exercises[i];
		if (ex) ex.lineIndex++;
	}

	return newParsed;
}

/**
 * Add a new set to an exercise.
 *
 * Clones the first set as a template and appends a new set to the exercise.
 * New set starts with pending state and editable params.
 * Used for creating multi-set exercises or duplicating set templates.
 * Creates a deep clone to avoid mutations.
 *
 * Parameters:
 * - parsed: Complete workout state
 * - exerciseIndex: Index of exercise to add set to
 *
 * Returns: New ParsedWorkout with new set appended (or original if exercise not found)
 */
export function addSet(parsed: ParsedWorkout, exerciseIndex: number): ParsedWorkout {
	const newParsed = structuredClone(parsed);
	const exercise = newParsed.exercises[exerciseIndex];
	if (!exercise || exercise.sets.length === 0) return parsed;

	// Copy the first set as a template
	const firstSet = exercise.sets[0];
	if (!firstSet) return parsed;
	
	const clonedSet = structuredClone(firstSet);
	const newSet: ExerciseSet = {
		state: 'pending',
		params: clonedSet?.params || [],
		lineIndex: (exercise.sets[exercise.sets.length - 1]?.lineIndex || 0) + 1
	};

	// Make values editable again
	for (const param of newSet.params) {
		// Keep Duration params editable for sets
		param.editable = param.key.toLowerCase() === 'duration' || param.editable;
	}

	// Add the new set
	exercise.sets.push(newSet);

	return newParsed;
}

/**
 * Record the actual elapsed duration for an exercise as a Duration param.
 *
 * Called after an exercise is marked complete to capture the actual time taken.
 * Updates exercise.recordedDuration for use in system totals (~time).
 * Adds or updates Duration param with the recorded value (locked, non-editable).
 * Creates a deep clone to avoid mutations.
 *
 * Parameters:
 * - parsed: Complete workout state
 * - exerciseIndex: Index of exercise to record duration for
 * - durationStr: Duration string from timer (e.g., "3m 45s")
 *
 * Returns: New ParsedWorkout with recorded duration applied
 */
export function setRecordedDuration(
	parsed: ParsedWorkout,
	exerciseIndex: number,
	durationStr: string
): ParsedWorkout {
	const newParsed = structuredClone(parsed);
	const exercise = newParsed.exercises[exerciseIndex];
	if (!exercise) return parsed;

	// Find Duration param or add one
	let durationParam = exercise.params.find(p => p.key.toLowerCase() === 'duration');

	if (durationParam) {
		durationParam.value = durationStr;
		durationParam.editable = false;
	} else {
		// Add Duration param
		exercise.params.push({
			key: 'Duration',
			value: durationStr,
			editable: false
		});
	}

	exercise.recordedTime = durationStr;
	return newParsed;
}

/**
 * Record the actual elapsed duration for a single set.
 *
 * Stores elapsed time in set.recordedTime (not as a param, but as metadata).
 * Used when set is completed to capture actual exercise time.
 * This time is later included in system totals (~time) when set is completed.
 * Creates a deep clone to avoid mutations.
 *
 * Parameters:
 * - parsed: Complete workout state
 * - exerciseIndex: Index of exercise containing the set
 * - setIndex: Index of set to record duration for
 * - durationStr: Duration string from timer (e.g., "45s")
 *
 * Returns: New ParsedWorkout with set recorded time applied
 */
export function setSetRecordedDuration(
	parsed: ParsedWorkout,
	exerciseIndex: number,
	setIndex: number,
	durationStr: string
): ParsedWorkout {
	const newParsed = structuredClone(parsed);
	const exercise = newParsed.exercises[exerciseIndex];
	if (!exercise) return parsed;

	const set = exercise.sets[setIndex];
	if (!set) return parsed;

	// Store actual elapsed time to recordedDuration (not Duration param)
	set.recordedTime = durationStr;

	return newParsed;
}

/**
 * Store the actual elapsed rest time for a specific set.
 * Called after a rest period completes to record how long the rest actually took.
 */
export function setSetRecordedRest(
	parsed: ParsedWorkout,
	exerciseIndex: number,
	setIndex: number,
	restStr: string
): ParsedWorkout {
	const newParsed = structuredClone(parsed);
	const exercise = newParsed.exercises[exerciseIndex];
	if (!exercise) return parsed;

	const set = exercise.sets[setIndex];
	if (!set) return parsed;

	// Store actual elapsed rest time to recordedRest (not Rest param)
	set.recordedRest = restStr;

	return newParsed;
}

/**
 * Update the Rest parameter for a specific set.
 *
 * Finds or creates the Rest param and updates its value (editable).
 * Used to modify the required rest duration between sets.
 * Separate from setSetRecordedRest - this is the target duration stored as a param.
 * Creates a deep clone to avoid mutations.
 *
 * Parameters:
 * - parsed: Complete workout state
 * - exerciseIndex: Index of exercise containing the set
 * - setIndex: Index of set to update
 * - restStr: Rest duration string (e.g., "60s", "1m 30s")
 *
 * Returns: New ParsedWorkout with rest param updated (or original if not found)
 */
export function updateSetRestDuration(
	parsed: ParsedWorkout,
	exerciseIndex: number,
	setIndex: number,
	restStr: string
): ParsedWorkout {
	const newParsed = structuredClone(parsed);
	const exercise = newParsed.exercises[exerciseIndex];
	if (!exercise) return parsed;

	const set = exercise.sets[setIndex];
	if (!set) return parsed;

	// Find Rest param or add one
	let restParam = set.params.find(p => p.key.toLowerCase() === 'rest');

	if (restParam) {
		restParam.value = restStr;
		restParam.editable = true;
	} else {
		// Add Rest param
		set.params.push({
			key: 'Rest',
			value: restStr,
			editable: true
		});
	}

	return newParsed;
}

/**
 * Create a sample workout for demonstration and testing.
 *
 * Includes:
 * - Metadata with title and planned state
 * - Multiple exercise types (timed and rep-based)
 * - Rest exercises between sets
 * - Multi-set exercises with varying parameters
 * - Mix of editable and locked parameter formats
 *
 * Used for:
 * - New user onboarding (sample template)
 * - UI debugging and screenshots
 * - Test fixtures for workout rendering
 *
 * Returns: Complete ParsedWorkout ready for rendering or serialization
 */
export function createSampleWorkout(): ParsedWorkout {
	const metadata = {
		title: 'Sample Workout',
		state: 'planned' as const,
		restDuration: 60
	};

	const exercises: Exercise[] = [
		{
			state: 'pending',
			name: 'Squats',
			params: [{ key: 'Duration', value: '[180s]', editable: true }],
			sets: [
				{
					state: 'pending',
					params: [
						{ key: 'Weight', value: '60', editable: true, unit: 'kg' },
						{ key: 'Reps', value: '12', editable: true },
						{ key: 'Rest', value: '[60s]', editable: true }
					],
					lineIndex: 0
				},
				{
					state: 'pending',
					params: [
						{ key: 'Weight', value: '65', editable: true, unit: 'kg' },
						{ key: 'Reps', value: '10', editable: true },
						{ key: 'Rest', value: '[90s]', editable: true }
					],
					lineIndex: 1
				}
			],
			targetDuration: 180,
			lineIndex: 0
		},
		{
			state: 'pending',
			name: 'Rest',
			params: [{ key: 'Duration', value: '60s', editable: true }],
			sets: [
				{
					state: 'pending',
					params: [{ key: 'Duration', value: '60s', editable: true }],
					lineIndex: 2
				}
			],
			targetDuration: 60,
			lineIndex: 3
		},
		{
			state: 'pending',
			name: 'Push-ups',
			params: [],
			sets: [
				{
					state: 'pending',
					params: [
						{ key: 'Reps', value: '15', editable: true },
						{ key: 'Rest', value: '[45s]', editable: true }
					],
					lineIndex: 3
				},
				{
					state: 'pending',
					params: [
						{ key: 'Reps', value: '12', editable: true },
						{ key: 'Rest', value: '[60s]', editable: true }
					],
					lineIndex: 4
				}
			],
			lineIndex: 4
		},
		{
			state: 'pending',
			name: 'Rest',
			params: [{ key: 'Duration', value: '60s', editable: true }],
			sets: [
				{
					state: 'pending',
					params: [{ key: 'Duration', value: '60s', editable: true }],
					lineIndex: 5
				}
			],
			targetDuration: 60,
			lineIndex: 6
		},
		{
			state: 'pending',
			name: 'Dumbbell Rows',
			params: [],
			sets: [
				{
					state: 'pending',
					params: [
						{ key: 'Weight', value: '20', editable: true, unit: 'kg' },
						{ key: 'Reps', value: '10', editable: true, unit: '/arm' },
						{ key: 'Rest', value: '[60s]', editable: true }
					],
					lineIndex: 6
				},
				{
					state: 'pending',
					params: [
						{ key: 'Weight', value: '25', editable: true, unit: 'kg' },
						{ key: 'Reps', value: '8', editable: true, unit: '/arm' },
						{ key: 'Rest', value: '[90s]', editable: true }
					],
					lineIndex: 7
				}
			],
			lineIndex: 7
		}
	];

	return {
		metadata,
		exercises,
		rawLines: [],
		metadataEndIndex: -1
	};
}

/**
 * Serialize a workout as a clean template for copying/reuse.
 *
 * Template Format:
 * - Resets metadata to planned state (no dates or elapsed duration)
 * - Keeps exercise names and structure
 * - Clears system totals (~time, ~rest) - templates start fresh
 * - Preserves target durations for timed exercises (e.g., [3m])
 * - Restores all params to editable format [brackets]
 * - Ready to paste into new workout entries
 *
 * Used for:
 * - Copy-to-clipboard functionality ("Use as template" button)
 * - Generating reusable workout definitions
 * - Archiving workouts for future reuse
 *
 * Parameters:
 * - parsed: Completed or in-progress workout to convert to template
 *
 * Returns: Markdown string suitable for copying to new workout entry
 */
export function serializeWorkoutAsTemplate(parsed: ParsedWorkout): string {
	const lines: string[] = [];

	// Metadata - reset to planned, no dates/duration
	if (parsed.metadata.title) {
		lines.push(`title: ${parsed.metadata.title}`);
	}
	lines.push('state: planned');
	lines.push('startDate:');
	lines.push('duration:');

	// Add separator
	lines.push('---');

	// Serialize exercises with their sets
	for (const exercise of parsed.exercises) {
		let exerciseLine = `- [ ] ${exercise.name}`;

		// Add exercise-level params (typically Duration for timed exercises)
		for (const param of exercise.params) {
			exerciseLine += ' | ';
			exerciseLine += `${param.key}: `;

			if (param.key.toLowerCase() === 'duration' && exercise.targetDuration) {
				// Restore original target duration format
				const mins = Math.floor(exercise.targetDuration / 60);
				const secs = exercise.targetDuration % 60;
				const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
				exerciseLine += `[${durationStr}]`;
			} else {
				exerciseLine += `[${param.value}]`;
			}

			if (param.unit) {
				exerciseLine += ` ${param.unit}`;
			}
		}

		lines.push(exerciseLine);

		// Add sets as indented sub-items
		for (const set of exercise.sets) {
			let setLine = '  - [ ]';

			for (const param of set.params) {
				setLine += ' ';
				setLine += `${param.key}: `;
				setLine += `[${param.value}]`;
				if (param.unit) {
					setLine += ` ${param.unit}`;
				}
			}

			lines.push(setLine);
		}
	}

	return lines.join('\n');
}
