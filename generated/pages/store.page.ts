// Shared store chrome — the nav and dialogs that appear on every Demoblaze page.
// Home, product, cart, order, contact, sign-up and about page objects extend this.
//
// Locators read from live snapshots of the real pages. The switch statements
// below exist because several control names in the Gherkin are ambiguous or
// have a surprising role in this app; each case says which.

import { expect, type Locator, type Page } from '@playwright/test';

export class StorePage {
  readonly page: Page;

  /**
   * Nav "Cart" link. `exact: true` is REQUIRED: without it the name "Cart"
   * also matches the product page's "Add to cart" link, which is a strict-mode
   * violation (verified on prod.html).
   */
  readonly navCart: Locator;

  /**
   * Nav "Home" link. Its accessible name is "Home (current)" on every page —
   * the "(current)" comes from a screen-reader-only span in the markup, not
   * from which page you are on — so it is matched by prefix.
   */
  readonly navHome: Locator;

  readonly logo: Locator;
  readonly navLogIn: Locator;
  readonly navLogOut: Locator;
  readonly navSignUp: Locator;
  /** Nav greeting. `#nameofuser` exists even when signed out, but is hidden. */
  readonly welcomeGreeting: Locator;

  constructor(page: Page) {
    this.page = page;
    this.navCart = page.getByRole('link', { name: 'Cart', exact: true });
    this.navHome = page.getByRole('link', { name: /^Home/ });
    this.logo = page.getByRole('link', { name: 'PRODUCT STORE' });
    this.navLogIn = page.getByRole('link', { name: 'Log in', exact: true });
    this.navLogOut = page.getByRole('link', { name: 'Log out', exact: true });
    this.navSignUp = page.getByRole('link', { name: 'Sign up', exact: true });
    this.welcomeGreeting = page.locator('#nameofuser');
  }

  /** The one dialog currently on screen. Every modal in this app is role=dialog. */
  visibleDialog(): Locator {
    return this.page.getByRole('dialog').filter({ visible: true });
  }

  /**
   * A dialog identified by its visible heading.
   *
   * Not by accessible name: #videoModal ("About us") has no aria-labelledby at
   * all, so getByRole('dialog', { name: 'About us' }) matches nothing. Every
   * dialog in this app does have a heading, so headings are used uniformly.
   */
  dialogTitled(title: string): Locator {
    return this.visibleDialog().filter({
      has: this.page.getByRole('heading', { name: title, exact: true }),
    });
  }

  /**
   * Resolves a control named in the Gherkin to a real locator.
   *
   * The default is role-based and covers most of the app. The special cases are
   * all verified ambiguities or surprises:
   */
  control(name: string): Locator {
    switch (name) {
      // "Add to cart" looks and reads like a button but its role is LINK.
      case 'Add to cart':
        return this.page.getByRole('link', { name: 'Add to cart', exact: true });

      // TWO buttons are named "Next": the carousel's (.carousel-control-next)
      // and the product grid's pagination (#next2). The catalogue scenarios
      // mean pagination. #next2's accessible name is "Next" (verified).
      case 'Next':
        return this.page.locator('#next2');

      // Every dialog has two buttons named "Close": the "×" in the header
      // (aria-label="Close") and the footer button whose text is "Close".
      // Filtering by text picks the footer one without resorting to .first().
      case 'Close':
        return this.visibleDialog()
          .getByRole('button', { name: 'Close' })
          .filter({ hasText: 'Close' });

      // These live inside a dialog AND share their name with a nav link
      // ("Log in", "Sign up"), so they must be scoped to the open dialog.
      case 'Log in':
      case 'Sign up':
      case 'Purchase':
      case 'Send message':
        return this.visibleDialog().getByRole('button', { name, exact: true });

      default:
        return this.page
          .getByRole('button', { name, exact: true })
          .or(this.page.getByRole('link', { name, exact: true }));
    }
  }

  /** Resolves a nav link named in the Gherkin. */
  navLink(name: string): Locator {
    switch (name) {
      case 'Cart':
        return this.navCart;
      case 'Home':
        return this.navHome;
      default:
        return this.page.getByRole('link', { name, exact: true });
    }
  }

  /**
   * Signs out, so the "Sign up" and "Log in" nav links exist.
   *
   * When signed in this app REMOVES those links from the DOM entirely (verified:
   * count 0, not merely hidden), and the role projects start every scenario
   * signed in from .auth/<role>.json. The sign-up scenarios say only "Given I am
   * on the home page", so this is the hidden precondition that makes
   * "click the Sign up link" possible — see needs-human.md for the suggested
   * Gherkin that would make it explicit.
   */
  async ensureSignedOut(): Promise<void> {
    await this.page.context().clearCookies();
    await this.page.goto('/');
    await expect(this.navSignUp).toBeVisible();
  }
}
