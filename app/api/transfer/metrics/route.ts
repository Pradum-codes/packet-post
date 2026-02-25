import { NextResponse } from 'next/server';
import { getTransferMetricSnapshot } from '@/lib/webrtc/observability';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    success: true,
    metrics: getTransferMetricSnapshot(),
  });
}
