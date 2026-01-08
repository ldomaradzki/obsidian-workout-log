import { Exercise, ExerciseState, TimerState, WorkoutCallbacks } from '../types';
import { formatDuration } from '../parser/exercise';

const STATE_ICONS: Record<ExerciseState, string> = {
	'pending': '○',
	'inProgress': '◐',
	'completed': '✓',
	'skipped': '—'
};

// Generate a consistent color hue from exercise name (djb2 hash with better distribution)
function nameToHue(name: string): number {
	let hash = 5381;
	for (let i = 0; i < name.length; i++) {
		hash = ((hash << 5) + hash) ^ name.charCodeAt(i);
	}
	// Use golden ratio to spread hues more evenly
	const golden = 0.618033988749895;
	const normalized = (Math.abs(hash) % 1000) / 1000;
	return Math.floor(((normalized * golden) % 1) * 360);
}

export interface ExerciseElements {
	container: HTMLElement;
	timerEl: HTMLElement | null;
	inputs: Map<string, HTMLInputElement>;
}

// Check if exercise has non-Duration params
function hasDisplayableParams(exercise: Exercise): boolean {
	return exercise.params.some(p => p.key.toLowerCase() !== 'duration');
}

export function renderExercise(
	container: HTMLElement,
	exercise: Exercise,
	index: number,
	isActive: boolean,
	timerState: TimerState | null,
	callbacks: WorkoutCallbacks,
	workoutState: 'planned' | 'started' | 'completed'
): ExerciseElements {
	const isSimple = !hasDisplayableParams(exercise);
	const exerciseEl = container.createDiv({
		cls: `workout-exercise state-${exercise.state}${isActive ? ' active' : ''}${isSimple ? ' simple' : ''}`
	});

	// Set color based on exercise name
	const hue = nameToHue(exercise.name);
	exerciseEl.style.setProperty('--exercise-color', `hsl(${hue}, 65%, 55%)`);

	const inputs = new Map<string, HTMLInputElement>();

	// Main row with icon, name, and timer
	const mainRow = exerciseEl.createDiv({ cls: 'workout-exercise-main' });

	// State icon
	const iconEl = mainRow.createSpan({ cls: 'workout-exercise-icon' });
	iconEl.textContent = STATE_ICONS[exercise.state];

	// Exercise name
	const nameEl = mainRow.createSpan({ cls: 'workout-exercise-name' });
	nameEl.textContent = exercise.name;

	// Timer display (right side)
	const timerEl = mainRow.createSpan({ cls: 'workout-exercise-timer' });

	if (exercise.state === 'completed' && exercise.recordedDuration) {
		timerEl.textContent = exercise.recordedDuration;
		timerEl.createSpan({ cls: 'timer-indicator recorded', text: ' ✓' });
	} else if (isActive && timerState) {
		updateExerciseTimer(timerEl, timerState, exercise.targetDuration);
	} else if (exercise.targetDuration) {
		timerEl.textContent = formatDuration(exercise.targetDuration);
		timerEl.createSpan({ cls: 'timer-indicator count-down', text: ' ▼' });
	} else if (exercise.state === 'pending') {
		timerEl.textContent = '--';
	}

	// Params row (only if there are displayable params)
	if (hasDisplayableParams(exercise)) {
		const paramsRow = exerciseEl.createDiv({ cls: 'workout-exercise-params' });

		for (const param of exercise.params) {
			// Skip Duration param in params display (shown in timer)
			if (param.key.toLowerCase() === 'duration') continue;

			const paramEl = paramsRow.createSpan({ cls: 'workout-param' });

			paramEl.createSpan({ cls: 'workout-param-key', text: `${param.key}: ` });

			if (param.editable && workoutState !== 'completed') {
				const input = paramEl.createEl('input', {
					cls: 'workout-param-input',
					type: 'text',
					value: param.value
				});
				input.addEventListener('blur', () => {
					callbacks.onParamChange(index, param.key, input.value);
				});
				input.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') {
						input.blur();
					}
				});
				inputs.set(param.key, input);
			} else {
				paramEl.createSpan({ cls: 'workout-param-value', text: param.value });
			}

			if (param.unit) {
				paramEl.createSpan({ cls: 'workout-param-unit', text: ` ${param.unit}` });
			}
		}
	}

	// Controls row (only for active exercise during workout)
	if (isActive && workoutState === 'started') {
		renderExerciseControls(exerciseEl, index, callbacks);
	}

	return { container: exerciseEl, timerEl, inputs };
}

function renderExerciseControls(
	exerciseEl: HTMLElement,
	index: number,
	callbacks: WorkoutCallbacks
): void {
	const controlsEl = exerciseEl.createDiv({ cls: 'workout-exercise-controls' });

	// Pause/Resume button
	const pauseBtn = controlsEl.createEl('button', { cls: 'workout-btn' });
	pauseBtn.createSpan({ cls: 'workout-btn-icon', text: '⏸' });
	pauseBtn.createSpan({ text: 'Pause' });
	pauseBtn.addEventListener('click', () => {
		const textSpan = pauseBtn.querySelector('span:last-child');
		const iconSpan = pauseBtn.querySelector('.workout-btn-icon');
		if (textSpan?.textContent === 'Pause') {
			callbacks.onPauseExercise();
			if (textSpan) textSpan.textContent = 'Resume';
			if (iconSpan) iconSpan.textContent = '▶';
		} else {
			callbacks.onResumeExercise();
			if (textSpan) textSpan.textContent = 'Pause';
			if (iconSpan) iconSpan.textContent = '⏸';
		}
	});

	// Skip button
	const skipBtn = controlsEl.createEl('button', { cls: 'workout-btn' });
	skipBtn.createSpan({ cls: 'workout-btn-icon', text: '⏭' });
	skipBtn.createSpan({ text: 'Skip' });
	skipBtn.addEventListener('click', () => {
		callbacks.onExerciseSkip(index);
	});

	// Add Set button
	const addSetBtn = controlsEl.createEl('button', { cls: 'workout-btn workout-btn-secondary' });
	addSetBtn.createSpan({ cls: 'workout-btn-icon', text: '+' });
	addSetBtn.createSpan({ text: 'Add Set' });
	addSetBtn.addEventListener('click', () => {
		callbacks.onExerciseAddSet(index);
	});

	// Finish button
	const finishBtn = controlsEl.createEl('button', { cls: 'workout-btn workout-btn-primary' });
	finishBtn.createSpan({ cls: 'workout-btn-icon', text: '✓' });
	finishBtn.createSpan({ text: 'Finish' });
	finishBtn.addEventListener('click', () => {
		callbacks.onExerciseFinish(index);
	});
}

export function updateExerciseTimer(
	timerEl: HTMLElement,
	timerState: TimerState,
	targetDuration?: number
): void {
	timerEl.empty();

	if (targetDuration !== undefined) {
		// Countdown mode
		const remaining = targetDuration - timerState.exerciseElapsed;
		if (remaining > 0) {
			timerEl.textContent = formatDuration(remaining);
			timerEl.createSpan({ cls: 'timer-indicator count-down', text: ' ▼' });
		} else {
			// Overtime
			timerEl.textContent = formatDuration(Math.abs(remaining));
			timerEl.addClass('overtime');
			timerEl.createSpan({ cls: 'timer-indicator overtime', text: ' ⚠' });
		}
	} else {
		// Count up mode
		timerEl.textContent = formatDuration(timerState.exerciseElapsed);
		timerEl.createSpan({ cls: 'timer-indicator count-up', text: ' ▲' });
	}
}
