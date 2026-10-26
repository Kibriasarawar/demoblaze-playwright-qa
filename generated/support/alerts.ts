// One alert handler per scenario.
//
// Demoblaze reports almost everything through JS alerts: "Product added.",
// "Wrong password.", "Thanks for the message!!", form validation. Playwright
// auto-dismisses a dialog when nothing is listening, so those messages vanish
// silently and a rejected action looks like "nothing happened".
//
// There must be exactly ONE listener. Registering page.on('dialog') and also
// awaiting page.waitForEvent('dialog') makes both handlers fire and the second
// dismiss throws "Cannot dismiss dialog which is already handled!" — that cost
// a debugging round during generation, hence this single collector.
//
// The collector is an `auto` fixture so it is attached before the first
// navigation, even in scenarios whose steps never mention alerts.

import { expect, type Page } from '@playwright/test';

export class AlertLog {
  private readonly messages: string[] = [];

  constructor(private readonly page: Page) {
    page.on('dialog', async (dialog) => {
      this.messages.push(dialog.message());
      await dialog.dismiss();
    });
  }

  /** Everything the app has said so far, in order. */
  all(): string[] {
    return [...this.messages];
  }

  /** Forget what has been seen, so a later step asserts on a fresh message. */
  clear(): void {
    this.messages.length = 0;
  }

  /**
   * Waits until the app has said something containing `expected`.
   *
   * Checks the alert log first, then visible on-page text, because a few
   * confirmations are rendered in the page rather than alerted. This is a
   * retrying assertion, not a fixed wait (hard rule 3).
   */
  async expectMessage(expected: string): Promise<void> {
    await expect
      .poll(
        async () => {
          if (this.messages.some((message) => message.includes(expected))) return true;
          return (await this.page.getByText(expected).filter({ visible: true }).count()) > 0;
        },
        {
          message:
            `No alert or visible on-page text containing "${expected}". ` +
            `Messages seen so far: ${JSON.stringify(this.messages)}`,
        },
      )
      .toBe(true);
  }
}
