import { parseMetadata, serializeMetadata } from './metadata';
import { WorkoutState } from '../types';

describe('parseMetadata', () => {
	it('should parse empty metadata', () => {
		const result = parseMetadata([]);
		expect(result.state).toBe('planned');
		expect(result.title).toBeUndefined();
	});

	it('should parse title', () => {
		const lines = ['title: Full Body Workout'];
		const result = parseMetadata(lines);
		
		expect(result.title).toBe('Full Body Workout');
	});

	it('should parse state - planned', () => {
		const lines = ['state: planned'];
		const result = parseMetadata(lines);
		
		expect(result.state).toBe('planned');
	});

	it('should parse state - started', () => {
		const lines = ['state: started'];
		const result = parseMetadata(lines);
		
		expect(result.state).toBe('started');
	});

	it('should parse state - completed', () => {
		const lines = ['state: completed'];
		const result = parseMetadata(lines);
		
		expect(result.state).toBe('completed');
	});

	it('should ignore invalid state and use default', () => {
		const lines = ['state: invalid'];
		const result = parseMetadata(lines);
		
		expect(result.state).toBe('planned');
	});

	it('should parse startDate', () => {
		const lines = ['startDate: 2026-01-08 15:45'];
		const result = parseMetadata(lines);
		
		expect(result.startDate).toBe('2026-01-08 15:45');
	});

	it('should parse duration', () => {
		const lines = ['duration: 45m 30s'];
		const result = parseMetadata(lines);
		
		expect(result.duration).toBe('45m 30s');
	});

	it('should parse restDuration in seconds', () => {
		const lines = ['restDuration: 60s'];
		const result = parseMetadata(lines);
		
		expect(result.restDuration).toBe(60);
	});

	it('should parse restDuration in MM:SS format', () => {
		const lines = ['restDuration: 1:30'];
		const result = parseMetadata(lines);
		
		expect(result.restDuration).toBe(90);
	});

	it('should parse saveToProperties as true', () => {
		const lines = ['saveToProperties: true'];
		const result = parseMetadata(lines);
		
		expect(result.saveToProperties).toBe(true);
	});

	it('should parse saveToProperties as false', () => {
		const lines = ['saveToProperties: false'];
		const result = parseMetadata(lines);
		
		expect(result.saveToProperties).toBe(false);
	});

	it('should handle multiple metadata fields', () => {
		const lines = [
			'title: Full Body',
			'state: started',
			'startDate: 2026-01-08',
			'duration: 30m',
			'restDuration: 90s',
			'saveToProperties: true'
		];
		const result = parseMetadata(lines);
		
		expect(result.title).toBe('Full Body');
		expect(result.state).toBe('started');
		expect(result.startDate).toBe('2026-01-08');
		expect(result.duration).toBe('30m');
		expect(result.restDuration).toBe(90);
		expect(result.saveToProperties).toBe(true);
	});

	it('should ignore lines without colons', () => {
		const lines = ['invalid line', 'title: My Workout'];
		const result = parseMetadata(lines);
		
		expect(result.title).toBe('My Workout');
	});

	it('should ignore empty values', () => {
		const lines = ['title: ', 'startDate: 2026-01-08'];
		const result = parseMetadata(lines);
		
		expect(result.title).toBeUndefined();
		expect(result.startDate).toBe('2026-01-08');
	});

	it('should be case-insensitive for keys', () => {
		const lines = ['TITLE: My Workout', 'STATE: completed', 'RestDuration: 120s'];
		const result = parseMetadata(lines);
		
		expect(result.title).toBe('My Workout');
		expect(result.state).toBe('completed');
		expect(result.restDuration).toBe(120);
	});

	it('should ignore invalid restDuration', () => {
		const lines = ['restDuration: invalid'];
		const result = parseMetadata(lines);
		
		expect(result.restDuration).toBeUndefined();
	});

	it('should trim whitespace from fields', () => {
		const lines = ['  title  :  My Workout  ', '  state  :  started  '];
		const result = parseMetadata(lines);
		
		expect(result.title).toBe('My Workout');
		expect(result.state).toBe('started');
	});
});

describe('serializeMetadata', () => {
	it('should serialize with only state (minimal)', () => {
		const metadata = { state: 'planned' as WorkoutState };
		const result = serializeMetadata(metadata);
		
		expect(result).toContain('state: planned');
		expect(result.length).toBe(1);
	});

	it('should serialize title', () => {
		const metadata = {
			state: 'planned' as WorkoutState,
			title: 'Full Body Workout'
		};
		const result = serializeMetadata(metadata);
		
		expect(result).toContain('title: Full Body Workout');
		expect(result).toContain('state: planned');
	});

	it('should serialize startDate', () => {
		const metadata = {
			state: 'started' as WorkoutState,
			startDate: '2026-01-08 15:45'
		};
		const result = serializeMetadata(metadata);
		
		expect(result).toContain('startDate: 2026-01-08 15:45');
	});

	it('should serialize duration', () => {
		const metadata = {
			state: 'completed' as WorkoutState,
			duration: '45m 30s'
		};
		const result = serializeMetadata(metadata);
		
		expect(result).toContain('duration: 45m 30s');
	});

	it('should serialize restDuration as human readable', () => {
		const metadata = {
			state: 'planned' as WorkoutState,
			restDuration: 90
		};
		const result = serializeMetadata(metadata);
		
		expect(result).toContain('restDuration: 1m 30s');
	});

	it('should serialize saveToProperties', () => {
		const metadata = {
			state: 'planned' as WorkoutState,
			saveToProperties: true
		};
		const result = serializeMetadata(metadata);
		
		expect(result).toContain('saveToProperties: true');
	});

	it('should serialize all fields', () => {
		const metadata = {
			state: 'completed' as WorkoutState,
			title: 'Full Body',
			startDate: '2026-01-08',
			duration: '30m',
			restDuration: 120,
			saveToProperties: true
		};
		const result = serializeMetadata(metadata);
		
		expect(result).toContain('title: Full Body');
		expect(result).toContain('state: completed');
		expect(result).toContain('startDate: 2026-01-08');
		expect(result).toContain('duration: 30m');
		expect(result).toContain('restDuration: 2m');
		expect(result).toContain('saveToProperties: true');
	});

	it('should serialize saveToProperties as false', () => {
		const metadata = {
			state: 'planned' as WorkoutState,
			saveToProperties: false
		};
		const result = serializeMetadata(metadata);
		
		expect(result).toContain('saveToProperties: false');
	});

	it('should roundtrip parse and serialize', () => {
		const lines = [
			'title: Test Workout',
			'state: completed',
			'startDate: 2026-01-08 10:00',
			'duration: 60m',
			'restDuration: 2m 30s'
		];
		const parsed = parseMetadata(lines);
		const serialized = serializeMetadata(parsed);
		const reparsed = parseMetadata(serialized);
		
		expect(reparsed.title).toBe(parsed.title);
		expect(reparsed.state).toBe(parsed.state);
		expect(reparsed.startDate).toBe(parsed.startDate);
		expect(reparsed.duration).toBe(parsed.duration);
		expect(reparsed.restDuration).toBe(parsed.restDuration);
	});
});
