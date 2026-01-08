import { ParsedWorkout, WorkoutCallbacks, TimerState } from '../types';
import { renderHeader, updateHeaderTimer } from './header';
import { renderExercise, updateExerciseTimer, ExerciseElements } from './exercise';
import { renderWorkoutControls } from './controls';
import { TimerManager } from '../timer/manager';

export interface RendererContext {
	el: HTMLElement;
	parsed: ParsedWorkout;
	callbacks: WorkoutCallbacks;
	workoutId: string;
	timerManager: TimerManager;
}

export function renderWorkout(ctx: RendererContext): void {
	const { el, parsed, callbacks, workoutId, timerManager } = ctx;

	// Clear existing content
	el.empty();

	const container = el.createDiv({
		cls: `workout-container state-${parsed.metadata.state}`
	});

	const isTimerRunning = timerManager.isTimerRunning(workoutId);
	const timerState = timerManager.getTimerState(workoutId);
	const initialActiveIndex = isTimerRunning
		? timerManager.getActiveExerciseIndex(workoutId)
		: -1;

	// Render header
	const { timerEl: headerTimerEl } = renderHeader(
		container,
		parsed.metadata,
		timerState,
		isTimerRunning
	);

	// Render exercises
	const exerciseElements: ExerciseElements[] = [];

	const exercisesContainer = container.createDiv({ cls: 'workout-exercises' });

	for (let i = 0; i < parsed.exercises.length; i++) {
		const exercise = parsed.exercises[i];
		if (!exercise) continue;

		const isActive = i === initialActiveIndex;
		const elements = renderExercise(
			exercisesContainer,
			exercise,
			i,
			isActive,
			isActive ? timerState : null,
			callbacks,
			parsed.metadata.state
		);
		exerciseElements.push(elements);
	}

	// Render workout-level controls
	renderWorkoutControls(container, parsed.metadata.state, callbacks, parsed);

	// Subscribe to timer updates if workout is in progress
	if (isTimerRunning) {
		// Track the active index at render time to detect when it changes
		let lastKnownActiveIndex = initialActiveIndex;
		// Flag to prevent multiple auto-advances from this render instance
		let hasAutoAdvanced = false;

		timerManager.subscribe(workoutId, (state: TimerState) => {
			// Update header timer
			updateHeaderTimer(headerTimerEl, state);

			// Get the CURRENT active index from the timer manager (not the stale one)
			const currentActiveIndex = timerManager.getActiveExerciseIndex(workoutId);

			// If the active index changed, this render instance is stale
			// Don't process updates - a new render will take over
			if (currentActiveIndex !== lastKnownActiveIndex) {
				return;
			}

			// Update active exercise timer
			const activeElements = exerciseElements[currentActiveIndex];
			const activeExercise = parsed.exercises[currentActiveIndex];

			if (activeElements?.timerEl && activeExercise) {
				updateExerciseTimer(
					activeElements.timerEl,
					state,
					activeExercise.targetDuration
				);

				// Check for auto-advance on countdown completion
				// Only trigger once per render instance
				if (!hasAutoAdvanced && activeExercise.targetDuration !== undefined) {
					if (state.exerciseElapsed >= activeExercise.targetDuration) {
						hasAutoAdvanced = true;
						// Auto-advance to next exercise
						callbacks.onExerciseFinish(currentActiveIndex);
					}
				}
			}
		});
	}
}

export { renderHeader, updateHeaderTimer } from './header';
export { renderExercise, updateExerciseTimer } from './exercise';
export { renderWorkoutControls } from './controls';
