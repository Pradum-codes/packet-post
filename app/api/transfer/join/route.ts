import { NextRequest, NextResponse } from 'next/server';
import { JoinTransferRequest, JoinTransferResponse } from '@/lib/webrtc/protocol';
import { getClientIp } from '@/lib/webrtc/network';
import { consumeRateLimit, pruneRateLimitStore } from '@/lib/webrtc/rateLimit';
import { recordTransferMetric } from '@/lib/webrtc/observability';
import { joinTransferSessionInSupabase } from '@/lib/webrtc/supabaseSessionStore';

export const runtime = 'nodejs';

const DEFAULT_JOIN_PER_MIN = 60;

function readJoinLimit() {
  const fromEnv = Number(process.env.WEBRTC_JOIN_RATE_LIMIT_PER_MIN);
  if (!Number.isFinite(fromEnv) || fromEnv <= 0) {
    return DEFAULT_JOIN_PER_MIN;
  }
  return Math.floor(fromEnv);
}

export async function POST(request: NextRequest) {
  recordTransferMetric('join_request');
  pruneRateLimitStore();
  const ip = getClientIp(request);
  const rate = consumeRateLimit(`join:${ip}`, readJoinLimit(), 60 * 1000);
  if (!rate.allowed) {
    recordTransferMetric('join_failure', { reason: 'rate-limited' });
    return NextResponse.json(
      { success: false, message: 'Too many join requests. Please retry shortly.' },
      {
        status: 429,
        headers: { 'retry-after': `${Math.ceil(rate.retryAfterMs / 1000)}` },
      }
    );
  }

  let body: JoinTransferRequest;

  try {
    body = (await request.json()) as JoinTransferRequest;
  } catch {
    recordTransferMetric('join_failure', { reason: 'invalid-json' });
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const transferCode = typeof body.transferCode === 'string' ? body.transferCode.trim().toUpperCase() : '';
  if (!transferCode) {
    recordTransferMetric('join_failure', { reason: 'missing-transfer-code' });
    return NextResponse.json({ success: false, message: 'transferCode is required' }, { status: 400 });
  }
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(transferCode)) {
    recordTransferMetric('join_failure', { reason: 'invalid-transfer-code-format' });
    return NextResponse.json({ success: false, message: 'transferCode must match ABCD-EFGH format' }, { status: 400 });
  }

  const joined = await joinTransferSessionInSupabase(transferCode);
  if ('reason' in joined) {
    recordTransferMetric('join_failure', { reason: joined.reason });
    if (joined.reason === 'already-joined') {
      return NextResponse.json({ success: false, message: 'Transfer session already has a receiver' }, { status: 409 });
    }
    if (joined.reason === 'expired') {
      return NextResponse.json({ success: false, message: 'Transfer session expired' }, { status: 410 });
    }
    if (joined.reason === 'misconfigured') {
      return NextResponse.json({ success: false, message: joined.message }, { status: 500 });
    }
    if (joined.reason === 'unknown') {
      return NextResponse.json({ success: false, message: joined.message || 'Could not join transfer session.' }, { status: 503 });
    }
    return NextResponse.json({ success: false, message: 'Transfer session not found' }, { status: 404 });
  }

  const response: JoinTransferResponse = {
    success: true,
    session: joined.session,
    receiverToken: joined.receiverToken,
  };
  recordTransferMetric('join_success');

  return NextResponse.json(response);
}
