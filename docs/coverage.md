# Coverage

Every scenario in `features/`, and what became of it.

| Module | Scenario | Test | Status |
| --- | --- | --- | --- |
| about | About us dialog opens from the navigation | `.features-gen/chromium-customer/about/about.feature.spec.js:6` | passed |
| about | Closing the About us dialog returns to the home page | `.features-gen/chromium-customer/about/about.feature.spec.js:13` | passed |
| cart | Remove the only product from the cart | `.features-gen/chromium-customer/cart/cart-manage.feature.spec.js:6` | passed |
| cart | Removing one of two products leaves the other | `.features-gen/chromium-customer/cart/cart-manage.feature.spec.js:17` | passed |
| cart | Adding the same product twice creates two rows | `.features-gen/chromium-customer/cart/cart-manage.feature.spec.js:31` | passed |
| cart | Cart survives a page reload | `.features-gen/chromium-customer/cart/cart-manage.feature.spec.js:42` | passed |
| cart | Add a single product to the cart | `.features-gen/chromium-customer/cart/cart.feature.spec.js:7` | passed |
| cart | Add two different products to the cart | `.features-gen/chromium-customer/cart/cart.feature.spec.js:16` | passed |
| cart | Cart is empty before anything is added | `.features-gen/chromium-customer/cart/cart.feature.spec.js:30` | passed |
| catalog | Home page lists products on arrival | `.features-gen/chromium-customer/catalog/catalog.feature.spec.js:6` | passed |
| catalog | Phones category shows only phones | `.features-gen/chromium-customer/catalog/catalog.feature.spec.js:12` | passed |
| catalog | Laptops category shows only laptops | `.features-gen/chromium-customer/catalog/catalog.feature.spec.js:20` | passed |
| catalog | Monitors category shows only monitors | `.features-gen/chromium-customer/catalog/catalog.feature.spec.js:27` | passed |
| catalog | Next page shows a different set of products | `.features-gen/chromium-customer/catalog/catalog.feature.spec.js:34` | passed |
| catalog | Switching category twice keeps the grid consistent | `.features-gen/chromium-customer/catalog/catalog.feature.spec.js:41` | passed |
| contact | Contact dialog opens with an empty form | `.features-gen/chromium-customer/contact/contact.feature.spec.js:6` | passed |
| contact | Sending a message confirms with a thank you | `.features-gen/chromium-customer/contact/contact.feature.spec.js:14` | passed |
| contact | Closing the contact dialog returns to the home page | `.features-gen/chromium-customer/contact/contact.feature.spec.js:22` | passed |
| e2e | Customer buys two products and completes the order | `.features-gen/chromium-customer/e2e/e2e.feature.spec.js:6` | skipped by tag |
| e2e | Order is rejected when the form is incomplete | `.features-gen/chromium-customer/e2e/e2e.feature.spec.js:35` | passed |
| e2e | Customer logs out at the end of the session | `.features-gen/chromium-customer/e2e/e2e.feature.spec.js:47` | passed |
| login | Login is rejected with a wrong password | `.features-gen/chromium-customer/login/login-negative.feature.spec.js:6` | passed |
| login | Login is rejected for a user that does not exist | `.features-gen/chromium-customer/login/login-negative.feature.spec.js:14` | passed |
| login | Login is rejected when both fields are empty | `.features-gen/chromium-customer/login/login-negative.feature.spec.js:21` | passed |
| login | Customer logs in with valid credentials | `.features-gen/chromium-customer/login/login.feature.spec.js:6` | passed |
| navigation | Navigation bar shows the signed-in state | `.features-gen/chromium-customer/navigation/navigation.feature.spec.js:6` | passed |
| navigation | Cart link opens the cart page | `.features-gen/chromium-customer/navigation/navigation.feature.spec.js:13` | passed |
| navigation | Logo returns to the home page from the cart | `.features-gen/chromium-customer/navigation/navigation.feature.spec.js:20` | passed |
| order | Order dialog opens with an empty form | `.features-gen/chromium-customer/order/order.feature.spec.js:6` | passed |
| order | Order dialog shows the cart total | `.features-gen/chromium-customer/order/order.feature.spec.js:17` | passed |
| order | Closing the order dialog keeps the cart intact | `.features-gen/chromium-customer/order/order.feature.spec.js:26` | passed |
| order | Order is rejected when the name is missing | `.features-gen/chromium-customer/order/order.feature.spec.js:37` | passed |
| order | Successful order shows a confirmation with the amount | `.features-gen/chromium-customer/order/order.feature.spec.js:48` | skipped by tag |
| product | Product page shows name, price and description | `.features-gen/chromium-customer/product/product.feature.spec.js:6` | passed |
| product | Adding a product confirms with a message | `.features-gen/chromium-customer/product/product.feature.spec.js:15` | passed |
| product | Returning to the home page from a product | `.features-gen/chromium-customer/product/product.feature.spec.js:22` | passed |
| signup | Sign up dialog opens from the navigation | `.features-gen/chromium-customer/signup/signup.feature.spec.js:6` | passed |
| signup | Sign up is rejected for a username that already exists | `.features-gen/chromium-customer/signup/signup.feature.spec.js:13` | passed |
| signup | Sign up is rejected when both fields are empty | `.features-gen/chromium-customer/signup/signup.feature.spec.js:21` | passed |
