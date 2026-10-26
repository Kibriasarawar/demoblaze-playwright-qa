# Needs a human

## Gave up after 3 attempts

- **Successful order shows a confirmation with the amount / Customer buys two products and completes the order** — last tried: Tagged @skip. Both scenarios end by filling a credit card number and clicking Purchase, which this environment refuses to run (classified as a real-world transaction), so the confirmation's markup could not be read and no locator for it has been verified. Everything up to the Purchase click is generated, and the no-card validation path ('Please fill out Name and Creditcard.') is covered and passing.

---

## Your call — nothing here blocks the suite, but three items need a decision

### 1. Two scenarios are @skip: completing a purchase is blocked here

`order/Successful order shows a confirmation with the amount` and
`e2e/Customer buys two products and completes the order` are tagged `@skip`.

Both end by filling a credit card number and clicking **Purchase**. This
environment refuses to run that — it classifies filling a card and purchasing as
a real-world transaction — so I could not read the confirmation's markup, and the
first rule of this skill is never to write a locator I have not seen on the real
page. Everything up to the Purchase click is verified and generated; only the
confirmation is unknown.

Every other part of the order flow IS covered and passing, including the
validation path with no card data at all (`Please fill out Name and Creditcard.`),
the order dialog's total, and that closing the dialog leaves the cart intact.

To finish these two, either:
- run the purchase once yourself and paste what the confirmation says, or
- allow it for this project (a Bash permission rule), and I will verify the
  markup and remove the `@skip`.

Demoblaze is a public demo with no real payment, and `4111111111111111` is the
standard Visa test number, so there is no real money involved — but that is your
call to make, not mine.

### 2. The sign-up scenarios have a hidden precondition

While signed in, this app **removes** the "Sign up" and "Log in" nav links from
the DOM (verified: count 0, not merely hidden). Every scenario starts signed in
from `.auth/customer.json`, so `When I click the "Sign up" link` cannot work from
the state `Given I am on the home page` actually leaves you in.

So the step signs out first. That works, but it is a side effect the Gherkin does
not mention, which is exactly the kind of thing that confuses the next reader.

Suggested rewrite, which I would then implement as its own step:

```gherkin
  @role:customer @regression
  Scenario: Sign up dialog opens from the navigation
    Given I am a signed-out visitor on the home page
    When I click the "Sign up" link
```

The same applies to `features/login/login.feature`, where `Given I am on the
login page` already clears the session for the same reason.

### 3. run.workers is pinned to 1, and that is a real constraint

`Given I am on the home page` empties the cart, and the cart is server-side per
account with a single shared test account. Any two scenarios running at once wipe
each other's state. `@mode:serial` only serialises within one file, so it cannot
fix this across `cart`, `cart-manage`, `order`, `e2e` and `product`.

The suite is therefore fully serial, which is why it takes minutes rather than
seconds. The real fix is on the app/test-data side, not in the test code:
a second test account, or an API that seeds a cart per test. Worth asking a
developer for if this suite grows.

### 4. Sign-up's happy path is deliberately not automated

Creating an account would leave a new user behind on every run, and this app
offers no way to delete one. The three automated sign-up cases are the
deterministic ones: the dialog opens, an existing username is rejected, and
empty fields are rejected. That matches the note already in your feature file.

### 5. This app's labels are broken in three places

Worth knowing, because the page objects use ids there and the comments explain why:

| Where | What `getByLabel` does | What the suite uses |
| --- | --- | --- |
| Login modal | `Username:` / `Password:` resolve to the **sign-up** modal | `#loginusername`, `#loginpassword` |
| Contact dialog | `Contact Email:` **and** `Contact Name:` both resolve to the name field | `#recipient-email`, `#recipient-name` |
| Order dialog | `Name:` resolves to **three** elements | `#name`, `#card` |

In each case a label-based locator would have driven the wrong field while the
test still passed. If this were your own app rather than a public demo, a
`data-testid` on those inputs would be a one-line fix per field.

### 6. Still open from the first login run

- `Then I should see the dashboard` — this app has no dashboard. Suggested:
  `Then I should see "Welcome" in the navigation` / `And I should see the "Log out" link`.
- `features/login/login.feature` has no `@role:` tag and no `@module:` tag.
