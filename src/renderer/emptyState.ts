export function renderEmptyState(
	container: HTMLElement,
	onAddSample: () => Promise<void>
): HTMLElement {
	const emptyStateEl = container.createDiv({ cls: 'workout-empty-state' });

	const message = emptyStateEl.createDiv({ cls: 'workout-empty-message' });
	message.createSpan({ text: 'This workout is empty' });

	const actionContainer = emptyStateEl.createDiv({ cls: 'workout-empty-action' });
	const addButton = actionContainer.createEl('button', {
		cls: 'workout-btn workout-btn-primary workout-btn-large'
	});
	addButton.createSpan({ cls: 'workout-btn-icon', text: '✨' });
	addButton.createSpan({ text: 'Add Sample Workout' });

	addButton.addEventListener('click', async () => {
		await onAddSample();
	});

	return emptyStateEl;
}
