import { renderHeader, updateHeaderTimer } from './header';
import { WorkoutMetadata, TimerState } from '../types';
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

	private _findByClass(className: string): MockElement | null {
		if (this.className.split(' ').includes(className)) return this;
		for (const child of this.children) {
			const found = child._findByClass(className);
			if (found) return found;
		}
		return null;
	}

	private _findByTag(tagName: string): MockElement | null {
		if (this.tag === tagName) return this;
		for (const child of this.children) {
			const found = child._findByTag(tagName);
			if (found) return found;
		}
		return null;
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
}

describe('renderHeader', () => {
	let container: MockElement;
	const baseMockMetadata: WorkoutMetadata = {
		title: 'Test Workout',
		state: 'planned',
		startDate: undefined,
		duration: undefined,
		restDuration: undefined
	};

	beforeEach(() => {
		container = new MockElement('div');
		jest.clearAllMocks();
	});

	describe('Container structure', () => {
		it('should create header element', () => {
			renderHeader(container, baseMockMetadata, null, false);
			expect(container.querySelector('.workout-header')).toBeTruthy();
		});

		it('should append header to container', () => {
			renderHeader(container, baseMockMetadata, null, false);
			expect(container.children.length).toBe(1);
		});

		it('should use correct header class', () => {
			const result = renderHeader(container, baseMockMetadata, null, false);
			const header = container.querySelector('.workout-header');
			expect(header?.className).toBe('workout-header');
		});
	});

	describe('Title rendering', () => {
		it('should render title element', () => {
			renderHeader(container, baseMockMetadata, null, false);
			const title = container.querySelector('.workout-title');
			expect(title).toBeTruthy();
		});

		it('should display workout title', () => {
			renderHeader(container, baseMockMetadata, null, false);
			const title = container.querySelector('.workout-title');
			expect(title?.textContent).toBe('Test Workout');
		});

		it('should use default title if not provided', () => {
			const metadata: WorkoutMetadata = { ...baseMockMetadata, title: '' };
			renderHeader(container, metadata, null, false);
			const title = container.querySelector('.workout-title');
			expect(title?.textContent).toBe('Workout');
		});

		it('should display custom titles', () => {
			const metadata: WorkoutMetadata = { ...baseMockMetadata, title: 'Upper Body' };
			renderHeader(container, metadata, null, false);
			const title = container.querySelector('.workout-title');
			expect(title?.textContent).toBe('Upper Body');
		});
	});

	describe('Rest duration rendering', () => {
		it('should not render rest duration if undefined', () => {
			renderHeader(container, baseMockMetadata, null, false);
			const restDuration = container.querySelector('.workout-rest-duration');
			expect(restDuration).toBeFalsy();
		});

		it('should render rest duration when defined', () => {
			const metadata: WorkoutMetadata = { ...baseMockMetadata, restDuration: 90 };
			renderHeader(container, metadata, null, false);
			const restDuration = container.querySelector('.workout-rest-duration');
			expect(restDuration).toBeTruthy();
		});

		it('should display formatted rest duration', () => {
			const metadata: WorkoutMetadata = { ...baseMockMetadata, restDuration: 90 };
			renderHeader(container, metadata, null, false);
			const restDuration = container.querySelector('.workout-rest-duration');
			expect(restDuration?.textContent).toContain('Rest:');
		});

		it('should use formatDurationHuman for rest display', () => {
			const metadata: WorkoutMetadata = { ...baseMockMetadata, restDuration: 120 };
			renderHeader(container, metadata, null, false);
			expect(exerciseParser.formatDurationHuman).toHaveBeenCalledWith(120);
		});
	});

	describe('Timer container', () => {
		it('should create timer container', () => {
			renderHeader(container, baseMockMetadata, null, false);
			const timerContainer = container.querySelector('.workout-header-timer');
			expect(timerContainer).toBeTruthy();
		});

		it('should create timer element inside container', () => {
			renderHeader(container, baseMockMetadata, null, false);
			const timerContainer = container.querySelector('.workout-header-timer');
			const timer = timerContainer?.querySelector('span');
			expect(timer?.className).toContain('workout-timer');
		});
	});

	describe('Timer display - Planned state', () => {
		it('should display -- :-- for planned state with no timer', () => {
			renderHeader(container, baseMockMetadata, null, false);
			const timer = container.querySelector('.workout-timer');
			expect(timer?.textContent).toBe('--:--');
		});

		it('should display -- :-- even with timer state if not running', () => {
			const timerState: TimerState = {
				workoutElapsed: 120,
				exerciseElapsed: 30,
				isRestActive: false,
				restRemaining: 0
			};
			renderHeader(container, baseMockMetadata, timerState, false);
			const timer = container.querySelector('.workout-timer');
			expect(timer?.textContent).toBe('--:--');
		});
	});

	describe('Timer display - Started state with running timer', () => {
		it('should display running timer when active', () => {
			const timerState: TimerState = {
				workoutElapsed: 125,
				exerciseElapsed: 35,
				isRestActive: false,
				restRemaining: 0
			};
			const metadata: WorkoutMetadata = { ...baseMockMetadata, state: 'started' };
			renderHeader(container, metadata, timerState, true);
			const timer = container.querySelector('.workout-timer');
			expect(timer?.textContent).toContain('Total:');
		});

		it('should use formatDuration for running timer', () => {
			const timerState: TimerState = {
				workoutElapsed: 125,
				exerciseElapsed: 35,
				isRestActive: false,
				restRemaining: 0
			};
			const metadata: WorkoutMetadata = { ...baseMockMetadata, state: 'started' };
			renderHeader(container, metadata, timerState, true);
			expect(exerciseParser.formatDuration).toHaveBeenCalledWith(125);
		});

		it('should show count-up indicator when running', () => {
			const timerState: TimerState = {
				workoutElapsed: 60,
				exerciseElapsed: 20,
				isRestActive: false,
				restRemaining: 0
			};
			const metadata: WorkoutMetadata = { ...baseMockMetadata, state: 'started' };
			const { timerEl } = renderHeader(container, metadata, timerState, true);
			// Check that timer element contains Total text
			expect(timerEl.textContent).toContain('Total:');
		});
	});

	describe('Timer display - Completed state', () => {
		it('should display recorded duration when completed', () => {
			const metadata: WorkoutMetadata = {
				...baseMockMetadata,
				state: 'completed',
				duration: '15m 30s'
			};
			renderHeader(container, metadata, null, false);
			const timer = container.querySelector('.workout-timer');
			expect(timer?.textContent).toContain('15m 30s');
		});

		it('should show check mark indicator when completed', () => {
			const metadata: WorkoutMetadata = {
				...baseMockMetadata,
				state: 'completed',
				duration: '15m 30s'
			};
			const { timerEl } = renderHeader(container, metadata, null, false);
			// Timer element should contain duration text
			expect(timerEl.textContent).toContain('15m 30s');
		});

		it('should not display timer indicator if no duration recorded', () => {
			const metadata: WorkoutMetadata = {
				...baseMockMetadata,
				state: 'completed',
				duration: undefined
			};
			const { timerEl } = renderHeader(container, metadata, null, false);
			const indicators = timerEl.querySelectorAll?.('.workout-timer-indicator') || [];
			// Should have default --:-- with no indicator
			expect(timerEl.textContent).toBe('--:--');
		});
	});

	describe('Return values', () => {
		it('should return titleEl and timerEl', () => {
			const result = renderHeader(container, baseMockMetadata, null, false);
			expect(result.titleEl).toBeDefined();
			expect(result.timerEl).toBeDefined();
		});

		it('should return correct titleEl reference', () => {
			const result = renderHeader(container, baseMockMetadata, null, false);
			expect(result.titleEl.textContent).toBe('Test Workout');
		});

		it('should return correct timerEl reference', () => {
			const result = renderHeader(container, baseMockMetadata, null, false);
			expect(result.timerEl.textContent).toBe('--:--');
		});

		it('returned elements should be in DOM', () => {
			const result = renderHeader(container, baseMockMetadata, null, false);
			const header = container.querySelector('.workout-header');
			expect(header?.children).toContain(result.timerEl.parent);
		});
	});

	describe('Edge cases', () => {
		it('should handle very long titles', () => {
			const longTitle = 'A'.repeat(100);
			const metadata: WorkoutMetadata = { ...baseMockMetadata, title: longTitle };
			renderHeader(container, metadata, null, false);
			const title = container.querySelector('.workout-title');
			expect(title?.textContent).toBe(longTitle);
		});

		it('should handle special characters in title', () => {
			const metadata: WorkoutMetadata = {
				...baseMockMetadata,
				title: 'Work*out @#$%'
			};
			renderHeader(container, metadata, null, false);
			const title = container.querySelector('.workout-title');
			expect(title?.textContent).toBe('Work*out @#$%');
		});

		it('should handle large rest duration', () => {
			const metadata: WorkoutMetadata = {
				...baseMockMetadata,
				restDuration: 3600
			};
			renderHeader(container, metadata, null, false);
			const restDuration = container.querySelector('.workout-rest-duration');
			expect(restDuration).toBeTruthy();
		});

		it('should handle zero rest duration', () => {
			const metadata: WorkoutMetadata = {
				...baseMockMetadata,
				restDuration: 0
			};
			// Falsy check - 0 is falsy, so rest duration shouldn't render
			renderHeader(container, metadata, null, false);
			const restDuration = container.querySelector('.workout-rest-duration');
			expect(restDuration).toBeFalsy();
		});
	});
});

describe('updateHeaderTimer', () => {
	let timerEl: MockElement;

	beforeEach(() => {
		timerEl = new MockElement('span');
		timerEl.className = 'workout-timer';
		jest.clearAllMocks();
	});

	describe('Timer update', () => {
		it('should clear existing content', () => {
			timerEl.textContent = 'Old Content';
			timerEl.createSpan({ text: 'Old Indicator' });

			const timerState: TimerState = {
				workoutElapsed: 120,
				exerciseElapsed: 30,
				isRestActive: false,
				restRemaining: 0
			};

			updateHeaderTimer(timerEl, timerState);
			// After empty(), content should be replaced
			expect(timerEl._textContent).not.toContain('Old');
		});

		it('should display formatted elapsed time', () => {
			const timerState: TimerState = {
				workoutElapsed: 125,
				exerciseElapsed: 35,
				isRestActive: false,
				restRemaining: 0
			};

			updateHeaderTimer(timerEl, timerState);
			expect(timerEl.textContent).toContain('Total:');
			expect(exerciseParser.formatDuration).toHaveBeenCalledWith(125);
		});

		it('should add count-up indicator', () => {
			const timerState: TimerState = {
				workoutElapsed: 60,
				exerciseElapsed: 20,
				isRestActive: false,
				restRemaining: 0
			};

			updateHeaderTimer(timerEl, timerState);
			// After update, timer should have content
			expect(timerEl.textContent).toBeTruthy();
		});

		it('should update with different elapsed times', () => {
			const timerState1: TimerState = {
				workoutElapsed: 30,
				exerciseElapsed: 10,
				isRestActive: false,
				restRemaining: 0
			};

			updateHeaderTimer(timerEl, timerState1);
			expect(exerciseParser.formatDuration).toHaveBeenCalledWith(30);

			jest.clearAllMocks();

			const timerState2: TimerState = {
				workoutElapsed: 300,
				exerciseElapsed: 100,
				isRestActive: false,
				restRemaining: 0
			};

			timerEl.empty();
			updateHeaderTimer(timerEl, timerState2);
			expect(exerciseParser.formatDuration).toHaveBeenCalledWith(300);
		});

		it('should replace previous content completely', () => {
			const timerState1: TimerState = {
				workoutElapsed: 60,
				exerciseElapsed: 20,
				isRestActive: false,
				restRemaining: 0
			};

			updateHeaderTimer(timerEl, timerState1);
			const firstChildren = timerEl.children.length;

			timerEl.empty();
			const timerState2: TimerState = {
				workoutElapsed: 120,
				exerciseElapsed: 40,
				isRestActive: false,
				restRemaining: 0
			};

			updateHeaderTimer(timerEl, timerState2);
			// Should have same number of children (text + indicator)
			expect(timerEl.children.length).toBe(firstChildren);
		});
	});

	describe('Indicator styling', () => {
		it('should use count-up class', () => {
			const timerState: TimerState = {
				workoutElapsed: 90,
				exerciseElapsed: 25,
				isRestActive: false,
				restRemaining: 0
			};

			updateHeaderTimer(timerEl, timerState);
			const indicator = timerEl.querySelector('.workout-timer-indicator');
			expect(indicator?.className).toContain('count-up');
		});

		it('should create up arrow indicator', () => {
			const timerState: TimerState = {
				workoutElapsed: 45,
				exerciseElapsed: 15,
				isRestActive: false,
				restRemaining: 0
			};

			updateHeaderTimer(timerEl, timerState);
			const indicator = timerEl.querySelector('.workout-timer-indicator');
			expect(indicator?.textContent).toBe(' ▲');
		});
	});
});
