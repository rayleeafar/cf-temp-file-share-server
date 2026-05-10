# Expired-File Cleanup — R2 Lifecycle Rule

Objects uploaded with a time-limited expiration include a `expires` custom metadata field (Unix timestamp in seconds). This lifecycle rule automatically deletes those objects from R2 once their `expires` value is in the past.

## How it works

1. **Upload.js** stores `customMetadata: { expires: "<unix-timestamp>" }` on objects with a time limit.
2. **"Never" files** are stored **without** any `expires` metadata — the lifecycle rule never touches them.
3. **Lifecycle rule** periodically scans the bucket and deletes objects where the `expires` metadata key exists and its value is less than the current time.

## Setup Steps

### Option 1: Cloudflare Dashboard (recommended)

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **R2** → **temp-files** bucket.
3. Go to the **Lifecycle** tab.
4. Click **Add rule**.
5. Configure the rule:

   | Field | Value |
   |-------|-------|
   | Rule name | `expire-expired-files` |
   | Condition type | **Custom metadata** |
   | Metadata key | `expires` |
   | Operator | **less than** |
   | Value | `now` (or current Unix timestamp in seconds) |
   | Action | **Delete objects** |

6. Click **Save**.

This rule:
- **Deletes objects** whose `expires` metadata value is less than the current time.
- **Never touches** objects without the `expires` metadata key (permanent/"Never" files).
- Runs automatically — no cron or scheduled functions needed.

### Option 2: Wrangler CLI (basic rule, without custom metadata filter)

```bash
# Apply the basic lifecycle config (applies to ALL objects, not just metadata-filtered)
npx wrangler r2 bucket lifecycle set temp-files --file lifecycle.json
```

> **Note**: The CLI/API does not currently support custom metadata conditions in lifecycle rules. Use the Dashboard (Option 1) to add the metadata condition. The `lifecycle.json` file provides the basic rule structure but the metadata condition must be added via the Dashboard.

## Verification

1. **Upload a 1-minute-expiry file** → confirm it returns HTTP 200 on download.
2. **Wait 2+ minutes** → the lifecycle rule deletes the object from R2.
3. **Download the same link** → confirm HTTP 410 Gone.
4. **Upload a "Never" file** → confirm it always serves and is never affected by the lifecycle rule.
