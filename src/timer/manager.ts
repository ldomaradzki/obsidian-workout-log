/**
 * Central timer management for all active workouts.
 *
 * Responsibilities:
 * - Maintain timer state (elapsed times, pause/resume, active exercise/set)
 * - Manage rest periods with duration tracking and countdown
 * - Coordinate subscribers and notify on state changes
 * - Efficient animation frame scheduling (one frame for all timers)
 * - State change detection (only notify when values actually change)
 * - Handle tab visibility changes (resume on tab focus)
 *
 * Architecture:
 * - TimerManager singleton manages Map<workoutId, TimerInstance>
 * - Each workout has its own timer with subscribers
 * - Uses requestAnimationFrame to update all timers efficiently
 * - Tracks previous state to avoid redundant callbacks
 * - Pause/resume handled at workout level (affects both exercise and rest timers)
 */

import { TimerInstance, TimerState, TimerCallback } from '../types';

/**
 * Manages timers for all active workouts with centralized state and callbacks.
 *
 * Public API:
 * - startWorkoutTimer() - Initialize or resume a workout timer
 * - advanceExercise() - Move to next exercise and reset elapsed time
 * - advanceSet() - Move to next set within same exercise
 * - startRest() - Begin rest period after set completion
 * - exitRest() - End rest period and advance to next set
 * - pauseExercise() / resumeExercise() - Pause/resume all timers
 * - stopWorkoutTimer() - Clean up timer and remove all subscribers
 * - subscribe() / getTimerState() - Query and monitor timer state
 * - isTimerRunning() / getActiveExerciseIndex() - Query current state
 *
 * Subscription model:
 * - Callbacks notified only when state meaningfully changes
 * - Unsubscribe function returned from subscribe()
 * - Auto-cleanup when last subscriber unsubscribes
 */
export class TimerManager {
	private timers: Map<string, TimerInstance> = new Map();
	private frameId: number | null = null;
	private lastSecond: number = 0;
	private onAutoAdvance: ((workoutId: string) => void) | null = null;
	// Track state from last callback to detect meaningful changes
	private lastCalledState: Map<string, TimerState> = new Map();
	// Track timeouts for graceful cleanup of orphaned timers
	private cleanupTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();

	/**
	 * Create a TimerManager instance.
	 * Listens for tab visibility changes to resume timers when tab becomes active.
	 */
	constructor() {
		// Resume timers when tab becomes visible (was in background)
		document.addEventListener('visibilitychange', () => {
			if (!document.hidden && this.timers.size > 0) {
				// Tab just became visible - force immediate update
				this.tick();
			}
		});
	}

	/**
	 * Set callback for auto-advance triggers (e.g., countdown timer completion).
	 * Called by main plugin to handle automatic progression.
	 */
	setAutoAdvanceCallback(callback: (workoutId: string) => void): void {
		this.onAutoAdvance = callback;
	}

	/**
	 * Start or resume a workout timer.
	 *
	 * If timer already exists:
	 * - Resets exercise timers
	 * - Preserves workout start time (for total elapsed)
	 * - Clears rest state
	 *
	 * If timer doesn't exist:
	 * - Creates new TimerInstance with current timestamp
	 * - Initializes empty callbacks set
	 * - Sets activeExerciseIndex to specified value (default 0)
	 *
	 * Parameters:
	 * - workoutId: Unique identifier for this workout
	 * - activeExerciseIndex: Starting exercise index (default 0)
	 * - elapsedWorkoutSeconds: Seconds already elapsed from a previous session (default 0)
	 */
	startWorkoutTimer(workoutId: string, activeExerciseIndex: number = 0, elapsedWorkoutSeconds: number = 0): void {
		const now = Date.now();
		const workoutStartTime = now - (elapsedWorkoutSeconds * 1000);

		const existing = this.timers.get(workoutId);
		if (existing) {
			// Resume existing timer with new exercise starting fresh
			existing.exerciseStartTime = now;
			existing.exercisePausedTime = 0;
			existing.isPaused = false;
			existing.activeExerciseIndex = activeExerciseIndex;
			existing.activeSetIndex = 0;
			existing.isRestActive = false;
			existing.restPausedTime = 0;
			existing.restDuration = 0;
		} else {
			// Create new timer instance
			this.timers.set(workoutId, {
				workoutId,
				workoutStartTime,        // Total elapsed from workout start (never paused)
				exerciseStartTime: now,  // Current exercise/set start time
				exercisePausedTime: 0,   // Accumulated time when paused
				isPaused: false,
				activeExerciseIndex,
				activeSetIndex: 0,
				isRestActive: false,
				restStartTime: now,
				restPausedTime: 0,       // Accumulated time for paused rest
				restDuration: 0,         // Total rest seconds to count down from
				callbacks: new Set()
			});
		}

		this.ensureFrame();
	}

	/**
	 * Move to the next exercise and reset its timer.
	 *
	 * Clears exercise elapsed time, exits any active rest, and starts fresh.
	 * Set index resets to 0 (first set of new exercise).
	 *
	 * Parameters:
	 * - workoutId: Workout identifier
	 * - newExerciseIndex: Index of next exercise
	 */
	advanceExercise(workoutId: string, newExerciseIndex: number): void {
		const timer = this.timers.get(workoutId);
		if (!timer) return;

		// Reset exercise timer counters
		timer.exerciseStartTime = Date.now();
		timer.exercisePausedTime = 0;
		timer.isPaused = false;
		timer.activeExerciseIndex = newExerciseIndex;
		timer.activeSetIndex = 0;  // Start at first set of new exercise
		// Exit any active rest
		timer.isRestActive = false;
		timer.restPausedTime = 0;
		timer.restDuration = 0;
	}

	/**
	 * Advance to the next set within the same (or specified) exercise.
	 *
	 * Resets exercise elapsed time for the new set.
	 * Exits any active rest period.
	 *
	 * Parameters:
	 * - workoutId: Workout identifier
	 * - exerciseIndex: Exercise index
	 * - setIndex: Index of next set within exercise
	 */
	advanceSet(workoutId: string, exerciseIndex: number, setIndex: number): void {
		const timer = this.timers.get(workoutId);
		if (!timer) return;

		// Reset exercise timer for new set
		timer.exerciseStartTime = Date.now();
		timer.exercisePausedTime = 0;
		timer.isPaused = false;
		timer.activeExerciseIndex = exerciseIndex;
		timer.activeSetIndex = setIndex;
		// Exit rest if active
		timer.isRestActive = false;
		timer.restPausedTime = 0;
		timer.restDuration = 0;
	}

	/**
	 * Begin a rest period between sets.
	 *
	 * Initializes countdown from specified rest duration.
	 * Rest timer counts down to 0, then shows negative (overtime) values.
	 *
	 * Parameters:
	 * - workoutId: Workout identifier
	 * - restDurationSeconds: Duration in seconds to rest
	 */
	startRest(workoutId: string, restDurationSeconds: number): void {
		const timer = this.timers.get(workoutId);
		if (!timer) return;

		timer.isRestActive = true;
		timer.restStartTime = Date.now();
		timer.restPausedTime = 0;
		timer.isPaused = false;
		timer.restDuration = restDurationSeconds;  // Countdown target
	}

	/**
	 * Exit rest period and advance to next set.
	 *
	 * Clears rest state and resets exercise timer for the next set.
	 *
	 * Parameters:
	 * - workoutId: Workout identifier
	 * - nextExerciseIndex: Exercise index to advance to
	 * - nextSetIndex: Set index within that exercise
	 */
	exitRest(workoutId: string, nextExerciseIndex: number, nextSetIndex: number): void {
		const timer = this.timers.get(workoutId);
		if (!timer) return;

		// Clear rest state
		timer.isRestActive = false;
		timer.restPausedTime = 0;
		timer.restDuration = 0;
		// Start timer for next set
		timer.exerciseStartTime = Date.now();
		timer.exercisePausedTime = 0;
		timer.activeExerciseIndex = nextExerciseIndex;
		timer.activeSetIndex = nextSetIndex;
	}

	/**
	 * Pause exercise timer and any active rest timer.
	 *
	 * Records elapsed time at moment of pause.
	 * Resume with resumeExercise() to continue from same point.
	 *
	 * Parameters:
	 * - workoutId: Workout identifier
	 */
	pauseExercise(workoutId: string): void {
		const timer = this.timers.get(workoutId);
		if (!timer || timer.isPaused) return;

		timer.isPaused = true;
		// Record elapsed time at moment of pause
		const now = Date.now();
		if (timer.isRestActive) {
			timer.restPausedTime += now - timer.restStartTime;
		} else {
			timer.exercisePausedTime += now - timer.exerciseStartTime;
		}
	}

	/**
	 * Resume paused exercise timer.
	 *
	 * Restarts from point where pause() was called.
	 *
	 * Parameters:
	 * - workoutId: Workout identifier
	 */
	resumeExercise(workoutId: string): void {
		const timer = this.timers.get(workoutId);
		if (!timer || !timer.isPaused) return;

		timer.isPaused = false;
		// Reset start time to now (continue from pause point with accumulated time)
		if (timer.isRestActive) {
			timer.restStartTime = Date.now();
		} else {
			timer.exerciseStartTime = Date.now();
		}
	}

	/**
	 * Stop and clean up a workout timer.
	 *
	 * Removes timer instance and all subscribers.
	 * Cancels animation frame if no more active timers.
	 *
	 * Parameters:
	 * - workoutId: Workout identifier
	 */
	stopWorkoutTimer(workoutId: string): void {
		this.timers.delete(workoutId);
		this.lastCalledState.delete(workoutId);

		const timeout = this.cleanupTimeouts.get(workoutId);
		if (timeout) {
			clearTimeout(timeout);
			this.cleanupTimeouts.delete(workoutId);
		}

		// Cancel animation frame if no more active timers
		if (this.timers.size === 0 && this.frameId !== null) {
			cancelAnimationFrame(this.frameId);
			this.frameId = null;
			this.lastSecond = 0;
		}
	}

	/**
	 * Subscribe to timer state changes for a workout.
	 *
	 * Callback called immediately with current state, then on each meaningful change.
	 * Only notifies when exerciseElapsed, restRemaining, or isRestActive actually change.
	 *
	 * Parameters:
	 * - workoutId: Workout identifier
	 * - callback: Function called with TimerState on changes
	 *
	 * Returns: Unsubscribe function (removes callback and cleans up timer if last subscriber)
	 */
	subscribe(workoutId: string, callback: TimerCallback): () => void {
		const timer = this.timers.get(workoutId);
		if (!timer) {
			// Timer doesn't exist, just return a no-op unsubscribe
			return () => {};
		}

		timer.callbacks.add(callback);

		// Clear any pending cleanup timeout since we have a new subscriber
		const existingTimeout = this.cleanupTimeouts.get(workoutId);
		if (existingTimeout) {
			clearTimeout(existingTimeout);
			this.cleanupTimeouts.delete(workoutId);
		}

		// Immediately call with current state
		const state = this.getTimerState(workoutId);
		if (state) {
			callback(state);
			this.lastCalledState.set(workoutId, state);
		}

		// Return unsubscribe function
		return () => {
			timer.callbacks.delete(callback);

			// Graceful Auto-cleanup: wait 5 minutes before deleting to allow for UI re-renders
			if (timer.callbacks.size === 0) {
				const timeout = setTimeout(() => {
					this.timers.delete(workoutId);
					this.lastCalledState.delete(workoutId);
					this.cleanupTimeouts.delete(workoutId);

					// Cancel animation frame if no timers left
					if (this.timers.size === 0 && this.frameId !== null) {
						cancelAnimationFrame(this.frameId);
						this.frameId = null;
						this.lastSecond = 0;
					}
				}, 300000); // 5 minutes grace period
				
				this.cleanupTimeouts.set(workoutId, timeout);
			}
		};
	}

	/**
	 * Get current timer state for a workout.
	 *
	 * Calculates elapsed times based on start times and pause state:
	 * - workoutElapsed: Total from workout start (never paused)
	 * - exerciseElapsed: Current exercise/set time (respects pause)
	 * - restElapsed: Time accumulated during rest (respects pause)
	 * - restRemaining: Seconds left in rest countdown (0+ or undefined if not resting)
	 *
	 * Returns: TimerState object or null if timer doesn't exist
	 */
	getTimerState(workoutId: string): TimerState | null {
		const timer = this.timers.get(workoutId);
		if (!timer) return null;

		const now = Date.now();

		// Total workout elapsed: always counting, no pause
		const workoutElapsed = Math.floor((now - timer.workoutStartTime) / 1000);

		// Exercise elapsed: respects pause state
		let exerciseElapsed: number;
		if (timer.isPaused) {
			exerciseElapsed = Math.floor(timer.exercisePausedTime / 1000);
		} else {
			const currentExerciseTime = now - timer.exerciseStartTime;
			exerciseElapsed = Math.floor((timer.exercisePausedTime + currentExerciseTime) / 1000);
		}

		// Rest elapsed and remaining: only if rest is active
		let restElapsed: number | undefined;
		let restRemaining: number | undefined;
		
		if (timer.isRestActive) {
			if (timer.isPaused) {
				restElapsed = Math.floor(timer.restPausedTime / 1000);
			} else {
				const currentRestTime = now - timer.restStartTime;
				restElapsed = Math.floor((timer.restPausedTime + currentRestTime) / 1000);
			}
			restRemaining = Math.max(0, timer.restDuration - restElapsed);
		}

		return {
			workoutElapsed,
			exerciseElapsed,
			isOvertime: false,  // Calculated by caller with target duration
			isRestActive: timer.isRestActive,
			restElapsed,
			restRemaining
		};
	}

	/**
	 * Get the currently active exercise index.
	 *
	 * Returns: Exercise index or 0 if timer doesn't exist
	 */
	getActiveExerciseIndex(workoutId: string): number {
		const timer = this.timers.get(workoutId);
		return timer?.activeExerciseIndex ?? 0;
	}

	/**
	 * Get the currently active set index.
	 *
	 * Returns: Set index or 0 if timer doesn't exist
	 */
	getActiveSetIndex(workoutId: string): number {
		const timer = this.timers.get(workoutId);
		return timer?.activeSetIndex ?? 0;
	}

	/**
	 * Update the active exercise index.
	 *
	 * Only resets exercise timer if index actually changes.
	 * Automatically resets to first set (activeSetIndex = 0).
	 *
	 * Parameters:
	 * - workoutId: Workout identifier
	 * - index: New exercise index
	 */
	setActiveExerciseIndex(workoutId: string, index: number): void {
		const timer = this.timers.get(workoutId);
		if (!timer) return;

		// Only reset exercise timer if index actually changed
		if (timer.activeExerciseIndex !== index) {
			timer.activeExerciseIndex = index;
			timer.activeSetIndex = 0;
			timer.exerciseStartTime = Date.now();
			timer.exercisePausedTime = 0;
			timer.isPaused = false;
		}
	}

	/**
	 * Check if a timer is running for the workout.
	 *
	 * Returns: true if timer exists and has active subscribers
	 */
	isTimerRunning(workoutId: string): boolean {
		return this.timers.has(workoutId);
	}

	/**
	 * Manually notify all subscribers of current timer state.
	 *
	 * Used when state changes require immediate UI update (e.g., exercise skip).
	 * Only notifies if state has meaningfully changed since last callback.
	 *
	 * Parameters:
	 * - workoutId: Workout identifier
	 */
	notifySubscribers(workoutId: string): void {
		const timer = this.timers.get(workoutId);
		if (!timer) return;

		const state = this.getTimerState(workoutId);
		if (!state) return;

		// Call all subscribers with current state and update lastCalledState
		if (this.stateChanged(workoutId, state)) {
			this.lastCalledState.set(workoutId, state);

			for (const callback of timer.callbacks) {
				callback(state);
			}
		}
	}

	/**
	 * Check if pause state has changed for a timer.
	 *
	 * Returns: true if paused, false if running or timer doesn't exist
	 */
	isPaused(workoutId: string): boolean {
		const timer = this.timers.get(workoutId);
		return timer?.isPaused ?? false;
	}

	/**
	 * Ensure animation frame is scheduled for timer updates.
	 *
	 * Uses requestAnimationFrame to update all timers efficiently.
	 * Only processes on actual second change (not every frame).
	 * Automatically cancels when no timers remain.
	 *
	 * Private: Called automatically by start/pause/resume methods.
	 */
	private ensureFrame(): void {
		if (this.frameId !== null) return;  // Already scheduled

		const scheduleNextFrame = () => {
			this.frameId = requestAnimationFrame(() => {
				this.frameId = null;

				const now = Date.now();
				const currentSecond = Math.floor(now / 1000);

				// Only process on actual second change (reduces callback frequency)
				if (currentSecond !== this.lastSecond) {
					this.lastSecond = currentSecond;
					this.tick();
				}

				// Schedule next frame if timers still active
				if (this.timers.size > 0) {
					scheduleNextFrame();
				}
			});
		};

		scheduleNextFrame();
	}

	/**
	 * Process all timers and notify subscribers of state changes.
	 *
	 * Called once per second by ensureFrame().
	 * Skips timers with no active subscribers.
	 * Only calls callbacks if state meaningfully changed.
	 *
	 * Private: Called via requestAnimationFrame by ensureFrame().
	 */
	private tick(): void {
		for (const [workoutId, timer] of this.timers) {
			// Skip if no active subscribers
			if (timer.callbacks.size === 0) continue;

			const state = this.getTimerState(workoutId);
			if (!state) continue;

			// Only callback if state meaningfully changed
			if (this.stateChanged(workoutId, state)) {
				this.lastCalledState.set(workoutId, state);

				for (const callback of timer.callbacks) {
					callback(state);
				}
			}
		}
	}

	/**
	 * Check if timer state has meaningfully changed since last callback.
	 *
	 * Only triggers callbacks for changes to:
	 * - exerciseElapsed (second boundary)
	 * - restRemaining (countdown changed)
	 * - isRestActive (entered/exited rest)
	 *
	 * Ignores: workoutElapsed (always increasing), other timer details
	 *
	 * Private: Used by tick() and notifySubscribers().
	 */
	private stateChanged(workoutId: string, current: TimerState): boolean {
		const prev = this.lastCalledState.get(workoutId);
		if (!prev) return true;

		return (
			prev.exerciseElapsed !== current.exerciseElapsed ||
			prev.restRemaining !== current.restRemaining ||
			prev.isRestActive !== current.isRestActive
		);
	}

	/**
	 * Check if exercise duration target has been exceeded and trigger auto-advance.
	 *
	 * Called by renderer to check if countdown timer finished.
	 * Calls onAutoAdvance callback if elapsed >= targetDuration.
	 *
	 * Parameters:
	 * - workoutId: Workout identifier
	 * - targetDuration: Target duration in seconds (if undefined, no auto-advance)
	 */
	checkAutoAdvance(workoutId: string, targetDuration: number | undefined): void {
		if (targetDuration === undefined) return;

		const state = this.getTimerState(workoutId);
		if (!state) return;

		if (state.exerciseElapsed >= targetDuration && this.onAutoAdvance) {
			this.onAutoAdvance(workoutId);
		}
	}

	/**
	 * Cleanup: Cancel all timers and clear state.
	 *
	 * Used during plugin shutdown or cleanup.
	 * Cancels any pending animation frame.
	 * Clears all timer and callback data.
	 */
	destroy(): void {
		if (this.frameId !== null) {
			cancelAnimationFrame(this.frameId);
			this.frameId = null;
		}
		this.timers.clear();
		this.lastCalledState.clear();
		for (const timeout of this.cleanupTimeouts.values()) {
			clearTimeout(timeout);
		}
		this.cleanupTimeouts.clear();
	}
}
