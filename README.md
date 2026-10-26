# Demoblaze — Playwright UI Test Suite

Automated end-to-end UI tests for [demoblaze.com](https://www.demoblaze.com), a public
demo storefront. Scenarios are written in plain-English Gherkin; `playwright-bdd`
compiles them into Playwright tests.

**[→ Open the latest test report](https://kibriasarawar.github.io/demoblaze-playwright-qa/report/)**

## Latest run

27 Oct 2026 · Chromium · 1 worker · 5m 30s

| | |
| --- | --- |
| Passed | 37 |
| Failed | 0 |
| Skipped by tag | 2 |
| Total scenarios | 39 |

[Full summary](docs/run-summary.md) · [Scenario-by-scenario coverage](docs/coverage.md) · [Open questions](docs/open-questions.md)

## What is covered

| Module | Scenarios | What it checks |
| --- | --- | --- |
| catalog | 6 | Product grid, the three category filters, pagination |
| cart | 7 | Add, remove, duplicate rows, totals, survival across reload |
| order | 5 | Order dialog, cart total, validation, closing without losing the cart |
| login | 4 | Valid login, wrong password, unknown user, empty fields |
| signup | 3 | Dialog opens, duplicate username rejected, empty fields rejected |
| product | 3 | Name, price, description, add-to-cart confirmation |
| navigation | 3 | Signed-in nav state, cart link, logo returns home |
| contact | 3 | Dialog opens, message sends, close returns home |
| about | 2 | Dialog opens with video player, close returns home |
| e2e | 3 | Full purchase journey, incomplete-form rejection, logout |

## What is not covered

Two scenarios are tagged `@skip` and did not run. Both end by entering a credit card
number and clicking **Purchase**:

- `order` → Successful order shows a confirmation with the amount
- `e2e` → Customer buys two products and completes the order

The environment used to generate these tests refuses to execute a card-entry and
purchase flow, so the confirmation dialog's markup was never observed. Rather than
write a locator against a guessed structure, the scenarios were left skipped.
Everything up to the Purchase click is generated and verified, and the validation
path with no card data (`Please fill out Name and Creditcard.`) passes.

**The purchase confirmation itself is therefore untested.** See
[open-questions.md](docs/open-questions.md) for how to close that gap.

Sign-up's happy path is also deliberately not automated: creating an account leaves a
new user behind on every run, and the app offers no way to remove one.

## Running the suite

Requires Node 20+.

```bash
npm install
npx playwright install chromium

cp credentials/.env.example credentials/.env   # then fill in BASE_URL and a test account
npm run qa:check                               # preflight: toolchain, config, env keys
npm run qa:test                                # bddgen + playwright test
npm run qa:open                                # open the HTML report
```

Useful variations:

```bash
npm run qa:test -- --headed              # watch the browser
npm run qa:test -- --grep @smoke         # the 5 smoke scenarios only
npm run qa:test -- --grep @module:cart   # one module
```

`credentials/.env` is git-ignored and never committed. Only `.env.example`, with empty
values, is in version control.

## Layout

```
features/           Gherkin scenarios, one folder per module
generated/pages/    Page objects — the only place locators live
generated/steps/    Step definitions; these call page objects, never locators
generated/support/  Shared fixtures (JS alert capture)
lib/                Config and credential loading
qa.config.yaml      Mode, roles, browsers, timeouts, reporting
docs/               Published test report
```

A `.feature` edit requires `bddgen` to run before the tests. `npm run qa:test` chains
both; calling `npx playwright test` alone will silently run the previous version.

## Known constraints

**The suite runs single-threaded.** Each scenario starts by emptying the cart, the cart
is server-side per account, and there is one shared test account — so parallel workers
overwrite each other's state. `workers` is pinned to `1` in `qa.config.yaml`, which is
why a 39-scenario run takes minutes rather than seconds. The fix belongs on the
application side: a second test account, or an API to seed a cart per test.

**Three of this app's form labels are wrong**, and label-based locators would silently
drive the wrong field while the test still passed:

| Dialog | What `getByLabel` resolves to | What the suite uses instead |
| --- | --- | --- |
| Login | `Username:` / `Password:` point at the **sign-up** modal | `#loginusername`, `#loginpassword` |
| Contact | `Contact Email:` and `Contact Name:` both point at the name field | `#recipient-email`, `#recipient-name` |
| Order | `Name:` matches three elements | `#name`, `#card` |

Ids are used there as a documented last resort. On a non-demo application, a
`data-testid` on each of those inputs would be the permanent fix.

**Product prices are asserted literally** (`$360`, `$790`, `1150`). If the demo site
changes its prices, those assertions fail — that is a data change, not a regression.

## Built with

[Playwright](https://playwright.dev) · [playwright-bdd](https://github.com/vitalets/playwright-bdd) · TypeScript
