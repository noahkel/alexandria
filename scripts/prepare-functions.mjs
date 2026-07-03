/**
 * Prepares the Cloud Functions source directory for deployment.
 *
 * Cloud Functions deploys a single self-contained directory, but the backend
 * lives in an npm workspace and depends on the unpublished @alexandria/shared
 * package. This script builds both workspaces and copies their build output
 * into functions/, where package.json references shared via a file: path.
 *
 * Run from the repository root (firebase.json predeploy does this).
 */
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const functionsDir = path.join(root, 'functions');

const run = (command) => {
  console.log(`> ${command}`);
  execSync(command, { cwd: root, stdio: 'inherit' });
};

run('npm run build --workspace=shared');
run('npm run build --workspace=backend');

// copy compiled backend
rmSync(path.join(functionsDir, 'build'), { recursive: true, force: true });
cpSync(path.join(root, 'backend', 'build'), path.join(functionsDir, 'build'), {
  recursive: true,
});

// copy the shared package (package.json + dist) for the file:./shared dependency
rmSync(path.join(functionsDir, 'shared'), { recursive: true, force: true });
mkdirSync(path.join(functionsDir, 'shared'), { recursive: true });
cpSync(
  path.join(root, 'shared', 'package.json'),
  path.join(functionsDir, 'shared', 'package.json')
);
cpSync(path.join(root, 'shared', 'dist'), path.join(functionsDir, 'shared', 'dist'), {
  recursive: true,
});

console.log('functions/ is ready for deployment');
