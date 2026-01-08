import { TimerInstance, TimerState, TimerCallback } from '../types';

export class TimerManager {
	private timers: Map<string, TimerInstance> = new Map();
	private intervalId: number | null = null;
	private onAutoAdvance: ((workoutId: string) => void) | null = null;

	setAutoAdvanceCallback(callback: (workoutId: string) => void): void {
		this.onAutoAdvance = callback;
	}

	startWorkoutTimer(workoutId: string, activeExerciseIndex: number = 0): void {
		const now = Date.now();

		const existing = this.timers.get(workoutId);
		if (existing) {
			// Resume existing timer with new exercise
			existing.exerciseStartTime = now;
			existing.exercisePausedTime = 0;
			existing.isPaused = false;
			existing.activeExerciseIndex = activeExerciseIndex;
		} else {
			this.timers.set(workoutId, {
				workoutId,
				workoutStartTime: now,
				exerciseStartTime: now,
				exercisePausedTime: 0,
				isPaused: false,
				activeExerciseIndex,
				callbacks: new Set()
			});
		}

		this.ensureInterval();
	}

	advanceExercise(workoutId: string, newExerciseIndex: number): void {
		const timer = this.timers.get(workoutId);
		if (!timer) return;

		timer.exerciseStartTime = Date.now();
		timer.exercisePausedTime = 0;
		timer.isPaused = false;
		timer.activeExerciseIndex = newExerciseIndex;
	}

	pauseExercise(workoutId: string): void {
		const timer = this.timers.get(workoutId);
		if (!timer || timer.isPaused) return;

		timer.isPaused = true;
		// Store how much time has passed for this exercise
		const now = Date.now();
		timer.exercisePausedTime += now - timer.exerciseStartTime;
	}

	resumeExercise(workoutId: string): void {
		const timer = this.timers.get(workoutId);
		if (!timer || !timer.isPaused) return;

		timer.isPaused = false;
		timer.exerciseStartTime = Date.now();
	}

	stopWorkoutTimer(workoutId: string): void {
		this.timers.delete(workoutId);

		if (this.timers.size === 0 && this.intervalId !== null) {
			window.clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	subscribe(workoutId: string, callback: TimerCallback): () => void {
		const timer = this.timers.get(workoutId);
		if (!timer) {
			// Timer doesn't exist, just return a no-op unsubscribe
			return () => {};
		}

		timer.callbacks.add(callback);

		// Immediately call with current state
		const state = this.getTimerState(workoutId);
		if (state) {
			callback(state);
		}

		return () => {
			timer.callbacks.delete(callback);
		};
	}

	getTimerState(workoutId: string): TimerState | null {
		const timer = this.timers.get(workoutId);
		if (!timer) return null;

		const now = Date.now();

		// Total workout elapsed (always running, no pause)
		const workoutElapsed = Math.floor((now - timer.workoutStartTime) / 1000);

		// Exercise elapsed (respects pause)
		let exerciseElapsed: number;
		if (timer.isPaused) {
			exerciseElapsed = Math.floor(timer.exercisePausedTime / 1000);
		} else {
			const currentExerciseTime = now - timer.exerciseStartTime;
			exerciseElapsed = Math.floor((timer.exercisePausedTime + currentExerciseTime) / 1000);
		}

		return {
			workoutElapsed,
			exerciseElapsed,
			isOvertime: false  // Calculated by caller with target duration
		};
	}

	getActiveExerciseIndex(workoutId: string): number {
		const timer = this.timers.get(workoutId);
		return timer?.activeExerciseIndex ?? 0;
	}

	isTimerRunning(workoutId: string): boolean {
		return this.timers.has(workoutId);
	}

	isPaused(workoutId: string): boolean {
		const timer = this.timers.get(workoutId);
		return timer?.isPaused ?? false;
	}

	private ensureInterval(): void {
		if (this.intervalId !== null) return;

		this.intervalId = window.setInterval(() => {
			this.tick();
		}, 1000);
	}

	private tick(): void {
		for (const [workoutId, timer] of this.timers) {
			const state = this.getTimerState(workoutId);
			if (!state) continue;

			for (const callback of timer.callbacks) {
				callback(state);
			}
		}
	}

	// Called when we need to check for auto-advance (countdown completed)
	checkAutoAdvance(workoutId: string, targetDuration: number | undefined): void {
		if (targetDuration === undefined) return;

		const state = this.getTimerState(workoutId);
		if (!state) return;

		if (state.exerciseElapsed >= targetDuration && this.onAutoAdvance) {
			this.onAutoAdvance(workoutId);
		}
	}

	// Cleanup all timers
	destroy(): void {
		if (this.intervalId !== null) {
			window.clearInterval(this.intervalId);
			this.intervalId = null;
		}
		this.timers.clear();
	}
}
