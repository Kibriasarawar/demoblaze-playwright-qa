// Order dialog steps.
//
// The order form's values come from the Gherkin, including the test card number
// the tester chose. Nothing is hardcoded here (hard rule 9).

import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures';

const { When, Then } = createBdd(test);

When(
  'I fill in the order form with name {string}, country {string}, city {string}, credit card {string}, month {string} and year {string}',
  async (
    { orderPage },
    name: string,
    country: string,
    city: string,
    card: string,
    month: string,
    year: string,
  ) => {
    await orderPage.waitForOpen();
    await orderPage.fillDetails({ name, country, city, card, month, year });
  },
);

Then('the order dialog should show the total {string}', async ({ orderPage }, total: string) => {
  // #totalm reads "Total: 360", so this is a containment check.
  await expect(orderPage.total).toContainText(total);
});

Then('the confirmation should show the amount {string}', async ({ page }, amount: string) => {
  // The purchase confirmation is rendered in the page (not a JS alert) and its
  // markup has NOT been verified against the live app — the sandbox blocks
  // completing a purchase. This asserts only that the amount is visible
  // somewhere in the confirmation, which is the weakest honest claim.
  // The two scenarios that reach this step are @skip until the purchase flow
  // can be run once and the real markup read. See needs-human.md.
  await expect(page.getByText(amount).filter({ visible: true }).first()).toBeVisible();
});
