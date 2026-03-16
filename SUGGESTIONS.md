# Suggested Changes

This file captures improvement ideas based on a walkthrough of the app. No changes have been applied here.

1. Unify file-size limits between the UI, API, and Next config to avoid confusing failures. Files: `app/components/FileUpload.tsx`, `lib/webrtc/network.ts`, `next.config.js`.
2. Update the README to match current storage and API behavior, including `/tmp` storage and `/api/download/...`. Files: `README.md`.
3. Make the drag-and-drop area keyboard-accessible with `role="button"`, `tabIndex`, and `onKeyDown`. File: `app/components/FileUpload.tsx`.
4. Show user-friendly error details in live transfer instead of the generic "Failed" label. File: `app/components/WebRTCTransfer.tsx`.
5. Consolidate JSON-LD to a single place (layout or page) to avoid duplicate schema markup. Files: `app/layout.tsx`, `app/page.tsx`.
6. Harden download headers for non-ASCII filenames by adding `filename*=` in `Content-Disposition`. File: `app/api/download/[filename]/route.ts`.
7. Add rate limiting to the telemetry endpoint to prevent abuse. Files: `app/api/transfer/telemetry/route.ts`, `lib/webrtc/rateLimit.ts`.
8. Make fallback messaging explicit in live transfer (e.g., "Live failed, uploading fallback link...") without hiding errors. File: `app/components/WebRTCTransfer.tsx`.
9. Consider persisting transfer metrics beyond in-memory storage for production use. File: `lib/webrtc/observability.ts`.
10. Make cleanup deterministic (or scheduled) rather than probabilistic to ensure old files are removed under low traffic. File: `app/api/upload/route.ts`.
11. Stabilize sitemap timestamps to avoid changing `lastModified` on every request. File: `app/sitemap.ts`.
12. Add `aria-live` to transfer status and progress so screen readers get state updates. File: `app/components/WebRTCTransfer.tsx`.
