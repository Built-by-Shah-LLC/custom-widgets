#!/usr/bin/env node
import { stat } from 'node:fs/promises';

const bundle = new URL('../public/widget.js', import.meta.url);

try {
  const file = await stat(bundle);
  if (!file.isFile() || file.size === 0) throw new Error('empty or not a file');
} catch (error) {
  console.error(`Missing usable public/widget.js: ${error.message}`);
  process.exitCode = 1;
}
