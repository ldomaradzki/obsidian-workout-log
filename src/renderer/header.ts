/**
 * Header rendering for workout blocks.
 *
 * Renders the top section of a workout display including:
 * - Workout title/name
 * - Rest duration setting (if defined)
 * - Total elapsed timer (during active workouts)
 *
 * Key features:
 * - renderHeader() creates the initial header structure with state-dependent timer display
 * - updateHeaderTimer() efficiently updates the timer display during workout progress
 * - Timer shows different info based on workout state (planned, started, completed)
 */

import { Constants, WorkoutMetadata, TimerState } from '../types';
import { formatDuration, formatDurationHuman } from '../parser/exercise';

/**
 * Render the workout header section.
 *
 * Creates the header with:
 * - Title/name (from metadata or default "Workout")
 * - Rest duration display (if defined in metadata)
 * - Total elapsed timer with state-dependent formatting
 *
 * Timer states:
 * - completed: Shows recorded total duration with checkmark (✓)
 * - running: Shows "Total: MM:SS" with count-up indicator (▲)
 * - planned: Shows "--:--" placeholder
 *
 * Returns { titleEl, timerEl } for external updates during timer progress.
 */
export function renderHeader(
	container: HTMLElement,
	metadata: WorkoutMetadata,
	timerState: TimerState | null,
	isTimerRunning: boolean
): { titleEl: HTMLElement; timerEl: HTMLElement } {
	// Create header container
	const headerEl = container.createDiv({ cls: 'workout-header' });

	// Render workout title/name
	const titleEl = headerEl.createDiv({ cls: 'workout-title' });
	titleEl.textContent = metadata.title || 'Workout';

	// Display rest duration if defined in metadata
	if (metadata.restDuration) {
		const restDurationEl = headerEl.createDiv({ cls: 'workout-rest-duration' });
		const formattedRest = formatDurationHuman(metadata.restDuration);
		restDurationEl.setText(`Rest: ${formattedRest}`);
	}

	// Create timer container and element
	const timerContainer = headerEl.createDiv({ cls: 'workout-header-timer' });

	const timerEl = timerContainer.createSpan({ cls: 'workout-timer' });

	// Display timer based on workout state
	if (metadata.state === 'completed' && metadata.duration) {
		// Completed: show recorded final duration with checkmark
		timerEl.textContent = metadata.duration;
		timerEl.createSpan({ cls: 'workout-timer-indicator recorded', text: Constants.TIMER_ICONS['recorded'] });
	} else if (isTimerRunning && timerState) {
		// Running: show total elapsed time count-up
		timerEl.textContent = `Total: ${formatDuration(timerState.workoutElapsed)}`;
		timerEl.createSpan({ cls: 'workout-timer-indicator count-up', text: Constants.TIMER_ICONS['count-up'] });
	} else if (metadata.state === 'planned') {
		// Planned: show placeholder
		timerEl.textContent = '--:--';
	} else {
		// Other states: show placeholder
		timerEl.textContent = '--:--';
	}

	// Return elements for external access (used by renderWorkout for timer updates)
	return { titleEl, timerEl };
}

/**
 * Update the header timer display during active workout.
 *
 * Called repeatedly during timer intervals to show updated elapsed time.
 * Clears existing content and renders fresh timer display with:
 * - Total elapsed time formatted as MM:SS
 * - Count-up indicator (▲) to show timer is running
 *
 * Parameters:
 * - timerEl: Header timer element to update
 * - timerState: Current timer state with workoutElapsed in seconds
 */
export function updateHeaderTimer(
	timerEl: HTMLElement,
	timerState: TimerState
): void {
	// Clear previous timer display
	timerEl.empty();
	
	// Display updated total elapsed time
	timerEl.textContent = `Total: ${formatDuration(timerState.workoutElapsed)}`;
	
	// Add count-up indicator to show timer actively running
	timerEl.createSpan({ cls: 'workout-timer-indicator count-up', text: Constants.TIMER_ICONS['count-up'] });
}
