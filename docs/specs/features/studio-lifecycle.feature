# Parent bead: paint-s86 (paint-s86.1, paint-s86.2, paint-s86.3, paint-s86.4, paint-s86.5)
Feature: Studio lifecycle ownership and verified recovery
  As a Codesketch user or painting agent
  I want the native CLI to own studio process lifecycle, verified discovery, and durable recovery
  So that painting sessions start reliably, crashes recover the last persisted snapshot, and shut down safely

  Scenario: Bare paint command starts studio and opens browser
    Given no studio instance is running on the target port
    When I run "paint" without arguments
    Then the CLI verifies packaged assets from apps/studio/assets.go
    And the CLI starts a background studio process with an authenticated capability token
    And the CLI polls studio readiness until the server reports healthy status
    And the CLI opens the studio URL in the default browser

  Scenario: Bare paint command reuses verified running instance
    Given an authenticated studio instance is already running and healthy
    When I run "paint" without arguments
    Then the CLI detects the existing instance and verifies its runtime digest
    And the CLI opens the existing studio URL in the default browser
    And no duplicate studio process is spawned

  Scenario: Browser launch failure leaves healthy studio available
    Given a newly started studio server has passed readiness verification
    When the system default browser fails to open or is unavailable
    Then the CLI outputs a diagnostic notification with the studio URL
    And the healthy studio process remains running and listening for connections

  Scenario: Headless studio start with no-open flag
    Given no studio instance is running on the target port
    When I run "paint studio start --no-open"
    Then a background studio process starts and passes readiness verification
    And the CLI outputs the listening URL, port, and process identifier
    And no browser window is opened

  Scenario: Observational studio status check without heartbeat refresh
    Given a running studio instance with an established comment listener heartbeat
    When I run "paint studio status"
    Then the CLI outputs the instance identifier, process identifier, and listening port
    And the studio comment listener heartbeat timestamp remains unchanged

  Scenario: Test isolation with ephemeral port and temporary data directory
    Given a test requires an isolated environment
    When I run "paint studio start --port 0 --data-dir /tmp/test-env --no-open"
    Then the studio binds to an assigned ephemeral loopback port
    And runtime persistence is written strictly to "/tmp/test-env"
    And sole production port 4317 and ".studio/session.json" remain untouched

  Scenario: Enforce single live writer per data directory on concurrent start
    Given an active studio process holds the writer lock on a data directory
    When a secondary studio process attempts to start using the same data directory
    Then the secondary startup reuses the verified running instance
    And the primary studio process continues writing safely without data corruption

  Scenario: Graceful shutdown with confirmed disk persistence
    Given a running studio instance with pending drawing commands and active history
    When I run "paint studio stop"
    Then the CLI sends an authenticated stop request containing the capability token and instance identifier
    And the server sets a stopping gate rejecting subsequent mutations with HTTP 503
    And the server quiesces playback, suspends ticks, and pauses the session
    And the server captures a fresh recovery snapshot and flushes it to disk
    And upon confirmed disk sync the server closes listeners and exits cleanly
    And the CLI reports successful studio shutdown

  Scenario: Failed persistence aborts shutdown and keeps studio live
    Given a running studio instance where the disk volume is full or unwriteable
    When a stop request is received by the server
    Then the server attempts to flush the recovery snapshot to disk
    And the disk flush operation fails
    Then the server returns HTTP 500 Internal Server Error
    And the server clears the stopping gate and remains live and paused
    And existing in-memory artwork, history, and queue remain intact for user recovery

  Scenario: Reject unauthorized lifecycle requests missing capability header
    Given a running studio instance with private capability protection
    When a client sends "POST /api/lifecycle/stop" without the "X-Codesketch-Capability" header
    Then the server rejects the request with HTTP 403 Forbidden
    And the studio process continues running unaffected

  Scenario: Reject browser-originated lifecycle requests
    Given a running studio instance
    When an HTTP request arrives at "/api/lifecycle/stop" with an "Origin" or "Sec-Fetch-Site" header
    Then the server rejects the request with HTTP 403 Forbidden
    And no lifecycle action or shutdown is performed

  Scenario: Persist active stroke progress and speed in recovery envelope
    Given a studio session actively playing a brush stroke with 45 percent progress at speed 2.0
    When persistence flushes the session state
    Then the recovery file is written with format "codesketch-recovery" and version 1
    And the recovery payload contains speed 2.0 and active progress 0.45
    And the active command is stored once at the head of the project queue
    And the complete recovery payload validates within the 8 MiB budget

  Scenario: Restore interrupted session paused with revoked execution grants
    Given a previously crashed session with a successfully persisted recovery snapshot
    When the studio starts and restores recovery state from the snapshot
    Then the session status is set strictly to paused
    And active stroke preview is reconstructed with derived duration matching progress 0.45
    And remaining commands form the uncommitted playback queue
    And active continuation grants are revoked requiring a fresh human grant to resume
    And a fresh instance identifier is assigned to the restored session

  Scenario: Reject malformed or legacy recovery files before server readiness
    Given a recovery file with format "codesketch" or version 0
    When the studio process initializes recovery
    Then recovery validation strictly rejects the obsolete file schema
    And the studio process terminates with an actionable diagnostic before opening its port
    And readiness verification fails cleanly

  Scenario: Startup preserves original corrupted recovery data on disk
    Given a corrupted recovery file with unparseable JSON exists in the data directory
    When the studio process attempts to initialize recovery state
    Then the server halts startup with an actionable error before opening its port
    And the original corrupted recovery file remains preserved on disk without deletion or overwriting

  Scenario: Concurrent shutdown handling across CLI and server
    Given a running studio instance
    When multiple CLI lifecycle stop operations are initiated concurrently
    Then the CLI operations are serialized and idempotent
    And when concurrent authenticated HTTP stop requests reach the server
    Then the server authenticates the capability and coalesces them into a single shutdown operation
    And the shutdown executes once with a single atomic flush

  Scenario: Reject running instance on runtime digest mismatch
    Given a running studio server on the target port with a mismatched content digest
    When I run "paint studio status" or "paint"
    Then the CLI detects the digest mismatch and rejects connection without automatic reader fallback
    And the CLI reports that an incompatible studio instance is occupying the port

  Scenario: Detect port collision with unauthenticated alien process
    Given port 4317 is occupied by an unrelated foreign process
    When I run "paint studio start"
    Then the CLI detects an alien listener failing Codesketch capability verification
    And the CLI halts with an error reporting that port 4317 is occupied
    And the alien process is not killed, terminated, or hijacked
