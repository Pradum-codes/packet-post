import { NextRequest } from 'next/server';
import { IceServerConfig } from '@/lib/webrtc/protocol';

const DEFAULT_ICE_SERVERS: IceServerConfig[] = [{ urls: ['stun:stun.l.google.com:19302'] }];
const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const DEFAULT_SIGNALING_PROVIDER = 'ws';

export type SignalingProvider = 'ws' | 'supabase';

export function getClientIp(request: NextRequest) {
  const fromForwarded = request.headers.get('x-forwarded-for');
  if (fromForwarded) {
    const first = fromForwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  return request.headers.get('x-real-ip') || 'unknown';
}

export function parseIceServersFromEnv(): IceServerConfig[] {
  const rawJson = process.env.WEBRTC_ICE_SERVERS_JSON;
  if (!rawJson) {
    return DEFAULT_ICE_SERVERS;
  }

  try {
    const parsed = JSON.parse(rawJson) as unknown;
    if (!Array.isArray(parsed)) {
      return DEFAULT_ICE_SERVERS;
    }

    const valid = parsed
      .filter((item): item is IceServerConfig => {
        if (!item || typeof item !== 'object') return false;
        const candidate = item as IceServerConfig;
        if (typeof candidate.urls === 'string') return true;
        if (Array.isArray(candidate.urls)) {
          return candidate.urls.every((url) => typeof url === 'string');
        }
        return false;
      })
      .map((item) => ({
        urls: item.urls,
        username: typeof item.username === 'string' ? item.username : undefined,
        credential: typeof item.credential === 'string' ? item.credential : undefined,
      }));

    return valid.length > 0 ? valid : DEFAULT_ICE_SERVERS;
  } catch {
    return DEFAULT_ICE_SERVERS;
  }
}

export function readMaxUploadBytes() {
  const raw = Number(process.env.WEB_UPLOAD_MAX_BYTES);
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_MAX_UPLOAD_BYTES;
  }
  return Math.floor(raw);
}

export function readSignalingProvider(): SignalingProvider {
  const raw = (process.env.WEBRTC_SIGNALING_PROVIDER || DEFAULT_SIGNALING_PROVIDER).toLowerCase();
  return raw === 'supabase' ? 'supabase' : 'ws';
}
