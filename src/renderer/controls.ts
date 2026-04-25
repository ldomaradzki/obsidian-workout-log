/**
 * Workout-level control rendering.
 *
 * Renders state-dependent control buttons at the workout level:
 * - Planned state: "Start Workout" button to begin the workout
 * - Completed state: "Completed" label + "Copy as Template" button
 *
 * Key features:
 * - Double-click prevention on "Start Workout" via isProcessing flag
 * - Visual feedback (disabled state, processing class) during async operations
 * - Copy-to-clipboard with user confirmation ("Copied!" feedback)
 * - Template serialization for reusing completed workouts as templates
 */

import { WorkoutState, WorkoutCallbacks, ParsedWorkout } from '../types';
import { serializeWorkoutAsTemplate } from '../serializer';

/**
 * Render workout-level control buttons based on workout state.
 *
 * Displays different controls depending on state:
 *
 * STATE: planned
 * - Shows "Start Workout" button (▶ icon)
 * - Button triggers onStartWorkout callback
 * - Includes double-click prevention with isProcessing flag
 * - Visual feedback: disabled state + processing class during async start
 *
 * STATE: completed
 * - Shows "Completed" label (✓ icon)
 * - Shows "Copy as Template" button (📋 icon)
 * - Button copies template to clipboard with "Copied!" visual feedback (1.5s)
 * - Template serialization converts completed workout to reusable template
 *
 * Returns: Controls container element
 */
export function renderWorkoutControls(
	container: HTMLElement,
	state: WorkoutState,
	callbacks: WorkoutCallbacks,
	parsed: ParsedWorkout
): HTMLElement {
	const controlsEl = container.createDiv({ cls: 'workout-controls' });

	if (state === 'planned') {
		// Render "Start Workout" button
		const startBtn = controlsEl.createEl('button', {
			cls: 'workout-btn workout-btn-primary workout-btn-large'
		});
		startBtn.createSpan({ cls: 'workout-btn-icon', text: '▶' });
		startBtn.createSpan({ text: 'Start Workout' });

		// Double-click prevention: track if operation is in progress
		let isProcessing = false;
		const handleStart = async () => {
			// Bail if already processing
			if (isProcessing) return;
			
			isProcessing = true;
			startBtn.addClass('workout-btn-processing');
			startBtn.setAttribute('disabled', 'true');
			
			try {
				// Trigger workout start callback
				await callbacks.onStartWorkout();
			} finally {
				// Button will be gone after re-render, but reset just in case
				isProcessing = false;
				startBtn.removeClass('workout-btn-processing');
				startBtn.removeAttribute('disabled');
			}
		};
		startBtn.addEventListener('click', handleStart);
	} else if (state === 'completed') {
		// Render "Completed" status label
		const completedLabel = controlsEl.createSpan({ cls: 'workout-completed-label' });
		completedLabel.createSpan({ cls: 'workout-btn-icon', text: '✓' });
		completedLabel.createSpan({ text: 'Completed' });

		// Render "Copy as Template" button
		const copyBtn = controlsEl.createEl('button', { cls: 'workout-btn' });
		copyBtn.createSpan({ cls: 'workout-btn-icon', text: '📋' });
		copyBtn.createSpan({ text: 'Copy as Template' });
		
		// Click handler: serialize to template and copy to clipboard
		copyBtn.addEventListener('click', async () => {
			// Serialize completed workout as reusable template
			const template = serializeWorkoutAsTemplate(parsed);
			
			// Copy markdown code block to clipboard
			await navigator.clipboard.writeText('```workout\n' + template + '\n```');

			// Show "Copied!" confirmation for 1.5 seconds
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
