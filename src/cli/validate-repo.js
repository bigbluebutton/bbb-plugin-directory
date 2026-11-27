#!/usr/bin/env node
// Validates every input file of the directory. Runs on every pull request.
import { resolve } from 'node:path';
import { repositoryErrors } from '../lib/repo.js';

const errors = repositoryErrors(resolve(process.argv[2] ?? '.'));
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Directory input files are valid');
