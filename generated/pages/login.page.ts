// Login page object — Demoblaze.
//
// Every locator below was read from a live accessibility snapshot of
// https://www.demoblaze.com/ (see outcome/exploration/home.md) and from the
// live DOM of the opened modal. None of them were guessed (hard rule 1).
//
// Why CSS ids appear here, as a documented last resort (hard rule 2):
// the two inputs inside #logInModal have NO accessible name, NO <label for>,
// NO placeholder and NO data-testid, so getByRole/getByLabel/getByPlaceholder
// cannot reach them. Worse, page-level getByLabel('Username:') resolves to the
// SIGN-UP modal (#signInModal), which does own those labels — using it would
// fill the wrong form and the test would pass while checking nothing.
// The ids are app-assigned and non-structural, so they are stable.

import { expect, type Locator, type Page } from '@playwright/test';
import { loadQaConfig } from '../../lib/qa-env';

const qa = loadQaConfig();

export class LoginPage {
  readonly page: Page;

  /** Nav entry point. Snapshot: `link "Log in"` (role=link, distinct from the modal's button). */
  readonly loginNavLink: Locator;
  /** The login dialog. Snapshot: `dialog "Log in"`. */
  readonly modal: Locator;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  /** Snapshot: `button "Log in"` inside the dialog, onclick=logIn(). */
  readonly submitButton: Locator;
  /** Post-login nav greeting: "Welcome <user>". */
  readonly welcomeMessage: Locator;
  /** Snapshot after login: `link "Log out"`. */
  readonly logoutLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.loginNavLink = page.getByRole('link', { name: 'Log in' });
    this.modal = page.locator('#logInModal');
    this.usernameInput = this.modal.locator('#loginusername');
    this.passwordInput = this.modal.locator('#loginpassword');
    this.submitButton = this.modal.getByRole('button', { name: 'Log in' });
    this.welcomeMessage = page.locator('#nameofuser');
    this.logoutLink = page.getByRole('link', { name: 'Log out' });
  }

  /**
   * Opens the login modal from a signed-out home page.
   *
   * The role projects load .auth/<role>.json, so a test would otherwise start
   * ALREADY signed in — and the "Log in" nav link is hidden for a signed-in
   * user. Clearing cookies first is what makes "I am on the login page" true.
   * Demoblaze keeps its session in the `user`/`tokenp_` cookies (verified).
   */
  async goto(): Promise<void> {
    await this.page.context().clearCookies();
    await this.page.goto(qa.auth.loginPath);
    await this.loginNavLink.click();
    await this.modal.waitFor({ state: 'visible' });
  }

  /** Credentials come from process.env via the `credentials` fixture — never hardcoded (hard rule 9). */
  async fillCredentials(user: string, pass: string): Promise<void> {
    await this.usernameInput.fill(user);
    await this.passwordInput.fill(pass);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  // Alerts are collected by the AlertLog fixture (generated/support/alerts.ts),
  // which is the single dialog handler for the whole suite. This class used to
  // register its own listener; two listeners make the second dismiss throw
  // "Cannot dismiss dialog which is already handled!".

  /** The real signed-in signal: the nav greeting plus a Log out link. */
  async expectLoggedIn(): Promise<void> {
    await expect(this.welcomeMessage).toBeVisible();
    await expect(this.welcomeMessage).toContainText('Welcome');
    await expect(this.logoutLink).toBeVisible();
    await expect(this.loginNavLink).toBeHidden();
  }
}
