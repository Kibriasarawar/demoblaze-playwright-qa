@module:login
Feature: Login failures

  What the app says when the credentials are wrong. The passwords here are
  deliberately fake; real ones live in credentials/.env.

  @role:customer @regression
  Scenario: Login is rejected with a wrong password
    Given I am on the login page
    When I enter my username and the password "wrongpassword"
    And I click the "Log in" button
    Then I should see the message "Wrong password."
    And I should see the "Log in" link

  @role:customer @regression
  Scenario: Login is rejected for a user that does not exist
    Given I am on the login page
    When I enter the username "no-such-user-9381" and the password "not-a-real-password"
    And I click the "Log in" button
    Then I should see the message "User does not exist."

  @role:customer @regression
  Scenario: Login is rejected when both fields are empty
    Given I am on the login page
    When I enter the username "" and the password ""
    And I click the "Log in" button
    Then I should see the message "Please fill out Username and Password."
