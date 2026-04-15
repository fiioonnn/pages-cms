# Design: Project Storage Settings, S3/R2 Upload, Image Crop & Compress

**Date:** 2026-04-15
**Status:** Approved

## Overview

Three features for the forked Pages CMS that work together:

1. **Project-based Storage Settings** — per-repo external storage (R2/S3) with encrypted credentials in PostgreSQL
2. **Cloudflare R2 & AWS S3 Upload** — media uploads routed to S3-compatible storage instead of GitHub
3. **Image Crop & Compress** — client-side crop dialog with optional compression before upload

## Codebase Context

- **Framework:** Next.js 16 (App Router), React 19, TypeScript
- **ORM:** Drizzle ORM with PostgreSQL
- **Auth:** Better Auth (GitHub OAuth + Magic Link)
- **UI:** shadcn/ui (Radix), Tailwind CSS v4, SWR
- **Projects** have no DB model — identified by `(owner, repo)` tuple
- **Existing encryption:** `lib/crypto.ts` uses AES-256-GCM with `CRYPTO_KEY` env var
- **Current uploads:** Browser → Base64 → POST `/api/{owner}/{repo}/{branch}/files/{path}` → GitHub API via Octokit

---

## Feature 1: Project-based Storage Settings

### Database Schema

New table `project_storage` in `db/schema.ts`:

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | serial | PRIMARY KEY | Consistent with all other tables |
| owner | text | NOT NULL | GitHub owner (user/org) |
| repo | text | NOT NULL | GitHub repo name |
| provider | text | NOT NULL, default "github" | "github" \| "cloudflare-r2" \| "aws-s3" |
| bucket | text | nullable | R2/S3 bucket name |
| account_id | text | nullable | Cloudflare R2 only |
| access_key_id | text | nullable | Encrypted (AES-GCM ciphertext) |
| access_key_iv | text | nullable | IV for access_key_id |
| secret_access_key | text | nullable | Encrypted (AES-GCM ciphertext) |
| secret_key_iv | text | nullable | IV for secret_access_key |
| public_url | text | nullable | e.g. https://media.example.com |
| region | text | nullable | AWS S3 region (R2 uses "auto") |
| endpoint | text | nullable | Custom S3-compatible endpoint |
| created_at | timestamp | NOT NULL, default now() | |
| updated_at | timestamp | NOT NULL, default now() | |

**Index:** `UNIQUE ON (lower(owner), lower(repo))` — case-insensitive, matching the collaborator table pattern.

**Key decisions:**
- `serial` PK instead of uuid — consistent with all 11 existing tables
- `owner + repo` instead of `project_id` — Pages CMS has no project model
- Separate IV columns per encrypted field — `encrypt()` returns `{ciphertext, iv}` pairs
- Provider as `text` not pgEnum — simpler Drizzle migrations
- Storage config is per-repo (branch-independent) — credentials belong to the repository, not a branch

### Encryption

Reuses existing `lib/crypto.ts` (`encrypt`/`decrypt` functions) with the `CRYPTO_KEY` env var. Two fields are encrypted: `access_key_id` and `secret_access_key`. Each gets its own IV column.

New helper in `lib/storage/settings.ts`:
- `encryptStorageCredentials(config)` — encrypts access_key_id + secret_access_key
- `decryptStorageCredentials(row)` — decrypts both fields
- `getStorageConfig(owner, repo)` — reads DB, decrypts, returns config
- `sanitizeStorageConfig(config)` — strips secrets for API response

### API Endpoints

All on `[owner]/[repo]` level (not branch-specific):

**`GET /api/[owner]/[repo]/storage`**
- Returns storage config without secrets (access keys masked)
- Auth: requires session + GitHub write access to repo
- Response: `{ provider, bucket, account_id, public_url, region, endpoint, has_credentials: boolean }`

**`POST /api/[owner]/[repo]/storage`**
- Saves storage config with encrypted credentials
- Auth: requires session + GitHub write access to repo
- Body: `{ provider, bucket, account_id, access_key_id, secret_access_key, public_url, region, endpoint }`
- If `access_key_id`/`secret_access_key` are empty strings, keeps existing encrypted values (allows updating other fields without re-entering secrets)

**`POST /api/[owner]/[repo]/storage/test`**
- Tests connection by uploading a small test file and deleting it
- Auth: requires session + GitHub write access to repo
- Body: same as POST storage (uses provided credentials, not necessarily saved ones)
- Response: `{ success: true }` or `{ success: false, error: "..." }`

### UI

New tab "Storage" in the project navigation, between "Collaborators" and "Cache".

**Route:** `app/(main)/[owner]/[repo]/[branch]/storage/page.tsx`

**Component:** `components/storage/storage-settings.tsx`

**Layout:**
- Provider dropdown: GitHub (Default) / Cloudflare R2 / AWS S3
- Conditional fields based on provider selection:
  - **GitHub:** Info text only — "Images and media are stored in the GitHub repository. No additional configuration needed."
  - **Cloudflare R2:** Bucket Name, Account ID, Access Key ID, Secret Access Key (password input), Public URL
  - **AWS S3:** Bucket Name, Region, Access Key ID, Secret Access Key (password input), Public URL (optional), Custom Endpoint (optional)
- Status display: success/error message after test
- Buttons: "Test connection" (outline) + "Save settings" (primary)

All UI text in English.

---

## Feature 2: Cloudflare R2 & AWS S3 Upload

### Storage Provider Abstraction

New directory `lib/storage/`:

**`lib/storage/types.ts`** — Interface definition:
```typescript
interface StorageProvider {
  upload(file: Buffer, path: string, contentType: string): Promise<{ url: string; size: number }>
  delete(path: string): Promise<void>
  list(prefix: string): Promise<MediaItem[]>
}
```

**`lib/storage/github.ts`** — `GitHubStorageProvider`
- Wraps existing Octokit upload logic extracted from `app/api/.../files/[path]/route.ts`
- `upload()`: calls `octokit.rest.repos.createOrUpdateFileContents()`
- `delete()`: calls `octokit.rest.repos.deleteFile()`
- `list()`: delegates to existing `getMediaCache()`

**`lib/storage/s3.ts`** — `S3StorageProvider`
- Single provider for both R2 and S3 (R2 is fully S3-compatible)
- Uses `@aws-sdk/client-s3` package
- R2 config: endpoint `https://{accountId}.r2.cloudflarestorage.com`, region `"auto"`
- S3 config: uses provided region and optional custom endpoint
- `upload()`: `PutObjectCommand`
- `delete()`: `DeleteObjectCommand`
- `list()`: `ListObjectsV2Command`

**`lib/storage/factory.ts`** — Factory function:
```typescript
async function getStorageProvider(
  owner: string,
  repo: string,
  token: string  // GitHub token for fallback
): Promise<StorageProvider>
```
- Reads `project_storage` table for `(owner, repo)`
- No record or `provider === "github"` → returns `GitHubStorageProvider`
- `provider === "cloudflare-r2"` or `"aws-s3"` → decrypts credentials, returns `S3StorageProvider`

### Integration Points

**`app/api/[owner]/[repo]/[branch]/files/[path]/route.ts`** (POST — media case):
- After the `case "media":` block, check storage provider
- If S3/R2: convert base64 to Buffer, call `provider.upload()`, return URL
- If GitHub: existing logic unchanged
- The content/settings cases remain untouched — only media uses external storage

**`app/api/[owner]/[repo]/[branch]/files/[path]/route.ts`** (DELETE — media case):
- If S3/R2: call `provider.delete()`
- If GitHub: existing logic unchanged

**`app/api/[owner]/[repo]/[branch]/media/[name]/[path]/route.ts`** (GET):
- If S3/R2: call `provider.list()` instead of `getMediaCache()`
- If GitHub: existing logic unchanged

### Image URLs in Content

- **GitHub storage:** relative path as before (e.g. `/images/cms/photo.jpg`)
- **R2/S3 storage:** full URL using `public_url` prefix (e.g. `https://media.example.com/photo.jpg`)

### Media Browser

When R2/S3 is active:
- Thumbnails load directly from `public_url` (no GitHub raw URL resolution needed)
- List fetched via S3 `ListObjectsV2Command`
- Delete/rename operations go through S3 API
- Upload goes to S3

When GitHub is active:
- Everything works exactly as before — no changes

---

## Feature 3: Image Crop & Compress

### Packages

- `react-easy-crop` — crop UI with touch/pinch support
- `browser-image-compression` — client-side compression in Web Worker

### Crop Dialog

**Component:** `components/media/image-crop-dialog.tsx`

Uses the existing `Dialog` component from `components/ui/dialog.tsx` (Radix-based).

**UI elements:**
- Crop area (react-easy-crop `<Cropper>`)
- Aspect ratio buttons: Free, 16:9, 4:3, 1:1, 3:4
- Zoom slider
- Compression toggle (default: OFF)
- Quality slider (10%-100%, visible only when compression is ON)
- Live size preview: "Original: 2.4 MB → Compressed: 680 KB (-72%)"
- Footer: "Skip" button (outline) + "Crop & Upload" button (primary)

**Behavior:**
- Dialog opens only for image files (checks `file.type.startsWith("image/")`)
- Non-image files bypass the dialog entirely
- "Skip" uploads the original file without crop or compression
- Compression is optional — user must toggle it on
- Quality slider defaults to 80% when enabled

### Technical Implementation

**Crop (Canvas API):**
```typescript
function getCroppedImage(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number }
): Promise<Blob>
```
- Creates offscreen canvas at crop dimensions
- Draws cropped region
- Returns Blob via `canvas.toBlob()`

**Compression (browser-image-compression):**
```typescript
import imageCompression from "browser-image-compression";

const compressed = await imageCompression(file, {
  maxSizeMB: undefined,  // no size limit, use quality
  initialQuality: quality, // 0.1 to 1.0
  useWebWorker: true,
});
```
- Runs in Web Worker (non-blocking)
- Only called when compression toggle is ON

### Integration into Upload Flow

Modified flow in `components/media/media-upload.tsx`:

1. User selects file (click or drag & drop)
2. If `file.type.startsWith("image/")` → open crop dialog
3. User crops (or clicks "Skip")
4. If compression toggle ON → compress via browser-image-compression
5. Result (Blob) → FileReader → Base64
6. POST to `/api/.../files/[path]` (unchanged endpoint)
7. Server-side: `getStorageProvider()` routes to GitHub or S3

The crop dialog sits between file selection and the existing upload logic. The API endpoint and server-side code don't need to know about crop/compress — they just receive base64 content.

---

## File Structure

### New Files

```
lib/storage/
  types.ts              # StorageProvider interface + MediaItem type
  github.ts             # GitHubStorageProvider (extracted from route.ts)
  s3.ts                 # S3StorageProvider (R2 + S3 via AWS SDK)
  factory.ts            # getStorageProvider() factory
  settings.ts           # encrypt/decrypt storage config helpers

app/api/[owner]/[repo]/storage/
  route.ts              # GET + POST storage settings
  test/route.ts         # POST connection test

app/(main)/[owner]/[repo]/[branch]/storage/
  page.tsx              # Storage settings page

components/storage/
  storage-settings.tsx  # Storage settings form component

components/media/
  image-crop-dialog.tsx # Crop + compress dialog

db/migrations/
  0012_*.sql            # project_storage table migration
```

### Modified Files

```
db/schema.ts                                          # + projectStorageTable
package.json                                          # + @aws-sdk/client-s3, react-easy-crop, browser-image-compression
app/api/[owner]/[repo]/[branch]/files/[path]/route.ts # media upload/delete → storage provider
app/api/[owner]/[repo]/[branch]/media/[name]/[path]/route.ts  # media list → storage provider
components/media/media-upload.tsx                      # + crop dialog before upload
components/media/media-view.tsx                        # thumbnails for S3 URLs
```

---

## Implementation Order

1. DB schema + migration (`project_storage` table)
2. Storage settings helpers (`lib/storage/settings.ts`)
3. Storage API endpoints (GET/POST/test)
4. Storage settings UI (tab + form component)
5. Storage provider abstraction (`types.ts`, `github.ts`, `s3.ts`, `factory.ts`)
6. Integrate storage provider into upload/delete/list endpoints
7. Update media browser for S3 URLs
8. Image crop dialog component
9. Image compression integration
10. Wire crop+compress into media-upload.tsx
11. `npm run build` — 0 errors

## Constraints

- Existing functionality must not break
- GitHub storage (default) works exactly as before when no external storage is configured
- All three features work together
- TypeScript throughout
- Error messages must be user-friendly
- New DB tables as Drizzle migrations
- Credentials never in `.pages.yml` or GitHub repo — only encrypted in PostgreSQL
- All UI text in English
