@module:about
Feature: About us

  The About us dialog and its video player.

  @role:customer @regression
  Scenario: About us dialog opens from the navigation
    Given I am on the home page
    When I click the "About us" link
    Then I should see the "About us" dialog
    And I should see a video player

  @role:customer @regression
  Scenario: Closing the About us dialog returns to the home page
    Given I am on the home page
    When I click the "About us" link
    And I click the "Close" button
    Then I should see a product list
