@module:signup
Feature: Sign up

  The sign-up dialog. Only the deterministic cases are automated here —
  see needs-human.md for why the happy path is not.

  @role:customer @regression
  Scenario: Sign up dialog opens from the navigation
    Given I am on the home page
    When I click the "Sign up" link
    Then I should see the "Sign up" dialog
    And I should see the "Sign up" button

  @role:customer @regression
  Scenario: Sign up is rejected for a username that already exists
    Given I am on the home page
    When I click the "Sign up" link
    And I enter my existing username and the sign-up password "not-a-real-password"
    And I click the "Sign up" button
    Then I should see the message "This user already exist."

  @role:customer @regression
  Scenario: Sign up is rejected when both fields are empty
    Given I am on the home page
    When I click the "Sign up" link
    And I enter the sign-up username "" and password ""
    And I click the "Sign up" button
    Then I should see the message "Please fill out Username and Password."
