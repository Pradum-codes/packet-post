import { NextRequest, NextResponse } from 'next/server';
import { JoinTransferRequest, JoinTransferResponse } from '@/lib/webrtc/protocol';
import { joinTransferSession, toPublicSession } from '@/lib/webrtc/sessionStore';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
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
