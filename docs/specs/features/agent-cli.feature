Feature: Complete agent painting CLI
  As a painting agent
  I want one documented command line interface for seeing and drawing
  So that I can paint while a human watches and directs me

  Scenario: Learn the drawing workflow offline
    Given no studio server is running
    When I request help or the painting guide
    Then I receive command syntax, examples, observation instructions, and pause semantics
    And the command succeeds without network access

  Scenario: Draw a stroke directly
    Given a running isolated studio
    When I submit a valid stroke with points, brush, size, and color flags
    Then the stroke enters the observable playback queue
    And the CLI reports a concise acknowledgement

  Scenario: Read the artist skill offline
    Given the native executable is outside its source checkout
    And no studio server is available
    When I run paint with the artist-skill flag
    Then I receive the complete paint-with-references skill and both referenced guides
    And the instructions include reference inspection, pencil construction, sketch approval and native drawing rules
    And the guide form prints the same bundle
    And JSON output contains the complete bundle as text

  Scenario: Preserve a human pause
    Given the human has paused the painter
    When I submit another stroke or wait for playback
    Then playback remains paused
    And the CLI reports the pause and available feedback

  Scenario: Inspect an immutable canvas snapshot
    Given a painting with layered marks and an active partial stroke
    When I request a canvas view
    Then I receive a readable PNG and its absolute path and snapshot revision
    And the live document and playback are unchanged
    And the CLI handles browser capture internally

  Scenario: Inspect a facial detail
    Given a valid crop within the canvas
    When I request that crop at a bounded scale
    Then I receive a PNG with the requested output dimensions

  Scenario: Inspect a pause during a document operation
    Given playback is paused during a fill or layer command
    When I request a canvas view or export
    Then I receive a PNG of the committed artwork
    And playback remains paused

  Scenario: Export committed artwork independently of transient drawing
    Given a valid committed document and an active playback command
    When I export PNG
    Then capture validates and renders the committed document
    And active work contributes no pixels

  Scenario: Reject invalid input atomically
    Given a running isolated studio
    When I provide unknown flags, malformed coordinates, or oversized JSON input
    Then the CLI exits with an actionable error
    And the painting history is unchanged

  Scenario: Support automation
    Given a running isolated studio
    When I request status with JSON output
    Then I receive the complete state including instance, revision, and feedback
    When I submit a batch through standard input
    Then valid commands enter the queue atomically

  Scenario: Fail capture cleanly
    Given the configured browser is unavailable or capture times out
    When I request a canvas view
    Then the CLI reports a bounded actionable failure
    And its temporary server, browser process, and profile are cleaned up
    And other browser sessions and the live painting remain available
