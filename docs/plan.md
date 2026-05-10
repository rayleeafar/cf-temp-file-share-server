Good, that resolves the ambiguity. The namespace code is derived from the auth token — so the same token always produces the same 4-digit namespace. Let me refine the plan with this clarification.

## Goal

Change shared file URLs from `/api/files/<uuid>` to `/<namespace_code>/<six_random_char>` where the namespace is a deterministic 4-digit code derived from the auth token, making URLs significantly shorter.

## Context

Cloudflare Pages app using R2 for storage. Files upload via `POST /api/upload`, stored with UUID keys, served from `GET /api/files/:id`. No database. The auth token (optional, user-supplied) is stored as R2 custom metadata for file-listing. The user clarified that the `namespace_code_number` should be a random-looking 4-digit code deterministically derived from the auth token — meaning all uploads sharing the same token share the same namespace.

## Acceptance Criteria

- **AC-1: New uploads generate short-format URLs in the form `<base_url>/<namespace_code>/<six_random_char>`**
  - `functions/api/upload.js`: when `authToken` is provided, compute namespace = `(hash(authToken) % 9000) + 1000` (deterministic, no storage needed)
  - When `authToken` is empty, generate a random 4-digit namespace per upload (1000-9999)
  - Generate 6-character base62 short code via `crypto.getRandomValues()`
  - R2 key: `<namespace_code>/<short_code>` (e.g., `8472/Ab3xY9`)
  - Upload response returns `url` in the new format, `id` as `<namespace_code>/<short_code>`
  - All existing metadata fields (`filename`, `expires`, `authToken`) preserved

- **AC-2: Short-format download URLs (GET `/:namespace/:code`) resolve and serve files**
  - Create `functions/[namespace]/[code].js` handling `GET /:namespace/:code`
  - Constructs R2 key from URL params, calls `bucket.get(key)`
  - Returns 404 if key not found
  - Returns 410 with inline expired-page HTML if `customMetadata.expires` is past timestamp
  - Serves file with `Content-Type`, `Content-Disposition: attachment`, `Content-Length` headers

- **AC-3: Old `/api/files/<uuid>` URLs for previously uploaded files continue working**
  - `functions/api/files/[id].js` left untouched
  - New short-format files are NOT reachable via old UUID path

- **AC-4: File listing API (`GET /api/files?token=...`) returns short-format URLs for new-format files**
  - `functions/api/files/index.js` constructs URLs as `url.origin + "/" + namespace + "/" + code` for keys containing `/`
  - Falls back to old `/api/files/<uuid>` format for keys without `/` (existing UUID files)
  - Frontend copies whichever URL it receives, no changes needed

- **AC-5: Collision-resistant short-code generation**
  - Base62 alphabet `0-9a-zA-Z`, 62^6 = ~56 billion combinations per namespace
  - Upload handler uses `bucket.head(key)` to check before `bucket.put()`, retries with fresh code on collision (up to 3 attempts)

## Implementation Notes

**Namespace derivation from auth token:** Uses a simple hash function (sdbm or FNV-1a) on the auth token string, then mod 9000 + 1000 to get a 4-digit number. This is stateless — no database, no lookup, no first-upload registration. The same token always yields the same namespace.

**Anonymous uploads (no auth token):** A random 4-digit code is generated per upload. This means anonymous files are scattered across namespaces, which is fine since listing is by auth token only.

**Files to create:**
- `functions/[namespace]/[code].js` — new download handler for short-format URLs

**Files to modify:**
- `functions/api/upload.js` — add namespace derivation, short-code generation, new key format, new URL construction
- `functions/api/files/index.js` — detect old vs new key format, construct appropriate URL

**Files unchanged:**
- `functions/api/files/[id].js` — backward compat for old UUID files
- All `public/` files — frontend only reads `data.url` from JSON response, format agnostic

**Routing:** Cloudflare Pages Functions file-based — `functions/[namespace]/[code].js` with bracket segments auto-matches `GET /:namespace/:code`. No `_routes.json` needed. Two-segment dynamic routes don't conflict with single-segment static assets like `/style.css`.

**Verification commands (manual):**
1. Upload a file WITH authToken, verify response URL matches `/<4-digit>/<6-char>`
2. Upload a second file with SAME authToken, verify namespace matches (same 4 digits)
3. Upload a file with DIFFERENT authToken, verify namespace differs
4. Upload a file WITHOUT authToken, verify URL still in correct format
5. Visit a returned short URL in browser, confirm file downloads
6. Visit `/9999/ZZZZZZ` (non-existent), confirm 404
7. Visit an old UUID URL from a previously uploaded file, confirm it still downloads
8. List files by token, confirm new-format files show short URLs

## Out of Scope

- Deleting or migrating existing UUID-keyed files to the new format
- Database or KV store for namespace mappings (derivation is stateless)
- User-customizable namespace codes
- Rate limiting on upload
- Analytics or click tracking on short URLs