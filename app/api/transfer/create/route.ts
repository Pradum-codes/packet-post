import { NextRequest, NextResponse } from 'next/server';
import { CreateTransferRequest, CreateTransferResponse } from '@/lib/webrtc/protocol';
import { createTransferSession, toPublicSession } from '@/lib/webrtc/sessionStore';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let body: CreateTransferRequest = {};

  try {
    body = (await request.json()) as CreateTransferRequest;
  } catch {
    body = {};
  }

  const session = createTransferSession(body.ttlMinutes);
  const response: CreateTransferResponse = {
    success: true,
    session: toPublicSession(session),
    senderToken: session.senderToken,
  };

  return NextResponse.json(response);
}
