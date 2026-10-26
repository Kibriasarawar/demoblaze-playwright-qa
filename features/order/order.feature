@module:order
Feature: Placing an order

  The order dialog that opens from the cart, and what it accepts.

  @role:customer @regression
  Scenario: Order dialog opens with an empty form
    Given I am on the home page
    When I open the product "Samsung galaxy s6"
    And I click the "Add to cart" button
    And I open the cart page
    And I click the "Place Order" button
    Then I should see the "Place order" dialog
    And the "Name" field should be empty
    And the "Credit card" field should be empty

  @role:customer @regression
  Scenario: Order dialog shows the cart total
    Given I am on the home page
    When I open the product "Samsung galaxy s6"
    And I click the "Add to cart" button
    And I open the cart page
    And I click the "Place Order" button
    Then the order dialog should show the total "360"

  @role:customer @regression
  Scenario: Closing the order dialog keeps the cart intact
    Given I am on the home page
    When I open the product "Samsung galaxy s6"
    And I click the "Add to cart" button
    And I open the cart page
    And I click the "Place Order" button
    And I click the "Close" button
    Then I should see "Samsung galaxy s6" in the cart
    And the cart should contain 1 item

  @role:customer @regression
  Scenario: Order is rejected when the name is missing
    Given I am on the home page
    When I open the product "Samsung galaxy s6"
    And I click the "Add to cart" button
    And I open the cart page
    And I click the "Place Order" button
    And I fill in the order form with name "", country "Bangladesh", city "Dhaka", credit card "4111111111111111", month "12" and year "2027"
    And I click the "Purchase" button
    Then I should see the message "Please fill out Name and Creditcard."

  # @skip: completing a purchase is blocked in this environment, so the
  # confirmation markup is unverified. See needs-human.md.
  @skip
  @role:customer @regression @destructive
  Scenario: Successful order shows a confirmation with the amount
    Given I am on the home page
    When I open the product "Samsung galaxy s6"
    And I click the "Add to cart" button
    And I open the cart page
    And I click the "Place Order" button
    And I fill in the order form with name "Test Customer", country "Bangladesh", city "Dhaka", credit card "4111111111111111", month "12" and year "2027"
    And I click the "Purchase" button
    Then I should see the message "Thank you for your purchase!"
    And the confirmation should show the amount "360"
