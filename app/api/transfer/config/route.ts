import { NextResponse } from 'next/server';
import { parseIceServersFromEnv, readMaxUploadBytes } from '@/lib/webrtc/network';
import { TransferConfigResponse } from '@/lib/webrtc/protocol';

export const runtime = 'nodejs';

export async function GET() {
  const response: TransferConfigResponse = {
    success: true,
    iceServers: parseIceServersFromEnv(),
    maxUploadBytes: readMaxUploadBytes(),
  };

  return NextResponse.json(response, {
    headers: {
      'cache-control': 'private, max-age=60',
    },
  });
}
