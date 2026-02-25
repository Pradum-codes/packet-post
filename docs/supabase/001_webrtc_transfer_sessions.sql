-- Phase 6.1 foundation schema for Supabase-backed WebRTC sessions
-- Run in Supabase SQL editor (or migration pipeline) before API cutover.

create extension if not exists pgcrypto;

create table if not exists public.webrtc_transfer_sessions (
  transfer_id uuid primary key default gen_random_uuid(),
  transfer_code text not null unique,
  sender_token text not null,
  receiver_token text unique,
  state text not null check (state in ('created', 'joined', 'closed', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists webrtc_transfer_sessions_expires_at_idx
  on public.webrtc_transfer_sessions (expires_at);

alter table public.webrtc_transfer_sessions enable row level security;

-- Keep direct client table access disabled for now; Next.js API routes use service role.
-- Add policy definitions when/if direct browser access is required.
