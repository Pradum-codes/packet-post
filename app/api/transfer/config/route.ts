import { NextResponse } from 'next/server';
import { parseIceServersFromEnv } from '@/lib/webrtc/network';
import { TransferConfigResponse } from '@/lib/webrtc/protocol';

export const runtime = 'nodejs';

export async function GET() {
  const response: TransferConfigResponse = {
    success: true,
    iceServers: parseIceServersFromEnv(),
  };

  return NextResponse.json(response, {
    headers: {
      'cache-control': 'private, max-age=60',
    },
  });
}
