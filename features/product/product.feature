@module:product
Feature: Product details

  What a customer sees after opening one product from the grid.

  @role:customer @smoke
  Scenario: Product page shows name, price and description
    Given I am on the home page
    When I open the product "Samsung galaxy s6"
    Then the product name should be "Samsung galaxy s6"
    And the product price should be "$360"
    And I should see a product description
    And I should see the "Add to cart" button

  @role:customer @regression
  Scenario: Adding a product confirms with a message
    Given I am on the home page
    When I open the product "Nexus 6"
    And I click the "Add to cart" button
    Then I should see the message "Product added"

  @role:customer @regression
  Scenario: Returning to the home page from a product
    Given I am on the home page
    When I open the product "Samsung galaxy s6"
    And I click the "Home" link
    Then I should see a product list
    And I should see "Samsung galaxy s6" in the product list
