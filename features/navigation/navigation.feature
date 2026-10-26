@module:navigation
Feature: Site navigation

  Moving between the main areas of the store.

  @role:customer @smoke
  Scenario: Navigation bar shows the signed-in state
    Given I am on the home page
    Then I should see the "Welcome" greeting
    And I should see the "Log out" link
    And I should not see the "Log in" link

  @role:customer @regression
  Scenario: Cart link opens the cart page
    Given I am on the home page
    When I click the "Cart" link
    Then I should be on the cart page
    And I should see the "Place Order" button

  @role:customer @regression
  Scenario: Logo returns to the home page from the cart
    Given I am on the home page
    When I click the "Cart" link
    And I click the "PRODUCT STORE" logo
    Then I should see a product list
