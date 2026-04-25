import { renderWorkoutControls } from './controls';
import { WorkoutCallbacks, ParsedWorkout } from '../types';
import * as serializer from '../serializer';

// Mock the serializer module
jest.mock('../serializer', () => ({
	serializeWorkoutAsTemplate: jest.fn(() => 'mocked template content')
}));

// Mock navigator.clipboard
const mockClipboard = {
	writeText: jest.fn()
};
Object.assign(navigator, { clipboard: mockClipboard });

// MockElement class to simulate DOM without jsdom
class MockElement {
	tag: string;
	className: string = '';
	children: MockElement[] = [];
	parent: MockElement | null = null;
	listeners: { [key: string]: Function[] } = {};
	_textContent: string = '';
	document: any;
	styleMap: Map<string, string> = new Map();
	attributes: Map<string, string> = new Map();

	constructor(tag: string) {
		this.tag = tag;
	}

	get textContent(): string {
		// Aggregate text from this element and all children
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

	querySelector(selector: string): MockElement | null {
		if (selector.startsWith('.')) {
			const className = selector.substring(1);
			const found = this._findByClass(className);
			return found;
		}
		if (selector === 'span:last-child') {
			if (this.children.length > 0) {
				const lastChild = this.children[this.children.length - 1];
				if (lastChild.tag === 'span') return lastChild;
			}
			return null;
		}
		const tagName = selector;
		return this._findByTag(tagName);
	}

	querySelectorAll(selector: string): MockElement[] {
		if (selector.startsWith('.')) {
			const className = selector.substring(1);
			return this._findAllByClass(className);
		}
		const tagName = selector;
		return this._findAllByTag(tagName);
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

	addClass(cls: string): void {
		const classes = this.className.split(' ').filter(c => c);
		if (!classes.includes(cls)) {
			classes.push(cls);
		}
		this.className = classes.join(' ');
	}

	removeClass(cls: string): void {
		const classes = this.className.split(' ').filter(c => c && c !== cls);
		this.className = classes.join(' ');
	}

	setAttribute(key: string, value: string): void {
		this.attributes.set(key, value);
	}

	removeAttribute(key: string): void {
		this.attributes.delete(key);
	}

	hasAttribute(key: string): boolean {
		return this.attributes.has(key);
	}

	setStyle(prop: string, value: string): void {
		this.styleMap.set(prop, value);
	}

	getStyle(prop: string): string | undefined {
		return this.styleMap.get(prop);
	}
}

describe('renderWorkoutControls', () => {
	let container: MockElement;
	let mockCallbacks: WorkoutCallbacks;
	let mockWorkout: ParsedWorkout;

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
			onAddSet: jest.fn()
		};
		mockWorkout = {
			metadata: { title: 'Test Workout', state: 'planned' },
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
		jest.clearAllMocks();
	});

	describe('Planned state', () => {
		it('should create controls container with correct class', () => {
			renderWorkoutControls(container, 'planned', mockCallbacks, mockWorkout);
			expect(container.querySelector('.workout-controls')).toBeTruthy();
		});

		it('should render start button', () => {
			renderWorkoutControls(container, 'planned', mockCallbacks, mockWorkout);
			const button = container.querySelector('button');
			expect(button).toBeTruthy();
			expect(button?.tag).toBe('button');
		});

		it('should add correct styling classes to start button', () => {
			renderWorkoutControls(container, 'planned', mockCallbacks, mockWorkout);
			const button = container.querySelector('button');
			expect(button?.className).toContain('workout-btn');
			expect(button?.className).toContain('workout-btn-primary');
			expect(button?.className).toContain('workout-btn-large');
		});

		it('should render play icon in button', () => {
			renderWorkoutControls(container, 'planned', mockCallbacks, mockWorkout);
			const icon = container.querySelector('.workout-btn-icon');
			expect(icon).toBeTruthy();
			expect(icon?.textContent).toBe('▶');
		});

		it('should render start button text', () => {
			renderWorkoutControls(container, 'planned', mockCallbacks, mockWorkout);
			const button = container.querySelector('button');
			expect(button?.textContent).toContain('Start Workout');
		});

		it('should call onStartWorkout when button clicked', async () => {
			renderWorkoutControls(container, 'planned', mockCallbacks, mockWorkout);
			const button = container.querySelector('button') as MockElement;

			button.click();
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(mockCallbacks.onStartWorkout).toHaveBeenCalledTimes(1);
		});

		it('should prevent double-click on start button', async () => {
			renderWorkoutControls(container, 'planned', mockCallbacks, mockWorkout);
			const button = container.querySelector('button') as MockElement;

			// Click twice rapidly
			button.click();
			button.click();
			await new Promise(resolve => setTimeout(resolve, 10));

			// Should only be called once due to isProcessing flag
			expect(mockCallbacks.onStartWorkout).toHaveBeenCalledTimes(1);
		});

		it('should add processing class during start', async () => {
			const slowCallback = jest.fn(async () => {
				await new Promise(resolve => setTimeout(resolve, 5));
			});
			mockCallbacks.onStartWorkout = slowCallback;

			renderWorkoutControls(container, 'planned', mockCallbacks, mockWorkout);
			const button = container.querySelector('button') as MockElement;

			const clickPromise = Promise.resolve().then(() => button.click());
			await new Promise(resolve => setTimeout(resolve, 2));

			expect(button.className).toContain('workout-btn-processing');
		});

		it('should disable button during start', async () => {
			let resolveCallback: (() => void) | undefined;
			mockCallbacks.onStartWorkout = jest.fn(async () => {
				await new Promise(resolve => {
					resolveCallback = resolve;
				});
			});

			renderWorkoutControls(container, 'planned', mockCallbacks, mockWorkout);
			const button = container.querySelector('button') as MockElement;

			button.click();
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(button.hasAttribute('disabled')).toBe(true);

			// Cleanup
			if (resolveCallback) resolveCallback();
			await new Promise(resolve => setTimeout(resolve, 20));
		});

		it('should remove processing class after start completes', async () => {
			renderWorkoutControls(container, 'planned', mockCallbacks, mockWorkout);
			const button = container.querySelector('button') as MockElement;

			button.click();
			await new Promise(resolve => setTimeout(resolve, 20));

			expect(button.className).not.toContain('workout-btn-processing');
		});

		it('should remove disabled attribute after start completes', async () => {
			renderWorkoutControls(container, 'planned', mockCallbacks, mockWorkout);
			const button = container.querySelector('button') as MockElement;

			button.click();
			await new Promise(resolve => setTimeout(resolve, 20));

			expect(button.hasAttribute('disabled')).toBe(false);
		});

		it('should recover from callback execution', async () => {
			mockCallbacks.onStartWorkout = jest.fn(async () => {
				await new Promise(resolve => setTimeout(resolve, 5));
			});

			renderWorkoutControls(container, 'planned', mockCallbacks, mockWorkout);
			const button = container.querySelector('button') as MockElement;

			button.click();
			await new Promise(resolve => setTimeout(resolve, 30));

			// Button should be re-enabled after callback completes
			expect(button.hasAttribute('disabled')).toBe(false);
			expect(button.className).not.toContain('workout-btn-processing');
		});

		it('should return the controls element', () => {
			const result = renderWorkoutControls(container, 'planned', mockCallbacks, mockWorkout);
			expect(result).toBeInstanceOf(MockElement);
			expect(result.className).toContain('workout-controls');
		});
	});

	describe('Completed state', () => {
		it('should create controls container with correct class', () => {
			renderWorkoutControls(container, 'completed', mockCallbacks, mockWorkout);
			expect(container.querySelector('.workout-controls')).toBeTruthy();
		});

		it('should render completed label', () => {
			renderWorkoutControls(container, 'completed', mockCallbacks, mockWorkout);
			const label = container.querySelector('.workout-completed-label');
			expect(label).toBeTruthy();
		});

		it('should render checkmark icon in completed label', () => {
			renderWorkoutControls(container, 'completed', mockCallbacks, mockWorkout);
			const label = container.querySelector('.workout-completed-label');
			const icon = label?.querySelector('.workout-btn-icon');
			expect(icon?.textContent).toBe('✓');
		});

		it('should render completed text', () => {
			renderWorkoutControls(container, 'completed', mockCallbacks, mockWorkout);
			const label = container.querySelector('.workout-completed-label');
			expect(label?.textContent).toContain('Completed');
		});

		it('should render copy as template button', () => {
			renderWorkoutControls(container, 'completed', mockCallbacks, mockWorkout);
			const button = container.querySelector('button');
			expect(button).toBeTruthy();
			expect(button?.textContent).toContain('Copy as Template');
		});

		it('should render clipboard icon in copy button', () => {
			renderWorkoutControls(container, 'completed', mockCallbacks, mockWorkout);
			const button = container.querySelector('button');
			const icon = button?.querySelector('.workout-btn-icon');
			expect(icon?.textContent).toBe('📋');
		});

		it('should add workout-btn class to copy button', () => {
			renderWorkoutControls(container, 'completed', mockCallbacks, mockWorkout);
			const button = container.querySelector('button');
			expect(button?.className).toContain('workout-btn');
		});

		it('should call serializeWorkoutAsTemplate when copy button clicked', async () => {
			renderWorkoutControls(container, 'completed', mockCallbacks, mockWorkout);
			const button = container.querySelector('button') as MockElement;

			button.click();
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(serializer.serializeWorkoutAsTemplate).toHaveBeenCalledWith(mockWorkout);
		});

		it('should copy serialized template to clipboard', async () => {
			renderWorkoutControls(container, 'completed', mockCallbacks, mockWorkout);
			const button = container.querySelector('button') as MockElement;

			button.click();
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(mockClipboard.writeText).toHaveBeenCalledWith('```workout\nmocked template content\n```');
		});

		it('should change button text to "Copied!" after copy', async () => {
			renderWorkoutControls(container, 'completed', mockCallbacks, mockWorkout);
			const button = container.querySelector('button') as MockElement;
			const textSpan = button?.querySelector('span:last-child');

			button.click();
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(textSpan?.textContent).toBe('Copied!');
		});

		it('should restore original button text after delay', async () => {
			renderWorkoutControls(container, 'completed', mockCallbacks, mockWorkout);
			const button = container.querySelector('button') as MockElement;
			const textSpan = button?.querySelector('span:last-child');

			button.click();
			await new Promise(resolve => setTimeout(resolve, 1600));

			expect(textSpan?.textContent).toBe('Copy as Template');
		});

		it('should handle clipboard write errors gracefully', async () => {
			mockClipboard.writeText.mockResolvedValueOnce(undefined);

			renderWorkoutControls(container, 'completed', mockCallbacks, mockWorkout);
			const button = container.querySelector('button') as MockElement;

			// Should not throw
			button.click();
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(mockClipboard.writeText).toHaveBeenCalled();
		});

		it('should handle missing text span gracefully', async () => {
			renderWorkoutControls(container, 'completed', mockCallbacks, mockWorkout);
			const button = container.querySelector('button') as MockElement;

			// Override querySelector to return null
			const originalQuerySelector = button.querySelector.bind(button);
			button.querySelector = jest.fn((selector: string) => {
				if (selector === 'span:last-child') return null;
				return originalQuerySelector(selector);
			});

			// Should not throw
			button.click();
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(mockClipboard.writeText).toHaveBeenCalled();
		});

		it('should return the controls element', () => {
			const result = renderWorkoutControls(container, 'completed', mockCallbacks, mockWorkout);
			expect(result).toBeInstanceOf(MockElement);
			expect(result.className).toContain('workout-controls');
		});
	});

	describe('Started state', () => {
		it('should not render any controls for started state', () => {
			renderWorkoutControls(container, 'started', mockCallbacks, mockWorkout);
			const controlsEl = container.querySelector('.workout-controls');
			expect(controlsEl?.children.length).toBe(0);
		});

		it('should return empty controls container for started state', () => {
			const result = renderWorkoutControls(container, 'started', mockCallbacks, mockWorkout);
			expect(result.children.length).toBe(0);
		});
	});

	describe('General functionality', () => {
		it('should append controls to container', () => {
			const result = renderWorkoutControls(container, 'planned', mockCallbacks, mockWorkout);
			expect(container.children).toContain(result);
		});

		it('should return HTMLElement', () => {
			const result = renderWorkoutControls(container, 'planned', mockCallbacks, mockWorkout);
			expect(result).toBeInstanceOf(MockElement);
		});

		it('should work with different workout exercises', async () => {
			const multiExerciseWorkout: ParsedWorkout = {
				metadata: { title: 'Full Body', state: 'completed' },
				exercises: [
					{
						name: 'Push Ups',
						state: 'completed',
						params: [],
						sets: [{ state: 'completed', params: [], lineIndex: 1 }],
						lineIndex: 0
					},
					{
						name: 'Pull Ups',
						state: 'completed',
						params: [],
						sets: [{ state: 'completed', params: [], lineIndex: 4 }],
						lineIndex: 3
					}
				],
				rawLines: [],
				metadataEndIndex: -1
			};

			renderWorkoutControls(container, 'completed', mockCallbacks, multiExerciseWorkout);
			const button = container.querySelector('button') as MockElement;
			expect(button?.textContent).toContain('Copy as Template');

			button.click();
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(serializer.serializeWorkoutAsTemplate).toHaveBeenCalledWith(multiExerciseWorkout);
		});
	});
});
