// About us dialog (#videoModal), opened from the nav "About us" link.
//
// Verified snapshot:
//   dialog                            <- NO accessible name at all
//     heading "About us" [level=5]
//     button "Close"
//     region "Video Player"
//       button "Play Video"
//     button "Close"
//
// The dialog has no aria-labelledby, so getByRole('dialog', { name: 'About us' })
// matches nothing — it is identified by its heading instead (see
// StorePage.dialogTitled). The video player, happily, exposes a proper
// region role with the accessible name "Video Player", so no CSS is needed.

import { type Locator, type Page } from '@playwright/test';
import { StorePage } from './store.page';

export class AboutPage extends StorePage {
  readonly dialog: Locator;
  readonly heading: Locator;
  readonly videoPlayer: Locator;

  constructor(page: Page) {
    super(page);
    this.dialog = page.locator('#videoModal');
    this.heading = page.getByRole('heading', { name: 'About us', exact: true });
    this.videoPlayer = page.getByRole('region', { name: 'Video Player' });
  }

  async waitForOpen(): Promise<void> {
    await this.dialog.waitFor({ state: 'visible' });
  }
}
