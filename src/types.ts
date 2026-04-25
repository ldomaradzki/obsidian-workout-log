import { MarkdownPostProcessorContext, TFile, App } from 'obsidian';

// Workout states
export type WorkoutState = 'planned' | 'started' | 'completed';

// Exercise completion states from markdown checkboxes
// [ ] = pending, [\] = inProgress, [x] = completed, [-] = skipped
export type ExerciseState = 'pending' | 'inProgress' | 'completed' | 'skipped';

// Token types for parameter parsing
export interface Token {
	type: 'key' | 'bracket' | 'value' | 'unit';
	value: string;
}

export abstract class Constants {
	static readonly STATE_ICONS: Record<ExerciseState, string> = {
		'pending': '○',
		'inProgress': '◐',
		'completed': '✓',
		'skipped': '—'
	};
	static readonly PARAM_PREFIX_ICONS: Record<string, string> = {
		'duration': '⏱️',
		'reps': '×',
		'rest': '⏸️'
	};
	static readonly TIMER_ICONS: Record<string, string> = {
		'count-down': ' ▼',
		'count-up': ' ▲',
		'recorded': ' ✓',
		'rest': ' ‖',
		'rest-overtime': ' ‖',
		'overtime': ' ⚠'

	};
}

// Key-value pairs for exercise/set parameters
export interface ExerciseParam {
	key: string;
	value: string;
	editable: boolean;  // true if wrapped in [brackets]
	unit?: string;
}

// Single set within an exercise
export interface ExerciseSet {
	state: ExerciseState;
	params: ExerciseParam[];
	lineIndex: number;        // Line index relative to exercise section start
	targetDuration?: number;  // Target duration in seconds (for countdown timers)
	targetRest?: number;      // Target rest duration in seconds (for countdown timers)
	recordedTime?: string;    // Actual elapsed time during the set (from timer)
	recordedRest?: string;    // Actual elapsed time during rest period after this set
}

// Parsed metadata from the workout block header
export interface WorkoutMetadata {
	title?: string;
	state: WorkoutState;
	startDate?: string;   // ISO format or human readable
	duration?: string;    // e.g., "11m 33s"
	restDuration?: number; // Default rest duration in seconds
	saveToProperties?: boolean; // Whether to save workout data to Obsidian properties
}

// Single exercise entry (with nested sets)
export interface Exercise {
	state: ExerciseState;
	name: string;
	params: ExerciseParam[];   // Exercise-level params (e.g., Duration)
	sets: ExerciseSet[];       // Nested sets
	targetDuration?: number;   // Target duration in seconds (for countdown)
	targetRest?: number;       // Target rest duration in seconds (for countdown)
	recordedTime?: string;     // Recorded duration after completion
	recordedRest?: string;     // Recorded rest duration after completion
	lineIndex: number;         // Line index relative to exercise section start
}

// Complete parsed workout block
export interface ParsedWorkout {
	metadata: WorkoutMetadata;
	exercises: Exercise[];
	rawLines: string[];          // Preserve original lines for reconstruction
	metadataEndIndex: number;    // Line index where metadata section ends (after ---)
}

// Timer instance for a workout
export interface TimerInstance {
	workoutId: string;
	workoutStartTime: number;    // Timestamp when workout started
	exerciseStartTime: number;   // Timestamp when current set started
	exercisePausedTime: number;  // Accumulated paused time for current set
	isPaused: boolean;
	activeExerciseIndex: number;
	activeSetIndex: number;      // Index of active set within active exercise
	isRestActive: boolean;       // True if currently in rest period after a set
	restStartTime: number;       // Timestamp when rest period started
	restPausedTime: number;      // Accumulated paused time for rest period
	restDuration: number;        // Total rest duration in seconds for current rest period
	callbacks: Set<TimerCallback>;
}

// Timer state passed to UI
export interface TimerState {
	workoutElapsed: number;      // Total workout elapsed seconds
	exerciseElapsed: number;     // Current exercise elapsed seconds
	exerciseRemaining?: number;  // Seconds remaining (countdown mode)
	isOvertime: boolean;         // True if countdown exceeded
	isRestActive?: boolean;      // True if currently in rest period
	restElapsed?: number;        // Rest period elapsed seconds
	restRemaining?: number;      // Rest period remaining seconds
}

export type TimerCallback = (state: TimerState) => void;

// Callbacks for workout interactions
export interface WorkoutCallbacks {
	onStartWorkout: () => Promise<void>;
	onFinishWorkout: () => Promise<void>;
	
	// Set/Exercise flow callbacks
	onSetFinish: (exerciseIndex: number, setIndex: number) => Promise<void>;
	onRestStart: (exerciseIndex: number, restDuration: number) => Promise<void>;
	onRestEnd: (exerciseIndex: number) => Promise<void>;
	onExerciseSkip: (exerciseIndex: number) => Promise<void>;
	onExerciseAddSet: (exerciseIndex: number) => Promise<void>;
	onExerciseAddRest: (exerciseIndex: number) => Promise<void>;
	
	// Parameter change callbacks
	onParamChange: (exerciseIndex: number, paramKey: string, newValue: string) => void;
	onSetParamChange: (exerciseIndex: number, setIndex: number, paramKey: string, newValue: string) => void;
	
	// UI control callbacks
	onFlushChanges: () => Promise<void>;
	onPauseExercise: () => void;
	onResumeExercise: () => void;
	onAddSample: () => Promise<void>;
	
	// Deprecated: kept for backwards compatibility, use onSetFinish instead
	onExerciseFinish?: (exerciseIndex: number) => Promise<void>;
}

// Context passed to renderer
export interface RenderContext {
	el: HTMLElement;
	parsed: ParsedWorkout;
	callbacks: WorkoutCallbacks;
	workoutId: string;
	app: App;
	timerState?: TimerState;
}

// Section info from Obsidian
export interface SectionInfo {
	lineStart: number;
	lineEnd: number;
}

// File update context
export interface UpdateContext {
	app: App;
	sourcePath: string;
	sectionInfo: SectionInfo | null;
}
