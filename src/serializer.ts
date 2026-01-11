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

// Add a rest exercise after the specified index
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

// Create a sample workout with comprehensive exercise examples
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
			params: [
				{ key: 'Weight', value: '60', editable: true, unit: 'kg' },
				{ key: 'Reps', value: '12', editable: true }
			],
			lineIndex: 0
		},
		{
			state: 'pending',
			name: 'Rest',
			params: [{ key: 'Duration', value: '60s', editable: true }],
			targetDuration: 60,
			lineIndex: 1
		},
		{
			state: 'pending',
			name: 'Push-ups',
			params: [{ key: 'Reps', value: '15', editable: true }],
			lineIndex: 2
		},
		{
			state: 'pending',
			name: 'Rest',
			params: [{ key: 'Duration', value: '60s', editable: true }],
			targetDuration: 60,
			lineIndex: 3
		},
		{
			state: 'pending',
			name: 'Dumbbell Rows',
			params: [
				{ key: 'Weight', value: '20', editable: true, unit: 'kg' },
				{ key: 'Reps', value: '10', editable: true, unit: '/arm' }
			],
			lineIndex: 4
		},
		{
			state: 'pending',
			name: 'Rest',
			params: [{ key: 'Duration', value: '60s', editable: true }],
			targetDuration: 60,
			lineIndex: 5
		},
		{
			state: 'pending',
			name: 'Plank Hold',
			params: [{ key: 'Duration', value: '45s', editable: true }],
			targetDuration: 45,
			lineIndex: 6
		},
		{
			state: 'pending',
			name: 'Rest',
			params: [{ key: 'Duration', value: '60s', editable: true }],
			targetDuration: 60,
			lineIndex: 7
		},
		{
			state: 'pending',
			name: 'Lunges',
			params: [{ key: 'Reps', value: '10', editable: true, unit: '/leg' }],
			lineIndex: 8
		}
	];

	return {
		metadata,
		exercises,
		rawLines: [],
		metadataEndIndex: -1
	};
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
