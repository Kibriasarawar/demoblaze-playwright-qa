# Test run — 27 Oct 2026, 03:03

**Application** Demoblaze · staging · chromium · 1 workers
**Mode** bdd
**Duration** 5m 30s

## Result

| | Count |
| --- | --- |
| Passed | 37 |
| Failed | 0 |
| Skipped | 2 |

_Login: 0 performed, 1 reused from a saved session._

## Auto-fixes applied

| Scenario | Attempt | Change | Result |
| --- | --- | --- | --- |
| Closing the order dialog keeps the cart intact | 1 | Went flaky on the first full run: ProductPage.waitForLoaded failed with "getByRole('heading', { level: 2 }) element(s) not found", then passed on retry. The product page's content is rendered by POST /view AFTER navigation, so waiting only for the prod.html URL left the assertion racing the render. openProduct() now waits for that response. Predicate is endsWith('/view'), not includes('/view'), because the latter also matches /viewcart and would resolve against the wrong call. | fixed - order feature passed 3 consecutive runs with --retries=0 |
| All scenarios (generation-time, before the first run) | 0 | Grid changes now settle on the app's own calls instead of racing a re-render: GET /entries (initial load), POST /bycat (category), POST /pagination (Next). Without this, 'I should not see X in the product list' could pass against a half-rendered or previous grid - the catalogue pagination scenario was the one at risk. | applied during generation, endpoints verified live |
| All scenarios (generation-time, before the first run) | 0 | Unified alert handling into one AlertLog collector registered as an auto fixture, and removed LoginPage.watchForAlerts. Demoblaze reports nearly everything through JS alerts, and having both a page.on('dialog') listener and a waitForEvent('dialog') made the second dismiss throw 'Cannot dismiss dialog which is already handled!' - hit during exploration. | applied during generation |
| Contact and order form scenarios | 0 | Avoided three label traps that would have driven the wrong field while still passing. Contact dialog: getByLabel('Contact Email:') AND getByLabel('Contact Name:') both resolve to #recipient-name, and nothing points at #recipient-email. Order dialog: getByLabel('Name:') resolves to 3 elements. Login modal: 'Username:'/'Password:' belong to the sign-up modal. All three now use the app's ids, documented as a last resort. | applied during generation, verified against the live DOM |
| Catalogue, dialog and about scenarios | 0 | Resolved control-name ambiguities by scoping, never by .first(): two buttons named 'Next' (carousel vs #next2 pagination) - the catalogue means pagination; two buttons named 'Close' in every dialog (header x and footer) - disambiguated with filter({ hasText: 'Close' }); 'Log in'/'Sign up'/'Purchase'/'Send message' share names with nav links, so they are scoped to the open dialog; #videoModal has no accessible name at all, so dialogs are matched by heading instead of getByRole('dialog', { name }). | applied during generation, each verified by counting matches on the live page |
| Sign up scenarios | 0 | This app REMOVES the 'Sign up' and 'Log in' nav links from the DOM while signed in (verified count 0, not merely hidden), and every scenario starts signed in from .auth/customer.json. The step that clicks the 'Sign up' link therefore signs out first. This is a side effect the Gherkin does not state - suggested rewrite is in needs-human.md. | applied during generation; flagged for the tester to make explicit |
| All scenarios (configuration) | 0 | Pinned run.workers to 1. Every scenario's Given empties the cart, the cart is server-side per account, and there is ONE shared test account - so any two scenarios running at once wipe each other's state. @mode:serial only serialises within a single file, so it cannot cover cart, cart-manage, order, e2e and product together. Cost: the suite is fully serial and takes ~6 minutes. | applied; the real fix is a second test account or API cart seeding, see needs-human.md |
| Successful order shows a confirmation with the amount / Customer buys two products and completes the order | 0 | Tagged @skip. Both scenarios end by filling a credit card number and clicking Purchase, which this environment refuses to run (classified as a real-world transaction), so the confirmation's markup could not be read and no locator for it has been verified. Everything up to the Purchase click is generated, and the no-card validation path ('Please fill out Name and Creditcard.') is covered and passing. | gave up pending a human decision |

1 scenario(s) hit the 3-attempt limit. See `needs-human.md`.

---

_Artifacts in this folder can contain session data. `outcome/` is git-ignored for that reason._
