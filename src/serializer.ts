import { ParsedWorkout, Exercise, ExerciseState } from './types';
import { serializeMetadata } from './parser/metadata';
import { serializeExercise, getStateChar } from './parser/exercise';

export function serializeWorkout(parsed: ParsedWorkout): string {
	const lines: string[] = [];

	// Serialize metadata
	const metadataLines = serializeMetadata(parsed.metadata);
	lines.push(...metadataLines);

	// Add separator
	lines.push('---');

	// Serialize exercises
	for (const exercise of parsed.exercises) {
		lines.push(serializeExercise(exercise));
	}

	return lines.join('\n');
}

// Update a specific param value in a workout
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

// Update exercise state
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

// Lock all editable fields (remove brackets)
export function lockAllFields(parsed: ParsedWorkout): ParsedWorkout {
	const newParsed = structuredClone(parsed);

	for (const exercise of newParsed.exercises) {
		for (const param of exercise.params) {
			param.editable = false;
		}
	}

	return newParsed;
}

// Add a new set (duplicate an exercise)
export function addSet(parsed: ParsedWorkout, exerciseIndex: number): ParsedWorkout {
	const newParsed = structuredClone(parsed);
	const exercise = newParsed.exercises[exerciseIndex];
	if (!exercise) return parsed;

	// Create a copy with pending state
	const newExercise: Exercise = {
		...structuredClone(exercise),
		state: 'pending',
		recordedDuration: undefined,
		lineIndex: exercise.lineIndex + 1
	};

	// Reset editable values to editable
	for (const param of newExercise.params) {
		if (param.key.toLowerCase() === 'duration' && !param.editable) {
			// If duration was recorded, remove it or reset
			param.editable = exercise.targetDuration !== undefined;
		}
	}

	// Insert after current exercise
	newParsed.exercises.splice(exerciseIndex + 1, 0, newExercise);

	// Update line indices for subsequent exercises
	for (let i = exerciseIndex + 2; i < newParsed.exercises.length; i++) {
		const ex = newParsed.exercises[i];
		if (ex) ex.lineIndex++;
	}

	return newParsed;
}

// Set Duration param value (for recording time after exercise completion)
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

	exercise.recordedDuration = durationStr;
	return newParsed;
}

// Serialize workout as a clean template (for copying)
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

	// Get unique exercises by name (remove duplicate sets)
	const seenNames = new Set<string>();
	const uniqueExercises: Exercise[] = [];

	for (const exercise of parsed.exercises) {
		if (!seenNames.has(exercise.name)) {
			seenNames.add(exercise.name);
			uniqueExercises.push(exercise);
		}
	}

	// Serialize exercises - reset state and make values editable
	for (const exercise of uniqueExercises) {
		let line = `- [ ] ${exercise.name}`;

		for (const param of exercise.params) {
			line += ' | ';
			line += `${param.key}: `;

			// Skip recorded durations, but keep target durations
			if (param.key.toLowerCase() === 'duration' && !exercise.targetDuration) {
				continue;
			}

			// Make all values editable
			if (param.key.toLowerCase() === 'duration' && exercise.targetDuration) {
				// Restore original target duration format
				const mins = Math.floor(exercise.targetDuration / 60);
				const secs = exercise.targetDuration % 60;
				const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
				line += `[${durationStr}]`;
			} else {
				line += `[${param.value}]`;
			}

			if (param.unit) {
				line += ` ${param.unit}`;
			}
		}

		lines.push(line);
	}

	return lines.join('\n');
}
