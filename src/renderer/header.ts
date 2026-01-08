import { WorkoutMetadata, TimerState } from '../types';
import { formatDuration } from '../parser/exercise';

export function renderHeader(
	container: HTMLElement,
	metadata: WorkoutMetadata,
	timerState: TimerState | null,
	isTimerRunning: boolean
): { titleEl: HTMLElement; timerEl: HTMLElement } {
	const headerEl = container.createDiv({ cls: 'workout-header' });

	const titleEl = headerEl.createDiv({ cls: 'workout-title' });
	titleEl.textContent = metadata.title || 'Workout';

	const timerContainer = headerEl.createDiv({ cls: 'workout-header-timer' });

	const timerEl = timerContainer.createSpan({ cls: 'workout-timer' });

	if (metadata.state === 'completed' && metadata.duration) {
		// Show recorded duration
		timerEl.textContent = metadata.duration;
		timerEl.createSpan({ cls: 'workout-timer-indicator recorded', text: ' ✓' });
	} else if (isTimerRunning && timerState) {
		// Show running timer
		timerEl.textContent = `Total: ${formatDuration(timerState.workoutElapsed)}`;
		timerEl.createSpan({ cls: 'workout-timer-indicator count-up', text: ' ▲' });
	} else if (metadata.state === 'planned') {
		timerEl.textContent = '--:--';
	} else {
		timerEl.textContent = '--:--';
	}

	return { titleEl, timerEl };
}

export function updateHeaderTimer(
	timerEl: HTMLElement,
	timerState: TimerState
): void {
	timerEl.empty();
	timerEl.textContent = `Total: ${formatDuration(timerState.workoutElapsed)}`;
	timerEl.createSpan({ cls: 'workout-timer-indicator count-up', text: ' ▲' });
}
