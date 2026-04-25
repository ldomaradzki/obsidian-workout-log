import { ParsedWorkout, Exercise, ExerciseSet } from '../types';
import { parseMetadata } from './metadata';
import { parseExercise, parseSet } from './exercise';

/**
 * Parse a markdown workout block into structured data.
 *
 * Workout Format:
 * ```
 * title: Workout Name
 * state: planned|started|completed
 * startDate: 2026-01-08
 * duration: 11m 33s
 * ---
 * - [ ] Exercise Name | Key: [value] unit | Key: value
 *   - [ ] | Key: [value] | Key: value
 *   - [ ] | Key: [value] | Key: value
 * - [ ] Another Exercise Name | Key: [value] unit | Key: value
 *   - [ ] | Key: [value] | Key: value
 * - [ ] Single Exercise Name | Key: [value] unit | Key: value
 * ```
 *
 * Structure:
 * - Metadata section (lines before ---): workout-level config
 * - Exercises section (lines after ---): list of exercises with nested sets
 * - Each exercise can have multiple numbered sets (indented)
 * - If exercise has no explicit sets, params become the default set
 *
 * Returns a ParsedWorkout with metadata, exercises, and line indices for updating.
 */
export function parseWorkout(source: string): ParsedWorkout {
	const rawLines = source.split('\n');

	// Find the separator line (---) that divides metadata from exercises
	let separatorIndex = -1;
	for (let i = 0; i < rawLines.length; i++) {
		if (rawLines[i]?.trim() === '---') {
			separatorIndex = i;
			break;
		}
	}

	// Parse metadata section (all lines before the ---)
	// If no separator found, assume no metadata
	const metadataLines = separatorIndex > 0
		? rawLines.slice(0, separatorIndex)
		: [];
	const metadata = parseMetadata(metadataLines);

	// Parse exercises section (all lines after the ---)
	// Each line is either:
	//   - An exercise (no indent): "- [state] Exercise Name | params"
	//   - A set (indented):        "  - [state] | params"
	const exerciseStartIndex = separatorIndex >= 0 ? separatorIndex + 1 : 0;
	const exerciseLines = rawLines.slice(exerciseStartIndex);

	const exercises: Exercise[] = [];
	let currentExercise: Exercise | null = null;

	for (let i = 0; i < exerciseLines.length; i++) {
		const line = exerciseLines[i];
		if (!line || !line.trim()) continue;

		const isIndented = line.match(/^\s+/);

		if (isIndented) {
			// Indented line = Set
			// Add to current exercise's sets array
			if (currentExercise) {
				const set = parseSet(line, i);
				if (set) {
					currentExercise.sets.push(set);
				}
			}
		} else {
			// Non-indented line = Exercise
			// Special case: if previous exercise has no sets (all params were exercise-level),
			// create a default set from those params to maintain structure
			if (currentExercise && currentExercise.sets.length === 0) {
				currentExercise.sets.push({
					state: currentExercise.state,
					params: currentExercise.params,
					lineIndex: currentExercise.lineIndex,
					targetDuration: currentExercise.targetDuration,
					targetRest: currentExercise.targetRest,
					recordedTime: currentExercise.recordedTime,
					recordedRest: currentExercise.recordedRest
				});
				currentExercise.params = [];
			}

			const exercise = parseExercise(line, i);
			if (exercise) {
				currentExercise = {
					...exercise,
					sets: []
				};
				exercises.push(currentExercise);
			}
		}
	}

	// Handle the last exercise: if no sets were added, create a default set from exercise params
	// This ensures every exercise has at least one set for the UI to render
	if (currentExercise && currentExercise.sets.length === 0) {
		currentExercise.sets.push({
			state: currentExercise.state,
			params: currentExercise.params,
			lineIndex: currentExercise.lineIndex,
			targetDuration: currentExercise.targetDuration,
			targetRest: currentExercise.targetRest,
			recordedTime: currentExercise.recordedTime,
			recordedRest: currentExercise.recordedRest
		});
		currentExercise.params = [];
	}

	return {
		metadata,
		exercises,
		rawLines,
		metadataEndIndex: separatorIndex >= 0 ? separatorIndex : -1
	};
}

// Re-export metadata parsing and serialization
export { parseMetadata, serializeMetadata } from './metadata';

// Re-export exercise and set parsing, serialization, and utility functions
// These provide granular access for direct parsing of individual lines (used in tests)
export { parseExercise, parseSet, serializeExercise, serializeSet, formatDuration, formatDurationHuman, parseDurationToSeconds, getStateChar } from './exercise';
