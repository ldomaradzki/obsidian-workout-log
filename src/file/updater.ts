/**
 * File update operations for workout blocks.
 *
 * Manages persisting changes back to the Obsidian vault with:
 * - Code block content replacement (workout markdown source)
 * - Line insertion (for adding exercises/sets)
 * - Frontmatter/properties export (optional feature for external tools)
 * - Concurrency control (locks) to prevent race conditions on simultaneous edits
 * - Validation checks (stale section detection, title matching)
 *
 * Architecture:
 * - FileUpdater class wraps Obsidian's app.vault.process() API
 * - withLock() serializes updates to prevent concurrent modifications
 * - updateCodeBlock() validates sectionInfo before updating
 * - saveToProperties() converts parsed data to file frontmatter
 */

import { App, TFile } from 'obsidian';
import { SectionInfo, ParsedWorkout } from '../types';

/**
 * Manages file update operations with concurrency control.
 *
 * Public methods:
 * - updateCodeBlock() - Replace workout code block content
 * - insertLineAfter() - Insert a new line within code block
 * - saveToProperties() - Export workout data to file frontmatter
 *
 * Private helpers:
 * - normalizeToCamelCase() - Convert exercise names to property keys
 * - withLock() - Serialize updates to prevent races
 */
export class FileUpdater {
	private updateLocks = new Map<string, Promise<void>>();

	/**
	 * Create a FileUpdater instance.
	 *
	 * Parameters:
	 * - app: Obsidian App instance for vault operations
	 */
	constructor(private app: App) {}

	/**
	 * Normalize exercise name to camelCase for use as property keys.
	 *
	 * Converts spaces, hyphens, underscores to camelCase:
	 * - "Push ups" → "pushUps"
	 * - "bench-press" → "benchPress"
	 * - "leg_raises" → "legRaises"
	 *
	 * Parameters:
	 * - name: Exercise name
	 *
	 * Returns: camelCase version suitable for object keys
	 */
	private normalizeToCamelCase(name: string): string {
		return name
			.trim()
			.split(/[\s\-_]+/)  // Split on spaces, hyphens, underscores
			.map((word, index) => {
				if (index === 0) {
					// First word: lowercase
					return word.toLowerCase();
				}
				// Following words: capitalize first letter
				return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
			})
			.join('');
	}

	/**
	 * Serialize updates to the same file to prevent race conditions.
	 *
	 * When multiple save operations occur simultaneously, this ensures they execute
	 * sequentially. Uses a Map of locks keyed by filePath.
	 *
	 * Flow:
	 * 1. Wait for any pending update on this file
	 * 2. Create a new lock promise
	 * 3. Execute the provided function
	 * 4. Resolve the lock when done
	 * 5. Clean up the lock entry
	 *
	 * Parameters:
	 * - filePath: File path to lock
	 * - fn: Async function to execute under lock
	 *
	 * Returns: Result from fn()
	 */
	private async withLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
		// Wait for any pending update to complete
		const pending = this.updateLocks.get(filePath);
		if (pending) {
			await pending;
		}

		// Create a new promise for our update
		let resolve: () => void;
		const lock = new Promise<void>(r => { resolve = r; });
		this.updateLocks.set(filePath, lock);

		try {
			return await fn();
		} finally {
			// Signal lock completion
			resolve!();
			// Clean up if this is still our lock (prevent stale cleanup)
			if (this.updateLocks.get(filePath) === lock) {
				this.updateLocks.delete(filePath);
			}
		}
	}

	/**
	 * Replace the content of a workout code block.
	 *
	 * Updates the markdown source between ```workout fences while preserving fence lines.
	 * Includes validation to detect stale updates.
	 *
	 * Validation checks:
	 * - File exists and is a TFile
	 * - sectionInfo is valid (not null)
	 * - Code block still starts at specified lineStart (detects stale renders)
	 * - Optional: title matches expectedTitle (detects conflicting updates)
	 *
	 * Parameters:
	 * - sourcePath: File path to update
	 * - sectionInfo: Section location (lineStart, lineEnd) or null if unknown
	 * - newContent: New content to place between code fences
	 * - expectedTitle: Optional title to validate (if provided, must match)
	 *
	 * Returns: true if update succeeded, false if validation failed
	 */
	async updateCodeBlock(
		sourcePath: string,
		sectionInfo: SectionInfo | null,
		newContent: string,
		expectedTitle?: string
	): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) {
			console.error('Workout Log: File not found:', sourcePath);
			return false;
		}

		if (!sectionInfo) {
			console.error('Workout Log: No section info available - cannot update file. Try navigating away and back.');
			return false;
		}

		let updateSucceeded = false;

		await this.withLock(sourcePath, async () => {
			await this.app.vault.process(file, (content) => {
				const lines = content.split('\n');

				// Validate that target location still has a workout code block
				// This detects stale renders (sectionInfo from before re-render)
				const startLine = lines[sectionInfo.lineStart];
				if (!startLine || !startLine.trim().startsWith('```workout')) {
					console.error('Workout Log: Stale sectionInfo - expected ```workout at line', sectionInfo.lineStart, '. Try navigating away and back.');
					return content; // Return unchanged
				}

				// If we have an expected title, validate it matches
				// This detects conflicting updates from simultaneous editing
				if (expectedTitle) {
					const blockContent = lines.slice(sectionInfo.lineStart + 1, sectionInfo.lineEnd).join('\n');
					const titleMatch = blockContent.match(/^title:\s*(.+)$/m);
					const actualTitle = titleMatch?.[1]?.trim();
					if (actualTitle && actualTitle !== expectedTitle) {
						console.error('Workout Log: Title mismatch - expected', expectedTitle, 'but found', actualTitle);
						return content; // Return unchanged
					}
				}

				// Find the code block boundaries
				const codeBlockStart = sectionInfo.lineStart;
				const codeBlockEnd = sectionInfo.lineEnd;

				// Replace content between the code fences (exclusive of the fences themselves)
				const beforeFence = lines.slice(0, codeBlockStart + 1);
				const afterFence = lines.slice(codeBlockEnd);

				const newLines = [
					...beforeFence,
					newContent,
					...afterFence
				];

				updateSucceeded = true;
				return newLines.join('\n');
			});
		});

		return updateSucceeded;
	}

	/**
	 * Insert a new line within a code block.
	 *
	 * Adds a line at the specified position (relative to code block start).
	 * Used for adding exercises or sets to existing workouts.
	 *
	 * Position calculation:
	 * - sectionInfo.lineStart = line with ```workout marker
	 * - relativeLineIndex = position within code block (0 = first content line)
	 * - Absolute line = lineStart + 1 + relativeLineIndex
	 *
	 * Parameters:
	 * - sourcePath: File path to update
	 * - sectionInfo: Section location or null
	 * - relativeLineIndex: Line position relative to code block content start
	 * - newLine: Line content to insert
	 */
	async insertLineAfter(
		sourcePath: string,
		sectionInfo: SectionInfo | null,
		relativeLineIndex: number,
		newLine: string
	): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) {
			console.error('File not found:', sourcePath);
			return;
		}

		if (!sectionInfo) {
			console.error('No section info available');
			return;
		}

		await this.app.vault.process(file, (content) => {
			const lines = content.split('\n');

			// Calculate absolute line number within the file
			// sectionInfo.lineStart is the ```workout line
			// relativeLineIndex is relative to inside the code block
			const absoluteLineIndex = sectionInfo.lineStart + 1 + relativeLineIndex;

			// Insert the new line after the specified line
			lines.splice(absoluteLineIndex + 1, 0, newLine);

			return lines.join('\n');
		});
	}

	/**
	 * Export workout data to file frontmatter/properties.
	 *
	 * Optional feature: only runs if parsed.metadata.saveToProperties is true.
	 *
	 * Exported properties:
	 * - Workout-level: workoutTitle, workoutState, workoutStartDate, workoutDuration, workoutRestDuration
	 * - Exercise data: workoutExercises (array with name, state, recorded times)
	 * - Exercise totals: [exerciseName]TotalWeight, [exerciseName]TotalReps, [exerciseName]TotalDuration
	 *   (names converted to camelCase, e.g., "Push ups" → "pushUps")
	 *
	 * Use cases:
	 * - Dataview queries on workout properties
	 * - External tools accessing file properties
	 * - Analytics on exercise performance
	 *
	 * Parameters:
	 * - sourcePath: File path to update
	 * - parsed: ParsedWorkout with data to export
	 */
	async saveToProperties(sourcePath: string, parsed: ParsedWorkout): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) {
			console.error('Workout Log: Cannot save to properties - file not found:', sourcePath);
			return;
		}

		// Only proceed if saveToProperties is explicitly true
		if (!parsed.metadata.saveToProperties) {
			return;
		}

		await this.withLock(sourcePath, async () => {
			// Build properties object from parsed workout data
			const properties: Record<string, unknown> = {};

			const metadata = parsed.metadata;

			// Workout-level metadata
			if (metadata.title) {
				properties.workoutTitle = metadata.title;
			}
			if (metadata.state) {
				properties.workoutState = metadata.state;
			}
			if (metadata.startDate) {
				properties.workoutStartDate = metadata.startDate;
			}
			if (metadata.duration) {
				properties.workoutDuration = metadata.duration;
			}
			if (metadata.restDuration !== undefined) {
				properties.workoutRestDuration = metadata.restDuration;
			}

			// Exercise data (overall structure)
			if (parsed.exercises.length > 0) {
				const exercises = parsed.exercises.map(exercise => ({
					name: exercise.name,
					state: exercise.state,
					recordedDuration: exercise.recordedTime,
					sets: exercise.sets.map(set => {
						// Extract recorded duration from params if it exists
						const durationParam = set.params.find(p => p.key.toLowerCase() === 'duration' && !p.editable);
						return {
							state: set.state,
							recordedDuration: durationParam?.value
						};
					})
				}));
				properties.workoutExercises = exercises;

				// Calculate and add per-exercise totals
				for (const exercise of parsed.exercises) {
					const normalizedName = this.normalizeToCamelCase(exercise.name);

					// Aggregate totals from all sets of this exercise
					let totalWeight = 0;
					let totalReps = 0;
					let totalDuration = 0;

					for (const set of exercise.sets) {
						// Extract weight from set params
						const weightParam = set.params.find(p => p.key.toLowerCase() === 'weight');
						if (weightParam && weightParam.value) {
							const weight = parseFloat(weightParam.value);
							if (!isNaN(weight)) {
								totalWeight += weight;
							}
						}

						// Extract reps from set params
						const repsParam = set.params.find(p => p.key.toLowerCase() === 'reps');
						if (repsParam && repsParam.value) {
							const reps = parseInt(repsParam.value, 10);
							if (!isNaN(reps)) {
								totalReps += reps;
							}
						}

						// Extract duration from set params
						const durationParam = set.params.find(p => p.key.toLowerCase() === 'duration');
						if (durationParam && durationParam.value) {
							const duration = parseInt(durationParam.value, 10);
							if (!isNaN(duration)) {
								totalDuration += duration;
							}
						}
					}

					// Add properties for this exercise if any totals exist
					if (totalWeight > 0) {
						properties[`${normalizedName}TotalWeight`] = totalWeight;
					}
					if (totalReps > 0) {
						properties[`${normalizedName}TotalReps`] = totalReps;
					}
					if (totalDuration > 0) {
						properties[`${normalizedName}TotalDuration`] = totalDuration;
					}
				}
			}

			// Update file frontmatter with properties
			try {
				await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
					// Merge properties into frontmatter
					Object.assign(frontmatter, properties);
				});
			} catch (error) {
				console.error('Workout Log: Failed to save properties to file:', error);
			}
		});
	}
}
