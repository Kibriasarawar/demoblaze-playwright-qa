// Step definitions for features/login/login.feature and login-negative.feature.
// Steps hold no locators — they call LoginPage.

import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures';

const { Given, When, Then } = createBdd(test);

Given('I am on the login page', async ({ loginPage }) => {
  await loginPage.goto();
  await expect(loginPage.usernameInput).toBeVisible();
});

When('I enter my username and password', async ({ loginPage, credentials }) => {
  await loginPage.fillCredentials(credentials.user, credentials.pass);
});

When(
  'I enter my username and the password {string}',
  async ({ loginPage, credentials }, password: string) => {
    // The real username with a deliberately wrong password from the Gherkin.
    await loginPage.fillCredentials(credentials.user, password);
  },
);

When(
  'I enter the username {string} and the password {string}',
  async ({ loginPage }, username: string, password: string) => {
    await loginPage.fillCredentials(username, password);
  },
);

When('I click the login button', async ({ loginPage }) => {
  await loginPage.submit();
});

// "I should see the dashboard" is asserted against this app's real signed-in
// signal — the nav greeting and the Log out link. Demoblaze has no dashboard
// page; see needs-human.md for the suggested Gherkin rewrite.
Then('I should see the dashboard', async ({ loginPage }) => {
  await loginPage.expectLoggedIn();
});
