// Product detail steps.

import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures';

const { When, Then } = createBdd(test);

When('I open the product {string}', async ({ homePage, productPage }, product: string) => {
  await homePage.openProduct(product);
  await productPage.waitForLoaded(product);
});

Then('the product name should be {string}', async ({ productPage }, name: string) => {
  await expect(productPage.title).toHaveText(name);
});

Then('the product price should be {string}', async ({ productPage }, price: string) => {
  // The heading reads "$360 *includes tax", so this is a containment check.
  await expect(productPage.price).toContainText(price);
});

Then('I should see a product description', async ({ productPage }) => {
  await expect(productPage.description).toBeVisible();
  await expect(productPage.description).not.toBeEmpty();
});
