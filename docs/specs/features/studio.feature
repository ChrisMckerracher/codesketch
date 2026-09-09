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

  Scenario: Adjust layer opacity during playback
    Given painting is running
    When the human holds the opacity slider at a chosen value across playback updates
    Then the slider preserves that value
    When the human releases the slider
    Then the chosen opacity is committed to the layer being edited

  Scenario: Cancel an opacity edit by changing layers
    Given a layer opacity edit is in progress
    When the selected layer changes
    Then the old edit is cancelled
    And the inspector displays the newly selected layer opacity

  Scenario: Toggle layer visibility with the keyboard
    Given a layer visibility button has keyboard focus
    When the human presses Enter or Space
    Then the layer visibility toggles
    And keyboard activation of the layer row still selects that layer
