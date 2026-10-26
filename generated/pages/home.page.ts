// Home page — the product grid, categories and pagination.
//
// The grid is always rendered by an XHR after DOMContentLoaded, and the three
// ways it changes each have their own call (all verified live):
//   GET  /entries     initial load
//   POST /bycat       a category was chosen
//   POST /pagination  Next / Previous
// Waiting for the matching call is what stops a "should not see X" assertion
// passing against the previous grid, or against a half-rendered one.

import { expect, type Locator, type Page } from '@playwright/test';
import { StorePage } from './store.page';

export class HomePage extends StorePage {
  /**
   * The product grid container. `#tbodyid` is the app's own id and the only
   * handle on this container — it has no role or accessible name, so this is a
   * documented last resort (hard rule 2). Everything inside it is found by role.
   */
  readonly grid: Locator;
  readonly productCards: Locator;
  readonly categoriesHeading: Locator;

  constructor(page: Page) {
    super(page);
    this.grid = page.locator('#tbodyid');
    this.productCards = this.grid.locator('.card');
    this.categoriesHeading = page.getByRole('link', { name: 'CATEGORIES' });
  }

  /** One product's title link in the grid. */
  productLink(name: string): Locator {
    return this.grid.getByRole('link', { name, exact: true });
  }

  /** Runs an action and waits for the grid call it triggers, then for a card. */
  private async withGridRefresh(
    urlPart: string,
    action: () => Promise<void>,
  ): Promise<void> {
    const refreshed = this.page.waitForResponse(
      (response) => response.url().includes(urlPart) && response.status() === 200,
    );
    await action();
    await refreshed;
    await expect(this.productCards.first()).toBeVisible();
  }

  async goto(): Promise<void> {
    await this.withGridRefresh('/entries', async () => {
      await this.page.goto('/');
    });
  }

  /** Returns to the home page using the nav, as a user would. */
  async gotoViaNav(): Promise<void> {
    await this.withGridRefresh('/entries', async () => {
      await this.navHome.click();
    });
  }

  /** Returns to the home page using the store logo. */
  async gotoViaLogo(): Promise<void> {
    await this.withGridRefresh('/entries', async () => {
      await this.logo.click();
    });
  }

  async openCategory(category: string): Promise<void> {
    await this.withGridRefresh('/bycat', async () => {
      await this.page.getByRole('link', { name: category, exact: true }).click();
    });
  }

  async goToNextPage(): Promise<void> {
    await this.withGridRefresh('/pagination', async () => {
      await this.control('Next').click();
    });
  }

  /**
   * Opens a product by its visible title.
   *
   * Each card holds two links to the same product — the image (no accessible
   * name) and the title. `exact: true` on the title keeps this to one match and
   * stops "Samsung galaxy s6" also matching "Samsung galaxy s7".
   *
   * The product page's content is rendered by POST /view after navigation, so
   * this waits for that call. Landing on prod.html is not enough: a run that
   * only waited for the URL went flaky with "heading level=2 not found",
   * because the assertion raced the render.
   *
   * endsWith('/view') and not includes('/view'): the latter also matches
   * /viewcart, which would resolve this wait against the wrong call.
   */
  async openProduct(name: string): Promise<void> {
    const rendered = this.page.waitForResponse(
      (response) => response.url().endsWith('/view') && response.status() === 200,
    );
    await this.productLink(name).click();
    await this.page.waitForURL(/prod\.html/);
    await rendered;
  }
}
