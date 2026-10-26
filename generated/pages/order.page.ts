// Order dialog (#orderModal), opened from the cart's "Place Order" button.
//
// Verified snapshot:
//   dialog "Place order"
//     heading "Place order" [level=5]
//     #totalm -> "Total: 360"   (just "Total:" when the cart is empty)
//     inputs: #name #country #city #card #month #year
//     button "Close" (x2 — header x and footer), button "Purchase"
//
// Why ids for the fields: the app's labels are mis-associated, so
// getByLabel('Name:') resolves to THREE elements (the total's label, the name
// label and more), which is a strict-mode violation. getByLabel('Credit card:')
// happens to work, but the whole form uses ids for consistency and safety.
// Documented last resort, hard rule 2.

import { type Locator, type Page } from '@playwright/test';
import { StorePage } from './store.page';

export type OrderDetails = {
  name: string;
  country: string;
  city: string;
  card: string;
  month: string;
  year: string;
};

export class OrderPage extends StorePage {
  readonly dialog: Locator;
  readonly heading: Locator;
  readonly total: Locator;
  readonly nameField: Locator;
  readonly countryField: Locator;
  readonly cityField: Locator;
  readonly cardField: Locator;
  readonly monthField: Locator;
  readonly yearField: Locator;
  readonly purchaseButton: Locator;

  constructor(page: Page) {
    super(page);
    this.dialog = page.locator('#orderModal');
    this.heading = page.getByRole('heading', { name: 'Place order', exact: true });
    this.total = page.locator('#totalm');
    this.nameField = this.dialog.locator('#name');
    this.countryField = this.dialog.locator('#country');
    this.cityField = this.dialog.locator('#city');
    this.cardField = this.dialog.locator('#card');
    this.monthField = this.dialog.locator('#month');
    this.yearField = this.dialog.locator('#year');
    this.purchaseButton = this.dialog.getByRole('button', { name: 'Purchase', exact: true });
  }

  async waitForOpen(): Promise<void> {
    await this.dialog.waitFor({ state: 'visible' });
  }

  /** Fills the form. `fill('')` is a no-op on an already-empty field, which is
   *  what the "rejected when the name is missing" scenarios rely on. */
  async fillDetails(details: OrderDetails): Promise<void> {
    await this.nameField.fill(details.name);
    await this.countryField.fill(details.country);
    await this.cityField.fill(details.city);
    await this.cardField.fill(details.card);
    await this.monthField.fill(details.month);
    await this.yearField.fill(details.year);
  }

  async purchase(): Promise<void> {
    await this.purchaseButton.click();
  }
}
