# dropr (Packet Post)

A modern, self-hosted file sharing app built with Next.js. Share files via classic uploads or live browser-to-browser transfers using WebRTC.

## Features
- Classic uploads with shareable, temporary download links
- Live WebRTC file transfers (sender/receiver with transfer codes)
- Optional fallback to classic upload when live transfer fails
- Supabase-backed transfer sessions and optional Supabase Realtime signaling
- Configurable upload limits and ICE server configuration
- Automatic best-effort cleanup of temporary files
- No user accounts required

## Quick Start

### Prerequisites
- Node.js 18+
- pnpm, npm, or yarn

### Install
```bash
pnpm install
```

### Development
```bash
pnpm dev
```
Open `http://localhost:3000`.

### Production
```bash
pnpm build
pnpm start
```

## Configuration

### Upload limits
- Client-side classic upload limit is currently enforced in the UI.
- Server-side limit is controlled by `WEB_UPLOAD_MAX_BYTES` (default: 25 MB).

### WebRTC
- `WEBRTC_SIGNALING_PROVIDER=ws|supabase`
- `NEXT_PUBLIC_SIGNALING_URL` (when using `ws` provider)
- `WEBRTC_ICE_SERVERS_JSON` (JSON array of ICE server configs)
- `WEBRTC_SESSION_TTL_MINUTES` (default 15, min 10, max 30)
- `WEBRTC_CREATE_RATE_LIMIT_PER_MIN` (default 20)
- `WEBRTC_JOIN_RATE_LIMIT_PER_MIN` (default 60)
- `WEBRTC_LOG_EVENTS=1` (optional console metrics)

### Supabase (required for session storage)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_SCHEMA` (default: `public`)

See `docs/supabase/README.md` for schema setup.

## Storage & File Lifecycle
- Uploaded files are stored in the OS temp directory at `os.tmpdir()/packet-post-uploads`.
- Files are served through `GET /api/download/[filename]`.
- Cleanup is best-effort and runs probabilistically during uploads; files older than 1 hour are deleted when cleanup runs.
- On serverless platforms, temp storage may be ephemeral.

## API Endpoints

### `POST /api/upload`
Upload a file via `multipart/form-data` with a `file` field.

### `GET /api/download/[filename]?name=<original-name>`
Download a previously uploaded file.

### `GET /api/transfer/config`
Returns ICE servers, max upload bytes, and signaling provider.

### `POST /api/transfer/create`
Creates a transfer session and returns a transfer code and sender token.

### `POST /api/transfer/join`
Joins a transfer session using a transfer code and returns a receiver token.

### `POST /api/transfer/telemetry`
Accepts client signaling delivery events.

### `GET /api/transfer/metrics`
Returns in-memory transfer counters.

## Project Structure
```
app/
  api/
    upload/
    download/[filename]/
    transfer/
  components/
    FileUpload.tsx
    WebRTCTransfer.tsx
lib/
  supabase/
  webrtc/
```

## Deployment Notes
- When using the WebSocket signaling provider, you must run a compatible signaling server and set `NEXT_PUBLIC_SIGNALING_URL`.
- For Supabase signaling, ensure Realtime is enabled and the schema is applied.
