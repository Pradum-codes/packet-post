import { NextRequest, NextResponse } from 'next/server';
import { CreateTransferRequest, CreateTransferResponse } from '@/lib/webrtc/protocol';
import { getClientIp } from '@/lib/webrtc/network';
import { consumeRateLimit, pruneRateLimitStore } from '@/lib/webrtc/rateLimit';
import { createTransferSession, toPublicSession } from '@/lib/webrtc/sessionStore';

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
  pruneRateLimitStore();
  const ip = getClientIp(request);
  const rate = consumeRateLimit(`create:${ip}`, readCreateLimit(), 60 * 1000);
  if (!rate.allowed) {
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
    return NextResponse.json({ success: false, message: 'ttlMinutes must be a positive number' }, { status: 400 });
  }

  const session = createTransferSession(body.ttlMinutes);
  const response: CreateTransferResponse = {
    success: true,
    session: toPublicSession(session),
    senderToken: session.senderToken,
  };

  return NextResponse.json(response);
}
