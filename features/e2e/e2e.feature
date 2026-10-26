@module:e2e
Feature: End to end purchase journey

  One customer walks the whole shop: browse a category, add products from
  two different categories, review the cart, place an order, and confirm
  the purchase. This is the journey that must never break.

  # @skip: completing a purchase is blocked in this environment, so the
  # confirmation markup is unverified. See needs-human.md.
  @skip
  @role:customer @smoke @destructive
  Scenario: Customer buys two products and completes the order
    Given I am on the home page
    Then I should see the "Log out" link

    When I open the "Phones" category
    Then I should see "Samsung galaxy s6" in the product list

    When I open the product "Samsung galaxy s6"
    Then the product price should be "$360"

    When I click the "Add to cart" button
    And I go back to the home page
    And I open the "Laptops" category
    Then I should see "Sony vaio i5" in the product list

    When I open the product "Sony vaio i5"
    And I click the "Add to cart" button
    And I open the cart page
    Then I should see "Samsung galaxy s6" in the cart
    And I should see "Sony vaio i5" in the cart
    And the cart should contain 2 items
    And the cart total should be "1150"

    When I click the "Place Order" button
    Then I should see the "Place order" dialog

    When I fill in the order form with name "Test Customer", country "Bangladesh", city "Dhaka", credit card "4111111111111111", month "12" and year "2027"
    And I click the "Purchase" button
    Then I should see the message "Thank you for your purchase!"
    And the confirmation should show the amount "1150"

    When I click the "OK" button
    Then I should be back on the home page
    And the cart should contain 0 items

  @role:customer @regression
  Scenario: Order is rejected when the form is incomplete
    Given I am on the home page
    When I open the product "Samsung galaxy s6"
    And I click the "Add to cart" button
    And I open the cart page
    And I click the "Place Order" button
    And I fill in the order form with name "", country "Bangladesh", city "Dhaka", credit card "", month "12" and year "2027"
    And I click the "Purchase" button
    Then I should see the message "Please fill out Name and Creditcard."
    And the "Place order" dialog should still be open

  @role:customer @regression
  Scenario: Customer logs out at the end of the session
    Given I am on the home page
    When I click the "Log out" link
    Then I should see the "Log in" link
    And I should not see the "Log out" link
