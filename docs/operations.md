# Durable writes and corrections

Previews only write a private local journal. Google writes require configured nutrition permission and explicit intent to save the displayed content. Keep the request ID for retries. A new occurrence, even the same meal tomorrow, gets a new ID. Journals are bound to both Google Health identity and OAuth client.

New records use a client-provided resource ID `fm-<operation UUID>-<dish index>`, persisted before POST. Google [documents client-provided DataPoint names](https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints). This API behavior still needs real-account verification. No automatic create retry is performed.

## Recover an interrupted operation

1. `fitbit_operations` lists IDs and states for the current account/mode, without dish details.
2. `fitbit_operation` shows the reviewed content and item states.
3. `fitbit_reconcile` performs only GET requests and local journal updates. If the exact stable ID exists and its payload matches, creation becomes verified. A 404 can mean delayed visibility; it never authorizes another POST.
4. Resume `fitbit_commit` on the SAME ID to send remaining pending dishes after the uncertain item has been resolved.

Legacy unknown creates without stable IDs cannot be safely matched by food/time. They stay uncertain and need manual diary inspection. If the service doesn't preserve a requested ID, creation stays unknown; don't bypass it with a new draft.

For an interrupted delete, reconcile reads the known resource: 404 confirms deletion, a matching readable record restores verified so a subsequent explicit removal can resume. Conflicting payloads or read failures stay unresolved.

## Correct a meal or water entry

Use `fitbit_preview_correction` or `fitbit_preview_water_correction` with `originalOperationId` and a NEW request ID. The original must be fully verified and active. Show the old and replacement contents before the user requests replacement.

Committing links the two journals, removes originals with verification, then saves replacement items with read-back. This is not atomic. During failure there may be no original and only some new dishes. Inspect BOTH IDs. Reconcile the uncertain journal, then commit the same correction again. A competing correction is blocked once one begins. An untouched correction can be cancelled; after original deletion starts it must be inspected and resumed.

The server only changes resources known to its journals. External diary edits can invalidate read-back. A separate removal affects the selected operation's own records, not arbitrary records or an entire correction chain.

Synthetic tests cover accepted writes with lost responses, crashes/restarts, 404 ambiguity, payload conflicts, delete uncertainty, concurrent clients and partial corrections. These are not evidence of real Google app behavior.

Untouched drafts expire after 24 hours. Once an operation starts, its existing ID can be resumed after a longer interruption; expiry does not force a new submission. Corrections check expiry before starting original deletion.
