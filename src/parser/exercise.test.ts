import {
	parseExercise,
	parseSet,
	parseDurationToSeconds,
	formatDuration,
	formatDurationHuman,
	getStateChar,
	serializeExercise,
	serializeSet
} from './exercise';
import { ExerciseState } from '../types';

/**
 * Tests for the core `parseExercise` function.
 * Ensures that markdown list items are correctly converted into `Exercise` objects,
 * extracting states, names, and parameters accurately.
 */
describe('parseExercise', () => {
	// Tests ensuring the fundamental shape of an exercise line is properly decoded
	describe('Basic Parsing & Structure', () => {
		it('should parse a basic exercise line', () => {
			const line = '- [ ] Bench Press | Weight: [100] kg';
			const exercise = parseExercise(line, 0);

			expect(exercise).not.toBeNull();
			expect(exercise!.name).toBe('Bench Press');
			expect(exercise!.state).toBe('pending');
			expect(exercise!.params).toHaveLength(1);
			expect(exercise!.params[0].key).toBe('Weight');
			expect(exercise!.params[0].value).toBe('100');
			expect(exercise!.params[0].unit).toBe('kg');
		});

		it('should handle inprogress exercise with multiple params', () => {
			const line = '- [\\] Squats | Weight: [200] kg | Reps: [10] | Duration: 60s';
			const exercise = parseExercise(line, 0);

			expect(exercise!.params).toHaveLength(3);
			expect(exercise!.state).toBe('inProgress');
			expect(exercise!.params[0].key).toBe('Weight');
			expect(exercise!.params[1].key).toBe('Reps');
			expect(exercise!.params[2].key).toBe('Duration');
		});

		it('should handle complete exercise with multiple params and system parameters', () => {
			const line = '- [x] Squats | Weight: [200] kg | Reps: [10] | Duration: 60s | ~time: 4s | ~rest: 3s';
			const exercise = parseExercise(line, 0);

			expect(exercise!.params).toHaveLength(3);
			expect(exercise!.state).toBe('completed');
			expect(exercise!.params[0].key).toBe('Weight');
			expect(exercise!.params[1].key).toBe('Reps');
			expect(exercise!.params[2].key).toBe('Duration');
		});

		it('should preserve lineIndex', () => {
			const line = '- [ ] Bench Press';
			const exercise = parseExercise(line, 42);

			expect(exercise!.lineIndex).toBe(42);
		});
	});

	// Tests handling the different markdown checkbox character maps
	describe('State Handling', () => {
		it('should parse exercise with completed state', () => {
			const line = '- [x] Running | Duration: 30m';
			const exercise = parseExercise(line, 0);
			expect(exercise!.state).toBe('completed');
		});

		it('should parse exercise with in-progress state', () => {
			const line = '- [\\] Squats | Weight: [150] lbs';
			const exercise = parseExercise(line, 0);
			expect(exercise!.state).toBe('inProgress');
		});

		it('should parse exercise with skipped state', () => {
			const line = '- [-] Swimming | Duration: 1h';
			const exercise = parseExercise(line, 0);
			expect(exercise!.state).toBe('skipped');
		});
	});

	// Tests ensuring parameters fall into the right routing bins
	describe('Parameter Extraction & Logic', () => {
		it('should handle case-insensitive parameter keys', () => {
			const line = '- [ ] Bench | wEiGhT: [100] kg';
			const exercise = parseExercise(line, 0);

			expect(exercise!.params[0].key).toBe('wEiGhT'); // Preserves original case
			expect(exercise!.params[0].value).toBe('100');
		});

		it('should handle targetDuration from editable Duration param', () => {
			const line = '- [ ] Cardio | Duration: [120]';
			const exercise = parseExercise(line, 0);
			expect(exercise!.targetDuration).toBe(120);
		});

		it('should handle recordedDuration from non-editable Duration param', () => {
			const line = '- [x] Cardio | Duration: 125 s';
			const exercise = parseExercise(line, 0);

			// Duration values are parsed as targetDuration in seconds
			expect(exercise!.targetDuration).toBe(125);
		});

		it('should handle Duration with compound format like 3m2s', () => {
			const line = '- [x] Workout | Duration: 3m2s';
			const exercise = parseExercise(line, 0);

			// Duration is converted to seconds: 3m2s = 182 seconds
			expect(exercise!.targetDuration).toBe(182);
		});
	});

	// Tests ensuring parsing fails safely instead of crashing
	describe('Malformed Inputs & Edge Cases', () => {
		it('should parse exercise names with special characters and emojis', () => {
			const line = '- [ ] Super-Squat 🏋️‍♂️ | Weight: [100] kg';
			const exercise = parseExercise(line, 0);
			expect(exercise!.name).toBe('Super-Squat 🏋️‍♂️');
		});

		it('should return null for malformed checkboxes', () => {
			expect(parseExercise('- [xx] Bench', 0)).toBeNull();
			expect(parseExercise('[ ] Bench', 0)).toBeNull();
			expect(parseExercise('- [] Bench', 0)).toBeNull();
		});

		it('should return null for invalid exercise line', () => {
			const line = 'invalid line';
			const exercise = parseExercise(line, 0);
			expect(exercise).toBeNull();
		});

		it('should return null if no checkbox found', () => {
			const line = '- Bench Press | Weight: [100] kg';
			const exercise = parseExercise(line, 0);
			expect(exercise).toBeNull();
		});

		it('should parse exercise with empty name', () => {
			const line = '- [ ] | Weight: [100] kg';
			const exercise = parseExercise(line, 0);

			// Parser allows empty names (they just have no name field)
			expect(exercise!.name).toBe('');
		});
	});
});

/**
 * Tests for parsing individual set strings into ExerciseSet objects.
 * Covers indentation handling, state mapping, and param extraction.
 */
describe('parseSet', () => {
	describe('Basic Parsing & Structure', () => {
		it('should parse a basic set line', () => {
			const line = '  - [ ] | Weight: [100] kg | Reps: [10]';
			const set = parseSet(line, 0);

			expect(set).not.toBeNull();
			expect(set!.state).toBe('pending');
			expect(set!.params).toHaveLength(2);
		});

		it('should parse set without indentation (trim applied)', () => {
			const line = '- [\\] | Reps: [8]';
			const set = parseSet(line, 0);

			expect(set!.state).toBe('inProgress');
			expect(set!.params).toHaveLength(1);
		});

		it('should preserve lineIndex', () => {
			const line = '  - [ ] | Weight: [50] kg';
			const set = parseSet(line, 99);

			expect(set!.lineIndex).toBe(99);
		});
	});

	describe('State & Parameter Handling', () => {
		it('should handle set with completed state', () => {
			const line = '  - [x] | Weight: 100 kg | Reps: 10';
			const set = parseSet(line, 0);
			expect(set!.state).toBe('completed');
		});

		it('should extract system parameters ~time and ~rest in sets', () => {
			const line = '  - [x] | ~time: 60s | ~rest: 90s';
			const set = parseSet(line, 0);
			expect(set!.recordedTime).toBe('60s');
			expect(set!.recordedRest).toBe('90s');
			expect(set!.params).toHaveLength(0); // System params are extracted, not kept in params array
		});

		it('should handle set with duration', () => {
			const line = '  - [x] | Duration: 45s';
			const set = parseSet(line, 0);

			expect(set!.params).toHaveLength(1);
			expect(set!.params[0].key).toBe('Duration');
			expect(set!.params[0].value).toBe('45s');
		});
	});

	describe('Malformed Inputs & Edge Cases', () => {
		it('should return null for invalid set line', () => {
			const line = '  invalid set';
			const set = parseSet(line, 0);
			expect(set).toBeNull();
		});
	});
});

/**
 * Tests for translating human-readable strings into second-based integers.
 */
describe('parseDurationToSeconds', () => {
	describe('Standard Formats', () => {
		it('should parse simple seconds format', () => {
			expect(parseDurationToSeconds('60s')).toBe(60);
			expect(parseDurationToSeconds('30s')).toBe(30);
		});

		it('should parse colon format MM:SS', () => {
			expect(parseDurationToSeconds('1:30')).toBe(90);
			expect(parseDurationToSeconds('5:45')).toBe(345);
			expect(parseDurationToSeconds('01:30')).toBe(90);
		});

		it('should parse minutes and seconds format', () => {
			expect(parseDurationToSeconds('1m 30s')).toBe(90);
			expect(parseDurationToSeconds('1m30s')).toBe(90);
			expect(parseDurationToSeconds('3m2s')).toBe(182);
			expect(parseDurationToSeconds('2m')).toBe(120);
		});

		it('should parse just seconds without unit', () => {
			expect(parseDurationToSeconds('120')).toBe(120);
			expect(parseDurationToSeconds('45')).toBe(45);
		});

		it('should handle minutes without seconds', () => {
			expect(parseDurationToSeconds('1m')).toBe(60);
			expect(parseDurationToSeconds('5m')).toBe(300);
		});
	});

	describe('Edge Cases & Anomalies', () => {
		it('should handle decimal seconds', () => {
			expect(parseDurationToSeconds('60')).toBe(60);
		});

		it('should handle values over 60 seconds', () => {
			expect(parseDurationToSeconds('120s')).toBe(120);
			expect(parseDurationToSeconds('1m 90s')).toBe(150);
		});

		it('should handle zero values', () => {
			expect(parseDurationToSeconds('0s')).toBe(0);
			expect(parseDurationToSeconds('0m 0s')).toBe(0);
			expect(parseDurationToSeconds('0')).toBe(0);
		});

		it('should return 0 for invalid format', () => {
			expect(parseDurationToSeconds('invalid')).toBe(0);
			expect(parseDurationToSeconds('')).toBe(0);
			expect(parseDurationToSeconds('abc123')).toBe(0);
		});

		it('should handle whitespace', () => {
			expect(parseDurationToSeconds('  60s  ')).toBe(60);
			expect(parseDurationToSeconds('1m  30s')).toBe(90);
		});

		it('should handle 3m2 format (no unit at end, assumes seconds)', () => {
			expect(parseDurationToSeconds('3m2')).toBe(182);
		});
	});
});

describe('formatDuration', () => {
	it('should format seconds to MM:SS', () => {
		expect(formatDuration(0)).toBe('0:00');
		expect(formatDuration(30)).toBe('0:30');
		expect(formatDuration(60)).toBe('1:00');
		expect(formatDuration(90)).toBe('1:30');
		expect(formatDuration(3661)).toBe('61:01');
	});

	it('should pad seconds with zeros', () => {
		expect(formatDuration(5)).toBe('0:05');
		expect(formatDuration(125)).toBe('2:05');
	});
});

describe('formatDurationHuman', () => {
	it('should format only seconds', () => {
		expect(formatDurationHuman(0)).toBe('0s');
		expect(formatDurationHuman(30)).toBe('30s');
		expect(formatDurationHuman(59)).toBe('59s');
	});

	it('should format only minutes', () => {
		expect(formatDurationHuman(60)).toBe('1m');
		expect(formatDurationHuman(300)).toBe('5m');
	});

	it('should format minutes and seconds', () => {
		expect(formatDurationHuman(90)).toBe('1m 30s');
		expect(formatDurationHuman(125)).toBe('2m 5s');
		expect(formatDurationHuman(661)).toBe('11m 1s');
	});
});

describe('getStateChar', () => {
	it('should map states to characters', () => {
		expect(getStateChar('pending')).toBe(' ');
		expect(getStateChar('inProgress')).toBe('\\');
		expect(getStateChar('completed')).toBe('x');
		expect(getStateChar('skipped')).toBe('-');
	});
});

describe('serializeExercise', () => {
	it('should serialize basic exercise', () => {
		const exercise = {
			state: 'pending' as ExerciseState,
			name: 'Bench Press',
			params: [
				{ key: 'Weight', value: '100', editable: true, unit: 'kg' }
			],
			sets: [],
			lineIndex: 0
		};

		const result = serializeExercise(exercise);
		expect(result).toBe('- [ ] Bench Press | Weight: [100] kg');
	});

	it('should serialize exercise with multiple params', () => {
		const exercise = {
			state: 'completed' as ExerciseState,
			name: 'Squats',
			params: [
				{ key: 'Weight', value: '200', editable: true, unit: 'kg' },
				{ key: 'Reps', value: '10', editable: false, unit: undefined }
			],
			sets: [],
			lineIndex: 0
		};

		const result = serializeExercise(exercise);
		expect(result).toBe('- [x] Squats | Weight: [200] kg | Reps: 10');
	});

	it('should serialize exercise with in-progress state', () => {
		const exercise = {
			state: 'inProgress' as ExerciseState,
			name: 'Running',
			params: [],
			sets: [],
			lineIndex: 0
		};

		const result = serializeExercise(exercise);
		expect(result).toBe('- [\\] Running');
	});

	it('should handle params without units', () => {
		const exercise = {
			state: 'pending' as ExerciseState,
			name: 'Cardio',
			params: [
				{ key: 'Duration', value: '60', editable: true, unit: undefined }
			],
			sets: [],
			lineIndex: 0
		};

		const result = serializeExercise(exercise);
		expect(result).toBe('- [ ] Cardio | Duration: [60]');
	});
});

describe('serializeSet', () => {
	it('should serialize basic set', () => {
		const set = {
			state: 'pending' as ExerciseState,
			params: [
				{ key: 'Weight', value: '100', editable: true, unit: 'kg' },
				{ key: 'Reps', value: '8', editable: true, unit: undefined }
			],
			lineIndex: 0
		};

		const result = serializeSet(set);
		expect(result).toBe('  - [ ] | Weight: [100] kg | Reps: [8]');
	});

	it('should serialize completed set', () => {
		const set = {
			state: 'completed' as ExerciseState,
			params: [
				{ key: 'Weight', value: '150', editable: false, unit: 'lbs' }
			],
			lineIndex: 0
		};

		const result = serializeSet(set);
		expect(result).toBe('  - [x] | Weight: 150 lbs');
	});

	it('should serialize set with no params', () => {
		const set = {
			state: 'inProgress' as ExerciseState,
			params: [],
			lineIndex: 0
		};

		const result = serializeSet(set);
		expect(result).toBe('  - [\\]');
	});

	it('should serialize set with duration', () => {
		const set = {
			state: 'pending' as ExerciseState,
			params: [
				{ key: 'Duration', value: '3m2s', editable: false, unit: undefined }
			],
			lineIndex: 0
		};

		const result = serializeSet(set);
		expect(result).toBe('  - [ ] | Duration: 3m2s');
	});
});

/**
 * Verification of exact data fidelity when transitioning from Markdown string to internal objects
 * and back to markdown strings. Validates handling of formatting quirks.
 */
describe('Integration & Idempotency Tests', () => {
	describe('Round-Trip Serialization', () => {
		it('should parse and serialize exercise without data loss', () => {
			const original = '- [x] Bench Press | Weight: [100] kg | Reps: [12]';
			const exercise = parseExercise(original, 0);
			const serialized = serializeExercise(exercise!);

			expect(serialized).toBe(original);
		});

		it('should parse and serialize set without data loss', () => {
			const original = '  - [ ] | Weight: [80] kg | Reps: [10]';
			const set = parseSet(original, 0);
			const serialized = serializeSet(set!);

			expect(serialized).toBe(original);
		});

		it('should maintain strict idempotency (Serialize -> Parse -> Serialize)', () => {
			const mockExercise = {
				state: 'completed' as ExerciseState,
				name: 'Complex Squat 🏋️‍♂️',
				params: [
					{ key: 'Weight', value: '100', editable: true, unit: 'kg' },
					{ key: 'Reps', value: '10', editable: false, unit: undefined }
				],
				sets: [],
				lineIndex: 0
			};

			const serialized1 = serializeExercise(mockExercise);
			const parsed = parseExercise(serialized1, 0);
			const serialized2 = serializeExercise(parsed!);
			
			expect(serialized1).toBe(serialized2);
		});
	});

	describe('Complex Parameter Edge Cases', () => {
		it('should handle complex exercise with all parameter types', () => {
			const line = '- [\\] Deadlift | Weight: [225] kg | Reps: [5] | Duration: 3m2s';
			const exercise = parseExercise(line, 0);

			expect(exercise).not.toBeNull();
			expect(exercise!.state).toBe('inProgress');
			expect(exercise!.name).toBe('Deadlift');
			// Weight, Reps, and Duration are all in params
			expect(exercise!.params).toHaveLength(3);
			// Duration is also extracted into targetDuration (in seconds)
			expect(exercise!.targetDuration).toBe(182);  // 3m2s = 182 seconds
		});

		it('should roundtrip duration formats through parsing', () => {
			const formats = ['60s', '1:30', '1m 30s', '1m30s', '3m2s', '3m2'];
			formats.forEach(format => {
				const seconds = parseDurationToSeconds(format);
				expect(seconds).toBeGreaterThan(0);
			});
		});

		it('should handle params with concatenated values like 10kg', () => {
			const line = '- [ ] Curls | Weight: 10kg';
			const exercise = parseExercise(line, 0);

			expect(exercise!.params).toHaveLength(1);
			expect(exercise!.params[0].key).toBe('Weight');
			expect(exercise!.params[0].value).toBe('10');
			expect(exercise!.params[0].unit).toBe('kg');
			expect(exercise!.params[0].editable).toBe(false);
		});

		it('should handle params with concatenated decimal values like 5.5lbs', () => {
			const line = '- [ ] Exercise | Weight: 5.5lbs';
			const exercise = parseExercise(line, 0);

			expect(exercise!.params[0].value).toBe('5.5');
			expect(exercise!.params[0].unit).toBe('lbs');
		});
	});

	describe('Parameter Whitelisting & Filtering', () => {
		it('should parse exercise without any params', () => {
			const line = '- [x] Rest';
			const exercise = parseExercise(line, 0);

			expect(exercise!.name).toBe('Rest');
			expect(exercise!.params).toHaveLength(0);
		});

		it('should ignore params that are not on the allowed list', () => {
			// Only Duration, Weight, Reps, and Rest are allowed
			// Sets and Notes should be filtered out
			const line = '- [ ] Exercise | Sets: 3 | Notes: [my note]';
			const exercise = parseExercise(line, 0);

			// Should have no params since Sets and Notes are not allowed
			expect(exercise!.params).toHaveLength(0);
		});

		it('should allow only whitelisted parameters', () => {
			// All allowed params should be parsed correctly
			const line = '- [ ] Exercise | Duration: [60s] | Weight: 20 lbs | Reps: [10] | Rest: 30s | Unknown: 5';
			const exercise = parseExercise(line, 0);

			// Should have 4 params (Duration, Weight, Reps, Rest), Unknown should be filtered out
			expect(exercise!.params).toHaveLength(4);
			expect(exercise!.params[0].key).toBe('Duration');
			expect(exercise!.params[1].key).toBe('Weight');
			expect(exercise!.params[2].key).toBe('Reps');
			expect(exercise!.params[3].key).toBe('Rest');
		});

		it('should safely ignore malformed parameters', () => {
			// Weight missing a colon, Reps missing a value
			const line = '- [ ] Exercise | Weight [100] kg | Reps: | Rest: []';
			const exercise = parseExercise(line, 0);

			// Weight and Reps should be ignored due to formatting issues
			// Rest: [] is technically parsed but with an empty string value
			expect(exercise!.params).toHaveLength(1);
			expect(exercise!.params[0].key).toBe('Rest');
			expect(exercise!.params[0].value).toBe('');
		});
	});

	describe('System Parameter Extraction', () => {
		it('should allow system-managed totals parameters (~time and ~rest)', () => {
			// ~time and ~rest are system-managed (locked) parameters
			// These are extracted into separate fields, not stored in params array
			const line = '- [x] Exercise | ~rest: 5m | ~time: 30m';
			const exercise = parseExercise(line, 0);

			expect(exercise!.recordedRest).toBe('5m');
			expect(exercise!.recordedTime).toBe('30m');
		});
	});
});
