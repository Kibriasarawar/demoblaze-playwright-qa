// Contact dialog steps.

import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures';

const { When } = createBdd(test);

When(
  'I fill in the contact form with email {string}, name {string} and message {string}',
  async ({ contactPage }, email: string, name: string, message: string) => {
    await contactPage.waitForOpen();
    await contactPage.fillMessage(email, name, message);
  },
);
