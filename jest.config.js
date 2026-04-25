export default {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/src'],
	testMatch: ['**/*.test.ts'],
	moduleFileExtensions: ['ts', 'js'],
	testPathIgnorePatterns: ['src/timer/manager.test.ts'],
	moduleNameMapper: {
		'^obsidian$': '<rootDir>/src/__mocks__/obsidian.ts'
	},
	collectCoverageFrom: [
		'src/**/*.ts',
		'!src/**/*.d.ts',
		'!src/**/*.test.ts',
		'!src/main.ts',
		'!src/timer/**'
	],
	coverageThreshold: {
		global: {
			branches: 75,
			functions: 70,
			lines: 88,
			statements: 88
		},
		'src/parser/exercise.ts': {
			branches: 85,
			functions: 100,
			lines: 95,
			statements: 95
		},
		'src/parser/metadata.ts': {
			branches: 90,
			functions: 100,
			lines: 100,
			statements: 100
		},
		'src/parser/index.ts': {
			branches: 90,
			lines: 100,
			statements: 100
		},
		'src/serializer.ts': {
			branches: 60,
			functions: 85,
			lines: 83,
			statements: 83
		},
		'src/file/updater.ts': {
			branches: 89,
			functions: 100,
			lines: 99,
			statements: 99
		},
		'src/renderer/header.ts': {
			branches: 80,
			functions: 100,
			lines: 90,
			statements: 90
		},
		'src/renderer/emptyState.ts': {
			branches: 80,
			functions: 100,
			lines: 90,
			statements: 90
		},
		'src/renderer/controls.ts': {
			branches: 75,
			functions: 80,
			lines: 85,
			statements: 85
		},
		'src/renderer/exercise.ts': {
			branches: 80,
			functions: 60,
			lines: 85,
			statements: 85
		},
		'src/renderer/index.ts': {
			branches: 70,
			functions: 40,
			lines: 85,
			statements: 85
		}
	}
};
