import { FileUpdater } from './updater';
import { SectionInfo, ParsedWorkout } from '../types';
import { TFile } from 'obsidian';

// Test mock using the mocked TFile class
class MockTFile extends TFile {
	constructor(path: string) {
		super(path);
	}
}

class MockApp {
	private files: Map<string, { content: string; frontmatter: Record<string, any> }> = new Map();

	setFileContent(path: string, content: string): void {
		if (!this.files.has(path)) {
			this.files.set(path, { content, frontmatter: {} });
		} else {
			const file = this.files.get(path)!;
			file.content = content;
		}
	}

	getFileContent(path: string): string | undefined {
		return this.files.get(path)?.content;
	}

	getFileFrontmatter(path: string): Record<string, any> {
		return this.files.get(path)?.frontmatter || {};
	}

	vault = {
		getAbstractFileByPath: (path: string) => {
			return this.files.has(path) ? new MockTFile(path) : null;
		},
		process: async (file: MockTFile, callback: (content: string) => string) => {
			const fileData = this.files.get(file.path);
			if (fileData) {
				const result = callback(fileData.content);
				fileData.content = result;
			}
		}
	};

	fileManager = {
		processFrontMatter: async (file: MockTFile, callback: (frontmatter: Record<string, any>) => void) => {
			const fileData = this.files.get(file.path);
			if (fileData) {
				callback(fileData.frontmatter);
			} else {
				console.error(`File not found in mock: ${file.path}`);
			}
		}
	};
}

describe('FileUpdater', () => {
	let updater: FileUpdater;
	let mockApp: MockApp;

	beforeEach(() => {
		mockApp = new MockApp();
		updater = new FileUpdater(mockApp as any);
	});

	describe('normalizeToCamelCase', () => {
		it('should convert single word to lowercase', () => {
			const result = (updater as any).normalizeToCamelCase('Bench');
			expect(result).toBe('bench');
		});

		it('should convert multi-word to camelCase with spaces', () => {
			const result = (updater as any).normalizeToCamelCase('Bench Press');
			expect(result).toBe('benchPress');
		});

		it('should convert multi-word with hyphens', () => {
			const result = (updater as any).normalizeToCamelCase('Dumb-Bell-Curl');
			expect(result).toBe('dumbBellCurl');
		});

		it('should convert multi-word with underscores', () => {
			const result = (updater as any).normalizeToCamelCase('Leg_Press');
			expect(result).toBe('legPress');
		});

		it('should handle mixed separators', () => {
			const result = (updater as any).normalizeToCamelCase('Cable - Row_Machine');
			expect(result).toBe('cableRowMachine');
		});

		it('should trim whitespace', () => {
			const result = (updater as any).normalizeToCamelCase('  Pull Ups  ');
			expect(result).toBe('pullUps');
		});

		it('should preserve case internally', () => {
			const result = (updater as any).normalizeToCamelCase('Machine Chest Press');
			expect(result).toBe('machineChestPress');
		});
	});

	describe('withLock', () => {
		it('should execute function successfully', async () => {
			const fn = jest.fn(async () => 'result');
			const result = await (updater as any).withLock('file.md', fn);
			expect(result).toBe('result');
			expect(fn).toHaveBeenCalledTimes(1);
		});

		it('should serialize concurrent updates to same file', async () => {
			const calls: number[] = [];
			const fn1 = jest.fn(async () => {
				calls.push(1);
				await new Promise(r => setTimeout(r, 10));
				calls.push(2);
				return 'result1';
			});
			const fn2 = jest.fn(async () => {
				calls.push(3);
				await new Promise(r => setTimeout(r, 5));
				calls.push(4);
				return 'result2';
			});

			const promise1 = (updater as any).withLock('file.md', fn1);
			const promise2 = (updater as any).withLock('file.md', fn2);

			const [result1, result2] = await Promise.all([promise1, promise2]);

			expect(result1).toBe('result1');
			expect(result2).toBe('result2');
			// Verify they ran sequentially: calls should be [1, 2, 3, 4]
			expect(calls).toEqual([1, 2, 3, 4]);
		});

		it('should allow parallel updates to different files', async () => {
			const calls: string[] = [];
			const fn1 = jest.fn(async () => {
				calls.push('file1-start');
				await new Promise(r => setTimeout(r, 10));
				calls.push('file1-end');
				return 'result1';
			});
			const fn2 = jest.fn(async () => {
				calls.push('file2-start');
				await new Promise(r => setTimeout(r, 10));
				calls.push('file2-end');
				return 'result2';
			});

			const promise1 = (updater as any).withLock('file1.md', fn1);
			const promise2 = (updater as any).withLock('file2.md', fn2);

			await Promise.all([promise1, promise2]);

			// Verify they ran in parallel (interleaved)
			expect(calls[0]).toBe('file1-start');
			expect(calls[1]).toBe('file2-start');
		});

		it('should clean up lock after successful execution', async () => {
			const getLocks = () => (updater as any).updateLocks;
			expect(getLocks().size).toBe(0);

			await (updater as any).withLock('file.md', async () => 'done');

			expect(getLocks().size).toBe(0);
		});

		it('should clean up lock after error', async () => {
			const getLocks = () => (updater as any).updateLocks;
			expect(getLocks().size).toBe(0);

			try {
				await (updater as any).withLock('file.md', async () => {
					throw new Error('test error');
				});
			} catch (e) {
				// Expected
			}

			expect(getLocks().size).toBe(0);
		});
	});

	describe('updateCodeBlock', () => {
		it('should update code block content successfully', async () => {
			const filePath = 'test.md';
			mockApp.setFileContent(filePath, '# Test\n```workout\ntitle: Old\n---\n- [ ] Exercise\n```\nEnd');

			const sectionInfo: SectionInfo = {
				lineStart: 1,
				lineEnd: 5
			};

			const newContent = 'title: New\n---\n- [ ] Exercise Updated';

			const result = await updater.updateCodeBlock(filePath, sectionInfo, newContent);

			expect(result).toBe(true);
			const updatedContent = mockApp.getFileContent(filePath);
			expect(updatedContent).toContain('title: New');
			expect(updatedContent).toContain('Exercise Updated');
		});

		it('should return false if file not found', async () => {
			const sectionInfo: SectionInfo = {
				lineStart: 0,
				lineEnd: 5
			};

			const result = await updater.updateCodeBlock('nonexistent.md', sectionInfo, 'content');

			expect(result).toBe(false);
		});

		it('should return false if sectionInfo is null', async () => {
			mockApp.setFileContent('test.md', 'content');

			const result = await updater.updateCodeBlock('test.md', null, 'content');

			expect(result).toBe(false);
		});

		it('should return false if workout code block is missing', async () => {
			const filePath = 'test.md';
			mockApp.setFileContent(filePath, '# Test\nNo code block here\n');

			const sectionInfo: SectionInfo = {
				lineStart: 1,
				lineEnd: 5
			};

			const result = await updater.updateCodeBlock(filePath, sectionInfo, 'new content');

			expect(result).toBe(false);
		});

		it('should validate expected title matches', async () => {
			const filePath = 'test.md';
			mockApp.setFileContent(filePath, '# Test\n```workout\ntitle: MyWorkout\n---\n- [ ] Exercise\n```\n');

			const sectionInfo: SectionInfo = {
				lineStart: 1,
				lineEnd: 5
			};

			const result = await updater.updateCodeBlock(
				filePath,
				sectionInfo,
				'title: MyWorkout\nnew content',
				'MyWorkout'
			);

			expect(result).toBe(true);
		});

		it('should return false if title does not match expected', async () => {
			const filePath = 'test.md';
			mockApp.setFileContent(filePath, '# Test\n```workout\ntitle: OldTitle\n---\n- [ ] Exercise\n```\n');

			const sectionInfo: SectionInfo = {
				lineStart: 1,
				lineEnd: 5
			};

			const result = await updater.updateCodeBlock(
				filePath,
				sectionInfo,
				'new content',
				'ExpectedTitle'
			);

			expect(result).toBe(false);
			// Content should remain unchanged
			const content = mockApp.getFileContent(filePath);
			expect(content).toContain('OldTitle');
		});

		it('should preserve content before and after code block', async () => {
			const filePath = 'test.md';
			mockApp.setFileContent(filePath, '# Header\nSome text\n```workout\nold content\n```\nMore text');

			const sectionInfo: SectionInfo = {
				lineStart: 2,
				lineEnd: 4
			};

			await updater.updateCodeBlock(filePath, sectionInfo, 'new content');

			const result = mockApp.getFileContent(filePath);
			expect(result).toContain('# Header');
			expect(result).toContain('Some text');
			expect(result).toContain('More text');
			expect(result).toContain('new content');
			expect(result).not.toContain('old content');
		});

		it('should handle multi-line code block updates', async () => {
			const filePath = 'test.md';
			const oldContent = '```workout\ntitle: Test\n---\n- [ ] Ex1\n- [ ] Ex2\n```';
			mockApp.setFileContent(filePath, oldContent);

			const sectionInfo: SectionInfo = {
				lineStart: 0,
				lineEnd: 5
			};

			const newContent = 'title: Test\n---\n- [x] Ex1\n- [ ] Ex2 Updated';

			await updater.updateCodeBlock(filePath, sectionInfo, newContent);

			const result = mockApp.getFileContent(filePath);
			expect(result).toContain('- [x] Ex1');
			expect(result).toContain('- [ ] Ex2 Updated');
		});
	});

	describe('insertLineAfter', () => {
		it('should insert line after specified relative line index', async () => {
			const filePath = 'test.md';
			mockApp.setFileContent(filePath, 'Line 1\n```workout\nLine 1\nLine 2\nLine 3\n```\nLine 4');

			const sectionInfo: SectionInfo = {
				lineStart: 1,
				lineEnd: 5
			};

			await updater.insertLineAfter(filePath, sectionInfo, 0, 'Inserted');

			const result = mockApp.getFileContent(filePath);
			const lines = result.split('\n');

			// sectionInfo.lineStart is 1 (```workout)
			// relativeLineIndex 0 refers to index 0 inside code block (Line 1)
			// Should insert at absolute line 3 (after Line 1)
			expect(lines[3]).toBe('Inserted');
		});

		it('should return silently if file not found', async () => {
			const sectionInfo: SectionInfo = {
				lineStart: 0,
				lineEnd: 5
			};

			await updater.insertLineAfter('nonexistent.md', sectionInfo, 0, 'new line');
			// Should not throw
		});

		it('should return silently if sectionInfo is null', async () => {
			mockApp.setFileContent('test.md', 'content');

			await updater.insertLineAfter('test.md', null, 0, 'new line');
			// Should not throw
		});

		it('should handle insertion at different relative indices', async () => {
			const filePath = 'test.md';
			mockApp.setFileContent(filePath, '```workout\nLine 1\nLine 2\nLine 3\n```');

			const sectionInfo: SectionInfo = {
				lineStart: 0,
				lineEnd: 4
			};

			await updater.insertLineAfter(filePath, sectionInfo, 2, 'Inserted at end');

			const result = mockApp.getFileContent(filePath);
			const lines = result.split('\n');

			// relativeLineIndex 2 is Line 3, insert after it
			expect(lines).toContain('Inserted at end');
		});
	});

	describe('saveToProperties', () => {
		it('should not save properties if saveToProperties is false', async () => {
			const filePath = 'test.md';
			mockApp.setFileContent(filePath, 'content');

			const parsed: ParsedWorkout = {
				metadata: {
					title: 'Test',
					state: 'started',
					saveToProperties: false
				},
				exercises: [],
				rawLines: [],
				metadataEndIndex: -1
			};

			await updater.saveToProperties(filePath, parsed);

			const frontmatter = mockApp.getFileFrontmatter(filePath);
			expect(frontmatter).toEqual({});
		});

		it('should save metadata properties', async () => {
			const filePath = 'test.md';
			mockApp.setFileContent(filePath, 'content');

			const parsed: ParsedWorkout = {
				metadata: {
					title: 'My Workout',
					state: 'started',
					startDate: '2026-04-08 10:00',
					duration: '30m',
					restDuration: 300,
					saveToProperties: true
				},
				exercises: [],
				rawLines: [],
				metadataEndIndex: -1
			};

			await updater.saveToProperties(filePath, parsed);

			const frontmatter = mockApp.getFileFrontmatter(filePath);
			expect(frontmatter.workoutTitle).toBe('My Workout');
			expect(frontmatter.workoutState).toBe('started');
			expect(frontmatter.workoutStartDate).toBe('2026-04-08 10:00');
			expect(frontmatter.workoutDuration).toBe('30m');
			expect(frontmatter.workoutRestDuration).toBe(300);
		});

		it('should save exercise data to properties', async () => {
			const filePath = 'test.md';
			mockApp.setFileContent(filePath, 'content');

			const parsed: ParsedWorkout = {
				metadata: {
					title: 'Test',
					state: 'started',
					saveToProperties: true
				},
				exercises: [
					{
						name: 'Bench Press',
						state: 'completed',
						recordedTime: '10m',
						params: [],
						lineIndex: 0,
						sets: [
							{
								state: 'completed',
								params: [
									{ key: 'Duration', value: '120', unit: 's', editable: false }
								],
								lineIndex: 1
							}
						]
					}
				],
				rawLines: [],
				metadataEndIndex: -1
			};

			await updater.saveToProperties(filePath, parsed);

			const frontmatter = mockApp.getFileFrontmatter(filePath);
			expect(frontmatter.workoutExercises).toBeDefined();
			expect(Array.isArray(frontmatter.workoutExercises)).toBe(true);

			const exercises = frontmatter.workoutExercises as any[];
			expect(exercises).toHaveLength(1);
			expect(exercises[0].name).toBe('Bench Press');
			expect(exercises[0].state).toBe('completed');
			expect(exercises[0].recordedDuration).toBe('10m');
		});

		it('should calculate exercise totals for weight', async () => {
			const filePath = 'test.md';
			mockApp.setFileContent(filePath, 'content');

			const parsed: ParsedWorkout = {
				metadata: {
					title: 'Test',
					state: 'started',
					saveToProperties: true
				},
				exercises: [
					{
						name: 'Dumb Bell Curl',
						state: 'completed',
						params: [],
						lineIndex: 0,
						sets: [
							{
								state: 'completed',
								params: [
									{ key: 'Weight', value: '10', unit: 'kg', editable: true },
									{ key: 'Reps', value: '10', unit: '', editable: true }
								],
								lineIndex: 1
							},
							{
								state: 'completed',
								params: [
									{ key: 'Weight', value: '12', unit: 'kg', editable: true },
									{ key: 'Reps', value: '8', unit: '', editable: true }
								],
								lineIndex: 2
							}
						]
					}
				],
				rawLines: [],
				metadataEndIndex: -1
			};

			await updater.saveToProperties(filePath, parsed);

			const frontmatter = mockApp.getFileFrontmatter(filePath);
			expect(frontmatter.dumbBellCurlTotalWeight).toBe(22);
			expect(frontmatter.dumbBellCurlTotalReps).toBe(18);
		});

		it('should calculate exercise totals for duration', async () => {
			const filePath = 'test.md';
			mockApp.setFileContent(filePath, 'content');

			const parsed: ParsedWorkout = {
				metadata: {
					title: 'Test',
					state: 'started',
					saveToProperties: true
				},
				exercises: [
					{
						name: 'Treadmill',
						state: 'completed',
						params: [],
						lineIndex: 0,
						sets: [
							{
								state: 'completed',
								params: [
									{ key: 'Duration', value: '300', unit: '', editable: true }
								],
								lineIndex: 1
							},
							{
								state: 'completed',
								params: [
									{ key: 'Duration', value: '180', unit: '', editable: true }
								],
								lineIndex: 2
							}
						]
					}
				],
				rawLines: [],
				metadataEndIndex: -1
			};

			await updater.saveToProperties(filePath, parsed);

			const frontmatter = mockApp.getFileFrontmatter(filePath);
			expect(frontmatter.treadmillTotalDuration).toBe(480);
		});

		it('should handle multiple exercises with different parameters', async () => {
			const filePath = 'test.md';
			mockApp.setFileContent(filePath, 'content');

			const parsed: ParsedWorkout = {
				metadata: {
					title: 'Test',
					state: 'started',
					saveToProperties: true
				},
				exercises: [
					{
						name: 'Bench Press',
						state: 'completed',
						params: [],
						lineIndex: 0,
						sets: [
							{
								state: 'completed',
								params: [
									{ key: 'Weight', value: '100', unit: 'kg', editable: true },
									{ key: 'Reps', value: '5', unit: '', editable: true }
								],
								lineIndex: 1
							}
						]
					},
					{
						name: 'Squats',
						state: 'completed',
						params: [],
						lineIndex: 2,
						sets: [
							{
								state: 'completed',
								params: [
									{ key: 'Weight', value: '150', unit: 'kg', editable: true },
									{ key: 'Reps', value: '8', unit: '', editable: true }
								],
								lineIndex: 3
							}
						]
					}
				],
				rawLines: [],
				metadataEndIndex: -1
			};

			await updater.saveToProperties(filePath, parsed);

			const frontmatter = mockApp.getFileFrontmatter(filePath);
			expect(frontmatter.benchPressTotalWeight).toBe(100);
			expect(frontmatter.benchPressTotalReps).toBe(5);
			expect(frontmatter.squatsTotalWeight).toBe(150);
			expect(frontmatter.squatsTotalReps).toBe(8);
		});

		it('should skip invalid numeric values', async () => {
			const filePath = 'test.md';
			mockApp.setFileContent(filePath, 'content');

			const parsed: ParsedWorkout = {
				metadata: {
					title: 'Test',
					state: 'started',
					saveToProperties: true
				},
				exercises: [
					{
						name: 'Test',
						state: 'completed',
						params: [],
						lineIndex: 0,
						sets: [
							{
								state: 'completed',
								params: [
									{ key: 'Weight', value: 'invalid', unit: 'kg', editable: true },
									{ key: 'Reps', value: '10', unit: '', editable: true }
								],
								lineIndex: 1
							}
						]
					}
				],
				rawLines: [],
				metadataEndIndex: -1
			};

			await updater.saveToProperties(filePath, parsed);

			const frontmatter = mockApp.getFileFrontmatter(filePath);
			expect(frontmatter.testTotalWeight).toBeUndefined();
			expect(frontmatter.testTotalReps).toBe(10);
		});

		it('should not add zero totals', async () => {
			const filePath = 'test.md';
			mockApp.setFileContent(filePath, 'content');

			const parsed: ParsedWorkout = {
				metadata: {
					title: 'Test',
					state: 'started',
					saveToProperties: true
				},
				exercises: [
					{
						name: 'NoParams',
						state: 'completed',
						params: [],
						lineIndex: 0,
						sets: [
							{
								state: 'completed',
								params: [],
								lineIndex: 1
							}
						]
					}
				],
				rawLines: [],
				metadataEndIndex: -1
			};

			await updater.saveToProperties(filePath, parsed);

			const frontmatter = mockApp.getFileFrontmatter(filePath);
			expect(frontmatter.noParamsTotalWeight).toBeUndefined();
			expect(frontmatter.noParamsTotalReps).toBeUndefined();
			expect(frontmatter.noParamsTotalDuration).toBeUndefined();
		});

		it('should return silently if file not found', async () => {
			const parsed: ParsedWorkout = {
				metadata: {
					title: 'Test',
					state: 'started',
					saveToProperties: true
				},
				exercises: [],
				rawLines: [],
				metadataEndIndex: -1
			};

			await updater.saveToProperties('nonexistent.md', parsed);
			// Should not throw
		});

		it('should handle exercises with recorded duration in set params', async () => {
			const filePath = 'test.md';
			mockApp.setFileContent(filePath, 'content');

			const parsed: ParsedWorkout = {
				metadata: {
					title: 'Test',
					state: 'started',
					saveToProperties: true
				},
				exercises: [
					{
						name: 'Exercise',
						state: 'completed',
						recordedTime: '10m',
						params: [],
						lineIndex: 0,
						sets: [
							{
								state: 'completed',
								params: [
									{ key: 'Duration', value: '300s', unit: '', editable: false }
								],
								lineIndex: 1
							}
						]
					}
				],
				rawLines: [],
				metadataEndIndex: -1
			};

			await updater.saveToProperties(filePath, parsed);

			const frontmatter = mockApp.getFileFrontmatter(filePath);
			const exercises = frontmatter.workoutExercises as any[];
			expect(exercises[0].recordedDuration).toBe('10m');
			expect(exercises[0].sets[0].recordedDuration).toBe('300s');
		});
	});
});
