// About us dialog steps.

import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures';

const { Then } = createBdd(test);

Then('I should see a video player', async ({ aboutPage }) => {
  // The player exposes a real region role with the accessible name
  // "Video Player", so no CSS is needed here.
  await expect(aboutPage.videoPlayer).toBeVisible();
});
