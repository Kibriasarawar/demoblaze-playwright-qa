// Cart steps. No raw locators here — everything goes through CartPage, which
// documents this app's two cart gotchas (one-row-at-a-time rendering and a
// lazily consistent API).

import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures';

const { When, Then } = createBdd(test);

When('I open the cart page', async ({ cartPage }) => {
  await cartPage.gotoViaNav();
});

When('I delete {string} from the cart', async ({ cartPage }, product: string) => {
  await cartPage.deleteItem(product);
});

Then('I should see {string} in the cart', async ({ cartPage }, product: string) => {
  await expect(cartPage.itemRow(product)).toBeVisible();
});

Then('I should not see {string} in the cart', async ({ cartPage }, product: string) => {
  await expect(cartPage.itemRow(product)).toHaveCount(0);
});

Then('the cart should contain {int} item(s)', async ({ cartPage }, count: number) => {
  await expect(cartPage.rows).toHaveCount(count);
});

Then('the cart total should be {string}', async ({ cartPage }, total: string) => {
  await expect(cartPage.total).toHaveText(total);
});
