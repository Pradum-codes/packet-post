# WebRTC File Share: Implementation and Deployment Status

## Is it fully deployable right now?
Short answer: it is deployable for development, staging, and low-scale/single-instance production. It is not fully production-hardened for multi-instance serverless deployment yet.

## Why this distinction matters
The WebRTC flow depends on ephemeral shared session state. Right now this state is stored in memory:
- transfer sessions (`lib/webrtc/sessionStore.ts`)
- API rate-limit counters (`lib/webrtc/rateLimit.ts`)
- signaling rooms and metrics (`server/signaling.cjs`)

In-memory state is fine for a single process but not reliable across multiple stateless instances. On Vercel, requests can hit different instances, so `create` and `join` may not share the same memory consistently.

## What is implemented (Phase 1-5)

### Phase 1: Client live-transfer UI skeleton
Need:
- Let users choose between classic upload and live P2P mode.

Implemented:
- Live mode UI with sender/receiver role selection and transfer state machine.

How:
- `app/components/FileUpload.tsx`
- `app/components/WebRTCTransfer.tsx`

### Phase 2: Session APIs + typed protocol
Need:
- Issue transfer IDs/codes/tokens and control short-lived sessions.

Implemented:
- Typed protocol contracts.
- `POST /api/transfer/create`
- `POST /api/transfer/join`
- Session lifecycle with TTL.

How:
- `lib/webrtc/protocol.ts`
- `lib/webrtc/sessionStore.ts`
- `app/api/transfer/create/route.ts`
- `app/api/transfer/join/route.ts`

### Phase 3: WebSocket signaling service
Need:
- Exchange signaling messages needed to establish peer connection.

Implemented:
- Dedicated signaling server with room routing and role mapping.

How:
- `server/signaling.cjs`
- Client signaling integration in `app/components/WebRTCTransfer.tsx`

### Phase 4: Peer connection + data channel transfer
Need:
- Actual file transfer over browser-to-browser data channel.

Implemented:
- SDP offer/answer exchange.
- ICE candidate exchange.
- Reliable ordered RTCDataChannel file chunk transfer.
- Receiver reassembly and download.
- Sender fallback to classic upload if live fails.

How:
- `app/components/WebRTCTransfer.tsx`

### Phase 5: Hardening + reliability
Need:
- Better resilience, abuse control, observability, and TURN/STUN configurability.

Implemented:
- API rate limits for transfer create/join.
- Transfer code format validation.
- Signaling server payload validation and size limits.
- Per-connection signaling message throttling.
- Idle room pruning and signaling metrics endpoint.
- Client reconnect attempts and manual retry.
- Runtime ICE config endpoint and env-driven ICE servers.

How:
- `app/api/transfer/create/route.ts`
- `app/api/transfer/join/route.ts`
- `app/api/transfer/config/route.ts`
- `lib/webrtc/rateLimit.ts`
- `lib/webrtc/network.ts`
- `server/signaling.cjs`
- `app/components/WebRTCTransfer.tsx`

## Current deployment topology

### App server
Responsibilities:
- Next.js UI
- classic upload/download APIs
- transfer create/join/config APIs

Can run on:
- Vercel or any Node host

### Signaling server
Responsibilities:
- Long-lived WebSocket service for signaling only

Can run on:
- Railway / Fly.io / Render / VM / container host

Not suitable for:
- Vercel serverless functions (persistent WS server not supported)

## Required environment variables
See `.env` and `.env.example`.

Key values:
- `NEXT_PUBLIC_SIGNALING_URL`
- `WEBRTC_ICE_SERVERS_JSON`
- `WEB_UPLOAD_MAX_BYTES`
- API/signaling rate-limit and safety knobs

## What users can do today
- Classic mode: upload once, share link, async download later.
- Live mode: sender and receiver connect via code, transfer file P2P with progress.
- Automatic fallback: sender can fall back to classic link upload when live transfer fails.

## What is still needed for fully production-ready Vercel architecture
1. Replace in-memory transfer session store with shared data store (Redis/Postgres) for create/join consistency.
2. Replace API rate-limit in-memory store with shared rate-limiter (Redis-based).
3. Optionally add auth/signature between API-issued session tokens and signaling server verification.
4. Add centralized logging/metrics sink and alerting for signaling and transfer API errors.
5. Add integration/E2E tests in CI for create/join + signaling + transfer fallback.
