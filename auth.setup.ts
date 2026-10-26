// Logs in once per role and saves the browser session to .auth/<role>.json.
// Driven entirely by qa.config.yaml. A tester never edits this file.
//
// The password is read from process.env by Node and typed into the browser.
// It is never printed and never reaches the AI's context (hard rule 6).
//
// The login locators below come from auth.loginPath on a real page. If your
// login form differs, the skill regenerates this file from a live snapshot —
// do not guess new locators by hand.

import fs from 'node:fs';
import { test as setup, expect, type Page } from '@playwright/test';
import { loadCredentials, loadQaConfig, storageStateFor, AUTH_DIR } from './lib/qa-env';

loadCredentials();
const qa = loadQaConfig();

function isFresh(file: string, maxAgeMinutes: number): boolean {
  if (!fs.existsSync(file)) return false;
  return (Date.now() - fs.statSync(file).mtimeMs) / 60_000 < maxAgeMinutes;
}

/** Assert that login actually succeeded, per auth.successCheck. */
async function expectLoggedIn(page: Page): Promise<void> {
  const { type, value } = qa.auth.successCheck;
  if (type === 'url') {
    await expect(page).toHaveURL(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } else if (type === 'text') {
    await expect(page.getByText(value).first()).toBeVisible();
  } else {
    await expect(page.getByRole('link', { name: value }).or(page.getByRole('button', { name: value })).first())
      .toBeVisible();
  }
}

if (qa.auth.strategy === 'form') {
  for (const role of qa.auth.roles) {
    setup(`authenticate as ${role.name}`, async ({ page }) => {
      const storage = storageStateFor(role.name);
      setup.skip(
        isFresh(storage, qa.auth.sessionMaxAgeMinutes),
        `session for "${role.name}" is younger than ${qa.auth.sessionMaxAgeMinutes} minutes — reusing it`,
      );

      const user = process.env[role.userEnv!];
      const pass = process.env[role.passEnv!];
      if (!user || !pass) {
        throw new Error(
          `${role.userEnv} and/or ${role.passEnv} are missing from credentials/.env. ` +
          'Run: node scripts/preflight.mjs',
        );
      }

      // Locators verified against a live snapshot of the app (hard rule 1).
      // Login is a modal opened from the nav, not a page. The inputs have no
      // accessible name or label, so ids are the documented last resort —
      // page-level getByLabel('Username:') hits the SIGN-UP modal instead.
      // See generated/pages/login.page.ts for the full reasoning.
      const modal = page.locator('#logInModal');

      // A bad login is reported with a JS alert that Playwright auto-dismisses,
      // which would otherwise make a wrong password look like a timeout.
      const alerts: string[] = [];
      page.on('dialog', async (dialog) => {
        alerts.push(dialog.message());
        await dialog.dismiss();
      });

      await page.goto(qa.auth.loginPath);
      await page.getByRole('link', { name: 'Log in' }).click();
      await modal.waitFor({ state: 'visible' });
      await modal.locator('#loginusername').fill(user);
      await modal.locator('#loginpassword').fill(pass);
      await modal.getByRole('button', { name: 'Log in' }).click();

      try {
        await expectLoggedIn(page);
      } catch (error) {
        if (alerts.length) {
          // The app's own words, e.g. "Wrong password." / "User does not exist."
          throw new Error(
            `Login as "${role.name}" was rejected by the app: ${alerts.join(' | ')}\n` +
            `Check ${role.userEnv} / ${role.passEnv} in credentials/.env.`,
          );
        }
        throw error;
      }

      fs.mkdirSync(AUTH_DIR, { recursive: true });
      await page.context().storageState({ path: storage });
    });
  }
}

if (qa.auth.strategy === 'manual-session') {
  // SSO, OTP, 2FA and CAPTCHA cannot be automated. The tester signs in by hand
  // once and the suite reuses that session until it expires.
  for (const role of qa.auth.roles) {
    setup(`check saved session for ${role.name}`, async () => {
      const storage = storageStateFor(role.name);
      if (!fs.existsSync(storage)) {
        throw new Error(
          `No saved session at ${storage}.\n\n` +
          'auth.strategy is "manual-session", so sign in by hand once:\n' +
          `  npx playwright codegen --save-storage=${storage} "$${qa.app.baseUrlEnv}"\n\n` +
          'Sign in in the window that opens, then close it. The session is saved.\n' +
          'It will expire eventually and you will need to repeat this.',
        );
      }
      const ageMinutes = (Date.now() - fs.statSync(storage).mtimeMs) / 60_000;
      // Warn, do not fail: only the app knows when the session really expires.
      if (ageMinutes > qa.auth.sessionMaxAgeMinutes) {
        setup.info().annotations.push({
          type: 'warning',
          description: `${storage} is ${Math.round(ageMinutes)} minutes old and may have expired. ` +
            'If tests fail by landing on the login page, re-record it.',
        });
      }
    });
  }
}

// strategy "none": no setup tests are defined, and no project depends on this.
