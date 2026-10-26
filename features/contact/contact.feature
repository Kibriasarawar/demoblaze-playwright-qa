@module:contact
Feature: Contact form

  The contact dialog in the navigation bar.

  @role:customer @regression
  Scenario: Contact dialog opens with an empty form
    Given I am on the home page
    When I click the "Contact" link
    Then I should see the "New message" dialog
    And the "Contact Email" field should be empty
    And the "Message" field should be empty

  @role:customer @regression @destructive
  Scenario: Sending a message confirms with a thank you
    Given I am on the home page
    When I click the "Contact" link
    And I fill in the contact form with email "qa-test@example.com", name "Test Customer" and message "Automated QA check, please ignore."
    And I click the "Send message" button
    Then I should see the message "Thanks for the message!!"

  @role:customer @regression
  Scenario: Closing the contact dialog returns to the home page
    Given I am on the home page
    When I click the "Contact" link
    And I click the "Close" button
    Then I should see a product list
