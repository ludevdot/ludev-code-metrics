import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

// Only bump version on the main branch.
// Feature branches just carry the .changeset/*.md files.
const branch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
if (branch !== 'main') {
  process.exit(0);
}

const changesetDir = join(process.cwd(), '.changeset');

let pendingChangesets;
try {
  const files = readdirSync(changesetDir);
  pendingChangesets = files.filter(
    (f) => f.endsWith('.md') && f !== 'README.md'
  );
} catch {
  process.exit(0);
}

if (pendingChangesets.length === 0) {
  process.exit(0);
}

console.log(
  `Found ${pendingChangesets.length} pending changeset(s). Running version bump...`
);

try {
  execSync('pnpm changeset version', { stdio: 'inherit' });
  execSync('git add package.json CHANGELOG.md .changeset/', { stdio: 'inherit' });
  console.log('Version bumped and changelog updated. Changes staged.');
} catch (error) {
  console.error('Failed to run changeset version:', error.message);
  process.exit(0);
}
