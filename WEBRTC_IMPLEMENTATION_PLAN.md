# WebRTC Implementation Plan

## Goal
Add a real-time WebRTC-based file transfer mode to this project while keeping the existing link-based upload/download flow as a reliable fallback.

## Current Implementation (As-Is)
- Frontend: single-page upload UI in `app/components/FileUpload.tsx`.
- Upload path: `POST /api/upload` in `app/api/upload/route.ts`.
- Download path: `GET /api/download/[filename]` in `app/api/download/[filename]/route.ts`.
- Storage: files written to `/tmp/packet-post-uploads` (via `tmpdir()`), cleaned up probabilistically if older than 1 hour.
- Product behavior today: asynchronous link sharing (sender uploads now, receiver can download later).

## Why WebRTC Is an Additive Mode
- Current mode is asynchronous and server-stored.
- WebRTC data channel mode is peer-to-peer and generally synchronous (both peers online).
- Replacing existing upload/download would remove an important capability.
- Recommended approach: keep both modes.

## Proposed Architecture (Earlier Recommendation, Captured)
1. Keep existing HTTP upload/download as fallback.
2. Add a new **Live transfer (WebRTC)** mode in the client UI.
3. Add signaling (WebSocket) to exchange SDP/ICE between peers.
4. Use `RTCPeerConnection` + `RTCDataChannel` for file chunk transfer.
5. Use STUN initially; deploy TURN for NAT/corporate-network reliability.
6. If WebRTC setup fails in ~10-15 seconds, fall back to `/api/upload`.

## Client-Side Interface Plan
Add a dedicated UI for live P2P transfer with:
- Mode/role selection: `Sender` or `Receiver`.
- Session handling: `Create transfer` / `Join transfer`.
- Shareable transfer code or link.
- File picker for sender.
- Connection status: idle, signaling, connecting, connected, failed.
- Transfer progress: bytes sent/received and percentage.
- Error + retry controls.
- Fallback action: upload via current server link flow.

## Backend + Signaling Plan

### A) Transfer Session API
Create endpoints for ephemeral sessions:
- `POST /api/transfer/create`
  - returns `transferId`, sender token, expiry.
- `POST /api/transfer/join`
  - validates join request and issues receiver token.

Session data (temporary):
- `transferId`
- `senderToken`
- `receiverToken` (issued on join)
- `expiresAt`
- state (`created`, `joined`, `closed`, `expired`)

### B) Signaling Channel
Use WebSocket signaling server for:
- `offer`
- `answer`
- `ice-candidate`
- `ready`
- `cancel`
- `error`

Notes:
- Signaling does not carry file bytes.
- It only coordinates peer connection setup.

### C) ICE Configuration
- Start with public STUN servers for development.
- Add TURN credentials for production reliability.
- Expose `iceServers` via server config/env.

## WebRTC File Transfer Protocol
Use one reliable ordered data channel (initially):
- Metadata message first:
  - original filename
  - mime type
  - total size
  - optional checksum
- File sent in chunks (e.g., 64KB-256KB).
- Receiver reassembles chunks into a `Blob`.
- Backpressure handling via `bufferedAmount` and `bufferedAmountLowThreshold`.
- Optional post-transfer integrity verification (checksum).

## Security and Abuse Controls
- Ephemeral transfer IDs with short TTL (10-30 min).
- One-time session tokens for sender/receiver.
- Rate-limit session creation and signaling events.
- Validate payload size and message schema on signaling server.
- Optional E2E encryption key in URL fragment for metadata/chunk encryption.

## Incremental Delivery Plan

### Phase 1: Client Interface Skeleton
- Add UI for live transfer mode and state model.
- No full signaling integration yet.
- Keep current upload flow unchanged.

### Phase 2: Session APIs + Signaling Types
- Add typed message protocol in `lib/webrtc/protocol.ts`.
- Implement `transfer/create` and `transfer/join`.

### Phase 3: WebSocket Signaling Service
- Implement signaling server and room/session mapping.
- Wire UI events to signaling messages.

### Phase 4: Peer Connection + Data Channel Transfer
- Implement sender/receiver logic, chunking, progress, and completion.
- Add fallback to `/api/upload` when connect fails.

### Phase 5: Hardening + Reliability
- TURN deployment.
- Retry/resume strategy.
- Metrics/logging.
- Abuse controls and tighter validation.

## Implementation Status (Current)
- Phase 1: Completed
- Phase 2: Completed
- Phase 3: Completed (WebSocket signaling server + UI signaling wiring)
- Phase 4: Completed (SDP/ICE + RTCDataChannel chunk transfer + sender fallback upload)
- Phase 5: Completed (ICE config endpoint, retry path, metrics, and abuse/rate-limit validation)

## Phase 6: Migration Plan to Supabase (Signaling + Shared Session State)

### Migration Objective
Move from in-memory session/signaling coordination to Supabase so WebRTC live mode works reliably across multiple app instances and does not depend on a dedicated local `server/signaling.cjs` process.

### What Will Change
- Replace `lib/webrtc/sessionStore.ts` in-memory persistence with Supabase Postgres tables.
- Replace WebSocket signaling transport (`server/signaling.cjs`) with Supabase Realtime channels.
- Keep the current WebRTC data channel transfer logic and fallback upload logic in `app/components/WebRTCTransfer.tsx`.
- Keep existing `/api/upload` and `/api/download` flows unchanged.

### Target Architecture
1. Next.js API routes continue creating/joining sessions.
2. API routes use Supabase server client (service role key) to read/write transfer session rows.
3. Browser clients subscribe to a Supabase Realtime channel per `transferId` for signaling messages (`offer`, `answer`, `ice-candidate`, `ready`, `cancel`, `error`).
4. Session validity, single-receiver join semantics, and token checks are enforced by DB constraints + transactional route logic.
5. Existing client state machine (connecting/transferring/fallback) remains the control plane.

### Proposed Supabase Data Model
Use Postgres as source of truth for session lifecycle.

```sql
create table webrtc_transfer_sessions (
  transfer_id uuid primary key default gen_random_uuid(),
  transfer_code text not null unique,
  sender_token text not null,
  receiver_token text unique,
  state text not null check (state in ('created','joined','closed','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index webrtc_transfer_sessions_expires_at_idx
  on webrtc_transfer_sessions (expires_at);
```

Optional (if you want DB-backed observability/audit):

```sql
create table webrtc_signaling_events (
  id bigint generated always as identity primary key,
  transfer_id uuid not null references webrtc_transfer_sessions(transfer_id) on delete cascade,
  from_role text not null check (from_role in ('sender','receiver')),
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
```

### API Refactor Plan
Keep endpoint contracts stable to avoid UI rewrites.

- `POST /api/transfer/create`
  - Generate `transfer_code`, `sender_token`, `expires_at`.
  - Insert row in `webrtc_transfer_sessions`.
  - Return current response shape unchanged.

- `POST /api/transfer/join`
  - Validate transfer code format and TTL.
  - Transactionally set `receiver_token` and `state='joined'` only when receiver is empty and not expired.
  - Return current response shape unchanged.

- New optional endpoint: `POST /api/transfer/close`
  - Marks session `closed` after successful transfer/cancel.
  - Improves cleanup and reduces stale joins.

- Cleanup job
  - Scheduled SQL or cron to mark/delete expired sessions.
  - Also remove stale signaling records if `webrtc_signaling_events` is used.

### Client Signaling Refactor Plan
In `app/components/WebRTCTransfer.tsx`:
- Replace raw `WebSocket` lifecycle (`join-room`, `relay`, `leave-room`) with Supabase Realtime channel subscribe/unsubscribe.
- Publish signaling payloads as channel events with the same typed `SignalPayload`.
- Filter incoming events by `transferId` and ignore self-originated events.
- Keep existing peer connection creation, data channel chunking, progress, and fallback paths unchanged.

### Security and Abuse Controls in Supabase
- Enable RLS on `webrtc_transfer_sessions`.
- Prefer server-side access via service role from Next.js routes; do not expose service role in browser.
- If direct client DB access is ever added, enforce row-level checks keyed by sender/receiver token and expiry.
- Keep API rate-limit behavior; migrate in-memory limiter to shared store later (Redis/Supabase-backed) if needed.
- Keep payload size/type validation in client and route boundary before publishing signaling messages.

### Environment and Config Changes
Add:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_SCHEMA` (optional, default `public`)

Deprecate after cutover:
- `NEXT_PUBLIC_SIGNALING_URL`
- `SIGNALING_HOST`
- `SIGNALING_PORT`
- `SIGNALING_MAX_MESSAGE_BYTES`
- `SIGNALING_MAX_MESSAGES_PER_10S`
- `SIGNALING_ROOM_IDLE_TTL_MS`
- `SIGNALING_LOG_EVENTS`

### Execution Phases

### Phase 6.1: Foundation
- Add Supabase client utilities (server + browser).
- Add migration SQL for session table.
- Add env plumbing and validation.
- Exit criteria: local create/join can read/write sessions from Supabase.

### Phase 6.2: API Cutover
- Refactor `transfer/create` and `transfer/join` routes to Supabase.
- Keep existing response contracts.
- Exit criteria: no usage of `lib/webrtc/sessionStore.ts` in runtime path.

### Phase 6.3: Signaling Transport Cutover
- Replace WebSocket signaling path in `WebRTCTransfer.tsx` with Supabase Realtime channel events.
- Maintain reconnect behavior and error states.
- Exit criteria: end-to-end sender/receiver connection succeeds without `server/signaling.cjs`.

### Phase 6.4: Cleanup and Hardening
- Remove unused signaling server runtime/script.
- Update docs and `.env.example`.
- Add metrics/logging hooks for create/join failure and signaling delivery failures.
- Exit criteria: production config no longer requires custom signaling service.

### Rollout Strategy
1. Ship behind a feature flag: `WEBRTC_SIGNALING_PROVIDER=ws|supabase`.
2. Internal test on Supabase path first (classic upload unaffected).
3. Gradually ramp traffic to Supabase signaling.
4. Keep WebSocket implementation available for fast rollback until stability is proven.

### Rollback Plan
- Toggle `WEBRTC_SIGNALING_PROVIDER=ws`.
- Restore `NEXT_PUBLIC_SIGNALING_URL` runtime config.
- Leave Supabase tables intact (no destructive rollback needed).

### Risks and Mitigations
- Realtime delivery ordering differences:
  - Mitigation: keep SDP/ICE idempotent handlers and strict message validation.
- Token leakage risk in client events:
  - Mitigation: never publish service keys; avoid embedding long-lived secrets in channel payloads.
- Expired session race conditions:
  - Mitigation: enforce expiry/state checks in transactional join update.

### Validation Checklist
- Sender can create session and receive code.
- Receiver can join exactly once per code.
- Offer/answer/ICE exchange works over Supabase Realtime.
- File transfer completion unchanged.
- Fallback upload still triggers on connection failure.
- Multi-instance deployment works consistently for create/join.

## Migration Impact Map
- Keep as-is:
  - `app/components/FileUpload.tsx` (classic mode UI)
  - `app/api/upload/route.ts` (classic upload)
  - `app/api/download/[filename]/route.ts` (classic download)
  - `lib/webrtc/protocol.ts` (signaling payload contracts)
- Refactor:
  - `app/components/WebRTCTransfer.tsx` (WebSocket transport to Supabase Realtime transport)
  - `app/api/transfer/create/route.ts` (in-memory store to Supabase persistence)
  - `app/api/transfer/join/route.ts` (in-memory store to Supabase persistence)
- Remove after cutover:
  - `server/signaling.cjs`
  - `npm run signal` script in `package.json`
  - signaling-specific env vars in `.env.example`
- Add:
  - Supabase client utilities under `lib/` (server + browser)
  - SQL migrations for transfer session table (and optional signaling audit table)

## Remaining Decisions
- Keep signaling payloads ephemeral-only in Realtime channels vs persist signaling events in Postgres for audits.
- Final TTL policy for sessions (fixed 15 min vs caller-configurable within a bounded range).
- Whether to add `transfer/close` endpoint immediately or defer to cleanup-on-expiry in first cut.
- Whether to migrate rate limiting to a shared backend in the same release or as Phase 6.5.

## Testing Plan
- Unit:
  - protocol encode/decode validation
  - session token/TTL logic against Supabase-backed records
- Integration:
  - create/join flow against database transactions
  - signaling handshake exchange over Supabase Realtime
- Browser E2E:
  - sender/receiver successful transfer
  - fallback path when P2P fails
  - large file behavior and progress accuracy

## Success Criteria
- Users can choose link mode or live P2P mode from the UI.
- Live mode can transfer files between two browsers with progress and completion.
- Connection failures degrade gracefully to server-upload mode.
- Existing upload/download behavior remains fully functional.
