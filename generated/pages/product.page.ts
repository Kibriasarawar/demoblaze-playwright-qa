// Product detail page (prod.html?idp_=N).
//
// Snapshot of the loaded page:
//   - heading "Samsung galaxy s6" [level=2]
//   - heading "$360 *includes tax" [level=3]   <- note the suffix
//   - #more-information > paragraph             (the description)
//   - link "Add to cart"                        <- a LINK, not a button
// The content arrives by XHR after DOMContentLoaded, hence waitForLoaded().

import { expect, type Locator, type Page } from '@playwright/test';
import { StorePage } from './store.page';

export class ProductPage extends StorePage {
  readonly title: Locator;
  /** Reads "$360 *includes tax", so assertions on it must be "contains". */
  readonly price: Locator;
  readonly description: Locator;
  /** Role is `link`, despite looking and reading like a button. */
  readonly addToCartLink: Locator;

  constructor(page: Page) {
    super(page);
    this.title = page.getByRole('heading', { level: 2 });
    this.price = page.getByRole('heading', { level: 3 });
    // #more-information is the app's own id for the description block; the
    // paragraph inside it is found by role.
    this.description = page.locator('#more-information').getByRole('paragraph');
    this.addToCartLink = page.getByRole('link', { name: 'Add to cart', exact: true });
  }

  async waitForLoaded(name: string): Promise<void> {
    await expect(this.title).toHaveText(name);
    await expect(this.addToCartLink).toBeVisible();
  }

  /**
   * Clicks Add to cart. The caller must then wait for the app's
   * "Product added." alert (via the AlertLog fixture), which is fired from the
   * add-to-cart XHR's success callback and is therefore the completion signal —
   * without it, the next step can read the cart before the server has the item.
   */
  async addToCart(): Promise<void> {
    await this.addToCartLink.click();
  }
}
