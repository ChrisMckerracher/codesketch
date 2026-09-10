# Requests

[`index.mjs`](index.mjs) coordinates ordered browser reads and mutations over
the studio API. `StudioRequests` accepts snapshots, tracks instance and
document-generation identity, and serializes writes.

Validation errors, stale conflicts, and uncertain transport failures receive
distinct outcomes. A stale or uncertain mutation invalidates synchronization;
queued unsent mutations are rejected when identity rotates.

Pause has priority and uses a dedicated handshake path. Reads coalesce, can
force a full refresh after invalidation, and apply only accepted current
snapshots. Successful acknowledgements update the coordinator snapshot.

The coordinator depends on [`../api.mjs`](../api.mjs) and model acceptance
callbacks. Coverage: `studio-request-order.test.mjs`,
`studio-request-reads.test.mjs`, and `studio-request-pause.test.mjs`.
