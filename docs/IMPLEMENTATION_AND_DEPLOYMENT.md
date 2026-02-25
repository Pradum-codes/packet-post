# WebRTC File Share: Implementation and Deployment Status

## Current status
The project has completed WebRTC migration Phases 6.1-6.4.

Implemented architecture:
- Session persistence for `create/join` uses Supabase PostgREST.
- Live signaling supports Supabase Realtime channels.
- Legacy WebSocket client path remains for rollback, but the in-repo signaling server runtime was removed.
- API and signaling telemetry hooks are implemented.

## Deployment model

### App server (required)
Responsibilities:
- Next.js UI
- classic upload/download APIs
- transfer create/join/config APIs
- transfer telemetry and transfer metrics APIs

Can run on:
- Vercel or any Node host

### Supabase project (required)
Responsibilities:
- `webrtc_transfer_sessions` storage
- Realtime signaling channels

## Required environment variables
See `.env.example`.

Primary values:
- `WEBRTC_SIGNALING_PROVIDER=supabase`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_SCHEMA`
- `WEBRTC_ICE_SERVERS_JSON`
- `WEB_UPLOAD_MAX_BYTES`
- `WEBRTC_CREATE_RATE_LIMIT_PER_MIN`
- `WEBRTC_JOIN_RATE_LIMIT_PER_MIN`
- `WEBRTC_LOG_EVENTS`

Optional legacy fallback:
- `NEXT_PUBLIC_SIGNALING_URL` (only if using `WEBRTC_SIGNALING_PROVIDER=ws`)

## Runtime telemetry hooks

### API-side counters
In-memory counters exposed at:
- `GET /api/transfer/metrics`

Tracked metrics:
- create request/success/failure
- join request/success/failure
- signaling delivery success/failure (from client telemetry)

### Client signaling telemetry ingestion
Endpoint:
- `POST /api/transfer/telemetry`

Accepted events:
- `signaling-delivery-success`
- `signaling-delivery-failure`

## What users can do now
- Classic mode: upload once, share link, asynchronous download later.
- Live mode: sender/receiver code-based P2P transfer with progress.
- Sender fallback upload when live transfer fails.

## Remaining production hardening
1. Move rate limiting from in-memory store to shared backend.
2. Add auth/session binding for signaling events if stricter trust boundaries are needed.
3. Add CI integration and E2E coverage for Supabase signaling flows.
4. Export metrics/logs to centralized observability backend.
