@module:cart
Feature: Managing the cart

  Changing what is already in the cart, and what survives a reload.

  @role:customer @regression
  Scenario: Remove the only product from the cart
    Given I am on the home page
    When I open the product "Samsung galaxy s6"
    And I click the "Add to cart" button
    And I open the cart page
    Then the cart should contain 1 item

    When I delete "Samsung galaxy s6" from the cart
    Then the cart should contain 0 items
    And I should not see "Samsung galaxy s6" in the cart

  @role:customer @regression
  Scenario: Removing one of two products leaves the other
    Given I am on the home page
    When I open the product "Samsung galaxy s6"
    And I click the "Add to cart" button
    And I go back to the home page
    And I open the product "Nexus 6"
    And I click the "Add to cart" button
    And I open the cart page
    And I delete "Samsung galaxy s6" from the cart
    Then I should see "Nexus 6" in the cart
    And I should not see "Samsung galaxy s6" in the cart
    And the cart should contain 1 item

  @role:customer @regression
  Scenario: Adding the same product twice creates two rows
    Given I am on the home page
    When I open the product "Nexus 6"
    And I click the "Add to cart" button
    And I go back to the home page
    And I open the product "Nexus 6"
    And I click the "Add to cart" button
    And I open the cart page
    Then the cart should contain 2 items

  @role:customer @regression
  Scenario: Cart survives a page reload
    Given I am on the home page
    When I open the product "Samsung galaxy s6"
    And I click the "Add to cart" button
    And I open the cart page
    And I reload the page
    Then I should see "Samsung galaxy s6" in the cart
    And the cart should contain 1 item
