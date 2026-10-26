// Fixtures for bdd mode. The skill extends this as it generates page objects.
//
// This file MUST stay in the `steps` glob in playwright.config.ts, or bddgen
// cannot find the test instance and every step reports as undefined.

import { test as base } from 'playwright-bdd';
import { loadQaConfig, activeRoles } from '../../lib/qa-env';
import { AlertLog } from '../support/alerts';
import { LoginPage } from '../pages/login.page';
import { HomePage } from '../pages/home.page';
import { ProductPage } from '../pages/product.page';
import { CartPage } from '../pages/cart.page';
import { OrderPage } from '../pages/order.page';
import { ContactPage } from '../pages/contact.page';
import { SignUpPage } from '../pages/signup.page';
import { AboutPage } from '../pages/about.page';

export type RoleCredentials = { user: string; pass: string };

export const test = base.extend<{
  alerts: AlertLog;
  loginPage: LoginPage;
  homePage: HomePage;
  productPage: ProductPage;
  cartPage: CartPage;
  orderPage: OrderPage;
  contactPage: ContactPage;
  signUpPage: SignUpPage;
  aboutPage: AboutPage;
  credentials: RoleCredentials;
}>({
  /**
   * The single dialog handler for the scenario. `auto` so it is attached before
   * the first navigation even when no step mentions alerts — otherwise an alert
   * fired early is auto-dismissed by Playwright and lost.
   */
  alerts: [
    async ({ page }, use) => {
      await use(new AlertLog(page));
    },
    { auto: true },
  ],

  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },
  productPage: async ({ page }, use) => {
    await use(new ProductPage(page));
  },
  cartPage: async ({ page }, use) => {
    await use(new CartPage(page));
  },
  orderPage: async ({ page }, use) => {
    await use(new OrderPage(page));
  },
  contactPage: async ({ page }, use) => {
    await use(new ContactPage(page));
  },
  signUpPage: async ({ page }, use) => {
    await use(new SignUpPage(page));
  },
  aboutPage: async ({ page }, use) => {
    await use(new AboutPage(page));
  },

  /**
   * Resolves the test account for whichever role project is running.
   * Project names are `<browser>-<role>`, so the role is read off the project
   * rather than hardcoded. Values are read from process.env by Node and typed
   * straight into the browser — they are never logged (hard rule 6).
   */
  credentials: async ({}, use, testInfo) => {
    const qa = loadQaConfig();
    const roles = activeRoles(qa);
    const role =
      roles.find((r) => testInfo.project.name.endsWith(`-${r.name}`)) ??
      roles.find((r) => r.name === qa.auth.defaultRole);

    if (!role) {
      throw new Error(
        `No role matches project "${testInfo.project.name}". Check auth.roles in qa.config.yaml.`,
      );
    }

    const user = process.env[role.userEnv!];
    const pass = process.env[role.passEnv!];
    if (!user || !pass) {
      throw new Error(
        `${role.userEnv} and/or ${role.passEnv} are missing from credentials/.env. ` +
        'Run: node scripts/preflight.mjs',
      );
    }

    await use({ user, pass });
  },
});
