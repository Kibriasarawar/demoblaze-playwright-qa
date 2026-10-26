// Cart page (cart.html).
//
// Snapshot of a cart holding one item:
//   rowgroup > row "Samsung galaxy s6 360 Delete"
//     cell (img) | cell "Samsung galaxy s6" | cell "360" | cell > link "Delete"
//   #totalp -> "360"   (and "" — empty string, not "0" — when the cart is empty)
//
// Three things about this page shape the code below. All three were measured
// against the live app, and the first two caused real failures first:
//
// 1. The table renders ONE ROW AT A TIME as each item's details are fetched, so
//    a row count taken mid-render is simply wrong — it reads 0 before the first
//    row lands, and climbs from there. Nothing in the DOM says "finished".
//    The /viewcart response does: it lists what the server holds. So every read
//    waits for that response and then for the DOM to match its item count.
//    Measured: counts of 5 and then 4 for the same cart before this was added.
// 2. The cart API is lazily consistent — a delete sometimes isn't reflected in
//    the next /viewcart. Cleanup therefore re-reads after every delete and
//    loops until the server itself reports zero, instead of assuming each
//    delete removes exactly one row.
// 3. An empty `#tbodyid` has no layout box, so it is *hidden*. Never wait for it
//    to be visible — that times out on exactly the case the empty-cart scenario
//    cares about. Use toHaveCount() on the rows instead.

import { expect, type Locator, type Page } from '@playwright/test';
import { StorePage } from './store.page';

/** Guard so a misbehaving page cannot turn cleanup into an endless delete loop. */
const MAX_CLEANUP_ROWS = 50;

export class CartPage extends StorePage {
  /**
   * Cart table body. `#tbodyid` is the app's own id and the only handle on this
   * container — no role, no accessible name — so it is a documented last resort
   * (hard rule 2). Rows, cells and links inside it are all found by role.
   */
  readonly body: Locator;
  readonly rows: Locator;
  readonly deleteLinks: Locator;
  /** Order total. `#totalp` has no role or label either; same last-resort note. */
  readonly total: Locator;
  readonly placeOrderButton: Locator;

  constructor(page: Page) {
    super(page);
    this.body = page.locator('#tbodyid');
    this.rows = this.body.getByRole('row');
    this.deleteLinks = this.body.getByRole('link', { name: 'Delete' });
    this.total = page.locator('#totalp');
    // Declared so it is documented, and so nothing clicks it by accident.
    // Placing an order is out of scope: it is irreversible.
    this.placeOrderButton = page.getByRole('button', { name: 'Place Order' });
  }

  /**
   * Runs a navigation and waits until the rendered table matches what the
   * server reported, then returns that item count. See note 1 at the top.
   *
   * This is a response wait plus a retrying assertion, not a sleep (hard rule 3).
   * The payload is never logged — it carries the account name.
   */
  private async readCart(navigate: () => Promise<void>): Promise<number> {
    const viewcart = this.page.waitForResponse(
      (response) => response.url().includes('/viewcart') && response.status() === 200,
    );
    await navigate();

    let expected = 0;
    try {
      const payload = (await (await viewcart).json()) as { Items?: unknown[] };
      expected = Array.isArray(payload.Items) ? payload.Items.length : 0;
    } catch {
      // A cart that has never been used can answer without a JSON body.
      expected = 0;
    }

    await expect(this.rows).toHaveCount(expected);
    return expected;
  }

  /** Opens the cart directly. Returns the number of items the server holds. */
  async goto(): Promise<number> {
    return this.readCart(async () => {
      await this.page.goto('/cart.html');
    });
  }

  /** Opens the cart from the nav, as a user would. */
  async gotoViaNav(): Promise<number> {
    return this.readCart(async () => {
      await this.navCart.click();
      await this.page.waitForURL(/cart\.html/);
    });
  }

  /** Reloads the cart and waits for it to settle. */
  async reload(): Promise<number> {
    return this.readCart(async () => {
      await this.page.reload();
    });
  }

  /** The row for one product, identified by its content rather than its index. */
  itemRow(product: string): Locator {
    return this.rows.filter({ hasText: product });
  }

  /**
   * Deletes one named product's row.
   *
   * Destructive, and allowed for the same approved reason as empty(). The app
   * posts to /deleteitem and then reloads the cart page itself, so this must not
   * reload as well — readCart() is already waiting for the resulting /viewcart.
   */
  async deleteItem(product: string): Promise<number> {
    return this.readCart(async () => {
      const deleted = this.page.waitForResponse(
        (response) => response.url().includes('/deleteitem'),
      );
      await this.itemRow(product).getByRole('link', { name: 'Delete' }).click();
      await deleted;
    });
  }

  /** Opens the order dialog. */
  async placeOrder(): Promise<void> {
    await this.placeOrderButton.click();
  }

  /**
   * Empties the cart so a scenario starts from a known state.
   *
   * Clicking Delete is a destructive action, allowed here only because the
   * tester approved it on 2026-10-27 for this one purpose; see the note on
   * agent.allowDestructiveActions in qa.config.yaml. Scope is deliberately
   * narrow: cart rows of the test account, nothing else, and never Place Order.
   *
   * Each pass waits for the app's own delete call to answer, then re-reads the
   * cart, because a delete is not always reflected immediately (note 2 above).
   */
  async empty(): Promise<number> {
    let items = await this.goto();
    let deletesClicked = 0;

    while (items > 0) {
      if (deletesClicked >= MAX_CLEANUP_ROWS) {
        throw new Error(
          `Cart cleanup clicked Delete ${MAX_CLEANUP_ROWS} times and the cart still ` +
          `reports ${items} item(s). Look at it by hand before trusting this run.`,
        );
      }

      // Clicking Delete posts to /deleteitem and then the app reloads the cart
      // page itself, which re-fires /viewcart. readCart() is already listening
      // for that response, so this must NOT reload as well — doing so raced the
      // app's own reload. Verified endpoint: POST api.demoblaze.com/deleteitem.
      items = await this.readCart(async () => {
        const deleted = this.page.waitForResponse(
          (response) => response.url().includes('/deleteitem'),
        );
        await this.deleteLinks.first().click();
        await deleted;
      });
      deletesClicked++;
    }

    await expect(this.rows).toHaveCount(0);
    return deletesClicked;
  }
}
