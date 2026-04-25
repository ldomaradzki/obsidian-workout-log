import { TimerManager } from './manager';

describe('TimerManager', () => {
	let manager: TimerManager;
	let dateNowSpy: jest.SpyInstance;

	beforeEach(() => {
		manager = new TimerManager();
		// Mock Date.now() for consistent testing
		dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(1000);
		// Mock requestAnimationFrame
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
	});

	describe('startWorkoutTimer', () => {
		it('should create new timer', () => {
			manager.startWorkoutTimer('workout1', 0);
			
			const state = manager.getTimerState('workout1');
			expect(state).not.toBeNull();
			expect(state?.activeExerciseIndex).toBe(0);
		});

		it('should resume existing timer with new exercise', () => {
			manager.startWorkoutTimer('workout1', 0);
			dateNowSpy.mockReturnValue(2000);
			manager.startWorkoutTimer('workout1', 1);
			
			const state = manager.getTimerState('workout1');
			expect(state?.activeExerciseIndex).toBe(1);
		});

		it('should initialize timer with correct default values', () => {
			manager.startWorkoutTimer('workout1', 0);
			const state = manager.getTimerState('workout1');
			
			expect(state?.isPaused).toBe(false);
			expect(state?.isRestActive).toBe(false);
			expect(state?.activeSetIndex).toBe(0);
		});
	});

	describe('advanceExercise', () => {
		it('should move to next exercise', () => {
			manager.startWorkoutTimer('workout1');
			dateNowSpy.mockReturnValue(5000);
			manager.advanceExercise('workout1', 2);
			
			const state = manager.getTimerState('workout1');
			expect(state?.activeExerciseIndex).toBe(2);
			expect(state?.activeSetIndex).toBe(0);
		});

		it('should reset paused time', () => {
			manager.startWorkoutTimer('workout1');
			manager.pauseExercise('workout1');
			dateNowSpy.mockReturnValue(2000);
			manager.advanceExercise('workout1', 1);
			
			const state = manager.getTimerState('workout1');
			expect(state?.exercisePausedTime).toBe(0);
		});
	});

	describe('advanceSet', () => {
		it('should move to next set in same exercise', () => {
			manager.startWorkoutTimer('workout1');
			dateNowSpy.mockReturnValue(5000);
			manager.advanceSet('workout1', 0, 2);
			
			const state = manager.getTimerState('workout1');
			expect(state?.activeExerciseIndex).toBe(0);
			expect(state?.activeSetIndex).toBe(2);
		});
	});

	describe('startRest', () => {
		it('should activate rest period', () => {
			manager.startWorkoutTimer('workout1');
			manager.startRest('workout1', 60);
			
			const state = manager.getTimerState('workout1');
			expect(state?.isRestActive).toBe(true);
			expect(state?.restDuration).toBe(60);
		});

		it('should reset pause time on rest start', () => {
			manager.startWorkoutTimer('workout1');
			manager.pauseExercise('workout1');
			dateNowSpy.mockReturnValue(2000);
			manager.startRest('workout1', 90);
			
			const state = manager.getTimerState('workout1');
			expect(state?.restPausedTime).toBe(0);
		});
	});

	describe('exitRest', () => {
		it('should exit rest and move to next exercise set', () => {
			manager.startWorkoutTimer('workout1');
			manager.startRest('workout1', 60);
			dateNowSpy.mockReturnValue(3000);
			manager.exitRest('workout1', 1, 1);
			
			const state = manager.getTimerState('workout1');
			expect(state?.isRestActive).toBe(false);
			expect(state?.activeExerciseIndex).toBe(1);
			expect(state?.activeSetIndex).toBe(1);
		});

		it('should clear rest duration', () => {
			manager.startWorkoutTimer('workout1');
			manager.startRest('workout1', 60);
			manager.exitRest('workout1', 0, 0);
			
			const state = manager.getTimerState('workout1');
			expect(state?.restDuration).toBe(0);
		});
	});

	describe('pauseExercise', () => {
		it('should pause exercise', () => {
			manager.startWorkoutTimer('workout1');
			manager.pauseExercise('workout1');
			
			const state = manager.getTimerState('workout1');
			expect(state?.isPaused).toBe(true);
		});

		it('should accumulate pause time', () => {
			manager.startWorkoutTimer('workout1');
			dateNowSpy.mockReturnValue(2000);
			manager.pauseExercise('workout1');
			
			const state = manager.getTimerState('workout1');
			expect(state?.exercisePausedTime).toBe(1000);
		});

		it('should not double-pause', () => {
			manager.startWorkoutTimer('workout1');
			manager.pauseExercise('workout1');
			const state1 = manager.getTimerState('workout1');
			
			dateNowSpy.mockReturnValue(3000);
			manager.pauseExercise('workout1');
			const state2 = manager.getTimerState('workout1');
			
			expect(state2?.exercisePausedTime).toBe(state1?.exercisePausedTime);
		});

		it('should pause rest period', () => {
			manager.startWorkoutTimer('workout1');
			manager.startRest('workout1', 60);
			dateNowSpy.mockReturnValue(2000);
			manager.pauseExercise('workout1');
			
			const state = manager.getTimerState('workout1');
			expect(state?.restPausedTime).toBe(1000);
		});
	});

	describe('resumeExercise', () => {
		it('should resume paused exercise', () => {
			manager.startWorkoutTimer('workout1');
			manager.pauseExercise('workout1');
			manager.resumeExercise('workout1');
			
			const state = manager.getTimerState('workout1');
			expect(state?.isPaused).toBe(false);
		});

		it('should not resume if not paused', () => {
			manager.startWorkoutTimer('workout1');
			manager.resumeExercise('workout1');
			
			const state = manager.getTimerState('workout1');
			expect(state?.isPaused).toBe(false);
		});
	});

	describe('stopWorkoutTimer', () => {
		it('should remove timer', () => {
			manager.startWorkoutTimer('workout1');
			manager.stopWorkoutTimer('workout1');
			
			const state = manager.getTimerState('workout1');
			expect(state).toBeNull();
		});

		it('should not error if timer doesnt exist', () => {
			expect(() => manager.stopWorkoutTimer('nonexistent')).not.toThrow();
		});
	});

	describe('subscribe', () => {
		it('should call callback on updates', () => {
			const callback = jest.fn();
			manager.startWorkoutTimer('workout1');
			manager.subscribe('workout1', callback);
			
			dateNowSpy.mockReturnValue(2000);
			jest.runAllTimers();
			
			expect(callback).toHaveBeenCalled();
		});

		it('should return unsubscribe function', () => {
			const callback = jest.fn();
			manager.startWorkoutTimer('workout1');
			const unsubscribe = manager.subscribe('workout1', callback);
			
			jest.runAllTimers();
			const callCount1 = callback.mock.calls.length;
			
			unsubscribe();
			jest.runAllTimers();
			
			// Callback should not be called again after unsubscribe
			expect(callback.mock.calls.length).toBe(callCount1);
		});
	});

	describe('getTimerState', () => {
		it('should return null for nonexistent timer', () => {
			const state = manager.getTimerState('nonexistent');
			expect(state).toBeNull();
		});

		it('should return current timer state', () => {
			manager.startWorkoutTimer('workout1', 2);
			const state = manager.getTimerState('workout1');
			
			expect(state?.workoutId).toBe('workout1');
			expect(state?.activeExerciseIndex).toBe(2);
		});
	});

	describe('getActiveExerciseIndex', () => {
		it('should return active exercise index', () => {
			manager.startWorkoutTimer('workout1', 1);
			const index = manager.getActiveExerciseIndex('workout1');
			
			expect(index).toBe(1);
		});

		it('should return -1 for nonexistent timer', () => {
			const index = manager.getActiveExerciseIndex('nonexistent');
			expect(index).toBe(-1);
		});
	});

	describe('getElapsedSeconds', () => {
		it('should calculate elapsed time', () => {
			manager.startWorkoutTimer('workout1');
			dateNowSpy.mockReturnValue(6000);
			
			const state = manager.getTimerState('workout1');
			expect(state?.workoutElapsed).toBe(5);
		});

		it('should account for pause time', () => {
			manager.startWorkoutTimer('workout1');
			dateNowSpy.mockReturnValue(2000);
			manager.pauseExercise('workout1');
			dateNowSpy.mockReturnValue(6000);
			
			const state = manager.getTimerState('workout1');
			expect(state?.exerciseElapsed).toBe(1);
		});
	});

	describe('getRestElapsedSeconds', () => {
		it('should calculate rest elapsed time', () => {
			manager.startWorkoutTimer('workout1');
			manager.startRest('workout1', 60);
			dateNowSpy.mockReturnValue(36000);
			
			const state = manager.getTimerState('workout1');
			expect(state?.restElapsed).toBe(35); // 36000ms (now) - 1000ms (start) = 35000ms = 35s
		});
	});

	describe('getRestRemainingSeconds', () => {
		it('should calculate rest remaining seconds', () => {
			manager.startWorkoutTimer('workout1');
			manager.startRest('workout1', 60);
			dateNowSpy.mockReturnValue(21000);
			
			const state = manager.getTimerState('workout1');
			expect(state?.restRemaining).toBeCloseTo(40, 1); // 60s duration - (21000ms - 1000ms) = 40s
		});
	});

	describe('setAutoAdvanceCallback', () => {
		it('should set callback', () => {
			const callback = jest.fn();
			manager.setAutoAdvanceCallback(callback);
			
			// Callback should be set internally (we can't directly test without more complex setup)
			expect(() => manager.setAutoAdvanceCallback(callback)).not.toThrow();
		});
	});

	describe('multiple timers', () => {
		it('should manage multiple timers independently', () => {
			manager.startWorkoutTimer('workout1', 0);
			manager.startWorkoutTimer('workout2', 1);
			
			const state1 = manager.getTimerState('workout1');
			const state2 = manager.getTimerState('workout2');
			
			expect(state1?.activeExerciseIndex).toBe(0);
			expect(state2?.activeExerciseIndex).toBe(1);
		});

		it('should allow pausing one timer without affecting another', () => {
			manager.startWorkoutTimer('workout1');
			manager.startWorkoutTimer('workout2');
			
			manager.pauseExercise('workout1');
			
			expect(manager.getTimerState('workout1')?.isPaused).toBe(true);
			expect(manager.getTimerState('workout2')?.isPaused).toBe(false);
		});

		it('should stop only specified timer', () => {
			manager.startWorkoutTimer('workout1');
			manager.startWorkoutTimer('workout2');
			
			manager.stopWorkoutTimer('workout1');
			
			expect(manager.getTimerState('workout1')).toBeNull();
			expect(manager.getTimerState('workout2')).not.toBeNull();
		});
	});

	describe('edge cases', () => {
		it('should handle operations on nonexistent timers gracefully', () => {
			expect(() => {
				manager.advanceExercise('nonexistent', 1);
				manager.pauseExercise('nonexistent');
				manager.resumeExercise('nonexistent');
				manager.startRest('nonexistent', 60);
			}).not.toThrow();
		});

		it('should handle negative exercise indices', () => {
			manager.startWorkoutTimer('workout1');
			manager.advanceExercise('workout1', -1);
			
			const state = manager.getTimerState('workout1');
			expect(state?.activeExerciseIndex).toBe(-1);
		});

		it('should handle large exercise indices', () => {
			manager.startWorkoutTimer('workout1');
			manager.advanceExercise('workout1', 9999);
			
			const state = manager.getTimerState('workout1');
			expect(state?.activeExerciseIndex).toBe(9999);
		});
	});
});
