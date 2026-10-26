# @mode:serial: all three scenarios act on the SAME server-side cart for the
# test account, so they must not run in parallel with each other.
@mode:serial
@module:cart
Feature: Shopping cart

  Adding products to the cart from the product page, and checking
  that the cart lists what was added.

  @role:customer @smoke
  Scenario: Add a single product to the cart
    Given I am on the home page
    When I open the product "Samsung galaxy s6"
    And I click the "Add to cart" button
    And I open the cart page
    Then I should see "Samsung galaxy s6" in the cart
    And the cart should contain 1 item

  @role:customer @regression
  Scenario: Add two different products to the cart
    Given I am on the home page
    When I open the product "Samsung galaxy s6"
    And I click the "Add to cart" button
    And I go back to the home page
    And I open the product "Nokia lumia 1520"
    And I click the "Add to cart" button
    And I open the cart page
    Then I should see "Samsung galaxy s6" in the cart
    And I should see "Nokia lumia 1520" in the cart
    And the cart should contain 2 items
    And the cart total should be "1180"

  @role:customer @regression
  Scenario: Cart is empty before anything is added
    Given I am on the home page
    When I open the cart page
    Then the cart should contain 0 items
