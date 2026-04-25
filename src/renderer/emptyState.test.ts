import { renderEmptyState } from './emptyState';

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

describe('renderEmptyState', () => {
	let container: MockElement;
	let callback: jest.Mock;

	beforeEach(() => {
		container = new MockElement('div');
		callback = jest.fn().mockResolvedValue(undefined);
	});

	describe('Container structure', () => {
		it('should create empty state container element', () => {
			renderEmptyState(container, callback);
			expect(container.querySelector('.workout-empty-state')).toBeTruthy();
		});

		it('should append empty state to container', () => {
			renderEmptyState(container, callback);
			expect(container.children.length).toBe(1);
		});

		it('should use correct root class', () => {
			const result = renderEmptyState(container, callback);
			expect(result.className).toBe('workout-empty-state');
		});

		it('should return the empty state element', () => {
			const result = renderEmptyState(container, callback);
			expect(result).toBeInstanceOf(MockElement);
			expect(result.tag).toBe('div');
		});

		it('should return element that is in container', () => {
			const result = renderEmptyState(container, callback);
			expect(container.children).toContain(result);
		});
	});

	describe('Message section', () => {
		it('should render message container', () => {
			renderEmptyState(container, callback);
			const message = container.querySelector('.workout-empty-message');
			expect(message).toBeTruthy();
		});

		it('should use correct message class', () => {
			renderEmptyState(container, callback);
			const message = container.querySelector('.workout-empty-message');
			expect(message?.className).toBe('workout-empty-message');
		});

		it('should render message as div', () => {
			renderEmptyState(container, callback);
			const message = container.querySelector('.workout-empty-message');
			expect(message?.tag).toBe('div');
		});

		it('should display empty workout message', () => {
			renderEmptyState(container, callback);
			const message = container.querySelector('.workout-empty-message');
			expect(message?.textContent).toContain('This workout is empty');
		});

		it('should have message text in span', () => {
			renderEmptyState(container, callback);
			const message = container.querySelector('.workout-empty-message');
			const span = message?.querySelector('span');
			expect(span?.textContent).toBe('This workout is empty');
		});

		it('should have exactly one span in message', () => {
			renderEmptyState(container, callback);
			const message = container.querySelector('.workout-empty-message');
			const spans = message?.querySelectorAll('span');
			expect(spans?.length).toBe(1);
		});
	});

	describe('Action container', () => {
		it('should render action container', () => {
			renderEmptyState(container, callback);
			const action = container.querySelector('.workout-empty-action');
			expect(action).toBeTruthy();
		});

		it('should use correct action class', () => {
			renderEmptyState(container, callback);
			const action = container.querySelector('.workout-empty-action');
			expect(action?.className).toBe('workout-empty-action');
		});

		it('should render action as div', () => {
			renderEmptyState(container, callback);
			const action = container.querySelector('.workout-empty-action');
			expect(action?.tag).toBe('div');
		});

		it('should contain button in action container', () => {
			renderEmptyState(container, callback);
			const action = container.querySelector('.workout-empty-action');
			const button = action?.querySelector('button');
			expect(button).toBeTruthy();
		});
	});

	describe('Button structure', () => {
		it('should render button element', () => {
			renderEmptyState(container, callback);
			const button = container.querySelector('button');
			expect(button).toBeTruthy();
			expect(button?.tag).toBe('button');
		});

		it('should have workout-btn class', () => {
			renderEmptyState(container, callback);
			const button = container.querySelector('button');
			expect(button?.className).toContain('workout-btn');
		});

		it('should have workout-btn-primary class', () => {
			renderEmptyState(container, callback);
			const button = container.querySelector('button');
			expect(button?.className).toContain('workout-btn-primary');
		});

		it('should have workout-btn-large class', () => {
			renderEmptyState(container, callback);
			const button = container.querySelector('button');
			expect(button?.className).toContain('workout-btn-large');
		});

		it('should have all three button classes', () => {
			renderEmptyState(container, callback);
			const button = container.querySelector('button');
			expect(button?.className).toBe('workout-btn workout-btn-primary workout-btn-large');
		});

		it('should have exactly two children in button', () => {
			renderEmptyState(container, callback);
			const button = container.querySelector('button');
			expect(button?.children.length).toBe(2);
		});
	});

	describe('Button icon', () => {
		it('should render icon span', () => {
			renderEmptyState(container, callback);
			const icon = container.querySelector('.workout-btn-icon');
			expect(icon).toBeTruthy();
		});

		it('should use correct icon class', () => {
			renderEmptyState(container, callback);
			const icon = container.querySelector('.workout-btn-icon');
			expect(icon?.className).toBe('workout-btn-icon');
		});

		it('should render icon as span', () => {
			renderEmptyState(container, callback);
			const icon = container.querySelector('.workout-btn-icon');
			expect(icon?.tag).toBe('span');
		});

		it('should display sparkle emoji', () => {
			renderEmptyState(container, callback);
			const icon = container.querySelector('.workout-btn-icon');
			expect(icon?.textContent).toBe('✨');
		});

		it('should be first child of button', () => {
			renderEmptyState(container, callback);
			const button = container.querySelector('button');
			const firstChild = button?.children[0];
			expect(firstChild?.className).toContain('workout-btn-icon');
		});
	});

	describe('Button label', () => {
		it('should render label span', () => {
			renderEmptyState(container, callback);
			const button = container.querySelector('button');
			const label = button?.children[1];
			expect(label?.tag).toBe('span');
		});

		it('should display correct button text', () => {
			renderEmptyState(container, callback);
			const button = container.querySelector('button');
			expect(button?.textContent).toContain('Add Sample Workout');
		});

		it('should have label as second child of button', () => {
			renderEmptyState(container, callback);
			const button = container.querySelector('button');
			const secondChild = button?.children[1];
			expect(secondChild?.textContent).toBe('Add Sample Workout');
		});

		it('should not have class on label span', () => {
			renderEmptyState(container, callback);
			const button = container.querySelector('button');
			const label = button?.children[1];
			expect(label?.className).toBe('');
		});
	});

	describe('Callback functionality', () => {
		it('should call callback when button clicked', async () => {
			renderEmptyState(container, callback);
			const button = container.querySelector('button') as MockElement;

			button.click();
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(callback).toHaveBeenCalledTimes(1);
		});

		it('should only call callback once per click', async () => {
			renderEmptyState(container, callback);
			const button = container.querySelector('button') as MockElement;

			button.click();
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(callback).toHaveBeenCalledTimes(1);
		});

		it('should call callback with no arguments', async () => {
			renderEmptyState(container, callback);
			const button = container.querySelector('button') as MockElement;

			button.click();
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(callback).toHaveBeenCalledWith();
		});

		it('should await callback completion', async () => {
			let callbackExecuted = false;
			const slowCallback = jest.fn(async () => {
				await new Promise(resolve => setTimeout(resolve, 10));
				callbackExecuted = true;
			});

			renderEmptyState(container, slowCallback);
			const button = container.querySelector('button') as MockElement;

			button.click();
			await new Promise(resolve => setTimeout(resolve, 20));

			expect(callbackExecuted).toBe(true);
		});

		it('should allow multiple clicks', async () => {
			renderEmptyState(container, callback);
			const button = container.querySelector('button') as MockElement;

			button.click();
			await new Promise(resolve => setTimeout(resolve, 5));
			button.click();
			await new Promise(resolve => setTimeout(resolve, 5));

			expect(callback).toHaveBeenCalledTimes(2);
		});
	});

	describe('DOM hierarchy', () => {
		it('should have correct element hierarchy', () => {
			const result = renderEmptyState(container, callback);

			expect(result.className).toContain('workout-empty-state');
			expect(result.children.length).toBe(2);

			const message = result.children[0];
			expect(message.className).toContain('workout-empty-message');

			const action = result.children[1];
			expect(action.className).toContain('workout-empty-action');

			const button = action.children[0];
			expect(button?.tag).toBe('button');
		});

		it('should have message before action in DOM order', () => {
			const result = renderEmptyState(container, callback);
			const message = result.children[0];
			const action = result.children[1];

			expect(message.className).toContain('workout-empty-message');
			expect(action.className).toContain('workout-empty-action');
		});

		it('should have icon before label in button', () => {
			renderEmptyState(container, callback);
			const button = container.querySelector('button');
			const icon = button?.children[0];
			const label = button?.children[1];

			expect(icon?.className).toContain('workout-btn-icon');
			expect(label?.textContent).toBe('Add Sample Workout');
		});
	});

	describe('Return value', () => {
		it('should return MockElement instance', () => {
			const result = renderEmptyState(container, callback);
			expect(result).toBeInstanceOf(MockElement);
		});

		it('should return a div element', () => {
			const result = renderEmptyState(container, callback);
			expect(result.tag).toBe('div');
		});

		it('should return element with workout-empty-state class', () => {
			const result = renderEmptyState(container, callback);
			expect(result.className).toContain('workout-empty-state');
		});

		it('returned element should be in container children', () => {
			const result = renderEmptyState(container, callback);
			expect(container.children).toContain(result);
		});

		it('should return the actual created element', () => {
			const result = renderEmptyState(container, callback);
			const queriedElement = container.querySelector('.workout-empty-state');
			expect(result).toBe(queriedElement);
		});
	});

	describe('Multiple renders', () => {
		it('should create separate elements for each render', () => {
			const callback1 = jest.fn();
			const callback2 = jest.fn();

			renderEmptyState(container, callback1);
			renderEmptyState(container, callback2);

			expect(container.children.length).toBe(2);
		});

		it('should each have their own button with independent callbacks', async () => {
			const callback1 = jest.fn();
			const callback2 = jest.fn();

			renderEmptyState(container, callback1);
			renderEmptyState(container, callback2);

			const buttons = container.querySelectorAll('button');
			expect(buttons.length).toBe(2);

			(buttons[0] as MockElement).click();
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(callback1).toHaveBeenCalled();
			expect(callback2).not.toHaveBeenCalled();
		});
	});

	describe('Edge cases', () => {
		it('should work with empty container', () => {
			const emptyContainer = new MockElement('div');
			renderEmptyState(emptyContainer, callback);
			expect(emptyContainer.children.length).toBe(1);
		});

		it('should work with pre-populated container', () => {
			const prePopulated = new MockElement('div');
			prePopulated.createDiv({ text: 'Existing content' });

			renderEmptyState(prePopulated, callback);
			expect(prePopulated.children.length).toBe(2);
		});

		it('should handle callback that returns void', async () => {
			const voidCallback = jest.fn(async () => {
				// Return undefined implicitly
			});

			renderEmptyState(container, voidCallback);
			const button = container.querySelector('button') as MockElement;

			button.click();
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(voidCallback).toHaveBeenCalled();
		});

		it('should preserve container content when adding empty state', () => {
			container.createDiv({ cls: 'existing-element' });
			const originalContent = container.children[0];

			renderEmptyState(container, callback);

			expect(container.children[0]).toBe(originalContent);
			expect(container.children[1].className).toContain('workout-empty-state');
		});
	});
});
