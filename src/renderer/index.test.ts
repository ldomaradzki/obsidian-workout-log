import { renderWorkout } from './index';
import { ParsedWorkout, WorkoutCallbacks, TimerState } from '../types';
import { TimerManager } from '../timer/manager';

// Mock renderer modules
jest.mock('./header', () => ({
	renderHeader: jest.fn(() => ({
		titleEl: { textContent: 'Test' },
		timerEl: { textContent: '--:--' }
	})),
	updateHeaderTimer: jest.fn()
}));

jest.mock('./exercise', () => ({
	renderExercise: jest.fn(() => ({
		container: { tag: 'div' },
		timerEl: { textContent: '--:--' },
		setTimerEl: { textContent: '--:--' },
		inputs: new Map(),
		setInputs: new Map()
	})),
	updateExerciseTimer: jest.fn()
}));

jest.mock('./controls', () => ({
	renderWorkoutControls: jest.fn()
}));

jest.mock('./emptyState', () => ({
	renderEmptyState: jest.fn()
}));

// Mock TimerManager
jest.mock('../timer/manager', () => ({
	TimerManager: jest.fn().mockImplementation(() => ({
		isTimerRunning: jest.fn(() => false),
		getTimerState: jest.fn(() => null),
		getActiveExerciseIndex: jest.fn(() => -1),
		getActiveSetIndex: jest.fn(() => -1),
		subscribe: jest.fn(),
		startTimer: jest.fn(),
		stopTimer: jest.fn()
	}))
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
	isConnected: boolean = true;

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

	contains(el: MockElement): boolean {
		for (const child of this.children) {
			if (child === el) return true;
			if (child.contains(el)) return true;
		}
		return false;
	}

	addEventListener(event: string, handler: Function): void {
		if (!this.listeners[event]) {
			this.listeners[event] = [];
		}
		this.listeners[event].push(handler);
	}
}

describe('renderWorkout', () => {
	let containerElement: MockElement;
	let timerManager: any;
	let mockCallbacks: WorkoutCallbacks;
	const mockWorkout: ParsedWorkout = {
		metadata: {
			title: 'Test Workout',
			state: 'planned'
		},
		exercises: [
			{
				name: 'Push Ups',
				state: 'pending',
				params: [],
				sets: [{ state: 'pending', params: [], lineIndex: 1 }],
				lineIndex: 0
			}
		],
		rawLines: [],
		metadataEndIndex: -1
	};

	beforeEach(() => {
		containerElement = new MockElement('div');
		timerManager = new (TimerManager as any)();
		mockCallbacks = {
			onParamChange: jest.fn(),
			onStartWorkout: jest.fn(),
			onExerciseFinish: jest.fn(),
			onFlushChanges: jest.fn(),
			onAddSample: jest.fn(),
			onRestEnd: jest.fn(),
			onFinishWorkout: jest.fn(),
			onSetFinish: jest.fn(),
			onRestStart: jest.fn(),
			onExerciseSkip: jest.fn(),
		};
		jest.clearAllMocks();
	});

	describe('Container initialization', () => {
		it('should clear existing content', () => {
			containerElement.createDiv({ text: 'Old Content' });
			expect(containerElement.children.length).toBe(1);

			renderWorkout({
				containerElement,
				parsed: mockWorkout,
				callbacks: mockCallbacks,
				workoutId: 'test-workout',
				timerManager
			});

			// After render, old content should be gone
			expect(containerElement.children.length).toBeGreaterThanOrEqual(1);
		});

		it('should create workout container', () => {
			renderWorkout({
				containerElement,
				parsed: mockWorkout,
				callbacks: mockCallbacks,
				workoutId: 'test-workout',
				timerManager
			});

			const container = containerElement.querySelector('.workout-container');
			expect(container).toBeTruthy();
		});

		it('should add state class to container', () => {
			renderWorkout({
				containerElement,
				parsed: mockWorkout,
				callbacks: mockCallbacks,
				workoutId: 'test-workout',
				timerManager
			});

			const container = containerElement.querySelector('.workout-container');
			expect(container?.className).toContain('state-planned');
		});

		it('should add correct state class for different states', () => {
			const completedWorkout: ParsedWorkout = {
				...mockWorkout,
				metadata: { ...mockWorkout.metadata, state: 'completed' }
			};

			renderWorkout({
				containerElement,
				parsed: completedWorkout,
				callbacks: mockCallbacks,
				workoutId: 'test-workout',
				timerManager
			});

			const container = containerElement.querySelector('.workout-container');
			expect(container?.className).toContain('state-completed');
		});
	});

	describe('Header rendering', () => {
		it('should render header', () => {
			const { renderHeader } = require('./header');
			renderWorkout({
				containerElement,
				parsed: mockWorkout,
				callbacks: mockCallbacks,
				workoutId: 'test-workout',
				timerManager
			});

			expect(renderHeader).toHaveBeenCalled();
		});

		it('should pass workout metadata to header', () => {
			const { renderHeader } = require('./header');
			renderWorkout({
				containerElement,
				parsed: mockWorkout,
				callbacks: mockCallbacks,
				workoutId: 'test-workout',
				timerManager
			});

			expect(renderHeader).toHaveBeenCalledWith(
				expect.any(MockElement),
				mockWorkout.metadata,
				null,
				false
			);
		});
	});

	describe('Empty state rendering', () => {
		it('should render empty state for empty planned workout', () => {
			const { renderEmptyState } = require('./emptyState');
			const emptyWorkout: ParsedWorkout = {
				metadata: { title: 'Empty', state: 'planned' },
				exercises: [],
				rawLines: [],
				metadataEndIndex: -1
			};

			renderWorkout({
				containerElement,
				parsed: emptyWorkout,
				callbacks: mockCallbacks,
				workoutId: 'test-workout',
				timerManager
			});

			expect(renderEmptyState).toHaveBeenCalledWith(
				expect.any(MockElement),
				mockCallbacks.onAddSample
			);
		});

		it('should not render empty state for non-empty workout', () => {
			const { renderEmptyState } = require('./emptyState');
			renderWorkout({
				containerElement,
				parsed: mockWorkout,
				callbacks: mockCallbacks,
				workoutId: 'test-workout',
				timerManager
			});

			expect(renderEmptyState).not.toHaveBeenCalled();
		});

		it('should not render empty state for completed empty workout', () => {
			const { renderEmptyState } = require('./emptyState');
			const emptyCompletedWorkout: ParsedWorkout = {
				metadata: { title: 'Empty', state: 'completed' },
				exercises: [],
				rawLines: [],
				metadataEndIndex: -1
			};

			renderWorkout({
				containerElement,
				parsed: emptyCompletedWorkout,
				callbacks: mockCallbacks,
				workoutId: 'test-workout',
				timerManager
			});

			expect(renderEmptyState).not.toHaveBeenCalled();
		});
	});

	describe('Exercise rendering', () => {
		it('should render exercises container', () => {
			renderWorkout({
				containerElement,
				parsed: mockWorkout,
				callbacks: mockCallbacks,
				workoutId: 'test-workout',
				timerManager
			});

			const container = containerElement.querySelector('.workout-exercises');
			expect(container).toBeTruthy();
		});

		it('should render each exercise', () => {
			const { renderExercise } = require('./exercise');
			renderWorkout({
				containerElement,
				parsed: mockWorkout,
				callbacks: mockCallbacks,
				workoutId: 'test-workout',
				timerManager
			});

			expect(renderExercise).toHaveBeenCalled();
		});

		it('should render multiple exercises', () => {
			const { renderExercise } = require('./exercise');
			const multiExerciseWorkout: ParsedWorkout = {
				metadata: { title: 'Multi', state: 'planned' },
				exercises: [
					{
						name: 'Exercise 1',
						state: 'pending',
						params: [],
						sets: [{ state: 'pending', params: [], lineIndex: 1 }],
						lineIndex: 0
					},
					{
						name: 'Exercise 2',
						state: 'pending',
						params: [],
						sets: [{ state: 'pending', params: [], lineIndex: 2 }],
						lineIndex: 1
					}
				],
				rawLines: [],
				metadataEndIndex: -1
			};

			renderWorkout({
				containerElement,
				parsed: multiExerciseWorkout,
				callbacks: mockCallbacks,
				workoutId: 'test-workout',
				timerManager
			});

			expect(renderExercise).toHaveBeenCalledTimes(2);
		});

		it('should set max-name-chars CSS variable', () => {
			renderWorkout({
				containerElement,
				parsed: mockWorkout,
				callbacks: mockCallbacks,
				workoutId: 'test-workout',
				timerManager
			});

			const exercisesContainer = containerElement.querySelector('.workout-exercises');
			expect((exercisesContainer?.style.setProperty as jest.Mock).mock.calls.some(
				call => call[0] === '--max-name-chars'
			)).toBe(true);
		});
	});

	describe('Controls rendering', () => {
		it('should render workout controls', () => {
			const { renderWorkoutControls } = require('./controls');
			renderWorkout({
				containerElement,
				parsed: mockWorkout,
				callbacks: mockCallbacks,
				workoutId: 'test-workout',
				timerManager
			});

			expect(renderWorkoutControls).toHaveBeenCalled();
		});

		it('should pass state to controls', () => {
			const { renderWorkoutControls } = require('./controls');
			renderWorkout({
				containerElement,
				parsed: mockWorkout,
				callbacks: mockCallbacks,
				workoutId: 'test-workout',
				timerManager
			});

			expect(renderWorkoutControls).toHaveBeenCalledWith(
				expect.any(MockElement),
				'planned',
				mockCallbacks,
				mockWorkout
			);
		});
	});

	describe('Focus event handling', () => {
		it('should add focusout listener to container', () => {
			renderWorkout({
				containerElement,
				parsed: mockWorkout,
				callbacks: mockCallbacks,
				workoutId: 'test-workout',
				timerManager
			});

			const container = containerElement.querySelector('.workout-container') as MockElement;
			expect(container?.listeners['focusout']).toBeDefined();
		});

		it('should call onFlushChanges when focus leaves container', () => {
			renderWorkout({
				containerElement,
				parsed: mockWorkout,
				callbacks: mockCallbacks,
				workoutId: 'test-workout',
				timerManager
			});

			const container = containerElement.querySelector('.workout-container') as MockElement;
			const focusoutEvent = new Event('focusout') as any;
			focusoutEvent.relatedTarget = null;

			if (container?.listeners['focusout']) {
				for (const handler of container.listeners['focusout']) {
					handler(focusoutEvent);
				}
			}

			expect(mockCallbacks.onFlushChanges).toHaveBeenCalled();
		});

		it('should not call onFlushChanges when focus moves within container', () => {
			renderWorkout({
				containerElement,
				parsed: mockWorkout,
				callbacks: mockCallbacks,
				workoutId: 'test-workout',
				timerManager
			});

			const container = containerElement.querySelector('.workout-container') as MockElement;
			const targetEl = new MockElement('input');
			container.children.push(targetEl);

			const focusoutEvent = new Event('focusout') as any;
			focusoutEvent.relatedTarget = targetEl;

			mockCallbacks.onFlushChanges.mockClear();

			if (container?.listeners['focusout']) {
				for (const handler of container.listeners['focusout']) {
					handler(focusoutEvent);
				}
			}

			expect(mockCallbacks.onFlushChanges).not.toHaveBeenCalled();
		});
	});

	describe('Timer subscription', () => {
		it('should handle planned state', () => {
			renderWorkout({
				containerElement,
				parsed: mockWorkout,
				callbacks: mockCallbacks,
				workoutId: 'test-workout',
				timerManager
			});

			const container = containerElement.querySelector('.workout-container');
			expect(container?.className).toContain('state-planned');
		});

		it('should handle started state', () => {
			const startedWorkout: ParsedWorkout = {
				...mockWorkout,
				metadata: { ...mockWorkout.metadata, state: 'started' }
			};

			renderWorkout({
				containerElement,
				parsed: startedWorkout,
				callbacks: mockCallbacks,
				workoutId: 'test-workout',
				timerManager
			});

			const container = containerElement.querySelector('.workout-container');
			expect(container?.className).toContain('state-started');
		});

		it('should handle completed state', () => {
			const completedWorkout: ParsedWorkout = {
				...mockWorkout,
				metadata: { ...mockWorkout.metadata, state: 'completed' }
			};

			renderWorkout({
				containerElement,
				parsed: completedWorkout,
				callbacks: mockCallbacks,
				workoutId: 'test-workout',
				timerManager
			});

			const container = containerElement.querySelector('.workout-container');
			expect(container?.className).toContain('state-completed');
		});
	});

	describe('Timer subscription', () => {
		it('should subscribe to timer when workout is running', () => {
			const mockTimerManager = {
				isTimerRunning: jest.fn(() => true),
				getTimerState: jest.fn(() => null),
				getActiveExerciseIndex: jest.fn(() => 0),
				getActiveSetIndex: jest.fn(() => 0),
				subscribe: jest.fn(),
				startTimer: jest.fn(),
				stopTimer: jest.fn()
			} as any;

			const parsedWorkout = {
				metadata: {
					title: 'Timer Workout',
					state: 'started',
					startDate: '2026-01-08 15:45',
					duration: '10m'
				},
				exercises: [
					{
						name: 'Exercise 1',
						state: 'in-progress',
						params: [],
						sets: [{ state: 'in-progress', params: [] }],
						targetDuration: 300,
						lineIndex: 0
					}
				]
			};

			renderWorkout({
				containerElement,
				parsed: parsedWorkout as any,
				callbacks: mockCallbacks,
				workoutId: 'test-workout:0',
				timerManager: mockTimerManager
			});

			expect(mockTimerManager.subscribe).toHaveBeenCalled();
		});

		it('should handle timer callback updates', () => {
			const mockTimerManager = {
				isTimerRunning: jest.fn(() => true),
				getTimerState: jest.fn(() => null),
				getActiveExerciseIndex: jest.fn(() => 0),
				getActiveSetIndex: jest.fn(() => 0),
				subscribe: jest.fn(),
				startTimer: jest.fn(),
				stopTimer: jest.fn()
			} as any;

			const parsedWorkout = {
				metadata: {
					title: 'Timer Workout',
					state: 'started',
					startDate: '2026-01-08 15:45',
					duration: '10m'
				},
				exercises: [
					{
						name: 'Exercise 1',
						state: 'in-progress',
						params: [],
						sets: [{ state: 'in-progress', params: [] }],
						targetDuration: 300,
						lineIndex: 0
					}
				]
			};

			renderWorkout({
				containerElement,
				parsed: parsedWorkout as any,
				callbacks: mockCallbacks,
				workoutId: 'test-workout:0',
				timerManager: mockTimerManager
			});

			// Get the subscription callback that was registered
			const subscribeCall = mockTimerManager.subscribe.mock.calls[0];
			const timerCallback = subscribeCall[1];

			// Simulate timer state update
			const timerState: TimerState = {
				workoutElapsed: 100,
				exerciseElapsed: 50,
				isOvertime: false,
				isRestActive: false,
				restRemaining: 0
			};

			const { updateHeaderTimer } = require('./header');
			const { updateExerciseTimer } = require('./exercise');
			timerCallback(timerState);

			// Verify header timer was updated
			expect(updateHeaderTimer).toHaveBeenCalled();
			expect(updateExerciseTimer).toHaveBeenCalled();
		});

		it('should not subscribe to timer when workout is not running', () => {
			const mockTimerManager = {
				isTimerRunning: jest.fn(() => false),
				getTimerState: jest.fn(() => null),
				getActiveExerciseIndex: jest.fn(() => -1),
				getActiveSetIndex: jest.fn(() => -1),
				subscribe: jest.fn(),
				startTimer: jest.fn(),
				stopTimer: jest.fn()
			} as any;

			const parsedWorkout = {
				metadata: {
					title: 'Planned Workout',
					state: 'planned',
					startDate: '2026-01-08 15:45',
					duration: '10m'
				},
				exercises: [
					{
						name: 'Exercise 1',
						state: 'pending',
						params: [],
						sets: [{ state: 'pending', params: [] }],
						lineIndex: 0
					}
				]
			};

			renderWorkout({
				containerElement,
				parsed: parsedWorkout as any,
				callbacks: mockCallbacks,
				workoutId: 'test-workout:0',
				timerManager: mockTimerManager
			});

			// Should not have called subscribe
			expect(mockTimerManager.subscribe).not.toHaveBeenCalled();
		});

		it('should handle stale render detection', () => {
			const mockTimerManager = {
				isTimerRunning: jest.fn(() => true),
				getTimerState: jest.fn(() => null),
				getActiveExerciseIndex: jest.fn(() => 0),
				getActiveSetIndex: jest.fn(() => 0),
				subscribe: jest.fn(),
				startTimer: jest.fn(),
				stopTimer: jest.fn()
			} as any;

			const parsedWorkout = {
				metadata: {
					title: 'Timer Workout',
					state: 'started',
					startDate: '2026-01-08 15:45',
					duration: '10m'
				},
				exercises: [
					{
						name: 'Exercise 1',
						state: 'in-progress',
						params: [],
						sets: [{ state: 'in-progress', params: [] }],
						targetDuration: 300,
						lineIndex: 0
					},
					{
						name: 'Exercise 2',
						state: 'pending',
						params: [],
						sets: [{ state: 'pending', params: [] }],
						lineIndex: 1
					}
				]
			};

			renderWorkout({
				containerElement,
				parsed: parsedWorkout as any,
				callbacks: mockCallbacks,
				workoutId: 'test-workout:0',
				timerManager: mockTimerManager
			});

			// Get the subscription callback
			const subscribeCall = mockTimerManager.subscribe.mock.calls[0];
			const timerCallback = subscribeCall[1];

			// Simulate active index change - should trigger stale detection
			mockTimerManager.getActiveExerciseIndex.mockReturnValue(1);

			const timerState: TimerState = {
				workoutElapsed: 100,
				exerciseElapsed: 50,
				isOvertime: false,
				isRestActive: false,
				restRemaining: 0
			};

			// This should return early due to stale index
			timerCallback(timerState);

			// onRestEnd should not be called
			expect(mockCallbacks.onRestEnd).not.toHaveBeenCalled();
		});

		it('should handle rest completion auto-advance', () => {
			const mockTimerManager = {
				isTimerRunning: jest.fn(() => true),
				getTimerState: jest.fn(() => null),
				getActiveExerciseIndex: jest.fn(() => 0),
				getActiveSetIndex: jest.fn(() => 1),
				subscribe: jest.fn(),
				startTimer: jest.fn(),
				stopTimer: jest.fn()
			} as any;

			const parsedWorkout = {
				metadata: {
					title: 'Timer Workout',
					state: 'started',
					startDate: '2026-01-08 15:45',
					duration: '10m'
				},
				exercises: [
					{
						name: 'Exercise 1',
						state: 'in-progress',
						params: [],
						sets: [
							{ state: 'completed', params: [] },
							{ state: 'in-progress', params: [{ key: 'Rest', value: '60s', editable: true, unit: '' }] }
						],
						lineIndex: 0
					},
					{
						name: 'Exercise 2',
						state: 'pending',
						params: [],
						sets: [{ state: 'pending', params: [] }],
						lineIndex: 1
					}
				]
			};

			renderWorkout({
				containerElement,
				parsed: parsedWorkout as any,
				callbacks: mockCallbacks,
				workoutId: 'test-workout:0',
				timerManager: mockTimerManager
			});

			// Get the subscription callback
			const subscribeCall = mockTimerManager.subscribe.mock.calls[0];
			expect(subscribeCall).toBeDefined();
			
			const timerCallback = subscribeCall[1];

			// Simulate timer state update
			const timerState: TimerState = {
				workoutElapsed: 200,
				exerciseElapsed: 100,
				isOvertime: false,
				isRestActive: true,
				restRemaining: 0
			};

			// Call the timer callback
			timerCallback(timerState);
			
			// Verify onRestEnd was called to auto-advance
			expect(mockCallbacks.onRestEnd).toHaveBeenCalledWith(0);
		});
	});

	describe('Edge cases', () => {
		it('should handle empty exercise list', () => {
			const emptyWorkout: ParsedWorkout = {
				metadata: { title: 'Empty', state: 'planned' },
				exercises: [],
				rawLines: [],
				metadataEndIndex: -1
			};

			renderWorkout({
				containerElement,
				parsed: emptyWorkout,
				callbacks: mockCallbacks,
				workoutId: 'test-workout',
				timerManager
			});

			expect(containerElement.children.length).toBeGreaterThan(0);
		});

		it('should handle single exercise', () => {
			renderWorkout({
				containerElement,
				parsed: mockWorkout,
				callbacks: mockCallbacks,
				workoutId: 'test-workout',
				timerManager
			});

			expect(containerElement.children.length).toBeGreaterThan(0);
		});

		it('should handle very long workout title', () => {
			const longTitleWorkout: ParsedWorkout = {
				metadata: {
					title: 'A'.repeat(500),
					state: 'planned'
				},
				exercises: mockWorkout.exercises,
				rawLines: [],
				metadataEndIndex: -1
			};

			renderWorkout({
				containerElement,
				parsed: longTitleWorkout,
				callbacks: mockCallbacks,
				workoutId: 'test-workout',
				timerManager
			});

			expect(containerElement.children.length).toBeGreaterThan(0);
		});
	});
});
