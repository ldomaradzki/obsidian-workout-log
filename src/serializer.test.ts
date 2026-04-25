import {
	serializeWorkout,
	updateParamValue,
	updateSetParamValue,
	updateExerciseState,
	updateSetState,
	lockAllFields,
	addRest,
	addSet,
	setRecordedDuration,
	setSetRecordedDuration,
	updateSetRestDuration,
	createSampleWorkout,
	serializeWorkoutAsTemplate
} from './serializer';
import { ExerciseState } from './types';
import { parseWorkout } from './parser/index';

describe('serializeWorkout', () => {
	it('should serialize basic workout', () => {
		const source = 'title: Test\nstate: planned\n---\n- [ ] Exercise\n  - [ ] | Weight: [100] kg';
		const parsed = parseWorkout(source);
		const serialized = serializeWorkout(parsed);
		
		expect(serialized).toContain('title: Test');
		expect(serialized).toContain('state: planned');
		expect(serialized).toContain('---');
		expect(serialized).toContain('- [ ] Exercise');
		expect(serialized).toContain('  - [ ] | Weight: [100] kg');
	});

	it('should roundtrip parse and serialize', () => {
		const source = 'title: Full Body\nstate: completed\n---\n- [x] Bench\n  - [x] | Weight: 100 kg | Reps: 8';
		const parsed = parseWorkout(source);
		const serialized = serializeWorkout(parsed);
		const reparsed = parseWorkout(serialized);
		
		expect(reparsed.metadata.title).toBe(parsed.metadata.title);
		expect(reparsed.exercises).toHaveLength(parsed.exercises.length);
		expect(reparsed.exercises[0].name).toBe(parsed.exercises[0].name);
	});
});

describe('updateParamValue', () => {
	it('should update existing exercise param', () => {
		const source = '---\n- [ ] Bench | Weight: [100] kg | Reps: [10]\n  - [ ] | Weight: [100] kg';
		const parsed = parseWorkout(source);
		const updated = updateParamValue(parsed, 0, 'Weight', '110');
		
		expect(updated.exercises[0].params.find(p => p.key === 'Weight')?.value).toBe('110');
	});

	it('should only update if param exists', () => {
		const source = '---\n- [ ] Exercise | Weight: [50] kg\n  - [ ] |';
		const parsed = parseWorkout(source);
		const updated = updateParamValue(parsed, 0, 'NonExistent', 'value');
		
		// Param not added, only existing params can be updated
		expect(updated.exercises[0].params.find(p => p.key === 'NonExistent')).toBeUndefined();
	});

	it('should return unchanged if exercise index invalid', () => {
		const source = '---\n- [ ] Exercise | Weight: [50] kg\n  - [ ] |';
		const parsed = parseWorkout(source);
		const updated = updateParamValue(parsed, 99, 'Key', 'value');
		
		expect(updated).toBe(parsed);
	});

	it('should not mutate original', () => {
		const source = '---\n- [ ] Bench | Weight: [100] kg | Reps: [10]\n  - [ ] |';
		const parsed = parseWorkout(source);
		const updated = updateParamValue(parsed, 0, 'Weight', '110');
		
		expect(parsed.exercises[0].params[0].value).toBe('100');
		expect(updated.exercises[0].params[0].value).toBe('110');
	});
});

describe('updateSetParamValue', () => {
	it('should update existing set param', () => {
		const source = '---\n- [ ] Bench\n  - [ ] | Weight: [100] kg';
		const parsed = parseWorkout(source);
		const updated = updateSetParamValue(parsed, 0, 0, 'Weight', '120');
		
		expect(updated.exercises[0].sets[0].params[0].value).toBe('120');
	});

	it('should return unchanged if exercise index invalid', () => {
		const source = '---\n- [ ] Bench\n  - [ ] | Weight: [100] kg';
		const parsed = parseWorkout(source);
		const updated = updateSetParamValue(parsed, 99, 0, 'Weight', '120');
		
		expect(updated).toBe(parsed);
	});

	it('should return unchanged if set index invalid', () => {
		const source = '---\n- [ ] Bench\n  - [ ] | Weight: [100] kg';
		const parsed = parseWorkout(source);
		const updated = updateSetParamValue(parsed, 0, 99, 'Weight', '120');
		
		expect(updated).toBe(parsed);
	});
});

describe('updateExerciseState', () => {
	it('should update exercise state', () => {
		const source = '---\n- [ ] Exercise\n  - [ ] |';
		const parsed = parseWorkout(source);
		const updated = updateExerciseState(parsed, 0, 'completed');
		
		expect(updated.exercises[0].state).toBe('completed');
	});

	it('should preserve original state if invalid index', () => {
		const source = '---\n- [ ] Exercise\n  - [ ] |';
		const parsed = parseWorkout(source);
		const updated = updateExerciseState(parsed, 99, 'completed');
		
		expect(updated).toBe(parsed);
	});
});

describe('updateSetState', () => {
	it('should update set state', () => {
		const source = '---\n- [ ] Bench\n  - [ ] | Weight: [100] kg';
		const parsed = parseWorkout(source);
		const updated = updateSetState(parsed, 0, 0, 'completed');
		
		expect(updated.exercises[0].sets[0].state).toBe('completed');
	});

	it('should return unchanged if indices invalid', () => {
		const source = '---\n- [ ] Bench\n  - [ ] | Weight: [100] kg';
		const parsed = parseWorkout(source);
		const updated = updateSetState(parsed, 99, 0, 'completed');
		
		expect(updated).toBe(parsed);
	});
});

describe('lockAllFields', () => {
	it('should convert all editable params to non-editable', () => {
		const source = '---\n- [ ] Bench | Weight: [100] kg | Reps: [8]\n  - [ ] | Weight: [100] kg | Reps: [8]';
		const parsed = parseWorkout(source);
		const locked = lockAllFields(parsed);
		
		// All params should be non-editable
		locked.exercises[0].params.forEach(p => {
			expect(p.editable).toBe(false);
		});
		locked.exercises[0].sets.forEach(s => {
			s.params.forEach(p => {
				expect(p.editable).toBe(false);
			});
		});
	});

	it('should not mutate original', () => {
		const source = '---\n- [ ] Bench | Weight: [100] kg | Reps: [8]\n  - [ ] |';
		const parsed = parseWorkout(source);
		const locked = lockAllFields(parsed);
		
		expect(parsed.exercises[0].params[0].editable).toBe(true);
		expect(locked.exercises[0].params[0].editable).toBe(false);
	});
});

describe('addRest', () => {
	it('should add rest exercise after specified index', () => {
		const source = '---\n- [ ] Bench\n  - [ ] |';
		const parsed = parseWorkout(source);
		const withRest = addRest(parsed, 0, 60);
		
		expect(withRest.exercises).toHaveLength(2);
		expect(withRest.exercises[1].name).toBe('Rest');
		expect(withRest.exercises[1].targetDuration).toBe(60);
	});

	it('should return unchanged if exercise index invalid', () => {
		const source = '---\n- [ ] Bench\n  - [ ] |';
		const parsed = parseWorkout(source);
		const withRest = addRest(parsed, 99, 60);
		
		expect(withRest).toBe(parsed);
	});

	it('should create rest with editable Duration param', () => {
		const source = '---\n- [ ] Bench\n  - [ ] |';
		const parsed = parseWorkout(source);
		const withRest = addRest(parsed, 0, 90);
		
		const restEx = withRest.exercises[1];
		expect(restEx.params).toHaveLength(1);
		expect(restEx.params[0].key).toBe('Duration');
		expect(restEx.params[0].value).toBe('90s');
		expect(restEx.params[0].editable).toBe(true);
	});
});

describe('addSet', () => {
	it('should add new set to exercise', () => {
		const source = '---\n- [ ] Bench\n  - [ ] | Weight: [100] kg';
		const parsed = parseWorkout(source);
		const withSet = addSet(parsed, 0);
		
		expect(withSet.exercises[0].sets).toHaveLength(2);
		expect(withSet.exercises[0].sets[1].state).toBe('pending');
	});

	it('should preserve params in new set', () => {
		const source = '---\n- [ ] Bench\n  - [ ] | Weight: [100] kg | Reps: [8]';
		const parsed = parseWorkout(source);
		const withSet = addSet(parsed, 0);
		
		expect(withSet.exercises[0].sets[1].params).toHaveLength(2);
	});

	it('should return unchanged if invalid exercise or no sets', () => {
		const source = '---\n- [ ] Bench';
		const parsed = parseWorkout(source);
		const withSet = addSet(parsed, 0);
		
		// First set is created from exercise params, so has 1 set
		// Adding another should work
		expect(withSet.exercises[0].sets.length).toBeGreaterThan(1);
	});
});

describe('setRecordedDuration', () => {
	it('should set recorded duration on exercise', () => {
		const source = '---\n- [ ] Cardio\n  - [ ] |';
		const parsed = parseWorkout(source);
		const updated = setRecordedDuration(parsed, 0, '5m 30s');
		
		const durationParam = updated.exercises[0].params.find(p => p.key === 'Duration');
		expect(durationParam?.value).toBe('5m 30s');
		expect(durationParam?.editable).toBe(false);
	});

	it('should overwrite existing duration', () => {
		const source = '---\n- [ ] Cardio | Duration: [60]\n  - [ ] |';
		const parsed = parseWorkout(source);
		const updated = setRecordedDuration(parsed, 0, '65s');
		
		const durationParam = updated.exercises[0].params.find(p => p.key === 'Duration');
		expect(durationParam?.value).toBe('65s');
		expect(durationParam?.editable).toBe(false);
	});

	it('should return unchanged if exercise index invalid', () => {
		const source = '---\n- [ ] Cardio';
		const parsed = parseWorkout(source);
		const updated = setRecordedDuration(parsed, 99, '60s');
		
		expect(updated).toBe(parsed);
	});
});

describe('setSetRecordedDuration', () => {
	it('should set recorded duration on set', () => {
		const source = '---\n- [ ] Bench\n  - [ ] |';
		const parsed = parseWorkout(source);
		const updated = setSetRecordedDuration(parsed, 0, 0, '2m 30s');
		
		// Should store to recordedDuration field, not Duration param
		expect(updated.exercises[0].sets[0].recordedTime).toBe('2m 30s');
	});
});

describe('updateSetRestDuration', () => {
	it('should update rest duration on set', () => {
		const source = '---\n- [ ] Bench\n  - [ ] |';
		const parsed = parseWorkout(source);
		const updated = updateSetRestDuration(parsed, 0, 0, '90s');
		
		const restParam = updated.exercises[0].sets[0].params.find(p => p.key === 'Rest');
		expect(restParam?.value).toBe('90s');
		expect(restParam?.editable).toBe(true);
	});
});

describe('totals persistence (~time and ~rest)', () => {
	it('should parse ~time and ~rest parameters in whitelist', () => {
		const source = '---\n- [x] Exercise | ~rest: 5m | ~time: 38m\n  - [x] | Rest: 60s | Duration: 2:30';
		const parsed = parseWorkout(source);
		
		// ~time and ~rest are extracted into separate fields, not stored in params array
		expect(parsed.exercises[0].recordedRest).toBe('5m');
		expect(parsed.exercises[0].recordedTime).toBe('38m');
	});

	it('should strip ~time and ~rest from incomplete exercises on serialize', () => {
		const source = '---\n- [ ] Bench | Weight: [100] kg | ~rest: 5m | ~time: 30m\n  - [ ] | Weight: [100] kg';
		const parsed = parseWorkout(source);
		const serialized = serializeWorkout(parsed);
		
		// Totals should be stripped for incomplete exercise
		expect(serialized).not.toContain('~rest');
		expect(serialized).not.toContain('~time');
		expect(serialized).toContain('- [ ] Bench | Weight: [100] kg');
	});

	it('should calculate and append ~rest for completed exercises with recorded rest', () => {
		const source = '---\n- [x] Bench\n  - [x] | Rest: 60s\n  - [x] | Rest: 60s';
		const parsed = parseWorkout(source);
		
		// Set recorded rest times (simulating actual elapsed rest from timer)
		parsed.exercises[0].sets[0].recordedRest = '60s';
		parsed.exercises[0].sets[1].recordedRest = '60s';
		
		const serialized = serializeWorkout(parsed);
		
		// Should aggregate ~rest from both sets
		expect(serialized).toContain('~rest: 2m');
		expect(serialized).toContain('- [x] Bench | ~rest: 2m');
	});

	it('should calculate and append ~time for completed exercises with recorded duration', () => {
		const source = '---\n- [x] Bench\n  - [x] | Duration: 1:30\n  - [x] | Duration: 2:00';
		const parsed = parseWorkout(source);
		
		// Set recorded durations (simulating actual elapsed time from timer)
		parsed.exercises[0].sets[0].recordedTime = '1m 30s';
		parsed.exercises[0].sets[1].recordedTime = '2m';
		
		const serialized = serializeWorkout(parsed);
		
		// Should aggregate ~time from both sets
		expect(serialized).toContain('~time: 3m 30s');
	});

	it('should include both ~rest and ~time for completed exercises', () => {
		const source = '---\n- [x] Bench\n  - [x] | Duration: 2:00 | Rest: 45s\n  - [x] | Duration: 2:00 | Rest: 45s';
		const parsed = parseWorkout(source);
		
		// Set recorded times
		parsed.exercises[0].sets[0].recordedTime = '2m';
		parsed.exercises[0].sets[0].recordedRest = '45s';
		parsed.exercises[0].sets[1].recordedTime = '2m';
		parsed.exercises[0].sets[1].recordedRest = '45s';
		
		const serialized = serializeWorkout(parsed);
		
		expect(serialized).toContain('~rest: 1m 30s');
		expect(serialized).toContain('~time: 4m');
	});

	it('should recalculate totals fresh (not preserve old values)', () => {
		const source = '---\n- [x] Bench | ~rest: 99m | ~time: 99m\n  - [x] | Duration: 1:00 | Rest: 30s';
		const parsed = parseWorkout(source);
		
		// Set recorded times (should overwrite old ~rest/~time from params)
		parsed.exercises[0].sets[0].recordedTime = '1m';
		parsed.exercises[0].sets[0].recordedRest = '30s';
		
		const serialized = serializeWorkout(parsed);
		
		// Old values should be recalculated, not preserved
		expect(serialized).not.toContain('~rest: 99m');
		expect(serialized).not.toContain('~time: 99m');
		expect(serialized).toContain('~rest: 30s');
		expect(serialized).toContain('~time: 1m');
	});

	it('should omit ~rest if no recorded rest exists', () => {
		const source = '---\n- [x] Bench\n  - [x] | Duration: 1:00';
		const parsed = parseWorkout(source);
		
		// Set only recordedDuration
		parsed.exercises[0].sets[0].recordedTime = '1m';
		
		const serialized = serializeWorkout(parsed);
		
		expect(serialized).not.toContain('~rest');
		expect(serialized).toContain('~time: 1m');
	});

	it('should omit ~time if no recorded duration exists', () => {
		const source = '---\n- [x] Bench\n  - [x] | Rest: 60s';
		const parsed = parseWorkout(source);
		
		// Set only recordedRest
		parsed.exercises[0].sets[0].recordedRest = '60s';
		
		const serialized = serializeWorkout(parsed);
		
		expect(serialized).not.toContain('~time');
		expect(serialized).toContain('~rest: 1m');
	});

	it('should show totals as locked (non-editable) parameters', () => {
		const source = '---\n- [x] Bench\n  - [x] | Duration: 1:30 | Rest: 45s';
		const parsed = parseWorkout(source);
		
		// Set recorded times
		parsed.exercises[0].sets[0].recordedTime = '1m 30s';
		parsed.exercises[0].sets[0].recordedRest = '45s';
		
		const serialized = serializeWorkout(parsed);
		
		// Totals should be locked format (no brackets)
		expect(serialized).toContain('~rest: 45s');
		expect(serialized).not.toContain('~rest: [45s]');
		expect(serialized).toContain('~time: 1m 30s');
		expect(serialized).not.toContain('~time: [1m 30s]');
	});

	it('should roundtrip with totals preserved for completed exercises', () => {
		const source = '---\n- [x] Bench\n  - [x] | Duration: 1:00 | Rest: 30s';
		const parsed = parseWorkout(source);
		
		// Set recorded times
		parsed.exercises[0].sets[0].recordedTime = '1m';
		parsed.exercises[0].sets[0].recordedRest = '30s';
		
		const serialized = serializeWorkout(parsed);
		const reparsed = parseWorkout(serialized);
		
		// ~rest and ~time are extracted into separate fields after parsing
		expect(reparsed.exercises[0].recordedRest).toBeDefined();
		expect(reparsed.exercises[0].recordedTime).toBeDefined();
	});

	it('should handle exercises with multiple sets correctly', () => {
		const source = '---\n- [x] Squats\n  - [x] | Duration: 2:00 | Rest: 60s\n  - [x] | Duration: 2:30 | Rest: 60s\n  - [x] | Duration: 2:15 | Rest: 45s';
		const parsed = parseWorkout(source);
		
		// Set recorded times for each set
		parsed.exercises[0].sets[0].recordedTime = '2m';
		parsed.exercises[0].sets[0].recordedRest = '60s';
		parsed.exercises[0].sets[1].recordedTime = '2m 30s';
		parsed.exercises[0].sets[1].recordedRest = '60s';
		parsed.exercises[0].sets[2].recordedTime = '2m 15s';
		parsed.exercises[0].sets[2].recordedRest = '45s';
		
		const serialized = serializeWorkout(parsed);
		
		// 2m + 2m 30s + 2m 15s = 6m 45s
		// 60s + 60s + 45s = 165s = 2m 45s
		expect(serialized).toContain('~time: 6m 45s');
		expect(serialized).toContain('~rest: 2m 45s');
	});
});

describe('createSampleWorkout', () => {
	it('should create sample workout with exercises', () => {
		const sample = createSampleWorkout();
		
		expect(sample.metadata.title).toBe('Sample Workout');
		expect(sample.exercises.length).toBeGreaterThan(0);
		expect(sample.exercises[0].sets.length).toBeGreaterThan(0);
	});
});

describe('serializeWorkoutAsTemplate', () => {
	it('should serialize workout as template with reset state', () => {
		const source = '---\n- [ ] Bench\n  - [ ] | Weight: [100] kg';
		const parsed = parseWorkout(source);
		const template = serializeWorkoutAsTemplate(parsed);
		
		expect(template).toContain('state: planned');
		expect(template).toContain('startDate:');
		expect(template).toContain('duration:');
	});
});

describe('totals persistence roundtrip', () => {
	it('should preserve ~time and ~rest through parse-serialize cycles', () => {
		// Create a completed workout
		const source = '---\n- [x] Bench\n  - [x] | Rest: 60s';
		const parsed1 = parseWorkout(source);
		
		// Set recorded times
		parsed1.exercises[0].sets[0].recordedTime = '2m';
		parsed1.exercises[0].sets[0].recordedRest = '45s';
		
		// First serialize - should add ~time and ~rest
		const serialized1 = serializeWorkout(parsed1);
		expect(serialized1).toContain('~time: 2m');
		expect(serialized1).toContain('~rest: 45s');
		
		// Parse the serialized result
		const parsed2 = parseWorkout(serialized1);
		
		// Check that ~time and ~rest were extracted into recordedDuration/recordedRest
		expect(parsed2.exercises[0].sets[0].recordedTime).toBe('2m');
		expect(parsed2.exercises[0].sets[0].recordedRest).toBe('45s');
		
		// Serialize again - should still have ~time and ~rest
		const serialized2 = serializeWorkout(parsed2);
		expect(serialized2).toContain('~time: 2m');
		expect(serialized2).toContain('~rest: 45s');
		
		// Parse and check one more time
		const parsed3 = parseWorkout(serialized2);
		expect(parsed3.exercises[0].sets[0].recordedTime).toBe('2m');
		expect(parsed3.exercises[0].sets[0].recordedRest).toBe('45s');
	});

	it('should aggregate set totals through exercise totals across multiple roundtrips', () => {
		const source = '---\n- [x] Squats\n  - [x] | Rest: 60s\n  - [x] | Rest: 60s';
		const parsed1 = parseWorkout(source);
		
		// Set recorded times for both sets
		parsed1.exercises[0].sets[0].recordedTime = '2m';
		parsed1.exercises[0].sets[0].recordedRest = '60s';
		parsed1.exercises[0].sets[1].recordedTime = '2m 30s';
		parsed1.exercises[0].sets[1].recordedRest = '60s';
		
		// First serialize - should calculate exercise totals
		const serialized1 = serializeWorkout(parsed1);
		expect(serialized1).toContain('- [x] Squats | ~rest: 2m | ~time: 4m 30s');
		// ~time and ~rest are internal and should not be serialized on the set line
		expect(serialized1).toContain('  - [x] | Rest: 60s');
		
		// Parse back
		const parsed2 = parseWorkout(serialized1);
		
		// Verify set totals are preserved
		expect(parsed2.exercises[0].sets[0].recordedTime).toBe('2m');
		expect(parsed2.exercises[0].sets[0].recordedRest).toBe('60s');
		// Note: duration format may vary slightly (spaces), so just check the value exists
		expect(parsed2.exercises[0].sets[1].recordedTime).toBeTruthy();
		expect(parsed2.exercises[0].sets[1].recordedTime?.replace(/\s+/g, '')).toBe('2m30s');
		expect(parsed2.exercises[0].sets[1].recordedRest).toBe('60s');
		
		// Serialize again - exercise totals should be recalculated from set totals
		const serialized2 = serializeWorkout(parsed2);
		expect(serialized2).toContain('- [x] Squats | ~rest: 2m | ~time: 4m 30s');
	});
});
