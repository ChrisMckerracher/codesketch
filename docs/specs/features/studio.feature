Feature: Observable agent painting
  Scenario: Watch a painting
    Given an empty studio
    When an agent submits a valid sequence of drawing commands
    Then strokes appear progressively in the browser
    And the queue reports remaining work

  Scenario: Direct the painter
    Given a painting is running
    When the human submits feedback
    Then painting pauses immediately
    And the feedback is available through the agent API
    And painting remains paused until explicitly resumed

  Scenario: Revise pending work
    Given a paused painting with completed and pending strokes
    When an agent replaces the pending commands
    Then completed artwork is preserved
    And the new work remains paused

  Scenario: Reject an invalid batch atomically
    Given an existing painting
    When a batch includes an invalid layer reference or coordinate
    Then the entire batch is rejected
    And the artwork and queue remain unchanged

  Scenario: Paint and recover
    Given a human draws on a selected layer
    When the human undoes and redoes the mark
    Then the mark disappears and returns
    When the project is saved and loaded
    Then its layers and artwork are preserved

  Scenario: Export artwork
    Given a painting with hidden and visible layers
    When the human exports PNG
    Then the image contains the visible artwork and background
