Feature: Native agent painting executable
  Agents use an installed paint command to draw and inspect a human-observable studio.

  Scenario: Learn the tool away from the checkout
    Given the native executable is installed on PATH
    And my current directory is outside the repository
    And no studio is running
    When I run help, guide, version, or shell completion
    Then the requested instructions are printed successfully
    And the executable uses its embedded resources

  Scenario: Draw through the existing command contract
    Given an isolated studio is running
    When I submit strokes, shapes, fills, and layer changes with paint
    Then the studio receives the same declarative JSON commands as existing clients
    And marks appear in the requested order
    And invalid arguments are rejected before mutation

  Scenario: Preserve human direction
    Given the human has paused a painting and left feedback
    When I inspect status, wait, watch, or view
    Then the pause and feedback remain intact
    And wait returns promptly with the paused state

  Scenario: Capture the canvas from an installed binary
    Given a studio snapshot has layers, erasure, and a partially drawn active stroke
    When I run paint view outside the repository
    Then an actual PNG includes the active partial stroke
    And paint export includes committed artwork
    And crop and scale produce the requested bounded dimensions
    And the shared renderer preserves layer compositing and brush appearance

  Scenario: Clean up a failed capture
    Given capture owns a temporary browser, profile, and loopback listener
    When the browser fails, the deadline expires, or I interrupt capture
    Then capture exits unsuccessfully within bounded time
    And its owned resources are cleaned up
    And an existing output file is preserved

  Scenario: Keep local data local
    When a configured endpoint is remote or redirects away
    Then the CLI rejects the request
    And proxy configuration does not forward studio traffic
    And imports, HTTP responses, and PNG results have explicit size limits

  Scenario: Produce an auditable native build
    Given the installed Go toolchain is available
    When I build and verify the CLI with module networking disabled
    Then the build uses only standard-library dependencies
    And verification rejects external modules and oversized source files
    And a single native executable contains the instructions and renderer assets
