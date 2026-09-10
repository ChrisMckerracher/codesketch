# Parent bead: paint-t4o (paint-t4o.1, paint-t4o.2)
Feature: Skip to end for queued drawing playback
  As a painting director or autonomous painting agent
  I want to finish queued drawing commands and active strokes immediately
  So that playback completes atomically without waiting for real-time stroke interpolation

  Scenario: Human triggers Skip to end from studio playback controls
    Given a painting document with an active partial stroke and 12 queued brush commands
    And playback is actively running at 1x speed
    When the human clicks the "Skip to end" button in the playback toolbar
    Then the session domain finishes all pending commands atomically
    And the active stroke completes and commits to the canvas document
    And all 12 queued commands render to completion in sequential order
    And the playback queue becomes empty and active preview becomes null
    And playback transitions to paused state
    And the control epoch increments by one
    And any active continuation grant is revoked

  Scenario: Agent executes paint finish with valid context and execution grant
    Given a running studio with 5 queued strokes submitted by an agent
    And the agent holds an active continuation grant for the current generation and control epoch
    When the agent runs "paint finish --generation <gen> --epoch <epoch> --grant <token>"
    Then the server validates the generation, control epoch, and grant token
    And all 5 queued strokes commit to the document immediately
    And playback settles in paused state
    And the CLI reports successful completion and 0 remaining

  Scenario: Preserve individual undo entries after finishing multiple commands
    Given an empty canvas where 4 distinct strokes are queued for playback
    When the human clicks "Skip to end"
    Then all 4 strokes render to completion on the active layer
    And the document history cursor advances by 4
    When the human triggers undo four times consecutively
    Then each stroke is undone individually in reverse sequential order
    And the canvas returns cleanly to the initial empty state

  Scenario: Complete active stroke when queue is already empty
    Given a brush stroke is actively animating at 60 percent progress with no remaining queued commands
    When the human triggers "Skip to end"
    Then the active stroke completes its remaining 40 percent path atomically
    And the completed mark is committed to the active layer history
    And active stroke preview becomes null
    And playback settles paused

  Scenario: Atomic validation aborts finish when any pending command is invalid
    Given an active stroke animating on layer 1
    And a queue containing 2 valid strokes and 1 corrupted command with NaN coordinates
    When "Skip to end" is invoked
    Then domain validation rejects the corrupted command before committing any marks
    And the entire session snapshot remains unchanged immediately after rejection
    And playback status, active preview, queue, history, grants, and revisions are completely preserved

  Scenario: Reject agent finish with stale control epoch
    Given an agent submitted a drawing batch under control epoch 3
    And the human subsequently paused playback advancing the control epoch to 4
    When the agent runs "paint finish --generation <gen> --epoch 3 --grant <token>"
    Then the server rejects the request with HTTP 409 Conflict
    And no pending commands are committed
    And the server response informs the agent of the epoch mismatch

  Scenario: Reject agent finish without grant token when grant is required
    Given a paused studio session requiring an execution grant after human intervention
    When the agent runs "paint finish --generation <gen> --epoch <epoch>" without a grant token
    Then the server rejects the request with HTTP 409 Conflict
    And the pending queue remains untouched

  Scenario: Studio Skip to end button disabled when queue is empty or offline
    Given an active studio session with an idle playback queue and no active stroke
    Then the "Skip to end" button in the playback controls is visually and functionally disabled
    When the studio server is offline or disconnected
    Then the "Skip to end" button remains disabled

  Scenario: Agent paint finish on empty queue validates execution authority as safe no-op
    Given a paused studio session with an idle playback queue and no active stroke
    When the agent runs "paint finish --generation <gen> --epoch <epoch>" with valid execution authority
    Then the server validates current generation and control epoch
    And the document history, artwork revision, and layers remain unchanged
    And the CLI reports successful completion and 0 remaining without mutating session state

  Scenario: Reject contextless paint finish without generation and epoch
    Given a running studio session
    When the agent runs "paint finish" without generation and epoch flags
    Then the CLI rejects the command before sending a request
    And an actionable error requires explicit generation and epoch flags

  Scenario: Interleaved human Skip to end invalidates in-flight agent mutations
    Given an agent is preparing a secondary batch of commands against control epoch 2
    When the human clicks "Skip to end" in the studio
    Then the current pending queue completes immediately and control epoch increments to 3
    And any active continuation grant is revoked
    When the agent's secondary batch arrives with expected epoch 2
    Then the server rejects the batch with HTTP 409 Conflict
    And the canvas artwork preserves the completed state without corruption
