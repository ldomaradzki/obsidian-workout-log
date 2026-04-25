/**
 * Empty state rendering for workout blocks.
 *
 * Displays a placeholder UI when a planned workout has no exercises.
 * Provides a prominent button to load a sample workout as a starting point.
 * Only shown for planned workouts with no exercises.
 */

export function renderEmptyState(
	container: HTMLElement,
	onAddSample: () => Promise<void>
): HTMLElement {
	/**
	 * Render the empty state UI for a workout with no exercises.
	 *
	 * Displays:
	 * - Message: "This workout is empty"
	 * - Button: "Add Sample Workout" with sparkle emoji (✨)
	 *
	 * Parameters:
	 * - container: Parent DOM element to render into
	 * - onAddSample: Async callback fired when user clicks "Add Sample Workout"
	 *
	 * Returns: Empty state container element
	 */
	const emptyStateEl = container.createDiv({ cls: 'workout-empty-state' });

	// Display empty state message
	const message = emptyStateEl.createDiv({ cls: 'workout-empty-message' });
	message.createSpan({ text: 'This workout is empty' });

	// Create action button container and button
	const actionContainer = emptyStateEl.createDiv({ cls: 'workout-empty-action' });
	const addButton = actionContainer.createEl('button', {
		cls: 'workout-btn workout-btn-primary workout-btn-large'
	});
	
	// Add button icon (sparkle emoji) and label
	addButton.createSpan({ cls: 'workout-btn-icon', text: '✨' });
	addButton.createSpan({ text: 'Add Sample Workout' });

	// Wire up click handler to load sample workout
	addButton.addEventListener('click', async () => {
		await onAddSample();
	});

	return emptyStateEl;
}
