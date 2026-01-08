import { App, TFile } from 'obsidian';
import { SectionInfo } from '../types';

export class FileUpdater {
	constructor(private app: App) {}

	async updateCodeBlock(
		sourcePath: string,
		sectionInfo: SectionInfo | null,
		newContent: string
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

			// Find the code block boundaries
			// sectionInfo.lineStart points to the ```workout line
			// sectionInfo.lineEnd points to the closing ``` line
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

			return newLines.join('\n');
		});
	}

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

			// Calculate absolute line number
			// sectionInfo.lineStart is the ```workout line
			// relativeLineIndex is relative to inside the code block
			const absoluteLineIndex = sectionInfo.lineStart + 1 + relativeLineIndex;

			// Insert the new line after the specified line
			lines.splice(absoluteLineIndex + 1, 0, newLine);

			return lines.join('\n');
		});
	}
}
