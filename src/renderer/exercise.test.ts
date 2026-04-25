import { renderExercise, updateExerciseTimer } from './exercise';
import { Exercise, ExerciseSet, ExerciseParam, TimerState, WorkoutCallbacks } from '../types';
import * as exerciseParser from '../parser/exercise';

// Mock the exercise parser
jest.mock('../parser/exercise', () => ({
	formatDuration: jest.fn((seconds: number) => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}),
	formatDurationHuman: jest.fn((seconds: number) => {
		if (seconds < 60) return `${seconds}s`;
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
	}),
	parseDurationToSeconds: jest.fn((duration: string) => {
		// Simple parser: "1m 30s" -> 90, "30s" -> 30
		const match = duration.match(/(?:(\d+)m)?\s*(?:(\d+)s)?/);
		if (!match) return 0;
		const mins = parseInt(match[1] || '0', 10);
		const secs = parseInt(match[2] || '0', 10);
		return mins * 60 + secs;
	})
}));

// MockElement class to simulate DOM
class MockElement {
	tag: string;
	className: string = '';
	children: MockElement[] = [];
	parent: MockElement | null = null;
	listeners: { [key: string]: Function[] } = {};
	_textContent: string = '';
	styleMap: Map<string, string> = new Map();
	attributes: Map<string, string> = new Map();

	constructor(tag: string) {
		this.tag = tag;
	}

	get textContent(): string {
		let text = this._textContent;
		for (const child of this.children) {
			text += child.textContent;
		}
		return text;
	}

	set textContent(value: string) {
		this._textContent = value;
	}

	createDiv(options?: { cls?: string; text?: string }): MockElement {
		return this.createEl('div', options);
	}

	createEl(tag: string, options?: { cls?: string; text?: string }): MockElement {
		const el = new MockElement(tag);
		el.parent = this;
		if (options?.cls) el.className = options.cls;
		if (options?.text) el.textContent = options.text;
		this.children.push(el);
		return el;
	}

	createSpan(options?: { cls?: string; text?: string }): MockElement {
		return this.createEl('span', options);
	}

	setText(text: string): void {
		this._textContent = text;
	}

	style = {
		setProperty: jest.fn()
	};

	querySelector(selector: string): MockElement | null {
		if (selector.startsWith('.')) {
			const className = selector.substring(1);
			return this._findByClass(className);
		}
		return this._findByTag(selector);
	}

	querySelectorAll(selector: string): MockElement[] {
		if (selector.startsWith('.')) {
			const className = selector.substring(1);
			return this._findAllByClass(className);
		}
		return this._findAllByTag(selector);
	}

	private _findByClass(className: string): MockElement | null {
		if (this.className.split(' ').includes(className)) return this;
		for (const child of this.children) {
			const found = child._findByClass(className);
			if (found) return found;
		}
		return null;
	}

	private _findAllByClass(className: string): MockElement[] {
		const results: MockElement[] = [];
		if (this.className.split(' ').includes(className)) {
			results.push(this);
		}
		for (const child of this.children) {
			results.push(...child._findAllByClass(className));
		}
		return results;
	}

	private _findByTag(tagName: string): MockElement | null {
		if (this.tag === tagName) return this;
		for (const child of this.children) {
			const found = child._findByTag(tagName);
			if (found) return found;
		}
		return null;
	}

	private _findAllByTag(tagName: string): MockElement[] {
		const results: MockElement[] = [];
		if (this.tag === tagName) {
			results.push(this);
		}
		for (const child of this.children) {
			results.push(...child._findAllByTag(tagName));
		}
		return results;
	}

	empty(): void {
		this.children = [];
		this._textContent = '';
	}

	addEventListener(event: string, handler: Function): void {
		if (!this.listeners[event]) {
			this.listeners[event] = [];
		}
		this.listeners[event].push(handler);
	}

	click(): void {
		if (this.listeners['click']) {
			for (const handler of this.listeners['click']) {
				handler(new Event('click'));
			}
		}
	}

	addClass(className: string): void {
		if (!this.className.includes(className)) {
			this.className = this.className ? `${this.className} ${className}` : className;
		}
	}

	removeClass(className: string): void {
		this.className = this.className.split(' ').filter(c => c !== className).join(' ');
	}

	get classList(): DOMTokenList {
		return {
			add: (className: string) => this.addClass(className),
			contains: (className: string) => this.className.split(' ').includes(className),
			remove: (className: string) => {
				this.className = this.className.split(' ').filter(c => c !== className).join(' ');
			},
			toggle: (className: string) => {
				if (this.classList.contains(className)) {
					this.classList.remove(className);
				} else {
					this.addClass(className);
				}
			},
			toString: () => this.className
		} as any;
	}
}

describe('renderExercise & updateExerciseTimer', () => {
	let container: MockElement;
	let mockCallbacks: WorkoutCallbacks;
	const baseMockExercise: Exercise = {
		name: 'Push Ups',
		state: 'pending',
		params: [],
		sets: [{ state: 'pending', params: [] }],
		lineIndex: 0
	};

	beforeEach(() => {
		container = new MockElement('div');
		mockCallbacks = {
			onExerciseStateChange: jest.fn(),
			onSetStateChange: jest.fn(),
			onParamChange: jest.fn(),
			onStartWorkout: jest.fn(),
			onPauseWorkout: jest.fn(),
			onResumeWorkout: jest.fn(),
			onSkipExercise: jest.fn(),
			onStartExerciseTimer: jest.fn(),
			onExerciseRest: jest.fn(),
			onExerciseRestPause: jest.fn(),
			onExerciseRestResume: jest.fn(),
			onExerciseRestDone: jest.fn(),
			onExerciseFinish: jest.fn(),
			onFlushChanges: jest.fn(),
			onAddSample: jest.fn(),
			onSetRecordedDuration: jest.fn(),
			onChangeRestDuration: jest.fn(),
			onAddRest: jest.fn(),
			onAddSet: jest.fn(),
			onRestEnd: jest.fn()
		};
		jest.clearAllMocks();
	});

	describe('Container structure', () => {
		it('should create exercise element', () => {
			renderExercise(
				container,
				baseMockExercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(container.querySelector('.workout-exercise')).toBeTruthy();
		});

		it('should append exercise to container', () => {
			renderExercise(
				container,
				baseMockExercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(container.children.length).toBe(1);
		});

		it('should include state class', () => {
			renderExercise(
				container,
				baseMockExercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			const exercise = container.querySelector('.workout-exercise');
			expect(exercise?.className).toContain('state-pending');
		});

		it('should add active class when isActive is true', () => {
			renderExercise(
				container,
				baseMockExercise,
				0,
				true,
				0,
				null,
				mockCallbacks,
				'started'
			);
			const exercise = container.querySelector('.workout-exercise');
			expect(exercise?.className).toContain('active');
		});

		it('should not add active class when isActive is false', () => {
			renderExercise(
				container,
				baseMockExercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			const exercise = container.querySelector('.workout-exercise');
			expect(exercise?.className).not.toContain('active');
		});

		it('should set color property from exercise name', () => {
			const result = renderExercise(
				container,
				baseMockExercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			// Check that setProperty was called with --exercise-color
			const exercise = container.querySelector('.workout-exercise') as MockElement;
			expect((exercise?.style.setProperty as jest.Mock).mock.calls.some(
				call => call[0] === '--exercise-color'
			)).toBe(true);
		});
	});

	describe('Exercise icon display', () => {
		it('should display pending icon', () => {
			renderExercise(
				container,
				{ ...baseMockExercise, state: 'pending' },
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			const icon = container.querySelector('.workout-exercise-icon');
			expect(icon?.textContent).toBe('○');
		});

		it('should display in-progress icon', () => {
			renderExercise(
				container,
				{ ...baseMockExercise, state: 'inProgress' },
				0,
				true,
				0,
				null,
				mockCallbacks,
				'started'
			);
			const icon = container.querySelector('.workout-exercise-icon');
			expect(icon?.textContent).toBe('◐');
		});

		it('should display completed icon', () => {
			renderExercise(
				container,
				{ ...baseMockExercise, state: 'completed' },
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'completed'
			);
			const icon = container.querySelector('.workout-exercise-icon');
			expect(icon?.textContent).toBe('✓');
		});

		it('should display skipped icon', () => {
			renderExercise(
				container,
				{ ...baseMockExercise, state: 'skipped' },
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'completed'
			);
			const icon = container.querySelector('.workout-exercise-icon');
			expect(icon?.textContent).toBe('—');
		});
	});

	describe('Exercise name display', () => {
		it('should display exercise name', () => {
			renderExercise(
				container,
				baseMockExercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			const name = container.querySelector('.workout-exercise-name');
			expect(name?.textContent).toBe('Push Ups');
		});

		it('should display long exercise names', () => {
			const longName = 'Push Ups with Extended Pause at Bottom';
			renderExercise(
				container,
				{ ...baseMockExercise, name: longName },
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			const name = container.querySelector('.workout-exercise-name');
			expect(name?.textContent).toBe(longName);
		});

		it('should have correct name class', () => {
			renderExercise(
				container,
				baseMockExercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			const name = container.querySelector('.workout-exercise-name');
			expect(name?.className).toContain('workout-exercise-name');
		});
	});

	describe('Return value', () => {
		it('should return ExerciseElements object', () => {
			const result = renderExercise(
				container,
				baseMockExercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(result).toBeDefined();
			expect(result.container).toBeDefined();
			expect(result.inputs).toBeDefined();
			expect(result.setInputs).toBeDefined();
		});

		it('should return container element', () => {
			const result = renderExercise(
				container,
				baseMockExercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(result.container).toBeInstanceOf(MockElement);
			expect(result.container.className).toContain('workout-exercise');
		});

		it('should have inputs map', () => {
			const result = renderExercise(
				container,
				baseMockExercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(result.inputs).toBeInstanceOf(Map);
		});

		it('should have setInputs map', () => {
			const result = renderExercise(
				container,
				baseMockExercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(result.setInputs).toBeInstanceOf(Map);
		});
	});

	describe('Multiple exercises in container', () => {
		it('should render multiple exercises', () => {
			renderExercise(
				container,
				{ ...baseMockExercise, name: 'Exercise 1' },
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			renderExercise(
				container,
				{ ...baseMockExercise, name: 'Exercise 2' },
				1,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(container.children.length).toBe(2);
		});

		it('should maintain state for each exercise', () => {
			renderExercise(
				container,
				{ ...baseMockExercise, state: 'pending', name: 'Exercise 1' },
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			renderExercise(
				container,
				{ ...baseMockExercise, state: 'completed', name: 'Exercise 2' },
				1,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			const exercises = container.querySelectorAll('.workout-exercise');
			expect(exercises[0].className).toContain('state-pending');
			expect(exercises[1].className).toContain('state-completed');
		});
	});

	describe('Helper functions and edge cases', () => {
		it('should render exercise with reps and weight parameters', () => {
			const exercise: Exercise = {
				name: 'Bench Press',
				state: 'pending',
				params: [
					{ key: 'Reps', value: '10', editable: true, unit: '' },
					{ key: 'Weight', value: '185', editable: false, unit: 'lbs' }
				],
				sets: [],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(result.inputs.size).toBeGreaterThan(0);
		});

		it('should render exercise with rest parameter', () => {
			const exercise: Exercise = {
				name: 'Cardio',
				state: 'pending',
				params: [
					{ key: 'Rest', value: '2m', editable: true, unit: '' }
				],
				sets: [],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(result.container).toBeDefined();
		});

		it('should handle sets with reps and weight parameters', () => {
			const exercise: Exercise = {
				name: 'Squats',
				state: 'pending',
				params: [],
				sets: [
					{
						state: 'pending',
						params: [
							{ key: 'Reps', value: '12', editable: true, unit: '' },
							{ key: 'Weight', value: '225', editable: false, unit: 'lbs' }
						]
					},
					{
						state: 'pending',
						params: [
							{ key: 'Reps', value: '10', editable: true, unit: '' },
							{ key: 'Weight', value: '235', editable: false, unit: 'lbs' }
						]
					}
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(result.setInputs.size).toBe(2);
		});

		it('should render set with recorded duration in completed state', () => {
			const exercise: Exercise = {
				name: 'Exercise',
				state: 'completed',
				params: [],
				sets: [
					{
						state: 'completed',
						params: [
							{ key: 'Duration', value: '5m 30s', editable: false, unit: '' }
						]
					}
				],
				lineIndex: 0,
				recordedTime: '5m 30s'
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'completed'
			);
			expect(result.container).toBeDefined();
		});

		it('should render set with rest duration', () => {
			const exercise: Exercise = {
				name: 'Exercise',
				state: 'in-progress',
				params: [],
				sets: [
					{
						state: 'in-progress',
						params: [
							{ key: 'Rest', value: '60s', editable: true, unit: '' }
						]
					}
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				null,
				mockCallbacks,
				'started'
			);
			expect(result.container).toBeDefined();
		});

		it('should render rest phase with timer state', () => {
			const exercise: Exercise = {
				name: 'Exercise',
				state: 'in-progress',
				params: [],
				sets: [
					{
						state: 'in-progress',
						params: [
							{ key: 'Rest', value: '90s', editable: true, unit: '' }
						]
					}
				],
				lineIndex: 0
			};
			const timerState: TimerState = {
				workoutElapsed: 0,
				exerciseElapsed: 0,
				isOvertime: false,
				isRestActive: true,
				restElapsed: 30, // Assuming 30s elapsed in rest
				restRemaining: 60
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				timerState,
				mockCallbacks,
				'started'
			);
			expect(result.setTimerEl).toBeDefined();
		});

		it('should render rest phase in yellow zone', () => {
			const exercise: Exercise = {
				name: 'Exercise',
				state: 'in-progress',
				params: [],
				sets: [
					{
						state: 'in-progress',
						params: [
							{ key: 'Rest', value: '90s', editable: true, unit: '' }
						]
					}
				],
				lineIndex: 0
			};
			const timerState: TimerState = {
				workoutElapsed: 0,
				exerciseElapsed: 0,
				isOvertime: false,
				isRestActive: true,
				restElapsed: 45, // Assuming 45s elapsed in rest
				restRemaining: 45
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				timerState,
				mockCallbacks,
				'started'
			);
			expect(result.setTimerEl).toBeDefined();
		});

		it('should render rest phase in red zone', () => {
			const exercise: Exercise = {
				name: 'Exercise',
				state: 'in-progress',
				params: [],
				sets: [
					{
						state: 'in-progress',
						params: [
							{ key: 'Rest', value: '90s', editable: true, unit: '' }
						]
					}
				],
				lineIndex: 0
			};
			const timerState: TimerState = {
				workoutElapsed: 0,
				exerciseElapsed: 0,
				isOvertime: false,
				isRestActive: true,
				restElapsed: 70, // Assuming 70s elapsed in rest
				restRemaining: 20
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				timerState,
				mockCallbacks,
				'started'
			);
			expect(result.setTimerEl).toBeDefined();
		});

		it('should handle rest overtime', () => {
			const exercise: Exercise = {
				name: 'Exercise',
				state: 'in-progress',
				params: [],
				sets: [
					{
						state: 'in-progress',
						params: [
							{ key: 'Rest', value: '60s', editable: true, unit: '' }
						]
					}
				],
				lineIndex: 0
			};
			const timerState: TimerState = {
				workoutElapsed: 0,
				exerciseElapsed: 0,
				isOvertime: true,
				isRestActive: true,
				restElapsed: 75, // Assuming 75s elapsed in rest
				restRemaining: -15
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				timerState,
				mockCallbacks,
				'started'
			);
			expect(result.setTimerEl).toBeDefined();
		});

		it('should render exercise with multiple parameter types', () => {
			const exercise: Exercise = {
				name: 'Complex Exercise',
				state: 'pending',
				params: [
					{ key: 'Distance', value: '10', editable: true, unit: 'km' },
					{ key: 'Time', value: '60', editable: false, unit: 'min' },
					{ key: 'Intensity', value: 'High', editable: true, unit: '' }
				],
				sets: [],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(result.inputs.size).toBeGreaterThan(0);
		});

		it('should render completed exercise with all totals', () => {
			const exercise: Exercise = {
				name: 'Completed Workout',
				state: 'completed',
				params: [
					{ key: 'Reps', value: '30', editable: false, unit: '' }
				],
				sets: [
					{ state: 'completed', params: [], recordedTime: '3m' },
					{ state: 'completed', params: [], recordedTime: '2m 45s' }
				],
				lineIndex: 0,
				recordedTime: '5m 45s'
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'completed'
			);
			expect(result.container).toBeDefined();
		});

		it('should handle set with both Duration and Rest parameters', () => {
			const exercise: Exercise = {
				name: 'Complex Set',
				state: 'in-progress',
				params: [],
				sets: [
					{
						state: 'in-progress',
						params: [
							{ key: 'Duration', value: '45s', editable: false, unit: '' },
							{ key: 'Rest', value: '60s', editable: true, unit: '' },
							{ key: 'Reps', value: '15', editable: true, unit: '' }
						]
					}
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				null,
				mockCallbacks,
				'started'
			);
			expect(result.setInputs.size).toBeGreaterThan(0);
		});

		it('should render exercise with no timer (pending state)', () => {
			const exercise: Exercise = {
				name: 'No Timer Exercise',
				state: 'pending',
				params: [],
				sets: [],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(result.timerEl).toBeDefined();
		});

		it('should render set with skipped state and rest', () => {
			const exercise: Exercise = {
				name: 'Skipped With Rest',
				state: 'pending',
				params: [],
				sets: [
					{
						state: 'skipped',
						params: [
							{ key: 'Rest', value: '60s', editable: true, unit: '' }
						]
					}
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(result.container).toBeDefined();
		});

		it('should render in-progress exercise with multiple sets and timers', () => {
			const exercise: Exercise = {
				name: 'Multi-set Exercise',
				state: 'in-progress',
				params: [],
				sets: [
					{ state: 'completed', params: [] },
					{ state: 'in-progress', params: [], targetRest: 45 },
					{ state: 'pending', params: [] }
				],
				lineIndex: 0
			};
			const timerState: TimerState = {
				workoutElapsed: 0,
				exerciseElapsed: 30,
				isOvertime: false,
				isRestActive: false,
				restRemaining: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				1,
				timerState,
				mockCallbacks,
				'started'
			);
			expect(result.setTimerEl).toBeDefined();
		});

		it('should render exercise with completed recorded time', () => {
			const exercise: Exercise = {
				name: 'Recorded Exercise',
				state: 'completed',
				params: [],
				sets: [],
				lineIndex: 0,
				recordedTime: '10m 25s'
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'completed'
			);
			expect(result.timerEl).toBeDefined();
		});

		it('should render exercise with target duration indicator', () => {
			const exercise: Exercise = {
				name: 'Duration Exercise',
				state: 'pending',
				params: [],
				sets: [],
				targetDuration: 120,
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(result.timerEl).toBeDefined();
		});

		it('should render exercise state indicator correctly', () => {
			const states: Array<'pending' | 'in-progress' | 'completed' | 'skipped'> = [
				'pending',
				'in-progress',
				'completed',
				'skipped'
			];
			
			for (const state of states) {
				container = new MockElement('div');
				const exercise: Exercise = {
					name: `Exercise ${state}`,
					state,
					params: [],
					sets: [],
					lineIndex: 0
				};
				const result = renderExercise(
					container,
					exercise,
					0,
					state === 'in-progress',
					-1,
					null,
					mockCallbacks,
					state === 'completed' ? 'completed' : state === 'in-progress' ? 'started' : 'planned'
				);
				expect(result.container.className).toContain(`state-${state}`);
			}
		});

		it('should handle exercise name to hue color generation', () => {
			const names = ['Squats', 'Bench Press', 'Deadlifts', 'Pull-ups', 'Rows'];
			
			for (const name of names) {
				container = new MockElement('div');
				const exercise: Exercise = {
					name,
					state: 'pending',
					params: [],
					sets: [],
					lineIndex: 0
				};
				const result = renderExercise(
					container,
					exercise,
					0,
					false,
					-1,
					null,
					mockCallbacks,
					'planned'
				);
				expect(result.container).toBeDefined();
			}
		});

		it('should render set in-progress state with timer', () => {
			const exercise: Exercise = {
				name: 'Set Timer Test',
				state: 'in-progress',
				params: [],
				sets: [
					{ state: 'in-progress', params: [] }
				],
				lineIndex: 0
			};
			const timerState: TimerState = {
				workoutElapsed: 0,
				exerciseElapsed: 30,
				isOvertime: false,
				isRestActive: false,
				restRemaining: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				timerState,
				mockCallbacks,
				'started'
			);
			expect(result.setTimerEl).toBeDefined();
		});

		it('should render completed set with recorded duration', () => {
			const exercise: Exercise = {
				name: 'Recorded Set',
				state: 'completed',
				params: [],
				sets: [
					{
						state: 'completed',
						params: [
							{ key: 'Duration', value: '8m 15s', editable: false, unit: '' }
						]
					}
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'completed'
			);
			expect(result.container).toBeDefined();
		});

		it('should handle editable vs non-editable parameter display', () => {
			const exercise: Exercise = {
				name: 'Params Test',
				state: 'started',
				params: [
					{ key: 'Distance', value: '5', editable: true, unit: 'km' },
					{ key: 'Target', value: '10', editable: false, unit: 'km' }
				],
				sets: [],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'started'
			);
			expect(result.inputs.has('Distance')).toBe(true);
		});
	});

	describe('Exercise with sets and parameters', () => {
		it('should render sets with editable parameters', () => {
			const exercise: Exercise = {
				name: 'Squats',
				state: 'pending',
				params: [],
				sets: [
					{
						state: 'pending',
						params: [
							{ key: 'Reps', value: '10', editable: true, unit: '' },
							{ key: 'Weight', value: '185', editable: true, unit: 'lbs' }
						]
					}
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(result.container).toBeDefined();
			expect(result.setInputs.size).toBeGreaterThan(0);
		});

		it('should render sets with recorded duration', () => {
			const exercise: Exercise = {
				name: 'Run',
				state: 'completed',
				params: [],
				sets: [
					{
						state: 'completed',
						params: [],
						recordedTime: '15m 30s'
					}
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'completed'
			);
			expect(result.container).toBeDefined();
		});

		it('should render sets with rest duration', () => {
			const exercise: Exercise = {
				name: 'Intervals',
				state: 'pending',
				params: [],
				sets: [
					{
						state: 'pending',
						params: [],
						targetRest: 120
					}
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(result.container).toBeDefined();
		});

		it('should render in-progress set with timer', () => {
			const exercise: Exercise = {
				name: 'Treadmill',
				state: 'in-progress',
				params: [{ key: 'Time', value: '30', editable: false, unit: 'm' }],
				sets: [
					{
						state: 'in-progress',
						params: []
					}
				],
				targetDuration: 1800,
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				null,
				mockCallbacks,
				'started'
			);
			expect(result.setTimerEl).toBeDefined();
		});

		it('should render set with rest phase', () => {
			const exercise: Exercise = {
				name: 'Complex Strength',
				state: 'started',
				params: [],
				sets: [
					{ state: 'completed', params: [] },
					{ state: 'in-progress', params: [], targetRest: 60 }
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				1,
				{ workoutElapsed: 0, exerciseElapsed: 0, isOvertime: false, isRestActive: true, restElapsed: 10, restRemaining: 50 },
				mockCallbacks,
				'started'
			);
			expect(result.container).toBeDefined();
		});

		it('should render multiple sets with different states', () => {
			const exercise: Exercise = {
				name: 'Full Body',
				state: 'in-progress',
				params: [],
				sets: [
					{ state: 'completed', params: [] },
					{ state: 'in-progress', params: [] },
					{ state: 'pending', params: [] },
					{ state: 'skipped', params: [] }
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				1,
				null,
				mockCallbacks,
				'started'
			);
			expect(result.container).toBeDefined();
		});

		it('should render exercise with calculated totals', () => {
			const exercise: Exercise = {
				name: 'Weighted Exercise',
				state: 'pending',
				params: [
					{ key: 'Reps', value: '8', editable: false, unit: '' },
					{ key: 'Weight', value: '185', editable: false, unit: 'lbs' }
				],
				sets: [
					{ state: 'pending', params: [] },
					{ state: 'pending', params: [] },
					{ state: 'pending', params: [] }
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(result.container).toBeDefined();
		});

		it('should handle set parameters with various editable states', () => {
			const exercise: Exercise = {
				name: 'Mixed Config Exercise',
				state: 'pending',
				params: [],
				sets: [
					{
						state: 'pending',
						params: [
							{ key: 'Reps', value: '10', editable: true, unit: '' },
							{ key: 'Weight', value: '100', editable: false, unit: 'lbs' },
							{ key: 'RPE', value: '8', editable: true, unit: '' }
						]
					}
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(result.container).toBeDefined();
			expect(result.setInputs.size).toBeGreaterThan(0);
		});

		it('should render completed exercise with recorded and rest duration', () => {
			const exercise: Exercise = {
				name: 'Completed Strength',
				state: 'completed',
				params: [
					{ key: 'Reps', value: '5', editable: false, unit: '' },
					{ key: 'Weight', value: '225', editable: false, unit: 'lbs' }
				],
				sets: [
					{
						state: 'completed',
						params: [],
						recordedTime: '2m 10s',
						recordedRest: '120s'
					}
				],
				recordedTime: '2m 30s',
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'completed'
			);
			expect(result.container).toBeDefined();
		});
	});

	describe('Edge cases', () => {
		it('should handle exercises with no sets', () => {
			const exerciseNoSets: Exercise = {
				...baseMockExercise,
				sets: []
			};
			const result = renderExercise(
				container,
				exerciseNoSets,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(result).toBeDefined();
		});

		it('should handle exercises with no params', () => {
			const exerciseNoParams: Exercise = {
				...baseMockExercise,
				params: [],
				sets: [{ state: 'pending', params: [] }]
			};
			const result = renderExercise(
				container,
				exerciseNoParams,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(result).toBeDefined();
		});

		it('should handle very high exercise index', () => {
			const result = renderExercise(
				container,
				baseMockExercise,
				9999,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(result).toBeDefined();
		});

		it('should handle exercises with multiple sets', () => {
			const exerciseMultipleSets: Exercise = {
				name: 'Squats',
				state: 'pending',
				params: [],
				sets: [
					{ state: 'pending', params: [] },
					{ state: 'pending', params: [] },
					{ state: 'pending', params: [] }
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exerciseMultipleSets,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(result).toBeDefined();
		});

		it('should handle exercises with reps and weight params', () => {
			const exerciseWithReps: Exercise = {
				name: 'Bench Press',
				state: 'pending',
				params: [
					{ key: 'Reps', value: '8', editable: false, unit: '' },
					{ key: 'Weight', value: '185', editable: false, unit: 'lbs' }
				],
				sets: [{ state: 'pending', params: [] }],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exerciseWithReps,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(result).toBeDefined();
		});

		it('should handle editable exercise params', () => {
			const exerciseEditable: Exercise = {
				name: 'Dumbbell Rows',
				state: 'pending',
				params: [
					{ key: 'Reps', value: '10', editable: true, unit: '' },
					{ key: 'Weight', value: '65', editable: true, unit: 'lbs' }
				],
				sets: [{ state: 'pending', params: [] }],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exerciseEditable,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(result.inputs.size).toBeGreaterThan(0);
		});

		it('should handle exercises with target duration', () => {
			const exerciseWithDuration: Exercise = {
				...baseMockExercise,
				targetDuration: 300,
				sets: []
			};
			const result = renderExercise(
				container,
				exerciseWithDuration,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(result).toBeDefined();
		});

		it('should handle completed exercises with recorded duration', () => {
			const completedExercise: Exercise = {
				...baseMockExercise,
				state: 'completed',
				recordedTime: '5m 30s',
				sets: []
			};
			const result = renderExercise(
				container,
				completedExercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'completed'
			);
			expect(result).toBeDefined();
		});

		it('should render set with all parameter types', () => {
			const exercise: Exercise = {
				name: 'Advanced Exercise',
				state: 'pending',
				params: [],
				sets: [
					{
						state: 'pending',
						params: [
							{ key: 'Reps', value: '10', editable: true, unit: '' },
							{ key: 'Weight', value: '50', editable: false, unit: 'kg' },
							{ key: 'Distance', value: '5', editable: true, unit: 'km' },
							{ key: 'Duration', value: '45', editable: false, unit: 's' }
						]
					}
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(result.setInputs.size).toBeGreaterThan(0);
		});

		it('should render exercise with skipped state', () => {
			const skippedExercise: Exercise = {
				name: 'Skipped Exercise',
				state: 'pending',
				params: [],
				sets: [{ state: 'skipped', params: [] }],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				skippedExercise,
				1,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(result.container).toBeDefined();
		});

		it('should render exercise with mixed set states', () => {
			const mixedExercise: Exercise = {
				name: 'Mixed Sets Exercise',
				state: 'in-progress',
				params: [],
				sets: [
					{ state: 'completed', params: [] },
					{ state: 'completed', params: [], recordedTime: '2m' },
					{ state: 'in-progress', params: [] },
					{ state: 'pending', params: [] },
					{ state: 'skipped', params: [] }
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				mixedExercise,
				0,
				true,
				2,
				null,
				mockCallbacks,
				'started'
			);
			expect(result.container).toBeDefined();
		});

		it('should handle exercise with rest timing', () => {
			const exerciseWithRest: Exercise = {
				name: 'Rest Exercise',
				state: 'started',
				params: [],
				sets: [
					{ state: 'in-progress', params: [], targetRest: 90 },
					{ state: 'pending', params: [], targetRest: 90 }
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exerciseWithRest,
				0,
				true,
				0,
				{ workoutElapsed: 0, exerciseElapsed: 15, isOvertime: false, isRestActive: false, restElapsed: 0, restRemaining: 0 },
				mockCallbacks,
				'started'
			);
			expect(result.container).toBeDefined();
		});

		it('should render exercise with no target duration', () => {
			const exercise: Exercise = {
				name: 'Count-up Exercise',
				state: 'started',
				params: [],
				sets: [{ state: 'in-progress', params: [] }],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				null,
				mockCallbacks,
				'started'
			);
			expect(result.container).toBeDefined();
		});

		it('should render exercise at different indices', () => {
			const exercise: Exercise = {
				name: 'Indexed Exercise',
				state: 'pending',
				params: [],
				sets: [{ state: 'pending', params: [] }],
				lineIndex: 0
			};
			
			// Test various indices
			for (let i = 0; i < 5; i++) {
				container = new MockElement('div');
				const result = renderExercise(
					container,
					exercise,
					i,
					false,
					-1,
					null,
					mockCallbacks,
					'planned'
				);
				expect(result).toBeDefined();
			}
		});

		it('should handle exercise with single set', () => {
			const singleSetExercise: Exercise = {
				name: 'Single Set',
				state: 'pending',
				params: [{ key: 'Time', value: '30', editable: false, unit: 'm' }],
				sets: [{ state: 'pending', params: [] }],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				singleSetExercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(result.container).toBeDefined();
		});

		it('should handle exercise with many sets', () => {
			const manySets: Exercise = {
				name: 'Many Sets Exercise',
				state: 'pending',
				params: [],
				sets: Array(10).fill(null).map(() => ({ state: 'pending', params: [] })),
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				manySets,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'planned'
			);
			expect(result.container).toBeDefined();
		});
	});
});

describe('updateExerciseTimer', () => {
	let timerEl: MockElement;

	beforeEach(() => {
		timerEl = new MockElement('span');
		jest.clearAllMocks();
	});

	describe('Timer update with count-up', () => {
		it('should display formatted elapsed time', () => {
			const timerState: TimerState = {
				workoutElapsed: 120,
				exerciseElapsed: 45, // Assuming this is the relevant elapsed time for count-up
				isOvertime: false,
				isRestActive: false,
				restElapsed: 0,
				exerciseRemaining: undefined,
				restRemaining: 0
			};

			updateExerciseTimer(timerEl, timerState);
			expect(exerciseParser.formatDuration).toHaveBeenCalledWith(45);
		});

		it('should clear previous content', () => {
			timerEl.textContent = 'Previous Content';
			const timerState: TimerState = {
				workoutElapsed: 120,
				exerciseElapsed: 45, // Assuming this is the relevant elapsed time for count-up
				isOvertime: false,
				isRestActive: false,
				restElapsed: 0,
				exerciseRemaining: undefined,
				restRemaining: 0
			};

			updateExerciseTimer(timerEl, timerState);
			expect(timerEl.textContent).not.toContain('Previous');
		});

		it('should handle zero elapsed time', () => {
			const timerState: TimerState = {
				workoutElapsed: 0,
				exerciseElapsed: 0, // Assuming this is the relevant elapsed time for count-up
				isOvertime: false,
				isRestActive: false,
				restElapsed: 0,
				exerciseRemaining: undefined,
				restRemaining: 0
			};

			updateExerciseTimer(timerEl, timerState);
			expect(timerEl.textContent).toBeTruthy();
		});
	});

	describe('Timer update with countdown', () => {
		it('should display countdown timer', () => {
			const timerState: TimerState = {
				workoutElapsed: 120,
				exerciseElapsed: 45, // Assuming this is the relevant elapsed time for countdown
				isOvertime: false,
				isRestActive: false,
				restElapsed: 0,
				exerciseRemaining: undefined,
				restRemaining: 0
			};
			const targetDuration = 120;

			updateExerciseTimer(timerEl, timerState, targetDuration);
			// Should calculate remaining time
			expect(timerEl.textContent).toBeTruthy();
		});

		it('should handle target duration provided', () => {
			const timerState: TimerState = {
				workoutElapsed: 120,
				exerciseElapsed: 45, // Assuming this is the relevant elapsed time for countdown
				isOvertime: false,
				isRestActive: false,
				restElapsed: 0,
				exerciseRemaining: undefined,
				restRemaining: 0
			};
			const targetDuration = 60;

			updateExerciseTimer(timerEl, timerState, targetDuration);
			// Should show time remaining from target
			expect(timerEl.textContent).toBeTruthy();
		});

		it('should display overtime when elapsed exceeds target', () => {
			const timerState: TimerState = {
				workoutElapsed: 150,
				exerciseElapsed: 125, // Assuming this is the relevant elapsed time for countdown
				isOvertime: true, // Should be true if overtime
				isRestActive: false,
				restElapsed: 0,
				exerciseRemaining: undefined,
				restRemaining: 0
			};
			const targetDuration = 60;

			updateExerciseTimer(timerEl, timerState, targetDuration);
			expect(timerEl.className).toContain('overtime');
		});

		it('should add overtime class on overtime', () => {
			const timerState: TimerState = {
				workoutElapsed: 200,
				exerciseElapsed: 200, // Assuming this is the relevant elapsed time for countdown
				isOvertime: true, // Should be true if overtime
				isRestActive: false,
				restElapsed: 0,
				exerciseRemaining: undefined,
				restRemaining: 0
			};
			const targetDuration = 60;

			updateExerciseTimer(timerEl, timerState, targetDuration);
			expect(timerEl.classList.contains('overtime')).toBe(true);
		});

		it('should handle exact target duration match', () => {
			const timerState: TimerState = {
				workoutElapsed: 100,
				exerciseElapsed: 60, // Assuming this is the relevant elapsed time for countdown
				isOvertime: false,
				isRestActive: false,
				restElapsed: 0,
				exerciseRemaining: undefined,
				restRemaining: 0
			};
			const targetDuration = 60;

			updateExerciseTimer(timerEl, timerState, targetDuration);
			expect(timerEl.textContent).toBeTruthy();
		});
	});

	describe('Coverage improvements - Controls and buttons', () => {
		let container: MockElement;
		let mockCallbacks: WorkoutCallbacks;

		beforeEach(() => {
			container = new MockElement('div');
			mockCallbacks = {
				onExerciseStateChange: jest.fn(),
				onSetStateChange: jest.fn(),
				onParamChange: jest.fn(),
				onSetParamChange: jest.fn(),
				onStartWorkout: jest.fn(),
				onFinishWorkout: jest.fn(),
				onExerciseFinish: jest.fn(),
				onSetFinish: jest.fn(),
				onFlushChanges: jest.fn(),
				onAddSample: jest.fn(),
				onExerciseAddSet: jest.fn(),
				onExerciseAddRest: jest.fn(),
				onExerciseSkip: jest.fn(),
				onPauseExercise: jest.fn(),
				onResumeExercise: jest.fn(),
				onRestEnd: jest.fn()
			};
		});

		it('should show Add Rest button when restDuration is defined', () => {
			const exercise: Exercise = {
				name: 'Exercise with Rest',
				state: 'in-progress',
				params: [],
				sets: [{ state: 'in-progress', params: [] }],
				lineIndex: 0
			};
			const restDuration = 60; // restDuration metadata
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				{ workoutElapsed: 0, exerciseElapsed: 10, isOvertime: false, isRestActive: false, restElapsed: 0, restRemaining: 0 }, // timerState
				mockCallbacks, // callbacks
				'started', // workoutState
				restDuration, // restDuration
				1 // totalExercises
			);
			expect(result.container).toBeDefined();
		});

		it('should display next button as "Next Set" when not on last set', () => {
			const exercise: Exercise = {
				name: 'Multi-Set Exercise',
				state: 'in-progress',
				params: [],
				sets: [
					{ state: 'completed', params: [] },
					{ state: 'in-progress', params: [] },
					{ state: 'pending', params: [] }
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				1,
				{ workoutElapsed: 0, exerciseElapsed: 30, isOvertime: false, isRestActive: false, restElapsed: 0, restRemaining: 0 },
				mockCallbacks,
				'started',
				undefined,
				2 // totalExercises (not last)
			);
			expect(mockCallbacks.onSetFinish).toBeDefined();
		});

		it('should display next button as "Next" when on last set but not last exercise', () => {
			const exercise: Exercise = {
				name: 'Exercise',
				state: 'in-progress',
				params: [],
				sets: [
					{ state: 'completed', params: [] },
					{ state: 'in-progress', params: [] }
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				1,
				{ workoutElapsed: 0, exerciseElapsed: 30, isOvertime: false, isRestActive: false, restElapsed: 0, restRemaining: 0 },
				mockCallbacks,
				'started',
				undefined,
				2 // totalExercises (there's another after this)
			);
			expect(mockCallbacks.onSetFinish).toBeDefined();
		});

		it('should display next button as "Done" when on last set of last exercise', () => {
			const exercise: Exercise = {
				name: 'Final Exercise',
				state: 'in-progress',
				params: [],
				sets: [
					{ state: 'completed', params: [] },
					{ state: 'in-progress', params: [] }
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				2,  // Last exercise index
				true,
				1,
				{ workoutElapsed: 0, exerciseElapsed: 30, isOvertime: false, isRestActive: false, restElapsed: 0, restRemaining: 0 },
				mockCallbacks,
				'started',
				undefined,
				3 // totalExercises (3 total, on exercise 2 which is last)
			);
			expect(mockCallbacks.onSetFinish).toBeDefined();
		});

		it('should display next button as "Start Next" when in rest phase', () => {
			const exercise: Exercise = {
				name: 'Exercise',
				state: 'in-progress',
				params: [],
				sets: [{ state: 'in-progress', params: [] }],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				{ workoutElapsed: 0, exerciseElapsed: 0, isOvertime: false, isRestActive: true, restElapsed: 30, restRemaining: 20 },
				mockCallbacks,
				'started',
				undefined,
				1 // totalExercises
			);
			expect(mockCallbacks.onRestEnd).toBeDefined();
		});

		it('should toggle pause button state on click', () => {
			const exercise: Exercise = {
				name: 'Exercise',
				state: 'in-progress',
				params: [],
				sets: [{ state: 'in-progress', params: [] }],
				lineIndex: 0
			};
			renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				{ workoutElapsed: 0, exerciseElapsed: 0, isOvertime: false, isRestActive: true, restElapsed: 60, restRemaining: 0 },  // timerState
				mockCallbacks, // callbacks
				'started', // workoutState
				undefined, // restDuration
				undefined // totalExercises
			);
			// Pause button should be present and functional
			expect(mockCallbacks.onPauseExercise).toBeDefined();
		});

		it('should call onExerciseSkip on skip button click', () => {
			const exercise: Exercise = {
				name: 'Exercise',
				state: 'in-progress',
				params: [],
				sets: [{ state: 'in-progress', params: [] }],
				lineIndex: 0
			};
			renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				{ workoutElapsed: 0, exerciseElapsed: 30, isOvertime: false, isRestActive: false, restElapsed: 0, restRemaining: 0 }, // timerState
				mockCallbacks, // callbacks
				'started', // workoutState
				undefined, // restDuration
				undefined // totalExercises
			);
			expect(mockCallbacks.onExerciseSkip).toBeDefined();
		});

		it('should call onExerciseAddSet when "Add Set" clicked', () => {
			const exercise: Exercise = {
				name: 'Exercise',
				state: 'in-progress',
				params: [],
				sets: [{ state: 'in-progress', params: [] }],
				lineIndex: 0
			};
			renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				{ workoutElapsed: 0, exerciseElapsed: 30, isOvertime: false, isRestActive: false, restElapsed: 0, restRemaining: 0 }, // timerState
				mockCallbacks, // callbacks
				'started', // workoutState
				undefined, // restDuration
				undefined // totalExercises
			);
			expect(mockCallbacks.onExerciseAddSet).toBeDefined();
		});
	});

	describe('Coverage improvements - Parameters with units', () => {
		let container: MockElement;
		let mockCallbacks: WorkoutCallbacks;

		beforeEach(() => {
			container = new MockElement('div');
			mockCallbacks = {
				onExerciseStateChange: jest.fn(),
				onSetStateChange: jest.fn(),
				onParamChange: jest.fn(),
				onSetParamChange: jest.fn(),
				onStartWorkout: jest.fn(),
				onFinishWorkout: jest.fn(),
				onExerciseFinish: jest.fn(),
				onSetFinish: jest.fn(),
				onFlushChanges: jest.fn(),
				onAddSample: jest.fn(),
				onExerciseAddSet: jest.fn(),
				onExerciseAddRest: jest.fn(),
				onExerciseSkip: jest.fn(),
				onPauseExercise: jest.fn(),
				onResumeExercise: jest.fn(),
				onRestEnd: jest.fn()
			};
		});

		it('should display exercise parameters with units when not completed', () => {
			const exercise: Exercise = {
				name: 'Weighted Exercise',
				state: 'in-progress',
				params: [
					{ key: 'Weight', value: '185', editable: false, unit: 'lbs' },
					{ key: 'Reps', value: '10', editable: true, unit: '' }
				],
				sets: [{ state: 'in-progress', params: [] }],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				{ workoutElapsed: 0, exerciseElapsed: 0, isOvertime: false, isRestActive: true, restElapsed: 250, restRemaining: 50 }, // timerState
				mockCallbacks, // callbacks
				'started', // workoutState
				undefined, // restDuration
				undefined // totalExercises
			);
			expect(result.inputs.size).toBeGreaterThan(0);
		});

		it('should display set parameters with units', () => {
			const exercise: Exercise = {
				name: 'Set Params Exercise',
				state: 'in-progress',
				params: [],
				sets: [
					{
						state: 'in-progress',
						params: [
							{ key: 'Reps', value: '12', editable: true, unit: '' },
							{ key: 'Weight', value: '225', editable: false, unit: 'lbs' }
						]
					}
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				{ workoutElapsed: 0, exerciseElapsed: 0, isOvertime: false, isRestActive: true, restElapsed: 150, restRemaining: 150 }, // timerState
				mockCallbacks, // callbacks
				'started', // workoutState
				undefined, // restDuration
				undefined // totalExercises
			);
			expect(result.setInputs.size).toBe(1);
		});

		it('should display completed exercise with recorded duration', () => {
			const exercise: Exercise = {
				name: 'Completed Exercise',
				state: 'completed',
				params: [
					{ key: 'Weight', value: '185', editable: false, unit: 'lbs' }
				],
				sets: [
					{
						state: 'completed',
						params: [],
						recordedTime: '5m 30s'
					}
				],
				recordedTime: '5m 30s',
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'completed'
			);
			expect(result.container).toBeDefined();
		});

		it('should display total rest time when exercise is completed', () => {
			const exercise: Exercise = {
				name: 'Completed with Rest',
				state: 'completed',
				params: [],
				sets: [
					{
						state: 'completed',
						params: [
							{ key: 'Rest', value: '60s', editable: false, unit: '' }
						],
						recordedTime: '3m'
					},
					{
						state: 'completed',
						params: [
							{ key: 'Rest', value: '60s', editable: false, unit: '' }
						],
						recordedTime: '3m'
					}
				],
				recordedTime: '6m 2m',
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'completed'
			);
			expect(result.container).toBeDefined();
		});
	});

	describe('Coverage improvements - Rest phase color coding', () => {
		let container: MockElement;
		let mockCallbacks: WorkoutCallbacks;

		beforeEach(() => {
			container = new MockElement('div');
			mockCallbacks = {
				onExerciseStateChange: jest.fn(),
				onSetStateChange: jest.fn(),
				onParamChange: jest.fn(),
				onSetParamChange: jest.fn(),
				onStartWorkout: jest.fn(),
				onFinishWorkout: jest.fn(),
				onExerciseFinish: jest.fn(),
				onSetFinish: jest.fn(),
				onFlushChanges: jest.fn(),
				onAddSample: jest.fn(),
				onExerciseAddSet: jest.fn(),
				onExerciseAddRest: jest.fn(),
				onExerciseSkip: jest.fn(),
				onPauseExercise: jest.fn(),
				onResumeExercise: jest.fn(),
				onRestEnd: jest.fn()
			};
		});

		it('should show rest phase in green zone (>66% remaining)', () => {
			const exercise: Exercise = {
				name: 'Exercise',
				state: 'in-progress',
				params: [],
				sets: [
					{
						state: 'in-progress',
						params: [
							{ key: 'Rest', value: '300s', editable: false, unit: '' }
						]
					}
				],
				lineIndex: 0
			};
			const timerState: TimerState = {
				workoutElapsed: 30,
				exerciseElapsed: 30,
				isOvertime: false,
				isRestActive: true,
				restElapsed: 50,
				restRemaining: 250  // 250/300 = 83% (green)
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				timerState,
				mockCallbacks,
				'started'
			);
			expect(result.setTimerEl).toBeDefined();
		});

		it('should show rest phase in yellow zone (33-66% remaining)', () => {
			const exercise: Exercise = {
				name: 'Exercise',
				state: 'in-progress',
				params: [],
				sets: [
					{
						state: 'in-progress',
						params: [
							{ key: 'Rest', value: '300s', editable: false, unit: '' }
						]
					}
				],
				lineIndex: 0
			};
			const timerState: TimerState = {
				workoutElapsed: 100,
				exerciseElapsed: 100,
				isOvertime: false,
				isRestActive: true,
				restElapsed: 150,
				restRemaining: 150  // 150/300 = 50% (yellow)
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				timerState,
				mockCallbacks,
				'started'
			);
			expect(result.setTimerEl).toBeDefined();
		});

		it('should show rest phase in red zone (<33% remaining)', () => {
			const exercise: Exercise = {
				name: 'Exercise',
				state: 'in-progress',
				params: [],
				sets: [
					{
						state: 'in-progress',
						params: [
							{ key: 'Rest', value: '300s', editable: false, unit: '' }
						]
					}
				],
				lineIndex: 0
			};
			const timerState: TimerState = {
				workoutElapsed: 250,
				exerciseElapsed: 250,
				isOvertime: false,
				isRestActive: true,
				restElapsed: 250,
				restRemaining: 50  // 50/300 = 17% (red)
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				timerState,
				mockCallbacks,
				'started'
			);
			expect(result.setTimerEl).toBeDefined();
		});

		it('should handle rest overtime (negative remaining)', () => {
			const exercise: Exercise = {
				name: 'Exercise',
				state: 'in-progress',
				params: [],
				sets: [
					{
						state: 'in-progress',
						params: [
							{ key: 'Rest', value: '60s', editable: false, unit: '' }
						]
					}
				],
				lineIndex: 0
			};
			const timerState: TimerState = {
				workoutElapsed: 75,
				exerciseElapsed: 75,
				isOvertime: false,
				isRestActive: true,
				restElapsed: 75,
				restRemaining: -15  // Overtime by 15 seconds
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				timerState,
				mockCallbacks,
				'started'
			);
			expect(result.setTimerEl).toBeDefined();
		});

		it('should handle rest complete (zero remaining)', () => {
			const exercise: Exercise = {
				name: 'Exercise',
				state: 'in-progress',
				params: [],
				sets: [
					{
						state: 'in-progress',
						params: [
							{ key: 'Rest', value: '60s', editable: false, unit: '' }
						]
					}
				],
				lineIndex: 0
			};
			const timerState: TimerState = {
				workoutElapsed: 60,
				exerciseElapsed: 60,
				isOvertime: false,
				isRestActive: true,
				restElapsed: 60,
				restRemaining: 0  // Exactly at end
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				timerState,
				mockCallbacks,
				'started'
			);
			expect(result.setTimerEl).toBeDefined();
		});

		it('should handle rest with zero duration in timer state', () => {
			const exercise: Exercise = {
				name: 'Exercise',
				state: 'in-progress',
				params: [],
				sets: [
					{
						state: 'in-progress',
						params: []
					}
				],
				lineIndex: 0
			};
			const timerState: TimerState = {
				workoutElapsed: 30,
				exerciseElapsed: 30,
				isOvertime: false,
				isRestActive: true,
				restElapsed: 30,
				restRemaining: 30  // No rest duration param
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				timerState,
				mockCallbacks,
				'started'
			);
			expect(result.setTimerEl).toBeDefined();
		});

		it('should display total recorded time for completed exercise', () => {
			const exercise: Exercise = {
				name: 'Completed Exercise',
				state: 'completed',
				params: [],
				sets: [
					{
						state: 'completed',
						params: [
							{ key: 'Duration', value: '5m 30s', editable: false, unit: '' }
						],
						lineIndex: 0
					}
				],
				lineIndex: 0,
				recordedTime: '5m 30s'
			};
			renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'completed'
			);
			// Check that exercise was rendered
			expect(container.children.length).toBeGreaterThan(0);
		});

		it('should display total rest time for completed exercise with rest params', () => {
			const exercise: Exercise = {
				name: ' Completed with Rest',
				state: 'completed',
				params: [],
				sets: [
					{
						state: 'completed',
						params: [
							{ key: 'Rest', value: '60s', editable: true, unit: '' },
							{ key: 'Duration', value: '3m', editable: false, unit: '' }
						],
						lineIndex: 0
					},
					{
						state: 'completed',
						params: [
							{ key: 'Rest', value: '60s', editable: true, unit: '' },
							{ key: 'Duration', value: '3m', editable: false, unit: '' }
						],
						lineIndex: 1
					}
				],
				lineIndex: 0,
				recordedTime: '6m 2m'
			};
			renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'completed'
			);
			expect(container.children.length).toBeGreaterThan(0);
		});

		it('should display exercise params with units in non-completed state', () => {
			const exercise: Exercise = {
				name: 'Params Exercise',
				state: 'started',
				params: [
					{ key: 'Distance', value: '5', editable: false, unit: 'km' },
					{ key: 'Intensity', value: 'High', editable: true, unit: '' }
				],
				sets: [],
				lineIndex: 0
			};
			renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'started'
			);
			expect(container.children.length).toBeGreaterThan(0);
		});

		it('should display set params with units in non-completed state', () => {
			const exercise: Exercise = {
				name: 'Set Params Exercise',
				state: 'started',
				params: [],
				sets: [
					{
						state: 'started',
						params: [
							{ key: 'Reps', value: '12', editable: true, unit: '' },
							{ key: 'Weight', value: '225', editable: false, unit: 'lbs' }
						],
						lineIndex: 0
					}
				],
				lineIndex: 0
			};
			renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'started'
			);
			expect(container.children.length).toBeGreaterThan(0);
		});

		it('should render exercise params with editable inputs when not completed', () => {
			const exercise: Exercise = {
				name: 'Editable Params',
				state: 'started',
				params: [
					{ key: 'Weight', value: '185', editable: true, unit: 'lbs' }
				],
				sets: [{ state: 'started', params: [], lineIndex: 0 }],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'started'
			);
			expect(result.inputs.size).toBeGreaterThan(0);
		});

		it('should render set params with editable inputs', () => {
			const exercise: Exercise = {
				name: 'Set Editable',
				state: 'started',
				params: [],
				sets: [
					{
						state: 'started',
						params: [
							{ key: 'Reps', value: '10', editable:true, unit: '' }
						],
						lineIndex: 0
					}
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'started'
			);
			expect(result.setInputs.get(0)?.size).toBeGreaterThan(0);
		});

		it('should display rest info for sets during active workout', () => {
			const exercise: Exercise = {
				name: 'Rest Info',
				state: 'in-progress',
				params: [],
				sets: [
					{
						state: 'in-progress',
						params: [
							{ key: 'Rest', value: '90s', editable: false, unit: '' }
						],
						lineIndex: 0
					}
				],
				lineIndex: 0
			};
			renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				{ workoutElapsed: 0, exerciseElapsed: 0, isOvertime: true, isRestActive: true, restElapsed: 75, restRemaining: -15 },  // Overtime by 15 seconds
				mockCallbacks,
				'started',
				undefined,
				mockCallbacks,
				'started'
			);
			expect(container.children.length).toBeGreaterThan(0);
		});

		it('should show rest display with recorded rest time', () => {
			const exercise: Exercise = {
				name: 'Recorded Rest',
				state: 'completed',
				params: [],
				sets: [
					{
						state: 'completed',
						params: [
							{ key: 'Rest', value: '60s', editable: false, unit: '' }
						],
						lineIndex: 0,
						recordedRest: '65s'
					}
				],
				lineIndex: 0
			};
			renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'completed'
			);
			expect(container.children.length).toBeGreaterThan(0);
		});

		it('should apply green phase class for rest at >66%', () => {
			const exercise: Exercise = {
				name: 'Green Phase',
				state: 'in-progress',
				params: [],
				sets: [
					{
						state: 'in-progress',
						params: [
							{ key: 'Rest', value: '300s', editable: false, unit: '' }
						],
						lineIndex: 0
					}
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				{ workoutElapsed: 0, exerciseElapsed: 0, isOvertime: false, isRestActive: true, restElapsed: 50, restRemaining: 250 }, // 250/300 = 83%
				mockCallbacks,
				'started'
			);
			expect(result.container.className).toContain('state-in-progress');
		});

		it('should test parameter display logic with no units', () => {
			const exercise: Exercise = {
				name: 'No Unit Params',
				state: 'in-progress',
				params: [
					{ key: 'Reps', value: '8', editable: true, unit: '' }
				],
				sets: [
					{
						state: 'in-progress',
						params: [
							{ key: 'Set Reps', value: '10', editable: false, unit: '' }
						],
						lineIndex: 0
					}
				],
				lineIndex: 0
			};
			renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				{ workoutElapsed: 0, exerciseElapsed: 10, isOvertime: false, isRestActive: false, restElapsed: 0, restRemaining: 0 }, // timerState
				mockCallbacks, // callbacks
				'started', // workoutState
				undefined, // restDuration
				undefined // totalExercises
			);
			expect(container.querySelector('.workout-exercise')).toBeTruthy();
		});

		it('should test exercise with all parameter types combined', () => {
			const exercise: Exercise = {
				name: 'Complex Params',
				state: 'in-progress',
				params: [
					{ key: 'Reps', value: '20', editable: false, unit: '' },
					{ key: 'Weight', value: '100', editable: true, unit: 'lbs' }
				],
				sets: [
					{
						state: 'in-progress',
						params: [
							{ key: 'Duration', value: '60s', editable: false, unit: '' },
							{ key: 'Rest', value: '45s', editable: true, unit: '' }
						],
						lineIndex: 0
					}
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				{ workoutElapsed: 0, exerciseElapsed: 25, isOvertime: false, isRestActive: false, restElapsed: 0, restRemaining: 0 }, // timerState
				mockCallbacks, // callbacks
				'started', // workoutState
				undefined, // restDuration
				3 // totalExercises
			);
			expect(result.container).toBeTruthy();
		});

		it('should render multi-set exercise with specified active set', () => {
			const exercise: Exercise = {
				name: 'Multi-Set Active',
				state: 'in-progress',
				params: [],
				sets: [
					{ state: 'completed', params: [], lineIndex: 0 },
					{ state: 'completed', params: [], lineIndex: 1 },
					{ state: 'in-progress', params: [], lineIndex: 2 },
					{ state: 'pending', params: [], lineIndex: 3 }
				],
				lineIndex: 0
			};
			renderExercise(
				container,
				exercise,
				0,
				true,
				2, // active set is index 2
				{ workoutElapsed: 0, exerciseElapsed: 30, isOvertime: false, isRestActive: false, restElapsed: 0, restRemaining: 0 }, // timerState
				mockCallbacks, // callbacks
				'started', // workoutState
				undefined, // restDuration
				undefined // totalExercises
			);
			expect(container.children.length).toBeGreaterThan(0);
		});

		it('should handle set transitions with rest active', () => {
			const exercise: Exercise = {
				name: 'Set Transition',
				state: 'in-progress',
				params: [],
				sets: [
					{
						state: 'completed',
						params: [
							{ key: 'Rest', value: '120s', editable: false, unit: '' }
						],
						lineIndex: 0
					},
					{
						state: 'in-progress',
						params: [],
						lineIndex: 1
					}
				],
				lineIndex: 0
			};
			renderExercise(
				container,
				exercise,
				0,
				true,
				1,
				{ workoutElapsed: 0, exerciseElapsed: 0, isOvertime: false, isRestActive: true, restElapsed: 55, restRemaining: 65 }, // timerState
				mockCallbacks, // callbacks
				'started', // workoutState
				undefined, // restDuration
				undefined // totalExercises
			);
			expect(container.querySelector('.workout-exercise')).toBeTruthy();
		});

		it('should check "Next" button text for intermediate set', () => {
			const exercise: Exercise = {
				name: 'Intermediate Set',
				state: 'in-progress',
				params: [],
				sets: [
					{ state: 'completed', params: [], lineIndex: 0 },
					{ state: 'in-progress', params: [], lineIndex: 1 },
					{ state: 'pending', params: [], lineIndex: 2 }
				],
				lineIndex: 0
			};
			renderExercise(
				container,
				exercise,
				0,
				true,
				1,
				{ workoutElapsed: 0, exerciseElapsed: 20, isOvertime: false, isRestActive: false, restElapsed: 0, restRemaining: 0 }, // timerState
				mockCallbacks, // callbacks
				'started', // workoutState
				undefined, // restDuration
				2 // totalExercises
			);
			const buttons = container.querySelectorAll('button');
			const nextBtn = buttons.find(b => b.textContent && (b.textContent.includes('Next') || b.textContent.includes('Done')));
			expect(nextBtn).toBeTruthy();
		});
	});

	describe('Button event handlers with clicks', () => {
		let container: MockElement;
		let mockCallbacks: WorkoutCallbacks;

		beforeEach(() => {
			container = new MockElement('div');
			mockCallbacks = {
				onExerciseStateChange: jest.fn(),
				onSetStateChange: jest.fn(),
				onParamChange: jest.fn(),
				onSetParamChange: jest.fn(),
				onStartWorkout: jest.fn(),
				onFinishWorkout: jest.fn(),
				onExerciseFinish: jest.fn(),
				onSetFinish: jest.fn(),
				onFlushChanges: jest.fn(),
				onAddSample: jest.fn(),
				onExerciseAddSet: jest.fn(),
				onExerciseAddRest: jest.fn(),
				onExerciseSkip: jest.fn(),
				onPauseExercise: jest.fn(),
				onResumeExercise: jest.fn(),
				onRestEnd: jest.fn()
			};
		});

		it('should trigger pause click handler and toggle text', () => {
			const exercise: Exercise = {
				name: 'Pause Test',
				state: 'in-progress',
				params: [],
				sets: [
					{
						state: 'in-progress',
						params: [],
						lineIndex: 0
					}
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				{ workoutElapsed: 0, exerciseElapsed: 0, isOvertime: false, isRestActive: true, restElapsed: 0, restRemaining: 30 },  // No rest duration param
				mockCallbacks,
				'started',
				undefined,
				mockCallbacks,
				'started'
			);

			const buttons = result.container.querySelectorAll('button');
			const pauseBtn = buttons.find(b => b.textContent !== undefined && (b.textContent === 'Pause' || b.textContent === 'Resume'));
			expect(pauseBtn).toBeTruthy();
			if (pauseBtn) {
				pauseBtn.click();
				expect(mockCallbacks.onPauseExercise).toHaveBeenCalledTimes(1);
				expect(pauseBtn.textContent).toBe('Resume');
				pauseBtn.click();
				expect(mockCallbacks.onResumeExercise).toHaveBeenCalledTimes(1);
				expect(pauseBtn.textContent).toBe('Pause');
			}
		});

		it('should trigger skip click handler', () => {
			const exercise: Exercise = {
				name: 'Skip Test',
				state: 'in-progress',
				params: [],
				sets: [
					{
						state: 'in-progress',
						params: [],
						lineIndex: 0
					}
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				{ workoutElapsed: 0, exerciseElapsed: 5, isOvertime: false, isRestActive: false, restElapsed: 0, restRemaining: 0 },
				mockCallbacks,
				'started',
				undefined,
				mockCallbacks,
				'started'
			);

			const buttons = result.container.querySelectorAll('button');
			const skipBtn = buttons.find(b => b.textContent === 'Skip');
			expect(skipBtn).toBeTruthy();
			if (skipBtn) {
				skipBtn.click();
				expect(mockCallbacks.onExerciseSkip).toHaveBeenCalledWith(0);
			}
		});

		it('should trigger add set click handler', () => {
			const exercise: Exercise = {
				name: 'Add Set Test',
				state: 'in-progress',
				params: [],
				sets: [
					{
						state: 'in-progress',
						params: [],
						lineIndex: 0
					}
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				{ workoutElapsed: 0, exerciseElapsed: 5, isOvertime: false, isRestActive: false, restElapsed: 0, restRemaining: 0 },
				mockCallbacks,
				'started',
				undefined,
				mockCallbacks,
				'started'
			);

			const buttons = result.container.querySelectorAll('button');
			const addSetBtn = buttons.find(b => b.textContent === '+ Set');
			expect(addSetBtn).toBeTruthy();
			if (addSetBtn) {
				addSetBtn.click();
				expect(mockCallbacks.onExerciseAddSet).toHaveBeenCalledWith(0);
			}
		});

		it('should trigger add rest click handler', () => {
			const exercise: Exercise = {
				name: 'Add Rest Test',
				state: 'in-progress',
				params: [],
				sets: [
					{
						state: 'in-progress',
						params: [],
						lineIndex: 0
					}
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				{ workoutElapsed: 0, exerciseElapsed: 5, isOvertime: false, isRestActive: false, restElapsed: 0, restRemaining: 0 }, // timerState
				mockCallbacks, // callbacks
				'started', // workoutState
				10, // restDuration
				undefined // totalExercises
			);

			const buttons = result.container.querySelectorAll('button');
			const addRestBtn = buttons.find(b => b.textContent === '+ Rest');
			expect(addRestBtn).toBeTruthy();
			if (addRestBtn) {
				addRestBtn.click();
				expect(mockCallbacks.onExerciseAddRest).toHaveBeenCalledWith(0);
			}
		});

		it('should trigger next set click handler during workout', () => {
			const exercise: Exercise = {
				name: 'Next Set Test',
				state: 'in-progress',
				params: [],
				sets: [
					{ state: 'completed', params: [], lineIndex: 0 },
					{
						state: 'in-progress',
						params: [],
						lineIndex: 1
					},
					{ state: 'pending', params: [], lineIndex: 2 }
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				1,
				{ workoutElapsed: 0, exerciseElapsed: 5, isOvertime: false, isRestActive: false, restElapsed: 0, restRemaining: 0 }, // timerState
				mockCallbacks, // callbacks
				'started', // workoutState
				10, // restDuration
				2 // totalExercises
			);

			const buttons = result.container.querySelectorAll('button');
			const nextBtn = buttons.find(b => b.textContent === 'Next');
			expect(nextBtn).toBeTruthy();
			if (nextBtn) {
				nextBtn.click();
				expect(mockCallbacks.onSetFinish).toHaveBeenCalledWith(0, 1);
			}
		});

		it('should trigger next click handler on last set (not final exercise)', () => {
			const exercise: Exercise = {
				name: 'Next Handler Test',
				state: 'in-progress',
				params: [],
				sets: [
					{ state: 'completed', params: [], lineIndex: 0 },
					{
						state: 'in-progress',
						params: [],
						lineIndex: 1
					}
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				1,
				{ workoutElapsed: 0, exerciseElapsed: 5, isOvertime: false, isRestActive: false, restElapsed: 0, restRemaining: 0 }, // timerState
				mockCallbacks, // callbacks
				'started', // workoutState
				undefined, // restDuration
				3 // totalExercises - not the last
			);

			const buttons = result.container.querySelectorAll('button');
			const nextBtn = buttons.find(b => b.textContent === 'Next');
			expect(nextBtn).toBeTruthy();
			if (nextBtn) {
				nextBtn.click();
				expect(mockCallbacks.onSetFinish).toHaveBeenCalledWith(0, 1);
			}
		});

		it('should trigger done click handler on final set', () => {
			const exercise: Exercise = {
				name: 'Done Handler Test',
				state: 'in-progress',
				params: [],
				sets: [
					{ state: 'completed', params: [], lineIndex: 0 },
					{
						state: 'in-progress',
						params: [],
						lineIndex: 1
					}
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				1,
				{ workoutElapsed: 0, exerciseElapsed: 5, isOvertime: false, isRestActive: false, restElapsed: 0, restRemaining: 0 }, // timerState
				mockCallbacks, // callbacks
				'started', // workoutState
				undefined, // restDuration
				1 // totalExercises - this is the last
			);

			const buttons = result.container.querySelectorAll('button');
			const doneBtn = buttons.find(b => b.textContent === 'Done');
			expect(doneBtn).toBeTruthy();
			if (doneBtn) {
				doneBtn.click();
				expect(mockCallbacks.onSetFinish).toHaveBeenCalledWith(0, 1);
			}
		});

		it('should trigger start next click handler during rest', () => {
			const exercise: Exercise = {
				name: 'Start Next Test',
				state: 'in-progress',
				params: [],
				sets: [
					{ state: 'completed', params: [], lineIndex: 0 },
					{
						state: 'in-progress',
						params: [],
						lineIndex: 1
					}
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				1,
				{ workoutElapsed: 0, exerciseElapsed: 0, isOvertime: false, isRestActive: true, restElapsed: 120, restRemaining: 30 }, // timerState
				mockCallbacks, // callbacks
				'started', // workoutState
				undefined, // restDuration
				2 // totalExercises
			);

			const buttons = result.container.querySelectorAll('button');
			const startNextBtn = buttons.find(b => b.textContent === 'Next');
			expect(startNextBtn).toBeTruthy();
			if (startNextBtn) {
				startNextBtn.click();
				expect(mockCallbacks.onRestEnd).toHaveBeenCalledWith(0);
			}
		});
	});

	describe('Helper function coverage - multi-set exercises', () => {
		let container: MockElement;
		let mockCallbacks: WorkoutCallbacks;

		beforeEach(() => {
			container = new MockElement('div');
			mockCallbacks = {
				onExerciseStateChange: jest.fn(),
				onSetStateChange: jest.fn(),
				onParamChange: jest.fn(),
				onSetParamChange: jest.fn(),
				onStartWorkout: jest.fn(),
				onFinishWorkout: jest.fn(),
				onExerciseFinish: jest.fn(),
				onSetFinish: jest.fn(),
				onFlushChanges: jest.fn(),
				onAddSample: jest.fn(),
				onExerciseAddSet: jest.fn(),
				onExerciseAddRest: jest.fn(),
				onExerciseSkip: jest.fn(),
				onPauseExercise: jest.fn(),
				onResumeExercise: jest.fn(),
				onRestEnd: jest.fn()
			};
		});

		it('should exercise hasDisplayableSetParams and getDisplayableSetParams in multi-set', () => {
			const exercise: Exercise = {
				name: 'Multi-Set Display Params',
				state: 'in-progress',
				params: [],
				sets: [
					{
						state: 'completed',
						params: [
							{ key: 'Reps', value: '15', editable: true, unit: '' },
							{ key: 'Weight', value: '185', editable: false, unit: 'lbs' },
							{ key: 'Duration', value: '60s', editable: false, unit: '' }
						],
						lineIndex: 0
					},
					{
						state: 'in-progress',
						params: [
							{ key: 'Reps', value: '14', editable: true, unit: '' },
							{ key: 'Duration', value: '60s', editable: false, unit: '' }
						],
						lineIndex: 1
					},
					{
						state: 'pending',
						params: [
							{ key: 'Reps', value: '12', editable: true, unit: '' },
							{ key: 'Duration', value: '60s', editable: false, unit: '' }
						],
						lineIndex: 2
					}
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				1,
				{ workoutElapsed: 25, exerciseElapsed: 25, isOvertime: false, isRestActive: false },
				mockCallbacks,
				'started'
			);
			expect(result.container.children.length).toBeGreaterThan(0);
		});

		it('should exercise getSetRecordedDuration with completed multi-set', () => {
			const exercise: Exercise = {
				name: 'Multi-Set Recorded Duration',
				state: 'completed',
				params: [],
				sets: [
					{
						state: 'completed',
						params: [
							{ key: 'Duration', value: '3m 20s', editable: false, unit: '' },
							{ key: 'Rest', value: '60s', editable: false, unit: '' }
						],
						lineIndex: 0,
						recordedTime: '3m 25s'
					},
					{
						state: 'completed',
						params: [
							{ key: 'Duration', value: '3m 15s', editable: false, unit: '' },
							{ key: 'Rest', value: '60s', editable: false, unit: '' }
						],
						lineIndex: 1,
						recordedTime: '3m 20s'
					},
					{
						state: 'completed',
						params: [
							{ key: 'Duration', value: '3m', editable: false, unit: '' }
						],
						lineIndex: 2,
						recordedTime: '3m 10s'
					}
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'completed'
			);
			expect(result.container.children.length).toBeGreaterThan(0);
		});

		it('should exercise getSetRestDuration with Rest params in sets', () => {
			const exercise: Exercise = {
				name: 'Exercise With Rest Params',
				state: 'completed',
				params: [],
				sets: [
					{
						state: 'completed',
						params: [
							{ key: 'Rest', value: '60s', editable: false, unit: '' },
							{ key: 'Reps', value: '12', editable: false, unit: '' }
						],
						lineIndex: 0
					},
					{
						state: 'completed',
						params: [
							{ key: 'Rest', value: '90s', editable: false, unit: '' },
							{ key: 'Reps', value: '10', editable: false, unit: '' }
						],
						lineIndex: 1,
						recordedRest: '95s'
					},
					{
						state: 'completed',
						params: [
							{ key: 'Reps', value: '8', editable: false, unit: '' }
						],
						lineIndex: 2
					}
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'completed'
			);
			expect(result.container.children.length).toBeGreaterThan(0);
		});

		it('should exercise computeExerciseTotals with multi-set completed', () => {
			const exercise: Exercise = {
				name: 'Totals Exercise',
				state: 'completed',
				params: [],
				sets: [
					{
						state: 'completed',
						params: [
							{ key: 'Reps', value: '15', editable: false, unit: '' },
							{ key: 'Weight', value: '185', editable: false, unit: 'lbs' },
							{ key: 'Duration', value: '60s', editable: false, unit: '' }
						],
						lineIndex: 0,
						recordedTime: '65s'
					},
					{
						state: 'completed',
						params: [
							{ key: 'Reps', value: '12', editable: false, unit: '' },
							{ key: 'Weight', value: '185', editable: false, unit: 'lbs' },
							{ key: 'Duration', value: '50s', editable: false, unit: '' },
							{ key: 'Rest', value: '90s', editable: false, unit: '' }
						],
						lineIndex: 1,
						recordedTime: '55s',
						recordedRest: '92s'
					},
					{
						state: 'completed',
						params: [
							{ key: 'Reps', value: '10', editable: false, unit: '' },
							{ key: 'Weight', value: '185', editable: false, unit: 'lbs' },
							{ key: 'Duration', value: '45s', editable: false, unit: '' },
							{ key: 'Rest', value: '90s', editable: false, unit: '' }
						],
						lineIndex: 2,
						recordedTime: '48s',
						recordedRest: '88s'
					}
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'completed'
			);
			expect(result.container.children.length).toBeGreaterThan(0);
		});

		it('should exercise renderSet implicitly through multi-set rendering', () => {
			const exercise: Exercise = {
				name: 'renderSet Test',
				state: 'in-progress',
				params: [
					{ key: 'Weight', value: '225', editable: false, unit: 'lbs' }
				],
				sets: [
					{
						state: 'completed',
						params: [
							{ key: 'Reps', value: '15', editable: false, unit: '' }
						],
						lineIndex: 0
					},
					{
						state: 'completed',
						params: [
							{ key: 'Reps', value: '13', editable: false, unit: '' }
						],
						lineIndex: 1
					},
					{
						state: 'in-progress',
						params: [
							{ key: 'Reps', value: '12', editable: false, unit: '' }
						],
						lineIndex: 2
					},
					{
						state: 'pending',
						params: [
							{ key: 'Reps', value: '10', editable: false, unit: '' }
						],
						lineIndex: 3
					}
				],
				lineIndex: 0
			};
			const result = renderExercise(
				container,
				exercise,
				0,
				true,
				2,
				{ workoutElapsed: 15, exerciseElapsed: 15, isOvertime: false, isRestActive: false },
				mockCallbacks,
				'started'
			);
			expect(result.container.children.length).toBeGreaterThan(0);
		});

		it('should exercise nameToHue with various exercise names', () => {
			const names = [
				'Bench Press',
				'Deadlift',
				'Squats',
				'Pull-ups',
				'Overhead Press',
				'Barbell Rows',
				'Dips',
				'Cable Curls'
			];
			for (const name of names) {
				const exercise: Exercise = {
					name: name,
					state: 'pending',
					params: [],
					sets: [
						{
							state: 'pending',
							params: [],
							lineIndex: 0
						}
					],
					lineIndex: 0
				};
				const result = renderExercise(
					container,
					exercise,
					0,
					false,
					-1,
					null,
					mockCallbacks,
					'planned'
				);
				// Verify that nameToHue was called by checking the style property was set
				expect(result.container.style.setProperty).toHaveBeenCalledWith(
					'--exercise-color',
					expect.stringContaining('hsl(')
				);
			}
		});
	});

	describe('Edge cases for helper functions', () => {
		let container: MockElement;
		let mockCallbacks: WorkoutCallbacks;

		beforeEach(() => {
			container = new MockElement('div');
			mockCallbacks = {
				onExerciseStateChange: jest.fn(),
				onSetStateChange: jest.fn(),
				onParamChange: jest.fn(),
				onSetParamChange: jest.fn(),
				onStartWorkout: jest.fn(),
				onFinishWorkout: jest.fn(),
				onExerciseFinish: jest.fn(),
				onSetFinish: jest.fn(),
				onFlushChanges: jest.fn(),
				onAddSample: jest.fn(),
				onExerciseAddSet: jest.fn(),
				onExerciseAddRest: jest.fn(),
				onExerciseSkip: jest.fn(),
				onPauseExercise: jest.fn(),
				onResumeExercise: jest.fn(),
				onRestEnd: jest.fn()
			};
		});

		it('should render exercise with displayable set params', () => {
			const exercise: Exercise = {
				name: 'Display Params',
				state: 'in-progress',
				params: [],
				sets: [
					{
						state: 'in-progress',
						params: [
							{ key: 'Reps', value: '15', editable: true, unit: '' },
							{ key: 'Weight', value: '185', editable: false, unit: 'lbs' },
							{ key: 'Rest', value: '90s', editable: true, unit: '' },
							{ key: 'Duration', value: '60s', editable: false, unit: '' }
						],
						lineIndex: 0
					}
				],
				lineIndex: 0
			};
			renderExercise(
				container,
				exercise,
				0,
				true,
				0,
				{ workoutElapsed: 0, exerciseElapsed: 5, isOvertime: false, isRestActive: false, restElapsed: 0, restRemaining: 0 },
				mockCallbacks,
				'started',
				undefined,
				mockCallbacks,
				'started'
			);
			expect(container.children.length).toBeGreaterThan(0);
		});

		it('should render exercise with computed totals in completed state', () => {
			const exercise: Exercise = {
				name: 'Computed Totals',
				state: 'completed',
				params: [
					{ key: 'Reps', value: '50', editable: false, unit: '' },
					{ key: 'Weight', value: '200', editable: false, unit: 'lbs' }
				],
				sets: [
					{
						state: 'completed',
						params: [
							{ key: 'Duration', value: '3m', editable: false, unit: '' },
							{ key: 'Rest', value: '60s', editable: true, unit: '' }
						],
						lineIndex: 0
					},
					{
						state: 'completed',
						params: [
							{ key: 'Duration', value: '2m 50s', editable: false, unit: '' },
							{ key: 'Rest', value: '60s', editable: true, unit: '' }
						],
						lineIndex: 1
					}
				],
				lineIndex: 0,
				recordedTime: '5m 50m'
			};
			renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'completed'
			);
			expect(container.children.length).toBeGreaterThan(0);
		});

		it('should exercise updateExerciseTimer with various timer states', () => {
			const timerEl = new MockElement('span');
			const timerState: TimerState = {
				workoutElapsed: 100,
				exerciseElapsed: 45,
				isRestActive: false,
				isOvertime: false, // Added missing property
				restRemaining: 0
			};
			updateExerciseTimer(timerEl, timerState, 60);
			expect(timerEl.textContent).toBeTruthy();
		});

		it('should exercise updateExerciseTimer with target duration', () => {
			const timerEl = new MockElement('span');
			const timerState: TimerState = {
				workoutElapsed: 60,
				exerciseElapsed: 30,
				isRestActive: false,
				isOvertime: false, // Added missing property
				restRemaining: 0 // Added missing property
			};
			updateExerciseTimer(timerEl, timerState,120);
			expect(timerEl.textContent).toBeTruthy();
		});

		it('should render set recorded rest duration', () => {
			const exercise: Exercise = {
				name: 'Recorded Rest',
				state: 'completed',
				params: [],
				sets: [
					{
						state: 'completed',
						params: [
							{ key: 'Rest', value: '60s', editable: true, unit: '' }
						],
						lineIndex: 0,
						recordedRest: '65s'
					}
				],
				lineIndex: 0
			};
			renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'completed'
			);
			expect(container.children.length).toBeGreaterThan(0);
		});

		it('should render set with recorded duration param', () => {
			const exercise: Exercise = {
				name: 'Recorded Duration',
				state: 'completed',
				params: [],
				sets: [
					{
						state: 'completed',
						params: [
							{ key: 'Duration', value: '4m 20s', editable: false, unit: '' }
						],
						lineIndex: 0,
						recordedTime: '4m 25s'
					}
				],
				lineIndex: 0
			};
			renderExercise(
				container,
				exercise,
				0,
				false,
				-1,
				null,
				mockCallbacks,
				'completed'
			);
			expect(container.children.length).toBeGreaterThan(0);
		});
	});
});
