Feature: Artwork region comments and directed agent painting
  As a human painting director
  I want to select canvas regions and provide bounded spatial critique
  So that an autonomous painting agent can inspect, acknowledge, and address my comments accurately

  Scenario: Wait for pause acknowledgement before selection begins
    Given an agent is actively painting in the studio
    When the human activates the Comment tool
    Then the client requests a pause and waits for the server acknowledgement
    And the canvas displays a stabilized snapshot with captured artwork context

  Scenario: Abort selection when pause request fails
    Given an agent is actively painting in the studio
    When the human activates the Comment tool and the pause request fails
    Then the client aborts selection mode safely
    And an actionable notification informs the human that pause failed

  Scenario: Select a canvas region with reverse drag normalization
    Given the Comment tool is active on a stabilized canvas
    When the human drags backwards from coordinate (450, 300) to (120, 150)
    Then the draft rectangle is normalized to top-left (120, 150) with finite positive width 330 and height 150
    And an anchored comment composer opens with keyboard focus on the text input

  Scenario: Maintain anchored overlay positions and focus across window resize
    Given an anchored comment composer is open next to a region rectangle
    When the browser window is resized
    Then the composer popover and region overlay recalculate their screen positions to match canvas coordinates
    And keyboard focus remains within the active comment input

  Scenario: Create a whole-canvas comment via keyboard
    Given the studio has focus and playback is paused
    When the human activates the whole-canvas comment shortcut without dragging
    Then the comment composer opens without a region rectangle
    When the human enters "Establish a cooler ambient tone across the background" and submits
    Then a numbered comment is recorded with a null bounding box

  Scenario: Cancel draft selection with Escape and restore focus
    Given an open comment draft with a selected canvas region
    When the human presses Escape
    Then the draft rectangle and composer disappear
    And playback remains paused
    And keyboard focus returns to the canvas work surface

  Scenario: Preserve comment draft on network failure
    Given an open comment draft with text "Refine tree branch silhouettes"
    When the human submits the draft and the network request fails
    Then an error notification appears
    And the draft text and bounding rectangle remain preserved in the composer

  Scenario: Idempotent send retries and payload conflict detection
    Given an open comment draft assigned client request identifier "req-001" for the current document generation
    When the human submits the draft and the response times out
    And the human submits the draft again with the same request identifier "req-001" and identical payload
    Then the server validates matching document generation first
    And evaluates request identifier deduplication second returning the recorded comment
    And validates artwork revision third
    When a subsequent submission uses request identifier "req-001" with altered text
    Then the server rejects the submission with HTTP 409 Conflict

  Scenario: Stale draft context rejected preserving draft text for recovery
    Given an open comment draft capturing artwork revision 8
    When mid-flight queue ticks advance the artwork to revision 9 before draft submission
    And the human submits the comment
    Then the server rejects the submission due to stale artwork context
    And the draft text is preserved in the composer
    When the human clicks Reselect and picks the region on current artwork
    Then the submission succeeds with updated artwork context

  Scenario: Layer visibility or opacity change invalidates pending draft
    Given an open comment draft captured at artwork revision 10
    When a layer visibility toggles or opacity changes before draft submission
    Then the artwork revision advances to 11
    When the draft is submitted with expected revision 10
    Then the server rejects the submission due to stale artwork context
    And the draft text is preserved in the composer

  Scenario: Critique visible composite across overlapping visible layers
    Given a painting with background layer at opacity 1.0 and paint layer at opacity 0.8
    When the human selects a canvas region and records a comment
    Then the comment records visibleLayers containing both layers in document stacking order
    When the agent captures the region crop with paint view --crop
    Then the crop image contains the blended composite of both visible layers

  Scenario: Whole-canvas comment captured with full-frame paint view without crop
    Given a painting with a recorded whole-canvas comment having a null rectangle
    When the agent inspects the whole-canvas critique
    Then the agent captures the canvas using paint view without --crop
    And the capture contains the full-frame visible composite across all visible layers

  Scenario: Exclude hidden and zero-opacity layers from comment region crop
    Given a painting with a visible paint layer, a hidden sketch layer, and an overlay layer at opacity zero
    When the human submits a region comment
    Then the comment visibleLayers context contains only the visible paint layer
    When the agent captures the region crop with paint view
    Then marks from the hidden and zero-opacity layers contribute zero pixels to the crop

  Scenario: Active layer independence for region critiques
    Given a studio with layer "details" selected as the active drawing layer
    When the human drafts and sends a region comment
    Then the comment applies to the visible canvas composite rather than restricting to layer "details"
    And all visible layers with positive opacity are recorded in the comment context

  Scenario: Send comment and remain paused
    Given an open comment draft on a paused painting with pending queue commands
    When the human enters critique text and clicks Send
    Then the comment is saved in open status with current artwork context
    And the control epoch increments
    And playback remains paused with pending queue commands preserved
    And no continuation authorization is granted to the agent

  Scenario: Apply and continue grants scoped continuation and clears obsolete queue
    Given a paused painting with obsolete pending strokes at control epoch 3
    When the human selects a region, writes critique, and clicks Apply & continue
    Then the comment is saved in open status
    And the control epoch increments to 4
    And all pending commands in the queue are cleared
    And a continuation grant is issued for document generation and control epoch 4
    And the agent is authorized to resume playback for this grant

  Scenario: Continuation grant persists across correction batches until epoch change
    Given a painting has an active continuation grant for control epoch 4
    When the agent submits a first correction batch and resumes playback with the grant token
    Then the batch plays without requiring a new grant
    When the agent submits a second correction batch under the same control epoch
    Then the second batch is also accepted and authorized
    When the human clicks Pause or submits another comment
    Then the document generation is preserved but the control epoch increments to 5
    And the previous continuation grant for epoch 4 is immediately revoked

  Scenario: Agent staging allowed without grant while ungranted execution is rejected
    Given playback is paused due to human comments at control epoch 2
    When the agent submits replacement commands with play set to false for epoch 2
    Then the staged commands enter the queue without committing any canvas marks
    And the agent remains in listening state without verifying pixels or addressing critique
    When the agent attempts an immediate command execution or step without a grant
    Then the server rejects the request with HTTP 409 Conflict
    And the painting history and paused playback remain unchanged

  Scenario: Human Resume explicitly authorizes pending work
    Given playback is paused with staged replacement commands in the queue at control epoch 2
    When the human clicks Resume in the studio toolbar
    Then the server increments the control epoch to 3 and issues a continuation grant
    And playback begins executing the staged commands

  Scenario: Reset continuation grant and rotate generation on new session and project load
    Given a session with an active continuation grant for document generation "gen-1"
    When the human resets the session with new or loads a project
    Then the server instance identifier is preserved
    But the document generation rotates to a new random identifier
    And the control epoch resets to zero
    And all existing continuation grants are revoked immediately

  Scenario: Opaque cursor reconnect and reset delivery
    Given an agent polling with a cursor referencing a previous document generation
    When the agent posts a poll request with the mismatched cursor
    Then the server returns a reset flag and the complete retained comment list
    And the agent receives the new opaque cursor for subsequent polling
    When the agent polls again with the current cursor and no comments have changed
    Then the server returns an empty comment list

  Scenario: Complete comment lifecycle across agent and human actions
    Given a comment exists in open status with sequence number 1
    When the agent acknowledges the comment with expected document generation and sequence 1
    Then the comment status transitions to acknowledged with sequence number 2
    When the agent addresses the comment with expected document generation and sequence 2
    Then the comment status transitions to addressed with sequence number 3
    When the human director clicks Resolve
    Then the comment status transitions to resolved with sequence number 4
    When the human director clicks Reopen
    Then the comment status returns to open with sequence number 5
    And playback is paused and the active continuation grant is revoked

  Scenario: Reject delayed lifecycle edits after sequence advancement
    Given a comment in addressed status at sequence number 3
    When an agent attempts to acknowledge the comment specifying expected sequence 1
    Then the server rejects the delayed update with HTTP 409 Conflict
    And the comment status remains addressed

  Scenario: Stale revision badge displays Artwork changed
    Given an open comment created at artwork revision 10
    When subsequent marks advance the canvas to artwork revision 15
    Then the comment badge displays the label "Artwork changed"
    And the bounding rectangle remains visible as a spatial location reference

  Scenario: Ephemeral poller heartbeat expires without storage writes
    Given an external agent runtime sending explicit POST poll requests
    When the agent posts a poll heartbeat
    Then the server updates the last-seen poller timestamp in memory
    And no persistence file writes or artwork revision increments occur
    When polling ceases for five seconds
    Then the studio listener status transitions to "Not listening"

  Scenario: Region overlays excluded from artwork exports
    Given a painting with visible layers and multiple active region comments with numbered pins
    When the human exports a PNG or an agent runs paint export
    Then the generated PNG contains only the artwork marks and background
    And no numbered pins, bounding boxes, or draft overlays appear in the exported image

  Scenario: Save and load project version 2 with rich comments and visible layer context
    Given a painting with region comments, lifecycle states, visibleLayers arrays, and sequence metadata
    When the project is saved
    Then the output JSON is formatted as codesketch project version 2
    When the version 2 project is loaded into a fresh session
    Then all comments, bounding rectangles, visibleLayers context, and lifecycle timestamps are restored exactly

  Scenario: Obsolete project version 1 rejected explicitly
    Given an obsolete version 1 project file
    When the project is loaded into the studio
    Then the load request is rejected atomically with an error
    And no version 1 migration is performed
    And existing session state is preserved

  Scenario: Legacy paint feedback command removed from CLI
    Given an external agent attempting to run paint feedback
    When the command executes
    Then the command is rejected as an unknown command
    And the current comments commands are required

  Scenario: Bounded CLI comments wait with opaque cursor retention
    Given an external agent waiting for critique via paint comments wait
    When the human submits a region comment within thirty seconds
    Then the CLI comments wait command returns at the four-hundred-millisecond poll interval
    And the output includes the new comment identifier, region bounds, and opaque cursor
    When the agent initiates a subsequent wait passing the retained cursor via --since
    Then the wait command blocks until the next comments change, reset, or control event
    And does not immediately return existing comments

  Scenario: Enforce strict spatial and text limits
    Given an open comment composer
    When a submission attempts text exceeding two thousand characters or coordinates outside 1000x700
    Then the submission is rejected before recording
    And the composer alerts the director to correct the input

  Scenario: Late pause acknowledgement discarded after Escape during pause request
    Given the human clicks the Comment tool and the pause request is in flight
    When the human presses Escape before the server responds
    Then the client cancels comment selection mode immediately
    And when the server pause acknowledgement finally arrives
    Then the late acknowledgement is discarded by its activation token without opening a composer or activating selection

  Scenario: Pause acknowledgement superseded by document generation rotation
    Given the human clicks the Comment tool and the pause request is in flight
    When the document generation rotates due to a session reset or project load before the acknowledgement arrives
    Then the pending pause acknowledgement is superseded
    And the client resets to idle with an expiry notification
    And the stale acknowledgement activates no selection

  Scenario: Discard active manual brush stroke when entering comment mode
    Given a manual brush stroke drag is in progress on the canvas
    When the human presses C or activates comment mode
    Then the active partial stroke is discarded without committing marks to history
    And no transient draft pixels appear during comment region selection

  Scenario: Undo redo and clear invalidate active continuation grant
    Given an active continuation grant exists for the current document generation and control epoch
    When an agent executes an authorized undo, redo, or clear mutation with the grant token
    Then the command succeeds and commits the mutation
    And the control epoch increments
    And the active continuation grant is immediately invalidated
    And subsequent agent executions require re-observing state for a renewed authorization

  Scenario: Paired mutation context flags required and forwarded without automatic refresh
    Given an external agent invoking CLI mutation commands
    When the agent supplies generation without epoch or epoch without generation
    Then the command is rejected locally with a usage error before any network request
    When the agent supplies both generation and epoch with an optional grant token
    Then the flags are forwarded strictly as observed to the server
    And the CLI never performs an automatic GET request to refresh stale context upon HTTP 409 rejection

  Scenario: Guarded agent mutations require explicit generation and epoch on fresh sessions
    Given a fresh untouched session with docGeneration "gen-fresh" and control epoch 0
    When an external agent attempts a mutation command without generation and epoch flags
    Then the command is rejected locally with a usage error before any network request
    When the agent supplies --generation "gen-fresh" --epoch 0
    Then the mutation is accepted with no continuation grant required

  Scenario: Comments wait wakes immediately on reset even with empty delta
    Given an external agent running paint comments wait with a supplied since cursor
    When the studio returns a reset flag due to generation or instance rotation with an empty comments list
    Then the comments wait command returns immediately with the reset envelope
    And does not block for the remainder of the timeout

  Scenario: Status and comment list reads do not refresh poller heartbeat
    Given an external agent reading session state or listing comments
    When the agent sends GET requests to /api/state or /api/comments
    Then the server returns the requested snapshot without updating the poller heartbeat timestamp
    And the studio listening indicator remains unchanged
    And only explicit POST requests to /api/comments/poll refresh the listener heartbeat

  Scenario: Project load envelope wraps agent load while trusting internal recovery
    Given an external agent loading a project document via the API
    When the agent submits a project payload wrapped with source agent and mutation context
    Then the server enforces continuation grant checks against current document generation and epoch
    When the studio performs an internal recovery load with source human
    Then the project is loaded paused with generation rotated and grants reset without requiring context flags
