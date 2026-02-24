import { NextRequest, NextResponse } from 'next/server';
import { JoinTransferRequest, JoinTransferResponse } from '@/lib/webrtc/protocol';
import { getClientIp } from '@/lib/webrtc/network';
import { consumeRateLimit, pruneRateLimitStore } from '@/lib/webrtc/rateLimit';
import { joinTransferSession, toPublicSession } from '@/lib/webrtc/sessionStore';

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
  pruneRateLimitStore();
  const ip = getClientIp(request);
  const rate = consumeRateLimit(`join:${ip}`, readJoinLimit(), 60 * 1000);
  if (!rate.allowed) {
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
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const transferCode = typeof body.transferCode === 'string' ? body.transferCode.trim().toUpperCase() : '';
  if (!transferCode) {
    return NextResponse.json({ success: false, message: 'transferCode is required' }, { status: 400 });
  }
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(transferCode)) {
    return NextResponse.json({ success: false, message: 'transferCode must match ABCD-EFGH format' }, { status: 400 });
  }

  const joined = joinTransferSession(transferCode);
  if (!joined.ok) {
    const reason = 'reason' in joined ? joined.reason : 'not-found';
    if (reason === 'already-joined') {
      return NextResponse.json({ success: false, message: 'Transfer session already has a receiver' }, { status: 409 });
    }
    if (reason === 'expired') {
      return NextResponse.json({ success: false, message: 'Transfer session expired' }, { status: 410 });
    }
    return NextResponse.json({ success: false, message: 'Transfer session not found' }, { status: 404 });
  }

  const response: JoinTransferResponse = {
    success: true,
    session: toPublicSession(joined.session),
    receiverToken: joined.receiverToken,
  };

  return NextResponse.json(response);
}
