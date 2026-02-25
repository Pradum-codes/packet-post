import { NextRequest, NextResponse } from 'next/server';
import { CreateTransferRequest, CreateTransferResponse } from '@/lib/webrtc/protocol';
import { getClientIp } from '@/lib/webrtc/network';
import { consumeRateLimit, pruneRateLimitStore } from '@/lib/webrtc/rateLimit';
import { recordTransferMetric } from '@/lib/webrtc/observability';
import { createTransferSessionInSupabase } from '@/lib/webrtc/supabaseSessionStore';

export const runtime = 'nodejs';

const DEFAULT_CREATE_PER_MIN = 20;

function readCreateLimit() {
  const fromEnv = Number(process.env.WEBRTC_CREATE_RATE_LIMIT_PER_MIN);
  if (!Number.isFinite(fromEnv) || fromEnv <= 0) {
    return DEFAULT_CREATE_PER_MIN;
  }
  return Math.floor(fromEnv);
}

export async function POST(request: NextRequest) {
  recordTransferMetric('create_request');
  pruneRateLimitStore();
  const ip = getClientIp(request);
  const rate = consumeRateLimit(`create:${ip}`, readCreateLimit(), 60 * 1000);
  if (!rate.allowed) {
    recordTransferMetric('create_failure', { reason: 'rate-limited' });
    return NextResponse.json(
      { success: false, message: 'Too many create requests. Please retry shortly.' },
      {
        status: 429,
        headers: { 'retry-after': `${Math.ceil(rate.retryAfterMs / 1000)}` },
      }
    );
  }

  let body: CreateTransferRequest = {};

  try {
    body = (await request.json()) as CreateTransferRequest;
  } catch {
    body = {};
  }

  if (typeof body.ttlMinutes !== 'undefined' && (!Number.isFinite(body.ttlMinutes) || body.ttlMinutes <= 0)) {
    recordTransferMetric('create_failure', { reason: 'invalid-ttl' });
    return NextResponse.json({ success: false, message: 'ttlMinutes must be a positive number' }, { status: 400 });
  }

  const session = await createTransferSessionInSupabase(body.ttlMinutes);
  if ('reason' in session) {
    recordTransferMetric('create_failure', { reason: session.reason });
    const status = session.reason === 'misconfigured' ? 500 : 503;
    return NextResponse.json(
      { success: false, message: session.message || 'Could not create transfer session.' },
      { status }
    );
  }

  const response: CreateTransferResponse = {
    success: true,
    session: session.session,
    senderToken: session.senderToken,
  };
  recordTransferMetric('create_success');

  return NextResponse.json(response);
}
