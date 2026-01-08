import { WorkoutMetadata, WorkoutState } from '../types';

const VALID_STATES: WorkoutState[] = ['planned', 'started', 'completed'];

export function parseMetadata(lines: string[]): WorkoutMetadata {
	const metadata: WorkoutMetadata = {
		state: 'planned'
	};

	for (const line of lines) {
		const colonIndex = line.indexOf(':');
		if (colonIndex === -1) continue;

		const key = line.substring(0, colonIndex).trim().toLowerCase();
		const value = line.substring(colonIndex + 1).trim();

		switch (key) {
			case 'title':
				if (value) metadata.title = value;
				break;
			case 'state':
				if (VALID_STATES.includes(value as WorkoutState)) {
					metadata.state = value as WorkoutState;
				}
				break;
			case 'startdate':
				if (value) metadata.startDate = value;
				break;
			case 'duration':
				if (value) metadata.duration = value;
				break;
		}
	}

	return metadata;
}

export function serializeMetadata(metadata: WorkoutMetadata): string[] {
	const lines: string[] = [];

	if (metadata.title !== undefined) {
		lines.push(`title: ${metadata.title}`);
	}
	lines.push(`state: ${metadata.state}`);
	if (metadata.startDate !== undefined) {
		lines.push(`startDate: ${metadata.startDate}`);
	}
	if (metadata.duration !== undefined) {
		lines.push(`duration: ${metadata.duration}`);
	}

	return lines;
}
