import { NextRequest, NextResponse } from 'next/server';
import { recordTransferMetric } from '@/lib/webrtc/observability';

export const runtime = 'nodejs';

type TelemetryBody = {
  event?: string;
  provider?: 'ws' | 'supabase';
  reason?: string;
};

export async function POST(request: NextRequest) {
  let body: TelemetryBody;

  try {
    body = (await request.json()) as TelemetryBody;
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.event !== 'signaling-delivery-success' && body.event !== 'signaling-delivery-failure') {
    return NextResponse.json({ success: false, message: 'Unsupported telemetry event' }, { status: 400 });
  }

  if (body.event === 'signaling-delivery-success') {
    recordTransferMetric('signaling_delivery_success', {
      provider: body.provider || 'unknown',
    });
  } else {
    recordTransferMetric('signaling_delivery_failure', {
      provider: body.provider || 'unknown',
      reason: typeof body.reason === 'string' ? body.reason : 'unknown',
    });
  }

  return NextResponse.json({ success: true });
}
