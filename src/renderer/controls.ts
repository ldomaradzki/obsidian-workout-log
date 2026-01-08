import { WorkoutState, WorkoutCallbacks, ParsedWorkout } from '../types';
import { serializeWorkoutAsTemplate } from '../serializer';

export function renderWorkoutControls(
	container: HTMLElement,
	state: WorkoutState,
	callbacks: WorkoutCallbacks,
	parsed: ParsedWorkout
): HTMLElement {
	const controlsEl = container.createDiv({ cls: 'workout-controls' });

	if (state === 'planned') {
		const startBtn = controlsEl.createEl('button', {
			cls: 'workout-btn workout-btn-primary workout-btn-large'
		});
		startBtn.createSpan({ cls: 'workout-btn-icon', text: '▶' });
		startBtn.createSpan({ text: 'Start Workout' });
		startBtn.addEventListener('click', () => {
			callbacks.onStartWorkout();
		});
	} else if (state === 'completed') {
		// Completed label
		const completedLabel = controlsEl.createSpan({ cls: 'workout-completed-label' });
		completedLabel.createSpan({ cls: 'workout-btn-icon', text: '✓' });
		completedLabel.createSpan({ text: 'Completed' });

		// Copy as template button
		const copyBtn = controlsEl.createEl('button', { cls: 'workout-btn' });
		copyBtn.createSpan({ cls: 'workout-btn-icon', text: '📋' });
		copyBtn.createSpan({ text: 'Copy as Template' });
		copyBtn.addEventListener('click', async () => {
			const template = serializeWorkoutAsTemplate(parsed);
			await navigator.clipboard.writeText('```workout\n' + template + '\n```');

			// Visual feedback
			const textSpan = copyBtn.querySelector('span:last-child');
			if (textSpan) {
				const originalText = textSpan.textContent;
				textSpan.textContent = 'Copied!';
				setTimeout(() => {
					textSpan.textContent = originalText;
				}, 1500);
			}
		});
	}

	return controlsEl;
}
