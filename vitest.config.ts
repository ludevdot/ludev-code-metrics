import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      // Redirect the 'vscode' import to our lightweight mock so tests don't
      // need a VS Code process running.
      vscode: path.resolve(__dirname, 'src/test/__mocks__/vscode.ts'),
    },
  },
});
