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

## File-Level Implementation Map
- Existing:
  - `app/components/FileUpload.tsx` (main UI)
  - `app/api/upload/route.ts` (upload)
  - `app/api/download/[filename]/route.ts` (download)
- Planned additions:
  - `app/components/WebRTCTransfer.tsx` (live transfer interface)
  - `lib/webrtc/protocol.ts` (message types)
  - `app/api/transfer/create/route.ts`
  - `app/api/transfer/join/route.ts`
  - signaling server module/process (WebSocket)

## Open Decisions
- Where signaling server runs (inside app process vs separate service).
- In-memory sessions vs Redis for multi-instance deployment.
- Max file size allowed for live mode.
- Whether to support resume/reconnect in v1.

## Testing Plan
- Unit:
  - protocol encode/decode validation
  - session token/TTL logic
- Integration:
  - create/join flow
  - signaling handshake exchange
- Browser E2E:
  - sender/receiver successful transfer
  - fallback path when P2P fails
  - large file behavior and progress accuracy

## Success Criteria
- Users can choose link mode or live P2P mode from the UI.
- Live mode can transfer files between two browsers with progress and completion.
- Connection failures degrade gracefully to server-upload mode.
- Existing upload/download behavior remains fully functional.
