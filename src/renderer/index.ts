/**
 * Main rendering orchestration for workout blocks.
 *
 * Responsibilities:
 * - Initialize and render the complete UI (header, exercises, controls)
 * - Manage timer subscriptions and state updates
 * - Detect stale renders and prevent duplicate updates
 * - Auto-advance to next exercise on rest completion
 * - Handle focus-out events to flush pending changes
 *
 * Architecture:
 * - renderWorkout() is the entry point, receives parsed data and callbacks
 * - Delegates to specialized renderers (header, exercise, controls, emptyState)
 * - Subscribes to timer updates only if workout is active
 * - Stale render detection via activeIndex tracking
 */

import { ParsedWorkout, WorkoutCallbacks, TimerState } from '../types';
import { renderHeader, updateHeaderTimer } from './header';
import { renderExercise, updateExerciseTimer, ExerciseElements } from './exercise';
import { renderWorkoutControls } from './controls';
import { renderEmptyState } from './emptyState';
import { TimerManager } from '../timer/manager';

/**
 * Context object passed to renderWorkout containing all necessary data and callbacks.
 *
 * Properties:
 * - containerElement: DOM element where content will be rendered
 * - parsed: ParsedWorkout data structure with metadata and exercises
 * - callbacks: User action handlers (set completion, timer events, etc.)
 * - workoutId: Unique identifier for this workout (used to track timer state)
 * - timerManager: Manages timers for all active workouts
 */
export interface RendererContext {
	containerElement: HTMLElement;
	parsed: ParsedWorkout;
	callbacks: WorkoutCallbacks;
	workoutId: string;
	timerManager: TimerManager;
}

/**
 * Render a complete workout UI with all sections and timer subscriptions.
 *
 * Flow:
 * 1. Clear existing content and create container
 * 2. Check if workout has active timer
 * 3. Render header with metadata and timer display
 * 4. Handle empty state if no exercises (planned workout)
 * 5. Render each exercise with current timer state and set information
 * 6. Render workout-level controls (Start, Mark Complete, etc.)
 * 7. Subscribe to timer updates if workout is active
 * 8. Set up focus-out handler to flush pending changes
 *
 * Key Logic:
 * - Stale render detection: tracks initialActiveIndex to detect when UI becomes stale
 * - Only processes timer updates if activeIndex hasn't changed
 * - Auto-advance on rest completion checks multiple conditions
 * - Updates header timer separately from exercise/set timers
 */
export function renderWorkout(ctx: RendererContext): void {
	const { containerElement, parsed, callbacks, workoutId, timerManager } = ctx;

	// Clear previous content
	containerElement.empty();

	const container = containerElement.createDiv({
		cls: `workout-container state-${parsed.metadata.state}`
	});

	// Check if timer is running and get current active indices
	const isTimerRunning = timerManager.isTimerRunning(workoutId);
	const timerState = timerManager.getTimerState(workoutId);
	const initialActiveIndex = isTimerRunning
		? timerManager.getActiveExerciseIndex(workoutId)
		: -1;

	// Render header section with metadata
	const { timerEl: headerTimerEl } = renderHeader(
		container,
		parsed.metadata,
		timerState,
		isTimerRunning
	);

	// Handle empty state: show sample workout prompt if no exercises
	if (parsed.exercises.length === 0 && parsed.metadata.state === 'planned') {
		renderEmptyState(container, callbacks.onAddSample);
		return;
	}

	// Render all exercises
	const exerciseElements: ExerciseElements[] = [];

	const exercisesContainer = container.createDiv({ cls: 'workout-exercises' });

	// Set CSS variable for name alignment (used by CSS for columnar layout)
	const maxNameLength = Math.max(...parsed.exercises.map(e => e.name.length));
	exercisesContainer.style.setProperty('--max-name-chars', String(maxNameLength));

	// Use callbacks directly - rest logic handled in callbacks
	const exerciseCallbacks = callbacks;

	for (let i = 0; i < parsed.exercises.length; i++) {
		const exercise = parsed.exercises[i];
		if (!exercise) continue;

		// Determine if this exercise is currently active
		const isActive = i === initialActiveIndex;
		const activeSetIndex = isActive ? timerManager.getActiveSetIndex(workoutId) : -1;

		const elements = renderExercise(
			exercisesContainer,
			exercise,
			i,
			isActive,
			activeSetIndex,
			isActive ? timerState : null,
			exerciseCallbacks,
			parsed.metadata.state,
			parsed.metadata.restDuration,
			parsed.exercises.length // totalExercises
		);
		exerciseElements.push(elements);
	}

	// Render workout-level controls (Start, Mark Complete, etc.)
	renderWorkoutControls(container, parsed.metadata.state, callbacks, parsed);

	// Flush pending changes when focus leaves the workout container
	// This ensures all edits are saved before the user moves away
	container.addEventListener('focusout', (e) => {
		const relatedTarget = e.relatedTarget as HTMLElement | null;
		// Only flush if focus is leaving the container entirely (not moving within it)
		if (!relatedTarget || !container.contains(relatedTarget)) {
			callbacks.onFlushChanges();
		}
	});

	// Subscribe to timer updates and handle state changes
	if (isTimerRunning) {
		// Track initial active index to detect stale renders
		// When Obsidian re-renders a code block, the new render will get different indices
		let lastKnownActiveIndex = initialActiveIndex;
		// Prevent multiple auto-advances from the same render instance
		let hasAutoAdvanced = false;
		let unsubscribe: () => void;

		unsubscribe = timerManager.subscribe(workoutId, (state: TimerState) => {
			// Stale render detection: if the container is no longer in the DOM, unsubscribe and stop.
			// This prevents updates from old renders after a re-render, which can cause race conditions
			// when the app is backgrounded and then brought back to the foreground.
			if (!container.isConnected) {
				if (unsubscribe) unsubscribe();
				return;
			}

			// Update the header timer display
			updateHeaderTimer(headerTimerEl, state);

			// Get current active index from timer manager (not stale capture)
			const currentActiveIndex = timerManager.getActiveExerciseIndex(workoutId);
			const currentSetActiveIndex = timerManager.getActiveSetIndex(workoutId);
			

			// Stale render detection: if active index changed, a new render is handling updates
			// Stop processing - this render is obsolete
			if (currentActiveIndex !== lastKnownActiveIndex) {
				console.log('Stale render detected. Current active index:', currentActiveIndex, 'Last known active index:', lastKnownActiveIndex);
				if (unsubscribe) unsubscribe();
				return;
			}

			// Update the active exercise's timer display
			const activeElements = exerciseElements[currentActiveIndex];
			const activeExercise = parsed.exercises[currentActiveIndex];
			const activeSet = activeExercise?.sets[currentSetActiveIndex];

			if (activeExercise) {
				// Update set timer if exercise has multisets
				if (activeElements?.setTimerEl && !state.isRestActive) {
					console.log(`[active] Active Exercise: [${currentActiveIndex}] ${activeExercise.name}, Active Set: [${currentSetActiveIndex}] ${activeSet?.lineIndex}`)
					updateExerciseTimer(
						activeElements.setTimerEl,
						state,
						activeSet?.targetDuration  // Set timers are count-up, not countdown
					);
				}
				// Update exercise timer if exercise has multiset and is in rest
				else if (activeElements?.setTimerEl && state.isRestActive) { 
					console.log(`[rest] Active Exercise: [${currentActiveIndex}] ${activeExercise.name}, Active Set: [${currentSetActiveIndex}] ${activeSet?.lineIndex}`)
					updateExerciseTimer(
						activeElements.setTimerEl,
						state,
						activeSet?.targetRest  // Set timers are count-up, not countdown
					);
				}
				else if (activeElements?.timerEl && !state.isRestActive) {
					// Update exercise timer while active if not multiset
					console.log(`[active] Active Exercise: [${currentActiveIndex}] ${activeExercise.name}`);
					updateExerciseTimer(
						activeElements.timerEl,
						state,
						activeExercise.sets[0]?.targetDuration
					);
				}
				else if (activeElements?.timerEl && state.isRestActive) {
					// Update exercise timer while rest if not multiset
					console.log(`[rest] Active Exercise: [${currentActiveIndex}] ${activeExercise.name}`);
					updateExerciseTimer(
						activeElements.timerEl,
						state,
						activeExercise.sets[0]?.targetRest
					);
				}

				// Auto-advance to next exercise when rest completes
				// Conditions: (1) on last set, (2) not last exercise, (3) rest has an editable bracket
				const isLastSet = activeExercise.sets.length > 0 &&
					(timerManager.getActiveSetIndex(workoutId) === activeExercise.sets.length - 1);
				const isLastExercise = currentActiveIndex === parsed.exercises.length - 1;

				const restParam = activeSet?.params.find(p => p.key.toLowerCase() === 'rest') || 
					activeExercise.params.find(p => p.key.toLowerCase() === 'rest');
				const isRestEditable = restParam?.editable ?? false;

				if (
					isLastSet && !isLastExercise && state.isRestActive &&
					typeof state.restRemaining === 'number' && state.restRemaining <= 0 && !hasAutoAdvanced &&
					isRestEditable
				) {
					hasAutoAdvanced = true;
					// Trigger advance to next exercise
					callbacks.onRestEnd(currentActiveIndex);
				}
			}
		});
	}
}

// Re-export specialized rendering functions for header (and update functions)
export { renderHeader, updateHeaderTimer } from './header';
export { renderExercise, updateExerciseTimer } from './exercise';
export { renderWorkoutControls } from './controls';
