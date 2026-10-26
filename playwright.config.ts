// Playwright configuration — bdd mode (playwright-bdd).
// Copied to the project root as playwright.config.ts by the skill's setup step.
// Everything here is driven by qa.config.yaml; edit that file, not this one.
//
// Run with:  npx bddgen test && npx playwright test
// bddgen MUST run first, or you run the previous version of your .feature files.

import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { defineBddProject } from 'playwright-bdd';
import { loadCredentials, loadQaConfig, baseUrl, storageStateFor, activeRoles, RUN_DIR } from './lib/qa-env';

loadCredentials();
const qa = loadQaConfig();
const runDir = RUN_DIR(qa.report.outputDir);

const deviceFor = {
  chromium: devices['Desktop Chrome'],
  firefox: devices['Desktop Firefox'],
  webkit: devices['Desktop Safari'],
} as const;

const needsLogin = qa.auth.strategy !== 'none';

// Cucumber tag expressions match whole tags — there is no "@role:*" wildcard.
// To route untagged scenarios to the default role, negate every known role tag.
const allRoleTags = activeRoles(qa).map((r) => `@role:${r.name}`);
const untagged = `not (${allRoleTags.join(' or ')})`;

export default defineConfig({
  fullyParallel: true,
  workers: qa.run.workers,
  retries: qa.run.retries,
  forbidOnly: true,

  reporter: [
    ['list'],
    ['html', { outputFolder: path.posix.join(runDir, 'report'), open: 'never' }],
    ['json', { outputFile: path.posix.join(runDir, 'results.json') }],
    ['junit', { outputFile: path.posix.join(runDir, 'junit.xml') }],
  ],
  outputDir: path.posix.join(runDir, 'artifacts'),

  use: {
    baseURL: baseUrl(qa),
    headless: qa.run.headless,
    viewport: qa.run.viewport,
    testIdAttribute: qa.agent.testIdAttribute,
    actionTimeout: qa.run.actionTimeoutMs,
    navigationTimeout: qa.run.navigationTimeoutMs,
    screenshot: qa.report.screenshots,
    video: qa.report.video,
    trace: qa.report.trace,
  },

  projects: [
    ...(needsLogin
      ? [{
          name: 'setup',
          testDir: '.',
          testMatch: /auth\.setup\.ts/,
          use: { trace: 'off' as const, video: 'off' as const, screenshot: 'off' as const },
        }]
      : []),

    ...qa.run.browsers.flatMap((browser) =>
      activeRoles(qa).map((role) => ({
        // In bdd mode roles are filtered at GENERATION time with a Gherkin tag
        // expression, not with grep. Untagged scenarios go to the default role.
        ...defineBddProject({
          name: `${browser}-${role.name}`,
          features: 'features/**/*.feature',
          // The fixtures file must be in here, or bddgen cannot find the test
          // instance and every step reports as undefined.
          steps: ['generated/steps/**/*.ts', 'generated/fixtures/**/*.ts'],
          featuresRoot: 'features',
          outputDir: path.posix.join('.features-gen', `${browser}-${role.name}`),
          tags: role.name === qa.auth.defaultRole
            ? `@role:${role.name} or (${untagged})`
            : `@role:${role.name}`,
        }),
        use: {
          ...deviceFor[browser],
          viewport: qa.run.viewport,
          ...(needsLogin ? { storageState: storageStateFor(role.name) } : {}),
        },
        ...(needsLogin ? { dependencies: ['setup'] } : {}),
      })),
    ),
  ],
});
