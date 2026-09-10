# Offline artist skill

Expose the user's paint-with-references skill through `paint --artist-skill` and `paint guide --artist-skill`. Both print the same complete offline bundle; `--json` uses the existing text envelope. Ordinary `paint guide` retains its instrument reference. This is an explicitly authorized CLI feature on the shared integration branch.

Keep the skill and its two referenced Markdown documents under `docs/artist-skill`, copied from the user's Codex skill. Embed these exact local files through the root asset package. Output the main skill followed by clearly identified bundled references, with a short explanation that the relative reference paths identify sections included below. Preserve the skill's drawing, reference inspection, approval, and image-generation rules. Reading the flag prints instructions and does not perform painting actions or install a skill.

Reuse existing offline dispatch, flag parsing, JSON output, help and shell-completion mechanisms. The flag is boolean and restricted to the guide form and its top-level alias. Reject values, duplicates, extra positionals and unrelated command usage through ordinary strict CLI validation. Help and completion make the flag discoverable.

Expand supply-chain embed checks with only the three exact approved Markdown paths. Keep canonical renderer checks and rejection of arbitrary embeds. Regression checks cover complete bundle content, offline output with invalid studio/browser settings, aliases, JSON and invalid invocations. Verify the installed binary from another directory with Node absent from PATH. The lead owns copied documentation and delivery; the Herdr worker owns code and tests. Preserve existing artwork and task metadata.
