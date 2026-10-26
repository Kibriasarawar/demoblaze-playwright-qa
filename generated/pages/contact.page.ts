// Contact dialog (#exampleModal), opened from the nav "Contact" link.
//
// Verified snapshot: dialog "New message", heading "New message",
// inputs #recipient-email #recipient-name #message-text, buttons Close x2 and
// "Send message". Confirms with the alert "Thanks for the message!!" and closes.
//
// Why ids, not labels — this app's labels are genuinely broken here:
//   getByLabel('Contact Email:') -> #recipient-name   (the NAME field)
//   getByLabel('Contact Name:')  -> #recipient-name   (the same field again)
// Two <label for> attributes point at #recipient-name and nothing points at
// #recipient-email, whose accessible name is empty. A label-based locator would
// silently fill the wrong field and the test would still pass. Verified live.

import { type Locator, type Page } from '@playwright/test';
import { StorePage } from './store.page';

export class ContactPage extends StorePage {
  readonly dialog: Locator;
  readonly emailField: Locator;
  readonly nameField: Locator;
  readonly messageField: Locator;
  readonly sendButton: Locator;

  constructor(page: Page) {
    super(page);
    this.dialog = page.locator('#exampleModal');
    this.emailField = this.dialog.locator('#recipient-email');
    this.nameField = this.dialog.locator('#recipient-name');
    this.messageField = this.dialog.locator('#message-text');
    this.sendButton = this.dialog.getByRole('button', { name: 'Send message', exact: true });
  }

  async waitForOpen(): Promise<void> {
    await this.dialog.waitFor({ state: 'visible' });
  }

  async fillMessage(email: string, name: string, message: string): Promise<void> {
    await this.emailField.fill(email);
    await this.nameField.fill(name);
    await this.messageField.fill(message);
  }
}
