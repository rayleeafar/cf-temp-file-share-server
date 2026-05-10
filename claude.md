# temp-file-server

A Cloudflare Pages application for uploading and sharing files with time-limited or permanent download links, stored in R2.

## Commands
- `npm run dev` — Start local dev server with `wrangler pages dev`
- `npm run deploy` — Deploy to Cloudflare Pages with `wrangler pages deploy`
- `npm run create-bucket` — Create the R2 bucket

## R2 Binding
The bucket is bound as `TEMP_FILES_BUCKET` in `wrangler.toml`. Accessed via `context.env.TEMP_FILES_BUCKET` in Pages Functions.

## Architecture
- Static frontend: `public/` directory
- API: `functions/api/` directory using Cloudflare Pages Functions
- Storage: R2 bucket `temp-files`
