import { Exercise, ExerciseSet, ExerciseState, ExerciseParam, Token } from '../types';

/**
 * Maps checkbox characters to exercise/set states.
 * Format: [state] where state = ' ' (pending), '\' (inProgress), 'x' (completed), '-' (skipped)
 */
const STATE_MAP: Record<string, ExerciseState> = {
	' ': 'pending',
	'\\': 'inProgress',
	'x': 'completed',
	'-': 'skipped'
};

/**
 * Reverse mapping: converts ExerciseState back to checkbox character.
 * Used during serialization to write state back to markdown.
 */
const STATE_CHAR_MAP: Record<ExerciseState, string> = {
	'pending': ' ',
	'inProgress': '\\',
	'completed': 'x',
	'skipped': '-'
};

/**
 * Tokenize a markdown checkbox line (exercise or set).
 * Expected format: "- [STATE] REMAINDER" where STATE is a single character.
 *
 * Returns:
 * - { stateChar, remainder } if valid checkbox found
 * - null if line doesn't match checkbox pattern
 */
function tokenizeExerciseLine(line: string): { stateChar: string; remainder: string } | null {
	// Check for leading dash
	if (!line.startsWith('-')) return null;

	// Find opening bracket
	const openBracketIndex = line.indexOf('[');
	if (openBracketIndex === -1) return null;

	// Find closing bracket
	const closeBracketIndex = line.indexOf(']', openBracketIndex);
	if (closeBracketIndex === -1) return null;

	// Extract state character
	const stateChar = line.substring(openBracketIndex + 1, closeBracketIndex);
	if (stateChar.length !== 1) return null;

	// Get remainder after closing bracket
	const afterBracket = line.substring(closeBracketIndex + 1).trimStart();
	if (!afterBracket) return null;

	return { stateChar, remainder: afterBracket };
}

/**
 * Parse a markdown exercise line into an Exercise object.
 *
 * Format: "- [STATE] Exercise Name | Key: [value] unit | Key: value"
 *
 * Special handling:
 * - Duration params: editable [60s] = countdown target, locked 45s = countdown timer + auto advance
 * - All other params are stored in exercise.params
 * - Sets array is empty (filled by parent parseWorkout)
 */
export function parseExercise(line: string, lineIndex: number): Exercise | null {
	const tokenized = tokenizeExerciseLine(line);
	if (!tokenized) return null;

	const state = STATE_MAP[tokenized.stateChar] ?? 'pending';

	// Split by | to get name and params
	const parts = tokenized.remainder.split('|').map(p => p.trim());
	const name = parts[0] ?? '';
	const paramStrings = parts.slice(1);

	const params: ExerciseParam[] = [];
	let targetDuration: number | undefined;
	let targetRest: number | undefined;
	let recordedTime: string | undefined;
	let recordedRest: string | undefined;

	for (const paramStr of paramStrings) {
		const param = parseParam(paramStr);
		if (param) {
			if (param.key.toLowerCase() === 'duration') {
				targetDuration = parseDurationToSeconds(param.value);
				params.push(param);
			}
			else if (param.key.toLowerCase() === 'rest') {
				targetRest = parseDurationToSeconds(param.value);
				params.push(param);
			}
			else if (param.key.toLowerCase() === '~time') {
				recordedTime = param.value;
			}
			else if (param.key.toLowerCase() === '~rest') {
				recordedRest = param.value;
			}
			else {
				params.push(param);
			}
		}
	}

	return {
		state,
		name,
		params,
		sets: [],        // Set by parent parseWorkout, not by this function
		targetDuration,  // Seconds: used for countdown timers
		targetRest,      // Seconds: used for rest periods
		recordedTime,    // Seconds: actual time recorded after completion
		recordedRest,    // Seconds: actual rest time recorded after completion
		lineIndex
	};
}

/**
 * Parse a markdown set line (indented) into an ExerciseSet object.
 *
 * Format: "  - [STATE] | Key: [value] unit | Key: value"
 *
 * Special handling:
 * - ~time and ~rest are extracted into recordedTime/recordedRest fields
 *   (these are system-computed values, not user params)
 * - All other params are stored in set.params
 */
export function parseSet(line: string, lineIndex: number): ExerciseSet | null {
	const trimmed = line.trim();
	const tokenized = tokenizeExerciseLine(trimmed);
	if (!tokenized) return null;

	const state = STATE_MAP[tokenized.stateChar] ?? 'pending';

	// Split by | to get params (no name for sets)
	const parts = tokenized.remainder.split('|').map(p => p.trim());
	const paramStrings = parts;

	const params: ExerciseParam[] = [];
	let targetDuration: number | undefined;
	let targetRest: number | undefined;
	let recordedTime: string | undefined;
	let recordedRest: string | undefined;

	for (const paramStr of paramStrings) {
		const param = parseParam(paramStr);
		if (param) {
			if (param.key.toLowerCase() === 'duration') {
				targetDuration = parseDurationToSeconds(param.value);
				params.push(param);
			} 
			else if (param.key.toLowerCase() === 'rest') {
				targetRest = parseDurationToSeconds(param.value);
				params.push(param);
			}
			else if (param.key.toLowerCase() === '~time') {
				recordedTime = param.value;
			} 
			else if (param.key.toLowerCase() === '~rest') {
				recordedRest = param.value;
			} 
			else {
				params.push(param);
			}
		}
	}

	return {
		state,
		params,
		lineIndex,
		targetDuration,  // Seconds: used for countdown timers
		targetRest,      // Seconds: used for rest periods
		recordedTime,    // Actual elapsed time during set
		recordedRest     // Actual elapsed rest period after set
	};
}

/**
 * Tokenize a parameter string into semantic tokens.
 *
 * Format: "Key: [value] unit" or "Key: value unit"
 * where [brackets] indicate editable values, no brackets = locked/readonly.
 *
 * Complex parsing logic:
 * 1. Extract key (everything before first ":")
 * 2. Check for bracketed value [content]
 * 3. Parse unbracketed value with optional unit
 *    - May be concatenated like "10kg" or "60s"
 *    - May be separated like "10 kg" or "60 s"
 * 4. Extract remaining text as unit
 *
 * Returns array of tokens with types: 'key', 'bracket'|'value', 'unit'
 */
function tokenizeParam(paramStr: string): Token[] {
	const tokens: Token[] = [];

	// 1. Parse key (everything before colon)
	const colonIndex = paramStr.indexOf(':');
	if (colonIndex === -1) return [];

	const key = paramStr.substring(0, colonIndex).trim();
	tokens.push({ type: 'key', value: key });

	// Step 2: Parse value and unit (everything after the colon)
	// Value may be bracketed [editable] or locked (no brackets)
	let remainder = paramStr.substring(colonIndex + 1).trim();

	// Check for bracketed value (editable)
	if (remainder.startsWith('[')) {
		const closeBracketIndex = remainder.indexOf(']');
		if (closeBracketIndex !== -1) {
			const value = remainder.substring(1, closeBracketIndex);
			tokens.push({ type: 'bracket', value });
			remainder = remainder.substring(closeBracketIndex + 1).trim();
		}
	} else if (remainder.length > 0) {
		// Unbracketed (locked) value - try to separate value and unit
		const spaceIndex = remainder.indexOf(' ');
		if (spaceIndex === -1) {
			// No space - might be concatenated value+unit like "100kg" or "60s"
			// No space - check if value and unit are concatenated (e.g., "10s", "60m")
			// Find where numeric portion ends (digits and optional decimal point)
			let numericEnd = 0;
			for (let i = 0; i < remainder.length; i++) {
				const char = remainder.charAt(i);
				if (char === '.' || (char >= '0' && char <= '9')) {
					numericEnd = i + 1;
				} else {
					break;
				}
			}

			if (numericEnd > 0 && numericEnd < remainder.length) {
				// Split: numeric value + non-numeric unit (e.g., "100" + "kg")
				tokens.push({ type: 'value', value: remainder.substring(0, numericEnd) });
				remainder = remainder.substring(numericEnd);
			} else {
				// All numeric or all non-numeric, treat entire string as value
				tokens.push({ type: 'value', value: remainder });
				return tokens;
			}
		} else {
			// Space found - everything before space is value, after is unit
			tokens.push({ type: 'value', value: remainder.substring(0, spaceIndex) });
			remainder = remainder.substring(spaceIndex).trim();
		}
	}

	// Step 3: Parse unit (any remaining text after value)
	if (remainder) {
		tokens.push({ type: 'unit', value: remainder });
	}

	return tokens;
}

/**
 * Convert tokenized parameter into an ExerciseParam object.
 *
 * Validation:
 * - Requires key and value tokens
 * - Applies parameter whitelist (Duration, Weight, Reps, Rest, ~time, ~rest)
 * - Unknown params are silently ignored
 *
 * Special logic for Duration/~time/~rest:
 * - Combines numeric value + text unit into single value string
 * - Examples: "60s", "1m 30s", "45.5kg"
 *
 * Returns:
 * - ExerciseParam with key, value, editable flag, and optional unit
 * - null if validation fails or param not whitelisted
 */
function parseParam(paramStr: string): ExerciseParam | null {
	const tokens = tokenizeParam(paramStr);
	if (tokens.length === 0) return null;

	const keyToken = tokens.find(t => t.type === 'key');
	const valueToken = tokens.find(t => t.type === 'bracket' || t.type === 'value');

	if (!keyToken || !valueToken) return null;

	// Only allow these parameters - all others are ignored
	// ~time and ~rest are system-managed totals (not user-editable)
	const allowedParams = ['duration', 'weight', 'reps', 'rest', '~time', '~rest'];
	const paramKeyLower = keyToken.value.toLowerCase();
	if (!allowedParams.includes(paramKeyLower)) {
		console.log(`Ignoring unrecognized parameter: ${keyToken.value}`);
		return null; // Ignore unrecognized parameters
	}

	const unitToken = tokens.find(t => t.type === 'unit');

	let finalValue = valueToken.value;
	let finalUnit = unitToken?.value;

	// Duration formats use compound notation (e.g., "1m 30s"), so combine numeric + unit
	// ~time and ~rest also follow duration format from serialization
	const isDurationParam = ['duration', 'rest', '~time', '~rest'].includes(keyToken.value.toLowerCase());
	if (isDurationParam && finalUnit) {
		finalValue = finalValue + finalUnit;
		finalUnit = undefined;
	}

	return {
		key: keyToken.value,
		value: finalValue,
		editable: valueToken.type === 'bracket',
		unit: finalUnit
	};
}

/**
 * Convert duration string to total seconds.
 *
 * Supports multiple formats:
 * - "60s" → 60
 * - "1:30" or "01:30" → 90
 * - "1m 30s" or "1m30s" → 90
 * - "45" → 45 (assumed seconds)
 *
 * Returns 0 if format is unrecognized.
 */
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

/**
 * Format seconds as MM:SS (padded for display).
 * Example: 90 → "1:30"
 */
export function formatDuration(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format seconds as human-readable string.
 * Examples:
 * - 30 → "30s"
 * - 90 → "1m 30s"
 * - 120 → "2m"
 */
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

/**
 * Get the checkbox character for a given exercise state.
 * Inverse of STATE_MAP - used during serialization.
 */
export function getStateChar(state: ExerciseState): string {
	return STATE_CHAR_MAP[state];
}

/**
 * Serialize an Exercise object back to markdown.
 *
 * Format: "- [STATE] Exercise Name | Key: [value] unit | Key: value"
 *
 * Logic:
 * - Converts state to checkbox character
 * - Outputs params with editable values in brackets
 * - Locked params (no brackets) are system-managed (like ~time, ~rest)
 */
export function serializeExercise(exercise: Exercise): string {
	const stateChar = getStateChar(exercise.state);
	let line = `- [${stateChar}] ${exercise.name}`;

	// Append each parameter with proper formatting
	for (const param of exercise.params) {
		line += ' | ';
		line += `${param.key}: `;
		if (param.editable) {
			// User-editable values shown in brackets
			line += `[${param.value}]`;
		} else {
			// Locked (system-managed) values without brackets
			line += param.value;
		}
		if (param.unit) {
			line += ` ${param.unit}`;
		}
	}

	return line;
}

/**
 * Serialize an ExerciseSet object back to markdown.
 *
 * Format: "  - [STATE] | Key: [value] unit | Key: value"
 *
 * Logic:
 * - Converts state to checkbox character
 * - Outputs params with editable values in brackets
 * - Locked params (no brackets) are system-managed (like ~time, ~rest)
 * - Indents with 2 spaces to nest under exercise
 */
export function serializeSet(set: ExerciseSet): string {
	// Indent all set lines 2 spaces relative to exercise line (indent = "  " prefix)
	const stateChar = getStateChar(set.state);
	let line = `  - [${stateChar}]`;

	// Append each parameter using same format as exercise params
	for (const param of set.params) {
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
