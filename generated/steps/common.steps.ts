// Steps shared by every module: clicking named controls, reading the app's
// messages, and the generic dialog / field assertions.
//
// Locators live in the page objects (StorePage.control / .navLink / .dialogTitled),
// which is where each ambiguity in this app's control names is documented.

import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures';

const { When, Then } = createBdd(test);

/**
 * Field names in the Gherkin mapped to the app's inputs.
 *
 * This mapping is not laziness — it is required. The app's <label for> wiring is
 * broken in both forms it matters in: in the contact dialog two labels point at
 * #recipient-name and nothing points at #recipient-email, and in the order
 * dialog getByLabel('Name:') resolves to three elements. See contact.page.ts and
 * order.page.ts for the verified details.
 */
const FIELD_IDS: Record<string, string> = {
  'Contact Email': '#recipient-email',
  'Contact Name': '#recipient-name',
  Message: '#message-text',
  Name: '#name',
  'Credit card': '#card',
  Country: '#country',
  City: '#city',
};

When('I click the {string} button', async ({ homePage, productPage, alerts }, name: string) => {
  if (name === 'Add to cart') {
    // The app confirms the add with an alert fired from the XHR success
    // callback, so waiting for it is what guarantees the server has the item
    // before any later step reads the cart.
    await productPage.addToCart();
    await alerts.expectMessage('Product added');
    return;
  }

  if (name === 'Next') {
    // Pagination, not the carousel — and it needs its own settle.
    await homePage.goToNextPage();
    return;
  }

  await homePage.control(name).click();
});

When('I click the {string} link', async ({ homePage }, name: string) => {
  if (name === 'Sign up') {
    // This app removes the "Sign up" link from the DOM while signed in, and
    // scenarios start signed in from the saved session. See
    // StorePage.ensureSignedOut and needs-human.md.
    await homePage.ensureSignedOut();
  }

  await homePage.navLink(name).click();
});

When('I click the {string} logo', async ({ homePage }, name: string) => {
  expect(name).toBe('PRODUCT STORE');
  await homePage.gotoViaLogo();
});

When('I reload the page', async ({ page, cartPage }) => {
  if (page.url().includes('cart.html')) {
    // The cart needs its settle, or the next assertion races the re-render.
    await cartPage.reload();
    return;
  }
  await page.reload();
});

Then('I should see the message {string}', async ({ alerts }, message: string) => {
  await alerts.expectMessage(message);
});

Then('I should see the {string} link', async ({ homePage }, name: string) => {
  await expect(homePage.navLink(name)).toBeVisible();
});

Then('I should not see the {string} link', async ({ homePage }, name: string) => {
  // While signed in/out this app removes the opposite link from the DOM
  // entirely, and toBeHidden() also passes for an element that is not there.
  await expect(homePage.navLink(name)).toBeHidden();
});

Then('I should see the {string} dialog', async ({ homePage }, title: string) => {
  await expect(homePage.dialogTitled(title)).toBeVisible();
});

Then('the {string} dialog should still be open', async ({ homePage }, title: string) => {
  await expect(homePage.dialogTitled(title)).toBeVisible();
});

Then('I should see the {string} button', async ({ homePage }, name: string) => {
  await expect(homePage.control(name)).toBeVisible();
});

Then('I should see the {string} logo', async ({ homePage }, name: string) => {
  expect(name).toBe('PRODUCT STORE');
  await expect(homePage.logo).toBeVisible();
});

Then('the {string} field should be empty', async ({ page }, field: string) => {
  const selector = FIELD_IDS[field];
  if (!selector) {
    throw new Error(
      `No field mapped for "${field}". Known fields: ${Object.keys(FIELD_IDS).join(', ')}. ` +
      'Add it to FIELD_IDS in common.steps.ts.',
    );
  }
  await expect(page.locator(selector)).toHaveValue('');
});

Then('I should see the {string} greeting', async ({ homePage }, text: string) => {
  await expect(homePage.welcomeGreeting).toBeVisible();
  await expect(homePage.welcomeGreeting).toContainText(text);
});
