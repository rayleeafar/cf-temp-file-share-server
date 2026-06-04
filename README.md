# Temp File Server

A Cloudflare Pages application for uploading and sharing files with time-limited or permanent download links, backed by Cloudflare R2 object storage.

Upload a file, get a shareable link, set an expiration time — no accounts, no databases, no sessions. Optionally use an auth token to group, list, and update your files.

## Features

- **Drag-and-drop upload** — Intuitive dark tech-style frontend with drag-and-drop file selection
- **Expiration control** — Choose from 1 hour, 6 hours, 24 hours, 3 days, 7 days, or permanent
- **Auth token grouping** — Optional token to group files under a namespace; token holders can list and update their files
- **File listing** — View all non-expired files associated with a given auth token
- **Inline file update** — Update file content and/or expiration without re-uploading from scratch
- **One-click copy link** — Copy shareable download URLs with a single click
- **Responsive design** — Dark cyberpunk/terminal-themed UI that works on desktop and mobile
- **No accounts required** — Upload without signing up; anonymous uploads get a random namespace
- **API docs** — Interactive Swagger/OpenAPI documentation at `/docs.html`

## Architecture

```
temp-file-server/
├── functions/
│   ├── [namespace]/
│   │   └── [code].js        # GET download by namespace/code key
│   └── api/
│       ├── upload.js         # POST upload file
│       └── files/
│           ├── index.js      # GET list files by auth token
│           ├── [id].js       # GET download by ID (backward compat)
│           └── update.js     # PUT update file content/expiration
├── public/
│   ├── index.html            # Main application page (dark tech UI)
│   ├── style.css             # Application styles
│   ├── script.js             # Frontend application logic
│   ├── expired.html          # Expired link page
│   ├── docs.html             # Swagger UI documentation page
│   └── spec/
│       └── openapi.yaml      # OpenAPI 3.0 specification
├── wrangler.toml             # Cloudflare Pages configuration
└── package.json
```

### Storage

Files are stored in an R2 bucket (`temp-files`) under keys in `namespace/code` format (e.g., `8472/Ab3xY9`). The namespace (4-digit number) is derived from the auth token hash via FNV-1a, or randomly generated for anonymous uploads. Each object stores custom metadata including the original filename, expiration timestamp, and auth token.

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- [Cloudflare account](https://dash.cloudflare.com/) with R2 enabled
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (installed via the project)

## Setup

1. **Clone the repository**

   ```bash
   git clone <repo-url>
   cd temp-file-server
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure Cloudflare credentials**

   ```bash
   npx wrangler login
   ```

4. **Create the R2 bucket**

   ```bash
   npm run create-bucket
   ```

5. **Start the development server**

   ```bash
   npm run dev
   ```

   The app runs at `http://localhost:18788` by default.

## Configuration

Configuration lives in `wrangler.toml`:

| Setting | Value | Description |
|---|---|---|
| `name` | `temp-file-server` | Cloudflare Pages project name |
| `compatibility_date` | `2026-05-03` | Workers runtime compatibility date |
| `pages_build_output_dir` | `public` | Static asset directory |
| R2 bucket binding | `TEMP_FILES_BUCKET` → `temp-files` | R2 bucket for file storage |

### Client-side limits

| Limit | Value |
|---|---|
| Maximum file size | 100 MB |
| Maximum expiration | 7 days |
| Supported expirations | 1h, 6h, 24h, 3d, 7d, Never |

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start local dev server on port 18788 |
| `npm run deploy` | Deploy to Cloudflare Pages |
| `npm run create-bucket` | Create the `temp-files` R2 bucket |

## API Overview

All API endpoints are served by Cloudflare Pages Functions. The full interactive documentation is available at `/docs.html` when the app is running.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/upload` | Upload a file. Accepts `multipart/form-data` with `file` (required), optional `expiresIn` (seconds), optional `authToken`. Returns `{ url, id, expiresAt? }`. |
| `GET` | `/{namespace}/{code}` | Download a file by its R2 key. Returns file content with download headers. Returns 410 if expired. |
| `GET` | `/api/files?token=...` | List all non-expired files for a given auth token. Returns `{ files: [...] }`. |
| `GET` | `/api/files/{id}` | Download a file by ID (backward compatibility with older UUID-style keys). |
| `PUT` | `/api/files/update` | Update an existing file's content and/or expiration. Requires `fileKey` and `authToken` in `multipart/form-data`. Optional `file` (new binary) and `expiresIn` (seconds or empty for permanent). Returns `{ url, id, expiresAt? }`. |

### Authentication

File updates and listing use a shared-secret auth token model. When a file is uploaded with an `authToken`, that token is stored in the object's metadata. The same token must be provided to:

- List files via `GET /api/files?token=...`
- Update a file via `PUT /api/files/update` with `authToken`

There is no user registration, login, or session management. Auth tokens are simple shared secrets — keep them private.

## Deployment

### Deploy to Cloudflare Pages

```bash
npm run deploy
```

This publishes the `public/` directory as a Cloudflare Pages site and deploys the Functions as serverless endpoints.

### One-click deploy

You can also deploy this project directly from the Cloudflare Pages dashboard:

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Go to **Workers & Pages** → **Pages**
3. Click **Connect to Git** and select your repository
4. Set build output directory to `public`
5. Deploy

## API Documentation

Interactive Swagger/OpenAPI documentation is available at `/docs.html` when the app is running. It describes all endpoints with parameters, request bodies, response codes, and example responses.

The OpenAPI spec file lives at `public/spec/openapi.yaml`.

## Development

The project uses [Wrangler](https://developers.cloudflare.com/workers/wrangler/) for local development:

```bash
npm run dev
```

The dev server starts on port 18788 and provides hot-reload for both static assets and Pages Functions.

## Tech Stack

- **Runtime:** Cloudflare Pages Functions (Workers runtime)
- **Storage:** Cloudflare R2 (S3-compatible object storage)
- **Frontend:** Vanilla HTML/CSS/JS with dark tech/cyberpunk theme
- **Docs:** Swagger UI (loaded from CDN) with OpenAPI 3.0 spec
- **Deployment:** Cloudflare Pages

## License

MIT
