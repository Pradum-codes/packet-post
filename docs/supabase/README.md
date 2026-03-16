# Supabase WebRTC Session Store

This folder contains the SQL schema and setup notes for storing WebRTC transfer sessions in Supabase. Signaling can be done via Supabase Realtime when `WEBRTC_SIGNALING_PROVIDER=supabase`.

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

## Current behavior
- `POST /api/transfer/create` and `POST /api/transfer/join` use Supabase for sessions.
- Supabase Realtime is used for live signaling when the provider is set to `supabase`.
- WebSocket signaling remains available when `WEBRTC_SIGNALING_PROVIDER=ws`.

## Telemetry and metrics
- Client signaling delivery events are accepted by `POST /api/transfer/telemetry`.
- Aggregated counters are available via `GET /api/transfer/metrics`.
- Metrics are stored in memory and reset on deploy/restart.
