// Sign-up dialog steps.
//
// No scenario here creates an account: the automated cases are "the dialog
// opens", "this username already exists" and "both fields are empty". The
// happy path would leave a new account behind on every run — see needs-human.md.

import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures';

const { When } = createBdd(test);

When(
  'I enter my existing username and the sign-up password {string}',
  async ({ signUpPage, credentials }, password: string) => {
    // Reuses the real test account's username on purpose — that is what makes
    // the app answer "This user already exist." The password is the fake one
    // from the Gherkin, never the real credential.
    await signUpPage.waitForOpen();
    await signUpPage.fillCredentials(credentials.user, password);
  },
);

When(
  'I enter the sign-up username {string} and password {string}',
  async ({ signUpPage }, username: string, password: string) => {
    await signUpPage.waitForOpen();
    await signUpPage.fillCredentials(username, password);
  },
);
