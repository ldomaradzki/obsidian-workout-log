/**
 * Exercise and set rendering for workout blocks.
 *
 * Handles rendering of exercises and their nested sets with:
 * - State indicators (pending, in-progress, completed, skipped)
 * - Exercise/set parameters (duration, weight, reps, rest) as editable chips
 * - Timer displays (countdown for exercises, count-up for sets)
 * - Total aggregations (for multi-set exercises: total reps, weight, recorded time, rest)
 * - Set-specific controls (pause, skip, add set, finish, etc.)
 * - Rest phase color coding (green > yellow > red as time depletes)
 *
 * Architecture:
 * - renderExercise() is the entry point, handles layout decisions
 * - renderSet/renderSetWithTimerElement for multi-set rendering
 * - renderSetControls() handles workout interaction buttons
 * - updateExerciseTimer() efficiently updates timer during progress
 * - Helper functions extract and compute exercise/set data
 */

import { Constants, Exercise, ExerciseSet, ExerciseParam, ExerciseState, TimerState, WorkoutCallbacks } from '../types';
import { formatDuration, parseDurationToSeconds, formatDurationHuman } from '../parser/exercise';

/**
 * Generate a consistent color hue from exercise name using djb2 hash.
 * Ensures each exercise gets a unique, visually distinct color.
 * Uses golden ratio distribution for better hue spread across color spectrum.
 *
 * Parameters:
 * - name: Exercise name to hash
 *
 * Returns: Hue value (0-359) suitable for HSL color
 */
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

/**
 * Context object for exercise rendering.
 * Tracks DOM elements and input fields for later reference and updates.
 *
 * Properties:
 * - container: Main exercise container element
 * - timerEl: Timer display for exercise (null if multiple sets)
 * - setTimerEl: Timer display for active set (for multi-set exercises)
 * - inputs: Exercise-level parameters as editable inputs (by key)
 * - setInputs: Set-level parameters grouped by set index, then by key
 */
export interface ExerciseElements {
	container: HTMLElement;
	timerEl: HTMLElement | null;
	setTimerEl: HTMLElement | null;  // Timer element for active set
	inputs: Map<string, HTMLInputElement>;
	setInputs: Map<number, Map<string, HTMLInputElement>>;  // Indexed by set index
}

/**
 * Check if a set has displayable parameters (duration, weight, reps).
 * Used to decide whether to render parameters section for a set.
 *
 * Parameters:
 * - set: ExerciseSet to check
 *
 * Returns: true if set contains at least one displayable param
 */
function hasDisplayableSetParams(set: ExerciseSet): boolean {
	return set.params.some(p => {
		const key = p.key.toLowerCase();
		return key === 'duration' || key === 'weight' || key === 'reps' || key === 'rest';
	});
}

/**
 * Extract displayable set parameters in a specific order.
 * Only returns: duration, weight, reps (if present).
 * Other parameters are ignored for set-level display.
 *
 * Parameters:
 * - set: ExerciseSet containing parameters
 *
 * Returns: Array of params in order [duration, weight, reps]
 */
function getDisplayableSetParams(set: ExerciseSet): ExerciseParam[] {
	const paramOrder = ['duration', 'weight', 'reps', 'rest'];
	const paramsMap = new Map<string, ExerciseParam>();
	
	// Build map of params by key
	for (const param of set.params) {
		const key = param.key.toLowerCase();
		if (paramOrder.includes(key)) {
			paramsMap.set(key, param);
		}
	}
	
	// Return params in specified order
	const orderedParams: ExerciseParam[] = [];
	for (const key of paramOrder) {
		const param = paramsMap.get(key);
		if (param) {
			orderedParams.push(param);
		}
	}
	
	return orderedParams;
}

/**
 * Extract recorded time from a set (system-managed ~time param).
 * Recorded times are locked (not editable) params created after set completion.
 *
 * Parameters:
 * - set: ExerciseSet to extract from
 *
 * Returns: Recorded time string (e.g., "1m 30s") or null if not recorded
 */
function getSetRecordedTime(set: ExerciseSet): string | null {
	const durationParam = set.params.find(p => p.key.toLowerCase() === '~time');
	return durationParam ? durationParam.value : null;
}

/**
 * Extract recorded rest from a set (system-managed ~rest param).
 * Rest is the period between sets (after completing one set, before starting next).
 *
 * Parameters:
 * - set: ExerciseSet to extract from
 *
 * Returns: Rest string (e.g., "60s") or null if not set
 */
function getSetRecordedRest(set: ExerciseSet): string | null {
	const restParam = set.params.find(p => p.key.toLowerCase() === '~rest');
	return restParam ? restParam.value : null;
}

/**
 * Extract duration from a set's duration parameter.
 * Duration is the target or recorded time for completing the set.
 *
 * Parameters:
 * - set: ExerciseSet to extract from
 *
 * Returns: Duration string (e.g., "60s") or null if not set
 */
function getSetDuration(set: ExerciseSet): string | null {
	const durationParam = set.params.find(p => p.key.toLowerCase() === 'duration');
	return durationParam ? durationParam.value : null;
}

/**
 * Render a display-only total parameter (e.g., total weight, total reps).
 * Display-only version with = prefix and no editing capability.
 *
 * Parameters:
 * - container: Parent element to render into
 * - value: The value to display
 * - unit: Optional unit string (e.g., " lbs")
 */
function renderTotalParam(
	container: HTMLElement,
	value: number | string,
	unit?: string
): void {
	const paramEl = container.createSpan({ cls: 'workout-param' });
	paramEl.createSpan({ cls: 'workout-param-prefix', text: '=' });
	paramEl.createSpan({ cls: 'workout-param-value', text: String(value) });
	if (unit) {
		paramEl.createSpan({ cls: 'workout-param-unit', text: unit });
	}
}

/**
 * Render a parameter element with optional editability.
 * Handles prefix icons (based on param key), value display/input, and unit rendering.
 *
 * Parameters:
 * - container: Parent element to render into
 * - param: Parameter to render
 * - workoutState: Current workout state (determines if param is editable)
 * - onInputChange: Callback when input value changes
 *
 * Returns: HTMLInputElement if editable, undefined otherwise
 */
function renderParamElement(
	container: HTMLElement,
	param: ExerciseParam,
	workoutState: 'planned' | 'started' | 'completed',
	onInputChange: (value: string) => void
): HTMLInputElement | undefined {
	const paramEl = container.createSpan({ cls: 'workout-param' });

	// Render prefix icon if icon exists for this param key
	const keyLower = param.key.toLowerCase();
	if (Constants.PARAM_PREFIX_ICONS[keyLower]) {
		paramEl.createSpan({ cls: 'workout-param-prefix', text: Constants.PARAM_PREFIX_ICONS[keyLower] });
	}

	// Duration and rest are never editable - always display as read-only
	// Brackets in markdown determine timer behavior (countdown vs count-up), not editability
	const isNeverEditable = keyLower === 'duration' || keyLower === 'rest';
	const isEditable = !isNeverEditable && param.editable && workoutState !== 'completed';

	if (isEditable) {
		const input = paramEl.createEl('input', {
			cls: 'workout-param-input',
			type: 'text',
			value: param.value
		});
		input.addEventListener('input', () => onInputChange(input.value));
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') input.blur();
		});
		
		// Unit after value
		if (param.unit) {
			paramEl.createSpan({ cls: 'workout-param-unit', text: ` ${param.unit}` });
		}
		
		return input;
	} else {
		paramEl.createSpan({ cls: 'workout-param-value', text: param.value });
		
		// Unit after value
		if (param.unit) {
			paramEl.createSpan({ cls: 'workout-param-unit', text: ` ${param.unit}` });
		}
		
		return undefined;
	}
}

/**
 * Aggregate totals from all sets in an exercise.
 * Sums reps, weight, and recorded times across all sets.
 * Used for display on multi-set exercise main row.
 *
 * Parameters:
 * - exercise: Exercise to aggregate
 * - isCompleted: Whether exercise is completed (affects which fields to sum)
 *
 * Returns: Object with aggregated totals
 * - reps: Total reps (null if no reps params present)
 * - weight: Total weight (null if no weight params present)
 * - duration: Target duration (from exercise.targetDuration)
 * - totalRecordedTime: Sum of recorded durations from all sets
 * - totalRest: Sum of rest periods from all sets
 */
function computeExerciseTotals(exercise: Exercise, isCompleted: boolean): { 
	reps: number | null; 
	weight: number | null; 
	duration: number;
	totalRecordedTime: number;
	totalRest: number;
} {
	let totalReps = 0;
	let totalWeight = 0;
	let totalRecordedTime = 0;
	let totalRest = 0;
	let repsFound = false;
	let weightFound = false;
	let targetDuration = exercise.targetDuration || 0;

	for (const set of exercise.sets) {
		for (const param of set.params) {
			if (param.key.toLowerCase() === 'reps') {
				const reps = parseInt(param.value, 10);
				if (!isNaN(reps)) {
					totalReps += reps;
					repsFound = true;
				}
			} else if (param.key.toLowerCase() === 'weight' || param.key.toLowerCase() === 'load') {
				const weight = parseFloat(param.value);
				if (!isNaN(weight)) {
					totalWeight += weight;
					weightFound = true;
				}
			} else if (param.key.toLowerCase() === 'rest') {
				// Sum rest durations from all sets (only editable means user-configured)
				if (param.editable) {
					const restSeconds = parseDurationToSeconds(param.value);
					totalRest += restSeconds;
				}
			}
		}

		// If exercise is completed, sum recorded durations from each set
		if (isCompleted) {
			for (const param of set.params) {
				if (param.key.toLowerCase() === '~time') {
					const seconds = parseDurationToSeconds(param.value);
					totalRecordedTime += seconds;
				}
			}
		}
	}

	return {
		reps: repsFound ? totalReps : null,
		weight: weightFound ? totalWeight : null,
		duration: targetDuration,
		totalRecordedTime,
		totalRest
	};
}

/**
 * Render an exercise with all its sets and current state.
 *
 * Determines layout based on exercise structure:
 * - Single set: renders on main row (icon | name | params | timer)
 * - Multiple sets: renders as separate indented rows per set
 * - Active during workout: displays timer and control buttons
 *
 * Parameters:
 * - container: Parent DOM element to render into
 * - exercise: Exercise object with sets and metadata
 * - index: Exercise index in parent workout
 * - isActive: Whether this exercise is currently active (timer running)
 * - activeSetIndex: Index of active set (if isActive)
 * - timerState: Current timer state (if isActive)
 * - callbacks: User action handlers
 * - workoutState: Current workout state (planned/started/completed)
 * - restDuration: Default rest duration (from metadata)
 * - totalExercises: Total count of exercises (for button labels)
 *
 * Returns: ExerciseElements with references to rendered elements
 */
export function renderExercise(
	container: HTMLElement,
	exercise: Exercise,
	index: number,
	isActive: boolean,
	activeSetIndex: number,
	timerState: TimerState | null,
	callbacks: WorkoutCallbacks,
	workoutState: 'planned' | 'started' | 'completed',
	restDuration?: number,
	totalExercises?: number
): ExerciseElements {
	const exerciseEl = container.createDiv({
		cls: `workout-exercise state-${exercise.state}${isActive ? ' active' : ''}`
	});

	// Set color based on exercise name
	const hue = nameToHue(exercise.name);
	exerciseEl.style.setProperty('--exercise-color', `hsl(${hue}, 65%, 55%)`);

	const inputs = new Map<string, HTMLInputElement>();
	const setInputs = new Map<number, Map<string, HTMLInputElement>>();
	let setTimerEl: HTMLElement | null = null;  // Track active set timer for timer updates

	// Single row layout: icon | name | params | timer
	const mainRow = exerciseEl.createDiv({ cls: 'workout-exercise-main' });

	// State icon
	const iconEl = mainRow.createSpan({ cls: 'workout-exercise-icon' });
	iconEl.textContent = Constants.STATE_ICONS[exercise.state];

	// Exercise name
	const nameEl = mainRow.createSpan({ cls: 'workout-exercise-name' });
	nameEl.textContent = exercise.name;

	// Determine multi-set layout and calculate totals
	const hasMultipleSets = exercise.sets.length > 1;
	const isCompleted = exercise.state === 'completed';
	const totals = computeExerciseTotals(exercise, isCompleted);
	
	// Display totals on multi-set exercise main row (only when completed)
	if (hasMultipleSets && isCompleted) {
		const totalsEl = mainRow.createSpan({ cls: 'workout-exercise-params' });

		// Show weight
		if (totals.weight !== null) {
			renderTotalParam(totalsEl, totals.weight, ' lbs');
		}

		// Show total reps
		if (totals.reps !== null) {
			renderTotalParam(totalsEl, totals.reps);
		}

		// Show total rest time
		if (totals.totalRest > 0) {
			renderTotalParam(totalsEl, formatDurationHuman(totals.totalRest));
		}

		// Show total recorded time when completed
		if (totals.totalRecordedTime > 0) {
			renderTotalParam(totalsEl, formatDurationHuman(totals.totalRecordedTime));
		}
	}

	// For single-set exercises, render set params inline on mainRow (if present)
	// Otherwise render exercise-level params
	if (!hasMultipleSets && exercise.sets.length > 0) {
		const singleSet = exercise.sets[0];
		if (singleSet && hasDisplayableSetParams(singleSet)) {
			// Set has displayable params: render those instead of exercise params
			const paramsEl = mainRow.createSpan({ cls: 'workout-exercise-params' });
			const setParamInputs = new Map<string, HTMLInputElement>();
			const displayableParams = getDisplayableSetParams(singleSet);

			for (const param of displayableParams) {
				const input = renderParamElement(
					paramsEl,
					param,
					workoutState,
					(value) => callbacks.onSetParamChange(index, 0, param.key, value)
				);
				if (input) setParamInputs.set(param.key, input);
			}
			setInputs.set(0, setParamInputs);
		} else if (exercise.params.length > 0) {
			// Set has no displayable params: render exercise-level params instead
			const containerEl = mainRow.createSpan({ cls: 'workout-exercise-params' });
			for (const param of exercise.params) {
				const input = renderParamElement(
					containerEl,
					param,
					workoutState,
					(value) => callbacks.onParamChange(index, param.key, value)
				);
				if (input) inputs.set(param.key, input);
			}
		}
	} else if (!hasMultipleSets && exercise.params.length > 0) {
		// No sets: render exercise-level params
		const containerEl = mainRow.createSpan({ cls: 'workout-exercise-params' });
		for (const param of exercise.params) {
			const input = renderParamElement(
				containerEl,
				param,
				workoutState,
				(value) => callbacks.onParamChange(index, param.key, value)
			);
			if (input) inputs.set(param.key, input);
		}
	}

	// Timer display (right side of mainRow)
	// Shown on mainRow if single set, otherwise on active set
	// Priority order: completed > active > static target > pending placeholder
	let timerEl: HTMLElement | null = null;
	
	if (!hasMultipleSets) {
		timerEl = mainRow.createSpan({ cls: 'workout-exercise-timer' });

		const singleSetDuration = exercise.sets[0] ? exercise.sets[0].targetDuration : undefined;
		// 1. Exercise completed: show recorded duration with checkmark
		// This is the final state after workout finishes
		if (exercise.state === 'completed' && exercise.recordedTime) {
			timerEl.textContent = exercise.recordedTime;
			timerEl.createSpan({ cls: 'timer-indicator recorded', text: Constants.TIMER_ICONS['recorded'] });
		} 
		// 2. Exercise currently active: show live timer (updates in real-time)
		// During workout, timer counts up/down and keeps updating via updateExerciseTimer()
		else if (isActive && timerState) {
			updateExerciseTimer(timerEl, timerState, exercise.targetDuration);
		} 
		// 3. Static target display (when not active)
		else if (singleSetDuration) {
			timerEl.textContent = formatDuration(singleSetDuration);
			timerEl.createSpan({ cls: 'timer-indicator count-down', text: Constants.TIMER_ICONS['count-down'] });
		} 
		// 4. Pending exercise with no target: show placeholder
		else {
			timerEl.textContent = '--';
		}
	}
	// Render sets as indented rows (only for multi-set exercises)
	else {
		const setsContainer = exerciseEl.createDiv({ cls: 'workout-sets' });
		for (let setIndex = 0; setIndex < exercise.sets.length; setIndex++) {
			const set = exercise.sets[setIndex];
			if (!set) continue;

			const isSetActive = isActive && setIndex === activeSetIndex;
			if (isSetActive) {
				// Store timer element for active set so we can update it
				setTimerEl = renderSetWithTimerElement(
					setsContainer,
					set,
					setIndex,
					index,
					isSetActive,
					isSetActive ? timerState : null,
					callbacks,
					workoutState,
					setInputs
				);
			} else {
				renderSet(
					setsContainer,
					set,
					setIndex,
					index,
					isSetActive,
					isSetActive ? timerState : null,
					callbacks,
					workoutState,
					setInputs
				);
			}
		}
	} 

	// Controls row (only for active set during workout)
	if (isActive && workoutState === 'started') {
		renderSetControls(exerciseEl, index, activeSetIndex, exercise.sets.length, callbacks, restDuration, timerState, totalExercises);
	}

	return { container: exerciseEl, timerEl, setTimerEl, inputs, setInputs };
}

/**
 * Render a set row (simple delegation to renderSetWithTimerElement).
 * Exists for semantic clarity - differentiates set rendering from set-with-timer rendering.
 */
function renderSet(
	container: HTMLElement,
	set: ExerciseSet,
	setIndex: number,
	exerciseIndex: number,
	isActive: boolean,
	timerState: TimerState | null,
	callbacks: WorkoutCallbacks,
	workoutState: 'planned' | 'started' | 'completed',
	setInputs: Map<number, Map<string, HTMLInputElement>>
): void {
	renderSetWithTimerElement(container, set, setIndex, exerciseIndex, isActive, timerState, callbacks, workoutState, setInputs);
}

/**
 * Render a set row with timer element.
 *
 * Creates indented set row with:
 * - State icon and "Set N" label
 * - Set parameters (duration, weight, reps) as chips
 * - Rest duration display
 * - Timer display (if active)
 * - Rest phase color coding (green/yellow/red based on remaining time)
 *
 * Parameters:
 * - container: Parent DOM element
 * - set: ExerciseSet to render
 * - setIndex: Index of this set (0-based)
 * - exerciseIndex: Index of parent exercise
 * - isActive: Whether this set is currently active
 * - timerState: Current timer state (if active)
 * - callbacks: User action handlers
 * - workoutState: Workout state (planned/started/completed)
 * - setInputs: Map to track input elements by set index and key
 *
 * Returns: Timer element (for active sets) or null
 */
function renderSetWithTimerElement(
	container: HTMLElement,
	set: ExerciseSet,
	setIndex: number,
	exerciseIndex: number,
	isActive: boolean,
	timerState: TimerState | null,
	callbacks: WorkoutCallbacks,
	workoutState: 'planned' | 'started' | 'completed',
	setInputs: Map<number, Map<string, HTMLInputElement>>
): HTMLElement | null {
	const setEl = container.createDiv({
		cls: `workout-set state-${set.state}${isActive ? ' active' : ''}`
	});

	const setRow = setEl.createDiv({ cls: 'workout-set-main' });

	// State icon
	const iconEl = setRow.createSpan({ cls: 'workout-set-icon' });
	iconEl.textContent = Constants.STATE_ICONS[set.state];

	// Set label ("Set 1", "Set 2", etc.)
	const labelEl = setRow.createSpan({ cls: 'workout-set-label' });
	labelEl.textContent = `Set ${setIndex + 1}`;

	// Set parameters as inline chips
	if (hasDisplayableSetParams(set)) {
		const paramsEl = setRow.createSpan({ cls: 'workout-set-params' });
		const setParamInputs = new Map<string, HTMLInputElement>();
		const displayableParams = getDisplayableSetParams(set);

		for (const param of displayableParams) {
			const input = renderParamElement(
				paramsEl,
				param,
				workoutState,
				(value) => callbacks.onSetParamChange(exerciseIndex, setIndex, param.key, value)
			);
			if (input) setParamInputs.set(param.key, input);
		}

		setInputs.set(setIndex, setParamInputs);
	}

	// Timer display (right side of mainRow)
	// Shown on mainRow if no sets or single set, otherwise on active set
	// Priority order: completed > active > static target > pending placeholder
	let timerEl: HTMLElement | null = null;
	timerEl = setRow.createSpan({ cls: 'workout-set-timer' });

	// Show recorded duration for completed sets
	const recordedDuration = getSetRecordedTime(set);

	if ( workoutState === 'completed' && recordedDuration) {
		timerEl.textContent = recordedDuration;
		timerEl.createSpan({ cls: 'timer-indicator recorded', text: Constants.TIMER_ICONS['recorded'] });
	} 
	// Set currently active: show live timer (updates in real-time)
	else if (isActive && timerState) {
		// Get rest duration for timer logic 
		const restDurationStr = getSetRecordedRest(set);
		
		// In rest mode: show rest timer with phase-based color coding
		if (timerState.isRestActive && timerState.restRemaining !== undefined) {
			const restDuration = restDurationStr ? parseDurationToSeconds(restDurationStr) : 0;
			const remaining = timerState.restRemaining;
			
			// Apply color phase classes based on rest progress
			if (restDuration > 0) {
				const restProgress = remaining / restDuration;
				
				if (restProgress > 0.66) {
					// Green: 66-100% remaining
					setEl.removeClass('rest-phase-yellow');
					setEl.removeClass('rest-phase-red');
					setEl.addClass('rest-phase-green');
				} else if (restProgress > 0.33) {
					// Yellow: 33-66% remaining
					setEl.removeClass('rest-phase-green');
					setEl.removeClass('rest-phase-red');
					setEl.addClass('rest-phase-yellow');
				} else {
					// Red: 0-33% remaining
					setEl.removeClass('rest-phase-green');
					setEl.removeClass('rest-phase-yellow');
					setEl.addClass('rest-phase-red');
				}
			}
			
			if (remaining > 0) {
				timerEl.textContent = formatDuration(remaining);
				timerEl.addClass('rest');
				timerEl.createSpan({ cls: 'timer-indicator rest', text: Constants.TIMER_ICONS['count-down'] });
			} else {
				// Rest time exceeded (overtime)
				timerEl.textContent = formatDuration(Math.abs(remaining));
				timerEl.removeClass('rest');
				timerEl.addClass('rest-overtime');
				timerEl.createSpan({ cls: 'timer-indicator overtime', text: Constants.TIMER_ICONS['count-up'] });
			}
		} else {
			// Not in rest: show exercise timer (count-up or countdown)
			updateExerciseTimer(timerEl, timerState, undefined);
		}
	}
	else {
		const setDurationStr = getSetDuration(set);
		const setDuration = setDurationStr ? parseDurationToSeconds(setDurationStr) : 0;
		if (setDuration != 0 ) {
			timerEl.textContent = formatDuration(setDuration);
			timerEl.createSpan({ cls: 'timer-indicator count-down', text: Constants.TIMER_ICONS['count-down'] });
		} else {
			// No duration defined: show placeholder
			timerEl.textContent = '--';
		}
	}
	
	return timerEl;
}

/**
 * Render workout control buttons for an active exercise.
 *
 * Displays buttons for:
 * - Pause/Resume: Toggle workout timer
 * - Skip: Mark exercise as skipped
 * - + Set: Add additional set to exercise
 * - + Rest: Add rest period after set (if restDuration defined)
 * - [Next Set|Next|Done]: Finish current set and advance
 *
 * Button text adapts based on:
 * - Rest state: "Start Next" during rest, otherwise "Next Set"/"Next"/"Done"
 * - Position: "Next Set" for mid-exercise, "Next" for last set w/ more exercises, "Done" for final set
 *
 * Parameters:
 * - exerciseEl: Exercise container to add controls to
 * - exerciseIndex: Index of current exercise
 * - setIndex: Index of current set
 * - totalSets: Total number of sets in exercise
 * - callbacks: User action handlers
 * - restDuration: Default rest duration (if defined, show "+ Rest" button)
 * - timerState: Current timer state (for rest detection)
 * - totalExercises: Total exercises in workout (for button labeling)
 */
function renderSetControls(
	exerciseEl: HTMLElement,
	exerciseIndex: number,
	setIndex: number,
	totalSets: number,
	callbacks: WorkoutCallbacks,
	restDuration?: number,
	timerState?: TimerState | null,
	totalExercises?: number
): void {
	const controlsEl = exerciseEl.createDiv({ cls: 'workout-exercise-controls' });

	// Pause/Resume toggle button
	const pauseBtn = controlsEl.createEl('button', { cls: 'workout-btn', text: 'Pause' });
	pauseBtn.addEventListener('click', () => {
		if (pauseBtn.textContent === 'Pause') {
			callbacks.onPauseExercise();
			pauseBtn.textContent = 'Resume';
		} else {
			callbacks.onResumeExercise();
			pauseBtn.textContent = 'Pause';
		}
	});

	// Skip button (marks exercise as skipped)
	const skipBtn = controlsEl.createEl('button', { cls: 'workout-btn', text: 'Skip' });
	skipBtn.addEventListener('click', () => {
		callbacks.onExerciseSkip(exerciseIndex);
	});

	// Group for finish buttons
	const finishGroup = controlsEl.createDiv({ cls: 'workout-btn-group' });

	// Add Set button (to add more sets to exercise)
	const addSetBtn = finishGroup.createEl('button', { cls: 'workout-btn', text: '+ Set' });
	addSetBtn.addEventListener('click', () => {
		callbacks.onExerciseAddSet(exerciseIndex);
	});

	// Add Rest button (only if restDuration defined in metadata)
	if (restDuration !== undefined) {
		const addRestBtn = finishGroup.createEl('button', { cls: 'workout-btn', text: '+ Rest' });
		addRestBtn.addEventListener('click', () => {
			callbacks.onExerciseAddRest(exerciseIndex);
		});
	}

	// Determine next button text based on position and state
	let nextBtnText: string;
	if (timerState?.isRestActive) {
		// During rest period, offer to start next
		nextBtnText = 'Next';
	} else {
		const isLastSet = setIndex === totalSets - 1;
		const isLastExercise = typeof totalExercises === 'number' ? (exerciseIndex === totalExercises - 1) : false;
		if (isLastSet && !isLastExercise) {
			// Last set, but more exercises ahead
			nextBtnText = 'Next';
		} else if (isLastSet && isLastExercise) {
			// Final set of final exercise
			nextBtnText = 'Done';
		} else {
			// Not last set
			nextBtnText = 'Next';
		}
	}
	
	const nextBtn = finishGroup.createEl('button', { cls: 'workout-btn', text: nextBtnText });
	nextBtn.addEventListener('click', () => {
		if (timerState?.isRestActive) {
			// Currently in rest, end it and advance
			callbacks.onRestEnd(exerciseIndex);
		} else {
			// Finishing a set, may start rest or advance
			callbacks.onSetFinish(exerciseIndex, setIndex);
		}
	});
}

/**
 * Update exercise/set timer display during workout progress.
 *
 * Displays timer in two modes:
 * - Countdown (targetDuration defined): Shows remaining time until target
 *   - Green icon ▼ when time remaining
 *   - Warning ⚠ + red "overtime" class when exceeded
 * - Count-up (no targetDuration): Shows elapsed time from set start
 *   - Count-up icon ▲ to distinguish from countdown
 *
 * Parameters:
 * - timerEl: Timer element to update
 * - timerState: Current timer state with elapsed times
 * - targetDuration: Target duration in seconds (if null/undefined, count-up mode)
 */
export function updateExerciseTimer(
	timerEl: HTMLElement,
	timerState: TimerState,
	targetDuration?: number
): void {
	timerEl.empty();

	if (targetDuration !== undefined && !timerState.isRestActive) {
		// Countdown mode: show remaining time vs target
		const remaining = targetDuration - timerState.exerciseElapsed;
		if (remaining > 0) {
			// Time remaining: show countdown with ▼ indicator
			timerEl.textContent = formatDuration(remaining);
			timerEl.createSpan({ cls: 'timer-indicator count-down', text: Constants.TIMER_ICONS['count-down'] });
		} else {
			// Overtime: show absolute value in red with warning icon
			timerEl.textContent = formatDuration(Math.abs(remaining));
			timerEl.addClass('overtime');
			timerEl.createSpan({ cls: 'timer-indicator overtime', text: Constants.TIMER_ICONS['overtime'] });
		}
	}
	else if (targetDuration !== undefined && timerState.isRestActive) {
		// Countdown mode: show remaining time vs target
		const restElapsed = timerState.restElapsed? timerState.restElapsed : 0;
		const remaining = targetDuration - restElapsed;
		if (remaining > 0) {
			// Time remaining: show countdown with ▼ indicator
			timerEl.textContent = formatDuration(remaining);
			timerEl.addClass('rest');
			timerEl.createSpan({ cls: 'timer-indicator rest', text: Constants.TIMER_ICONS['rest'] });
		} else {
			// Overtime: show absolute value in red with warning icon
			timerEl.textContent = formatDuration(Math.abs(remaining));
			timerEl.addClass('rest-overtime');
			timerEl.createSpan({ cls: 'timer-indicator rest-overtime', text: Constants.TIMER_ICONS['rest-overtime'] });
		}
	}
	 else {
		// Count-up mode: show elapsed time from start (no target limit)
		timerEl.textContent = formatDuration(timerState.exerciseElapsed);
		timerEl.createSpan({ cls: 'timer-indicator count-up', text: Constants.TIMER_ICONS['count-up'] });
	}
}
