import { ParsedWorkout } from '../types';
import { parseMetadata } from './metadata';
import { parseExercise } from './exercise';

export function parseWorkout(source: string): ParsedWorkout {
	const rawLines = source.split('\n');

	// Find the separator between metadata and exercises
	let separatorIndex = -1;
	for (let i = 0; i < rawLines.length; i++) {
		if (rawLines[i]?.trim() === '---') {
			separatorIndex = i;
			break;
		}
	}

	// Parse metadata (lines before ---)
	const metadataLines = separatorIndex > 0
		? rawLines.slice(0, separatorIndex)
		: [];
	const metadata = parseMetadata(metadataLines);

	// Parse exercises (lines after ---)
	const exerciseStartIndex = separatorIndex >= 0 ? separatorIndex + 1 : 0;
	const exerciseLines = rawLines.slice(exerciseStartIndex);

	const exercises = [];
	for (let i = 0; i < exerciseLines.length; i++) {
		const line = exerciseLines[i];
		if (!line) continue;

		const exercise = parseExercise(line, i);
		if (exercise) {
			exercises.push(exercise);
		}
	}

	return {
		metadata,
		exercises,
		rawLines,
		metadataEndIndex: separatorIndex >= 0 ? separatorIndex : -1
	};
}

export { parseMetadata, serializeMetadata } from './metadata';
export { parseExercise, serializeExercise, formatDuration, formatDurationHuman, parseDurationToSeconds, getStateChar } from './exercise';
