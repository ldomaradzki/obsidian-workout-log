import { parseWorkout } from './index';

describe('parseWorkout', () => {
	it('should parse minimal workout with metadata separator', () => {
		const source = 'title: Test\nstate: planned\n---\n- [ ] Exercise';
		const result = parseWorkout(source);
		
		expect(result.metadata.title).toBe('Test');
		expect(result.metadata.state).toBe('planned');
		expect(result.exercises).toHaveLength(1);
		expect(result.exercises[0].name).toBe('Exercise');
	});

	it('should parse empty workout', () => {
		const source = '';
		const result = parseWorkout(source);
		
		expect(result.metadata.state).toBe('planned');
		expect(result.exercises).toHaveLength(0);
	});

	it('should parse workout with no metadata', () => {
		const source = '- [ ] Bench Press\n  - [ ] | Weight: [100] kg';
		const result = parseWorkout(source);
		
		expect(result.metadata.state).toBe('planned');
		expect(result.exercises).toHaveLength(1);
		expect(result.metadataEndIndex).toBe(-1);
	});

	it('should parse single exercise with single set', () => {
		const source = '---\n- [ ] Bench Press\n  - [ ] | Weight: [100] kg';
		const result = parseWorkout(source);
		
		expect(result.exercises).toHaveLength(1);
		expect(result.exercises[0].name).toBe('Bench Press');
		expect(result.exercises[0].sets).toHaveLength(1);
		expect(result.exercises[0].sets[0].params).toHaveLength(1);
	});

	it('should parse exercise with multiple sets', () => {
		const source = '---\n- [ ] Squats\n  - [ ] | Weight: [100] kg\n  - [ ] | Weight: [110] kg\n  - [ ] | Weight: [120] kg';
		const result = parseWorkout(source);
		
		expect(result.exercises).toHaveLength(1);
		expect(result.exercises[0].sets).toHaveLength(3);
		expect(result.exercises[0].sets[0].params[0].value).toBe('100');
		expect(result.exercises[0].sets[1].params[0].value).toBe('110');
		expect(result.exercises[0].sets[2].params[0].value).toBe('120');
	});

	it('should parse multiple exercises', () => {
		const source = '---\n- [ ] Bench Press\n  - [ ] | Weight: [100] kg\n- [ ] Squats\n  - [ ] | Weight: [150] kg';
		const result = parseWorkout(source);
		
		expect(result.exercises).toHaveLength(2);
		expect(result.exercises[0].name).toBe('Bench Press');
		expect(result.exercises[1].name).toBe('Squats');
	});

	it('should convert exercise params to first set if no sets defined', () => {
		const source = '---\n- [ ] Running | Duration: 30m';
		const result = parseWorkout(source);
		
		expect(result.exercises[0].params).toHaveLength(0);
		expect(result.exercises[0].sets).toHaveLength(1);
		expect(result.exercises[0].sets[0].params).toHaveLength(1);
		expect(result.exercises[0].sets[0].params[0].key).toBe('Duration');
	});

	it('should handle exercise with params followed by sets', () => {
		const source = '---\n- [ ] Bench\n  - [ ] | Weight: [100] kg\n  - [ ] | Weight: [110] kg';
		const result = parseWorkout(source);
		
		// Exercise params should be empty, sets should have params
		expect(result.exercises[0].params).toHaveLength(0);
		expect(result.exercises[0].sets).toHaveLength(2);
	});

	it('should skip empty lines', () => {
		const source = '---\n\n- [ ] Exercise\n\n  - [ ] | Weight: [50] kg\n\n';
		const result = parseWorkout(source);
		
		expect(result.exercises).toHaveLength(1);
		expect(result.exercises[0].sets).toHaveLength(1);
	});

	it('should parse sets with indentation', () => {
		const source = '---\n- [ ] Deadlift\n  - [x] | Weight: 200 kg\n    - this should be ignored (too much indent)\n  - [ ] | Weight: 210 kg';
		const result = parseWorkout(source);
		
		expect(result.exercises[0].sets).toHaveLength(2);
	});

	it('should parse exercise in different states', () => {
		const source = '---\n- [ ] Pending\n  - [ ] | Weight: [50] kg\n- [x] Completed\n  - [x] | Weight: [50] kg\n- [\\] InProgress\n  - [\\] | Weight: [50] kg\n- [-] Skipped\n  - [-] | Weight: [50] kg';
		const result = parseWorkout(source);
		
		expect(result.exercises).toHaveLength(4);
		expect(result.exercises[0].state).toBe('pending');
		expect(result.exercises[1].state).toBe('completed');
		expect(result.exercises[2].state).toBe('inProgress');
		expect(result.exercises[3].state).toBe('skipped');
	});

	it('should preserve metadata and exercise separation', () => {
		const source = 'title: My Workout\nstate: started\n---\n- [ ] Exercise';
		const result = parseWorkout(source);
		
		expect(result.metadataEndIndex).toBe(2);
		expect(result.metadata.title).toBe('My Workout');
		expect(result.exercises).toHaveLength(1);
	});

	it('should handle no separator', () => {
		const source = 'title: My Workout\n- [ ] Exercise';
		const result = parseWorkout(source);
		
		expect(result.metadataEndIndex).toBe(-1);
		// When there's no separator, all lines are treated as exercises
		expect(result.metadata.title).toBeUndefined(); // title line is not metadata without separator
		expect(result.exercises).toHaveLength(1); // The "- [ ] Exercise" line is parsed
	});

	it('should store rawLines', () => {
		const source = 'title: Test\n---\n- [ ] Ex';
		const result = parseWorkout(source);
		
		expect(result.rawLines).toBeDefined();
		expect(result.rawLines.length).toBe(3);
	});

	it('should handle complex workout with all features', () => {
		const source = 'title: Full Body\nstate: started\nrestDuration: 60s\n---\n- [ ] Bench Press | Weight: [100] kg\n  - [x] | Weight: 100 kg | Reps: 8\n  - [ ] | Weight: [105] kg | Reps: [6]\n- [\\] Squats | Reps: [10]\n  - [x] | Weight: 100 kg | Reps: 10\n  - [\\] | Weight: [120] kg | Reps: [8]';
		const result = parseWorkout(source);
		
		expect(result.metadata.title).toBe('Full Body');
		expect(result.metadata.state).toBe('started');
		expect(result.metadata.restDuration).toBe(60);
		expect(result.exercises).toHaveLength(2);
		expect(result.exercises[0].name).toBe('Bench Press');
		expect(result.exercises[0].sets).toHaveLength(2);
		expect(result.exercises[1].name).toBe('Squats');
		expect(result.exercises[1].sets).toHaveLength(2);
	});

	it('should handle exercises where first set gets params', () => {
		const source = '---\n- [ ] Running | Duration: [600]';
		const result = parseWorkout(source);
		
		// When there are params on exercise with no explicit sets,
		// those params should move to the first set
		expect(result.exercises[0].params).toHaveLength(0);
		expect(result.exercises[0].sets).toHaveLength(1);
		expect(result.exercises[0].sets[0].params).toHaveLength(1);
		expect(result.exercises[0].sets[0].params[0].key).toBe('Duration');
		expect(result.exercises[0].sets[0].params[0].value).toBe('600');
	});

	it('should handle multiple exercises where middle one has no sets', () => {
		const source = '---\n- [ ] Ex1\n  - [ ] | Weight: [50] kg\n- [ ] Ex2 | Weight: [60] kg\n- [ ] Ex3\n  - [ ] | Weight: [70] kg';
		const result = parseWorkout(source);
		
		expect(result.exercises).toHaveLength(3);
		expect(result.exercises[1].params).toHaveLength(0);
		expect(result.exercises[1].sets).toHaveLength(1);
		expect(result.exercises[1].sets[0].params[0].value).toBe('60');
	});

	it('should parse exercises with targetDuration', () => {
		const source = '---\n- [ ] Cardio | Duration: [60]';
		const result = parseWorkout(source);
		
		expect(result.exercises[0].targetDuration).toBe(60);
	});

	it('should parse exercises with recordedDuration', () => {
		const source = '---\n- [x] Cardio | Duration: 65s';
		const result = parseWorkout(source);
		
		// Duration params (locked or editable) are parsed as targetDuration in seconds
		expect(result.exercises[0].targetDuration).toBe(65);
	});

	it('should handle tabs and spaces for indentation', () => {
		const source = '---\n- [ ] Exercise\n\t- [ ] | Weight: [50] kg';
		const result = parseWorkout(source);
		
		expect(result.exercises[0].sets).toHaveLength(1);
	});

	it('should preserve line indices', () => {
		const source = '---\n- [ ] Ex1\n  - [ ] | W: [50] kg\n- [ ] Ex2';
		const result = parseWorkout(source);
		
		// Line indices are relative to the start of exercise lines
		expect(result.exercises[0].lineIndex).toBe(0);
		expect(result.exercises[1].lineIndex).toBe(2);
	});
});
