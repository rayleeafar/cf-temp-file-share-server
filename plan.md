## Goal

Build and deploy a Cloudflare Pages application that lets users upload files to an R2 bucket, share time-limited or permanent download links, and have expired files auto-removed — all deployed via the Wrangler CLI.

---

## Context

- The entire application (static frontend + API) lives in a single Cloudflare Pages project.
- **Pages Functions** (file‑based routing under `/functions`) provide the API layer — no separate Worker needed.
- **R2** is the blob store; object lifecycle policies handle automatic expiration, no cron/scheduler required.
- The free plan of Cloudflare Pages (500 builds/month, 100k requests/day, 30s CPU per Function invocation) is sufficient for light use; works around the 30s wall-clock limit with a 25 MB upload size cap.
- Wrangler v3+ is assumed (`wrangler` ≥ 4.0 in the plan).
- **Cloudflare authentication** uses `wrangler login` (OAuth) for interactive use, or `CLOUDFLARE_API_TOKEN` for CI/headless. The `CLOUDFLARE_ACCOUNT_ID` is auto-detected after login but can be set explicitly if needed.

---

## Acceptance Criteria

- **AC‑1: Upload flow**  
  A user can select a file, choose an expiration (1h, 6h, 24h, 3d, 7d, or **Never**), and upload it. The response contains a unique shareable URL.

  - *Key files*: `public/index.html`, `public/script.js`, `functions/api/upload.js`
  - *Edge case*: files larger than 25 MB are rejected client-side and server-side with a clear message.
  - *Edge case*: "Never" expiration stores the object **without** an `expires` metadata field — download handler treats missing `expires` as "valid indefinitely".
  - *Verification*: `npx wrangler pages dev` — upload a file with "Never" expiration, confirm the response includes a URL and no `expiresAt` field.

- **AC‑2: Download flow**  
  Visiting a share link serves the original file for download. Expired links return a 410 Gone page. Permanent (non-expiring) links always serve the file.

  - *Key files*: `functions/api/files/[id].js`, `public/expired.html`
  - *Edge case*: a non‑existent or malformed ID returns 404.
  - *Edge case*: an object with no `expires` metadata is served regardless of time.
  - *Verification*: download a fresh link → file is served. Upload a time-limited file, wait past expiration → same link → 410 page. Upload a "Never" file → always serves.

- **AC‑3: Expired‑file cleanup**  
  Objects that have an `expires` metadata value in the past are automatically deleted from R2. Objects without `expires` metadata (permanent files) are never touched by lifecycle rules.

  - *Key setup*: R2 lifecycle rule that deletes objects only when `expires` metadata exists AND is in the past.
  - *Cloudflare Dashboard step*: Add a custom lifecycle rule matching `expires` metadata condition.
  - *Verification*: upload a 1-minute-expiry file → after 2 minutes the object is gone. Upload a "Never" file → still present after any amount of time.

- **AC‑4: Deployment**  
  The user authenticates with Cloudflare, creates the R2 bucket, deploys, and verifies end-to-end.

  - *Key files*: `wrangler.toml`, `package.json`
  - *Credentials setup*: `npx wrangler login` (OAuth browser flow) or `export CLOUDFLARE_API_TOKEN=...` for headless/CI.
  - *One-time R2 setup*: `npx wrangler r2 bucket create temp-files`
  - *Verification*: public URL renders the upload page; upload, download, and expiration all work on the live domain.

---

## Implementation Notes

### Project scaffold

```
temp-file-server/
├── public/
│   ├── index.html          # Upload page (drag‑and‑drop + expiration picker)
│   ├── expired.html        # Stub shown when a link has expired
│   ├── style.css           # Minimal styling
│   └── script.js           # Client‑side upload logic (fetch + FormData)
├── functions/
│   └── api/
│       ├── upload.js        # POST handler — accepts multipart, stores in R2
│       └── files/
│           └── [id].js      # GET (serve file) and DELETE handlers
├── wrangler.toml            # Pages project config + R2 binding
├── package.json             # wrangler as devDependency, scripts for dev/deploy
└── .gitignore               # node_modules, .wrangler
```

### R2 binding name

Use `TEMP_FILES_BUCKET` as the binding name in `wrangler.toml`. Inside Functions it is accessed as `context.env.TEMP_FILES_BUCKET`.

### Expiration strategy (updated for "Never" support)

- The client sends an `expiresIn` value (seconds, clamped to max 7 days = 604800). If the user selects **"Never"**, the client sends `expiresIn: null`.
- `upload.js`:
  - If `expiresIn` is a number: calculate `Math.floor(Date.now() / 1000) + expiresIn` and store it as **custom metadata** key `expires` on the R2 object. Return `{ url, id, expiresAt }` in the JSON response.
  - If `expiresIn` is null/undefined: store the object **without** any `expires` metadata. Return `{ url, id }` (no `expiresAt` field).
- `[id].js` (GET):
  - Read the object. If not found → 404.
  - If the object has `expires` metadata AND `expires` is in the past → 410 (gone).
  - If the object has no `expires` metadata OR `expires` is in the future → serve the file with original `Content-Type` and `Content-Disposition: attachment`.
- **R2 lifecycle policy**: Single rule: "Delete objects where `expires` metadata exists and its numeric value is less than current time." This never touches objects without the `expires` metadata key, so permanent files are safe.

### File ID generation

Use `crypto.randomUUID()` (available in the Pages Functions runtime) for object keys. Return the full download URL in the response body.

### Upload size guard

Enforce a **25 MB max** client-side (before the fetch) and server-side (check `content-length` header). Server returns 413 if exceeded.

### Cloudflare authentication

The plan includes two documented credential paths so users don't get stuck:

1. **Interactive (recommended)**: `npx wrangler login` — opens a browser to authenticate with Cloudflare. Stores a OAuth token in `~/.wrangler/config/default.toml`. No manual token management needed.
2. **Headless / CI**: Generate an API token in the Cloudflare Dashboard (Account > API Tokens > Create Token, with `Cloudflare Pages` and `R2` edit permissions), then set:
   ```bash
   export CLOUDFLARE_API_TOKEN="your-token-here"
   ```
3. **Account ID**: Wrangler auto-detects the account after login. If it fails during deploy ("multiple accounts found"), the error message tells the user to add `account_id` to `wrangler.toml`. The plan documents where to find it (Dashboard → Workers & Pages → right sidebar).

### Key files content outline

**`wrangler.toml`**:
```toml
name = "temp-file-server"
compatibility_date = "2025-04-16"

[[r2_buckets]]
binding = "TEMP_FILES_BUCKET"
bucket_name = "temp-files"
```

**`package.json`**: