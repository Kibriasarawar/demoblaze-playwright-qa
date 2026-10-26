// Catalogue steps: the home page, categories, pagination and the product grid.

import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures';

const { Given, When, Then } = createBdd(test);

/**
 * Starts from the home page with an empty cart.
 *
 * The cart is server-side per account and survives between runs, and many
 * scenarios across several feature files assert exact cart contents, so
 * "I am on the home page" has to mean "with a clean cart" or those counts are
 * meaningless. Cleanup is the approved Delete-per-row (see CartPage.empty).
 *
 * This is also why run.workers is 1 — see needs-human.md.
 */
Given('I am on the home page', async ({ homePage, cartPage }) => {
  await cartPage.empty();
  await homePage.goto();
});

When('I open the {string} category', async ({ homePage }, category: string) => {
  await homePage.openCategory(category);
});

When('I go back to the home page', async ({ homePage }) => {
  await homePage.gotoViaNav();
});

Then('I should see a product list', async ({ homePage }) => {
  await expect(homePage.productCards.first()).toBeVisible();
});

Then(
  'I should see at least {int} products in the product list',
  async ({ homePage }, count: number) => {
    // Not toHaveCount: the Gherkin says "at least", and the grid size changes
    // with category and page.
    await expect(homePage.productCards.first()).toBeVisible();
    expect(await homePage.productCards.count()).toBeGreaterThanOrEqual(count);
  },
);

Then('I should see {string} in the product list', async ({ homePage }, product: string) => {
  await expect(homePage.productLink(product)).toBeVisible();
});

Then('I should not see {string} in the product list', async ({ homePage }, product: string) => {
  await expect(homePage.productLink(product)).toHaveCount(0);
});

Then('I should be back on the home page', async ({ page, homePage }) => {
  await expect(page).toHaveURL(/(index\.html)?$|index\.html/);
  await expect(homePage.productCards.first()).toBeVisible();
});
