import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertE2EEnvironment,
  isolatedWebServerEnv,
  isE2EWebServerSkipped,
  projectSelectorMatches,
} from './src/lib/e2e-environment-guard';

// Load env files into process.env for Playwright + the Next webServer child.
for (const file of ['.env.local', '.env']) {
  const full = path.resolve(file);
  if (fs.existsSync(full)) {
    dotenv.config({ path: full, quiet: true });
  }
}

// Common aliases so middleware/auth and service-role data clients both work.
if (!process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_URL;
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_ANON_KEY) {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
}

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';
// Never use the generic application credentials to start a test server. The
// dedicated variables are intentionally separate so the current production
// `.env` cannot be mistaken for an isolated E2E database.
const hasServiceRole = Boolean(process.env.E2E_SUPABASE_SERVICE_ROLE_KEY);

const cliRequestedProjects = new Set(
  process.argv.flatMap((arg, index, argv) => {
    if (arg === '--project' || arg === '-p') {
      return argv[index + 1]?.split(',').filter(Boolean) ?? [];
    }
    if (arg.startsWith('--project=')) {
      return arg.slice('--project='.length).split(',').filter(Boolean);
    }
    return [];
  })
);
const projectSelectionEnv = '__BBS_PLAYWRIGHT_PROJECTS';
const isWorkerReevaluation = process.env.TEST_WORKER_INDEX !== undefined;
const propagatedProjects = new Set(
  isWorkerReevaluation
    ? (process.env[projectSelectionEnv] ?? '').split(',').filter(Boolean)
    : []
);
// A real CLI selection always wins over a stale/inherited marker. The marker
// is consumed only by Playwright worker reevaluation; top-level default-all
// runs ignore and clear it before applying the fail-closed guards.
const requestedProjects =
  cliRequestedProjects.size > 0 ? cliRequestedProjects : propagatedProjects;
if (!isWorkerReevaluation) {
  process.env[projectSelectionEnv] =
    cliRequestedProjects.size > 0
      ? [...cliRequestedProjects].join(',')
      : '';
}
const selectsProject = (project: 'mutation' | 'canary') =>
  [...requestedProjects].some((selector) =>
    projectSelectorMatches(selector, project)
  );
const loaderOnlyRequested =
  requestedProjects.size > 0 &&
  [...requestedProjects].some((selector) =>
    projectSelectorMatches(selector, 'loader')
  ) &&
  ![...requestedProjects].some((selector) =>
    (['local', 'mutation', 'canary'] as const).some((project) =>
      projectSelectorMatches(selector, project)
    )
  );
const loaderOnly =
  process.env.E2E_RUN_MUTATIONS !== 'true' && loaderOnlyRequested;
const runningMutations =
  process.env.E2E_RUN_MUTATIONS === 'true' ||
  selectsProject('mutation') ||
  // With no --project Playwright runs every project, including mutations.
  (requestedProjects.size === 0 && !loaderOnly);
const runningCanary =
  selectsProject('canary') || (requestedProjects.size === 0 && !loaderOnly);

if (runningMutations) {
  // This throws before Playwright creates a browser or starts Next's webServer.
  assertE2EEnvironment(process.env, 'mutation');
} else if (!loaderOnly && process.env.E2E_SUPABASE_URL) {
  // Dedicated credentials supplied for read-only local suites are still
  // checked; an inherited-only environment leaves those suites skipped.
  assertE2EEnvironment(process.env, 'readonly-local');
}
if (runningCanary) {
  // A canary target is always explicit when selected on its own. This keeps a
  // default production URL from being contacted by a generic test command.
  assertE2EEnvironment(process.env, 'canary');
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
  projects: [
    {
      name: 'local',
      testMatch: /.*embed\.local\.spec\.ts/,
      use: { baseURL },
    },
    {
      // Fully synthetic browser fixtures: the route handlers serve the built
      // IIFE and bootstrap data, so this project never starts Next or touches
      // Supabase credentials from the working environment.
      name: 'loader',
      testMatch: /.*embed\.loader\.spec\.ts/,
      use: { baseURL },
    },
    {
      // Mutation-bearing specs are opt-in and guarded independently. Keeping
      // them out of the default local project prevents an ordinary rendering
      // test command from ever writing to a database.
      name: 'mutation',
      testMatch: /.*(?:crud\.local|security\.api)\.spec\.ts/,
      use: { baseURL },
    },
    {
      name: 'canary',
      testMatch: /.*\.canary\.spec\.ts/,
      use: {
        baseURL: process.env.E2E_CANARY_URL ?? 'https://embed-site-seven.vercel.app',
      },
    },
  ],
  webServer:
    loaderOnly ||
    isE2EWebServerSkipped(process.env.E2E_SKIP_WEBSERVER) ||
    !hasServiceRole
      ? undefined
      : {
          command:
            'npm run build:widget && npx next dev --hostname 127.0.0.1 --port 3000',
          url: baseURL,
          reuseExistingServer: false,
          timeout: 180_000,
          env: {
            ...process.env,
            ...isolatedWebServerEnv(process.env),
            ENABLE_E2E_HARNESS: 'true',
            ALLOW_LOCALHOST_EMBEDS: 'true',
          },
        },
});
