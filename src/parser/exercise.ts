import { Exercise, ExerciseState, ExerciseParam } from '../types';

// Checkbox patterns: [ ] pending, [\] inProgress, [x] completed, [-] skipped
const EXERCISE_PATTERN = /^-\s*\[(.)\]\s*(.+)$/;

const STATE_MAP: Record<string, ExerciseState> = {
	' ': 'pending',
	'\\': 'inProgress',
	'x': 'completed',
	'-': 'skipped'
};

const STATE_CHAR_MAP: Record<ExerciseState, string> = {
	'pending': ' ',
	'inProgress': '\\',
	'completed': 'x',
	'skipped': '-'
};

// Parse value with optional brackets: [value] = editable, value = locked
// Also handle Duration special case for timer
const PARAM_PATTERN = /^([^:]+):\s*(\[([^\]]*)\]|([^\s\[]+))(\s+(.+))?$/;

export function parseExercise(line: string, lineIndex: number): Exercise | null {
	const match = line.match(EXERCISE_PATTERN);
	if (!match) return null;

	const stateChar = match[1] ?? ' ';
	const rest = match[2] ?? '';

	const state = STATE_MAP[stateChar] ?? 'pending';

	// Split by | to get name and params
	const parts = rest.split('|').map(p => p.trim());
	const name = parts[0] ?? '';
	const paramStrings = parts.slice(1);

	const params: ExerciseParam[] = [];
	let targetDuration: number | undefined;
	let recordedDuration: string | undefined;

	for (const paramStr of paramStrings) {
		const param = parseParam(paramStr);
		if (param) {
			params.push(param);

			// Special handling for Duration key
			if (param.key.toLowerCase() === 'duration') {
				if (param.editable) {
					// Editable duration = countdown target
					targetDuration = parseDurationToSeconds(param.value);
				} else {
					// Locked duration = recorded time
					recordedDuration = param.value + (param.unit ? ` ${param.unit}` : '');
				}
			}
		}
	}

	return {
		state,
		name,
		params,
		targetDuration,
		recordedDuration,
		lineIndex
	};
}

function parseParam(paramStr: string): ExerciseParam | null {
	// Handle simple format: Key: value or Key: [value] or Key: [value] unit
	const colonIndex = paramStr.indexOf(':');
	if (colonIndex === -1) return null;

	const key = paramStr.substring(0, colonIndex).trim();
	const rest = paramStr.substring(colonIndex + 1).trim();

	// Check for bracketed value
	const bracketMatch = rest.match(/^\[([^\]]*)\](.*)$/);
	if (bracketMatch) {
		const value = bracketMatch[1] ?? '';
		const afterBracket = (bracketMatch[2] ?? '').trim();
		return {
			key,
			value,
			editable: true,
			unit: afterBracket || undefined
		};
	}

	// No brackets - split on first space for value and unit
	const parts = rest.split(/\s+/);
	const value = parts[0] ?? '';
	const unit = parts.slice(1).join(' ') || undefined;

	return {
		key,
		value,
		editable: false,
		unit
	};
}

// Parse duration string like "60s", "1:30", "1m 30s" to seconds
export function parseDurationToSeconds(durationStr: string): number {
	const str = durationStr.trim();

	// Format: 60s
	const secondsMatch = str.match(/^(\d+)s$/);
	if (secondsMatch) {
		return parseInt(secondsMatch[1] ?? '0', 10);
	}

	// Format: 1:30 or 01:30
	const colonMatch = str.match(/^(\d+):(\d{2})$/);
	if (colonMatch) {
		const mins = parseInt(colonMatch[1] ?? '0', 10);
		const secs = parseInt(colonMatch[2] ?? '0', 10);
		return mins * 60 + secs;
	}

	// Format: 1m 30s or 1m30s
	const minSecMatch = str.match(/^(\d+)m\s*(\d+)?s?$/);
	if (minSecMatch) {
		const mins = parseInt(minSecMatch[1] ?? '0', 10);
		const secs = parseInt(minSecMatch[2] ?? '0', 10);
		return mins * 60 + secs;
	}

	// Format: just a number (assume seconds)
	const numMatch = str.match(/^(\d+)$/);
	if (numMatch) {
		return parseInt(numMatch[1] ?? '0', 10);
	}

	return 0;
}

// Format seconds to display string
export function formatDuration(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Format seconds to human readable string (e.g., "11m 33s")
export function formatDurationHuman(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	if (mins === 0) {
		return `${secs}s`;
	}
	if (secs === 0) {
		return `${mins}m`;
	}
	return `${mins}m ${secs}s`;
}

export function getStateChar(state: ExerciseState): string {
	return STATE_CHAR_MAP[state];
}

export function serializeExercise(exercise: Exercise): string {
	const stateChar = getStateChar(exercise.state);
	let line = `- [${stateChar}] ${exercise.name}`;

	for (const param of exercise.params) {
		line += ' | ';
		line += `${param.key}: `;
		if (param.editable) {
			line += `[${param.value}]`;
		} else {
			line += param.value;
		}
		if (param.unit) {
			line += ` ${param.unit}`;
		}
	}

	return line;
}
