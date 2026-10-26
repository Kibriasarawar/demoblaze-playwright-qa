// Navigation steps that assert where we have landed.

import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures';

const { Then } = createBdd(test);

Then('I should be on the cart page', async ({ page }) => {
  await expect(page).toHaveURL(/cart\.html/);
});
