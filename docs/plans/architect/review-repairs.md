# Repair the independent quality-review findings

The September 9 review reproduced three failures: PNG capture rejects a valid pause during a fill or layer command, playback snapshots overwrite an opacity drag, and the layer row suppresses its visibility button's keyboard activation. The user authorized repairs and delivery.

## Capture contract

The painting renderer and session retain their existing semantics. Active strokes and shapes contribute transient pixels to preview. Fill and layer commands take effect when committed; a preview during their active interval shows committed artwork. Export uses committed artwork regardless of the active command. Preserve snapshot, pixel and resource budgets and strict validation of every value actually rendered.

The capture context distinguishes drawable transients from other playback commands. Export discards active work before validating transient drawing data. Unknown active command types remain errors for preview. Avoid duplicating the complete session reducer inside capture.

Add shared data fixtures covering stroke, rect, ellipse, fill, layer.add and layer.update. Node tests check these against real Session snapshots; Go capture tests consume the same fixtures. Include real-browser pixel checks for preview/export during non-drawing commands and retain rejection coverage for invalid drawable transients. Shared test data supplies a compatibility check across the JavaScript/Go boundary without a runtime dependency.

## Layer interaction contract

An opacity edit belongs to the layer selected when editing starts. Incoming playback snapshots preserve its local value through pointer interaction and asynchronous submission. A layer switch, removed target, cancellation or failure must settle the edit explicitly; an old response must not overwrite a newer edit. Keep ordinary selection and server-driven opacity changes synchronized when there is no local edit.

The layer row handles selection keys when the row itself is targeted. Its child visibility button retains native Enter and Space activation. Verify row selection and visibility activation independently.

## Ownership and verification

The capture worker owns capture implementation/tests plus shared contract fixtures and their Node tests. The studio worker owns layer UI implementation and browser regressions/runner integration. Both preserve canonical painting, live studio state and artwork. The lead owns documentation, task tracking, review and delivery on the authorized shared integration branch.

Regression checks reproduce the original failures before implementation and pass afterward. Browser tests use real pointer holds across playback updates, assert the committed opacity, exercise cancellation/selection behavior, and use isolated servers. Run npm verification, gated native studio/capture tests and studio browser checks. Install the committed native executable and push the verified release.
