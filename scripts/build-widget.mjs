#!/usr/bin/env node
import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');
const publicDir = path.resolve(__dirname, '../public');
const bundlePath = path.join(publicDir, 'widget.js');
const manifestPath = path.join(publicDir, 'widget-manifest.json');

// NOTE: The bundle is served to client sites only via the stable route
// /api/embeds/widget.js. Hashed widget.<hash>.js copies were removed because
// every redeploy changed the hash and 404'd embed codes already pasted on
// client sites; next.config.ts rewrites legacy hashed URLs to the stable route.

/**
 * Loads `.css?inline` imports as plain strings so the embed script can inject
 * styles into each Shadow DOM instance.
 */
const cssInlinePlugin = {
  name: 'css-inline',
  setup(build) {
    build.onResolve({ filter: /\.css\?inline$/ }, (args) => {
      const resolved = path.resolve(
        args.importer ? path.dirname(args.importer) : process.cwd(),
        args.path.replace(/\?inline$/, '')
      );
      return { path: resolved, namespace: 'css-inline' };
    });

    build.onLoad({ filter: /.*/, namespace: 'css-inline' }, async (args) => {
      const contents = await fs.readFile(args.path, 'utf8');
      return { contents, loader: 'text' };
    });
  },
};

const buildOptions = {
  entryPoints: [path.resolve(__dirname, '../src/embed.tsx')],
  bundle: true,
  outfile: bundlePath,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  minify: !watch,
  plugins: [cssInlinePlugin],
  logLevel: 'info',
  alias: {
    react: 'preact/compat',
    'react-dom': 'preact/compat',
    'react/jsx-runtime': 'preact/jsx-runtime',
    'react/jsx-dev-runtime': 'preact/jsx-dev-runtime',
  },
};

async function writeStableManifest() {
  // Keep the historical manifest useful without publishing a build hash that
  // becomes stale after the next deployment. Consumers resolve the stable
  // route, which is covered by the same beforeFiles aliases as old snippets.
  await fs.writeFile(
    manifestPath,
    `${JSON.stringify({ file: 'widget.js' })}\n`,
    'utf8'
  );
}

if (watch) {
  await writeStableManifest();
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('[custom-widgets] Watching for widget changes...');
} else {
  await esbuild.build(buildOptions);
  await writeStableManifest();
  console.log('[custom-widgets] Widget bundle written to public/widget.js');
}
