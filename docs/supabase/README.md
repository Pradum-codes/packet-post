# Supabase Migration Bootstrap (Phase 6.1)

This folder contains initial SQL and setup notes for moving WebRTC transfer state/signaling control from in-memory storage to Supabase.

## Apply the schema
1. Open your Supabase project SQL editor.
2. Run `docs/supabase/001_webrtc_transfer_sessions.sql`.
3. Confirm `public.webrtc_transfer_sessions` exists.

## Configure environment variables
Set the following values in your app environment:
- `WEBRTC_SIGNALING_PROVIDER=supabase`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_SCHEMA=public`

## Current status
- `POST /api/transfer/create` and `POST /api/transfer/join` are Supabase-backed.
- Supabase Realtime is available for live signaling (`WEBRTC_SIGNALING_PROVIDER=supabase`).
- Legacy WebSocket signaling path remains available for rollback (`WEBRTC_SIGNALING_PROVIDER=ws`).
- Legacy in-repo signaling server runtime/script has been removed.

## Telemetry and metrics hooks
- Client signaling delivery events are accepted by `POST /api/transfer/telemetry`.
- Aggregated counters are available via `GET /api/transfer/metrics`.
