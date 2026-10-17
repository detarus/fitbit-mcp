---
name: nutrition
description: Create, review, save or correct Fitbit meal and water logs from text, labels or supported image input.
---

Use the current conversation's photo or text; the server does not perform image recognition. A photo cannot establish portion weight or hidden ingredients. Present assumptions, approximate values and relevant portion questions. Prefer a supplied label or user correction over a visual estimate.

Get one fitbit_request_id for a new occurrence, then fitbit_preview_meal or fitbit_preview_water. Reuse that ID for retries. Each dish's kcal/protein/fat/carbs describes the WHOLE portion; grams is the portion weight. Set source to photo-estimate, text-estimate, label or user-provided. Include assumptions. Use an explicit RFC3339 timestamp with the user's timezone offset and a supported mealType.

Show the draft before saving. Call fitbit_commit only after explicit user intent to save this reviewed content. Inspect every item: only verified means creation and read-back succeeded. Do not claim a meal was fully saved on partial/unknown results. Use fitbit_operations to find interrupted IDs and fitbit_reconcile after failures; never create a new request ID to bypass an uncertain write.

fitbit_cancel_draft cancels untouched drafts. For corrections, use fitbit_preview_correction (or fitbit_preview_water_correction) with the original operation ID and a new request ID. Show original and replacement; explain deletion before replacement is non-atomic. Only commit after explicit intent to replace. On partial results inspect BOTH IDs, reconcile uncertain ones and resume the same correction. Never cancel a correction that already began deleting originals or start another one to bypass an error. fitbit_remove removes this operation's known records. Reconciliation reads stable IDs without repeating creates/deletes; 404 may be delayed visibility. Legacy unknown creates need manual diary inspection.

Results appear in Google Health and the conversation. Fitbit Air has no screen. Do not promise operation in web/mobile chats just because the local CLI works.
