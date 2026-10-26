@module:catalog
Feature: Product catalogue

  Browsing the store front: categories, the product grid and pagination.

  @role:customer @smoke
  Scenario: Home page lists products on arrival
    Given I am on the home page
    Then I should see the "PRODUCT STORE" logo
    And I should see at least 9 products in the product list

  @role:customer @smoke
  Scenario: Phones category shows only phones
    Given I am on the home page
    When I open the "Phones" category
    Then I should see "Samsung galaxy s6" in the product list
    And I should see "Nokia lumia 1520" in the product list
    And I should not see "MacBook air" in the product list

  @role:customer @regression
  Scenario: Laptops category shows only laptops
    Given I am on the home page
    When I open the "Laptops" category
    Then I should see "Sony vaio i5" in the product list
    And I should not see "Samsung galaxy s6" in the product list

  @role:customer @regression
  Scenario: Monitors category shows only monitors
    Given I am on the home page
    When I open the "Monitors" category
    Then I should see "Apple monitor 24" in the product list
    And I should not see "Nexus 6" in the product list

  @role:customer @regression
  Scenario: Next page shows a different set of products
    Given I am on the home page
    When I click the "Next" button
    Then I should see a product list
    And I should not see "Samsung galaxy s6" in the product list

  @role:customer @regression
  Scenario: Switching category twice keeps the grid consistent
    Given I am on the home page
    When I open the "Phones" category
    And I open the "Monitors" category
    Then I should see "Apple monitor 24" in the product list
    And I should not see "Samsung galaxy s6" in the product list
