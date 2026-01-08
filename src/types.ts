import { MarkdownPostProcessorContext, TFile, App } from 'obsidian';

// Workout states
export type WorkoutState = 'planned' | 'started' | 'completed';

// Exercise completion states from markdown checkboxes
// [ ] = pending, [\] = inProgress, [x] = completed, [-] = skipped
export type ExerciseState = 'pending' | 'inProgress' | 'completed' | 'skipped';

// Key-value pairs for exercise parameters
export interface ExerciseParam {
	key: string;
	value: string;
	editable: boolean;  // true if wrapped in [brackets]
	unit?: string;
}

// Parsed metadata from the workout block header
export interface WorkoutMetadata {
	title?: string;
	state: WorkoutState;
	startDate?: string;   // ISO format or human readable
	duration?: string;    // e.g., "11m 33s"
}

// Single exercise entry
export interface Exercise {
	state: ExerciseState;
	name: string;
	params: ExerciseParam[];
	targetDuration?: number;     // Target duration in seconds (for countdown)
	recordedDuration?: string;   // Recorded duration after completion
	lineIndex: number;           // Line index relative to exercise section start
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
	exerciseStartTime: number;   // Timestamp when current exercise started
	exercisePausedTime: number;  // Accumulated paused time for current exercise
	isPaused: boolean;
	activeExerciseIndex: number;
	callbacks: Set<TimerCallback>;
}

// Timer state passed to UI
export interface TimerState {
	workoutElapsed: number;      // Total workout elapsed seconds
	exerciseElapsed: number;     // Current exercise elapsed seconds
	remaining?: number;          // Seconds remaining (countdown mode)
	isOvertime: boolean;         // True if countdown exceeded
}

export type TimerCallback = (state: TimerState) => void;

// Callbacks for workout interactions
export interface WorkoutCallbacks {
	onStartWorkout: () => Promise<void>;
	onFinishWorkout: () => Promise<void>;
	onExerciseFinish: (exerciseIndex: number) => Promise<void>;
	onExerciseAddSet: (exerciseIndex: number) => Promise<void>;
	onExerciseSkip: (exerciseIndex: number) => Promise<void>;
	onParamChange: (exerciseIndex: number, paramKey: string, newValue: string) => Promise<void>;
	onPauseExercise: () => void;
	onResumeExercise: () => void;
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
