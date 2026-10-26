// Sign-up dialog (#signInModal), opened from the nav "Sign up" link.
//
// Verified snapshot: dialog "Sign up" (aria-labelledby="signInModalLabel"),
// heading "Sign up", inputs #sign-username #sign-password, button "Sign up".
//
// Note the id: the SIGN-UP modal is #signInModal and the LOGIN modal is
// #logInModal — the app's names are the wrong way round from what you would
// guess, which is exactly why these came from a snapshot and not from memory.
//
// Unlike the login modal, this one's inputs DO have working labels
// ("Username:" / "Password:") — and that is the trap documented in
// login.page.ts, because those labels are what page-level getByLabel finds.

import { type Locator, type Page } from '@playwright/test';
import { StorePage } from './store.page';

export class SignUpPage extends StorePage {
  readonly dialog: Locator;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly signUpButton: Locator;

  constructor(page: Page) {
    super(page);
    this.dialog = page.locator('#signInModal');
    this.usernameInput = this.dialog.locator('#sign-username');
    this.passwordInput = this.dialog.locator('#sign-password');
    this.signUpButton = this.dialog.getByRole('button', { name: 'Sign up', exact: true });
  }

  async waitForOpen(): Promise<void> {
    await this.dialog.waitFor({ state: 'visible' });
  }

  async fillCredentials(user: string, pass: string): Promise<void> {
    await this.usernameInput.fill(user);
    await this.passwordInput.fill(pass);
  }
}
