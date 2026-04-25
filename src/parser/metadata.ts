/**
 * Metadata parsing and serialization for workout blocks.
 *
 * Handles the header section of a workout (before the --- separator):
 * title, state, startDate, duration, restDuration, saveToProperties
 *
 * Key features:
 * - parseMetadata() extracts key: value pairs from markdown lines
 * - serializeMetadata() converts WorkoutMetadata back to markdown lines
 * - State validation against VALID_STATES
 * - Duration parsing/formatting (supports compound notation like "1m 30s")
 */

import { WorkoutMetadata, WorkoutState } from '../types';
import { parseDurationToSeconds, formatDurationHuman } from './exercise';

/**
 * Valid workout states. Only these values are accepted during parsing.
 * - 'planned': workout setup, not started
 * - 'started': workout in progress
 * - 'completed': workout finished
 */
const VALID_STATES: WorkoutState[] = ['planned', 'started', 'completed'];

/**
 * Parse metadata lines from a workout block.
 *
 * Format: Each line is "key: value" where key is case-insensitive.
 *
 * Supported keys:
 * - title: string (workout name)
 * - state: 'planned' | 'started' | 'completed' (must be valid)
 * - startDate: string (ISO date or datetime)
 * - duration: string (human-readable format like "1m 30s")
 * - restDuration: string (rest duration as seconds, parsed from human format)
 * - saveToProperties: 'true' | 'false' (boolean as string)
 *
 * Invalid lines (no colon, unknown keys) are silently ignored.
 * Unknown state values are rejected (defaults to 'planned').
 */
export function parseMetadata(lines: string[]): WorkoutMetadata {
	// Start with default state; other fields optional
	const metadata: WorkoutMetadata = {
		state: 'planned'
	};

	for (const line of lines) {
		// Skip lines without colon separator
		const colonIndex = line.indexOf(':');
		if (colonIndex === -1) continue;

		// Extract key (case-insensitive) and value
		const key = line.substring(0, colonIndex).trim().toLowerCase();
		const value = line.substring(colonIndex + 1).trim();

		switch (key) {
			case 'title':
				// Store workout name if provided
				if (value) metadata.title = value;
				break;
			case 'state':
				// Only accept valid state values; reject unknown states
				if (VALID_STATES.includes(value as WorkoutState)) {
					metadata.state = value as WorkoutState;
				}
				break;
			case 'startdate':
				// Store ISO date/datetime when workout started
				if (value) metadata.startDate = value;
				break;
			case 'duration':
				// Store as-is; actual elapsed time recorded during workout
				if (value) metadata.duration = value;
				break;
			case 'restduration':
				// Parse human-readable format to seconds (e.g., "1m 30s" → 90)
				if (value) {
					const seconds = parseDurationToSeconds(value);
					if (seconds > 0) metadata.restDuration = seconds;
				}
				break;
			case 'savetoproperties':
				// Parse string 'true'/'false' to boolean
				metadata.saveToProperties = value.toLowerCase() === 'true';
				break;
		}
	}

	return metadata;
}

/**
 * Convert WorkoutMetadata back to markdown header lines.
 *
 * Output format: "key: value" lines, one per field.
 * - state: always included
 * - other fields: only if defined (optional fields)
 * - restDuration: converted from seconds to human format (e.g., 90 → "1m 30s")
 * - saveToProperties: converted from boolean to lowercase string
 *
 * Returns array of lines (without the --- separator).
 */
export function serializeMetadata(metadata: WorkoutMetadata): string[] {
	const lines: string[] = [];

	// Optional: title
	if (metadata.title !== undefined) {
		lines.push(`title: ${metadata.title}`);
	}

	// Required: state (always present)
	lines.push(`state: ${metadata.state}`);

	// Optional: startDate (ISO format)
	if (metadata.startDate !== undefined) {
		lines.push(`startDate: ${metadata.startDate}`);
	}

	// Optional: duration (actual elapsed time as string)
	if (metadata.duration !== undefined) {
		lines.push(`duration: ${metadata.duration}`);
	}

	// Optional: restDuration (stored as seconds, convert to human format)
	if (metadata.restDuration !== undefined) {
		lines.push(`restDuration: ${formatDurationHuman(metadata.restDuration)}`);
	}

	// Optional: saveToProperties (convert boolean to string)
	if (metadata.saveToProperties !== undefined) {
		lines.push(`saveToProperties: ${metadata.saveToProperties}`);
	}

	return lines;
}
