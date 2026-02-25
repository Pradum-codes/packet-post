import { randomBytes } from 'crypto';
import { SessionState, TransferSessionPublic } from '@/lib/webrtc/protocol';
import { readSupabaseServerConfig, supabaseServerRequest } from '@/lib/supabase/server';

const DEFAULT_TTL_MINUTES = 15;
const MIN_TTL_MINUTES = 10;
const MAX_TTL_MINUTES = 30;
const MAX_CREATE_RETRIES = 5;
const TABLE_NAME = 'webrtc_transfer_sessions';

type DbSessionRow = {
  transfer_id: string;
  transfer_code: string;
  sender_token: string;
  receiver_token: string | null;
  state: SessionState;
  created_at: string;
  expires_at: string;
};

type CreateResult =
  | {
      ok: true;
      session: TransferSessionPublic;
      senderToken: string;
    }
  | {
      ok: false;
      reason: 'misconfigured' | 'unknown';
      message: string;
    };

type JoinResult =
  | {
      ok: true;
      session: TransferSessionPublic;
      receiverToken: string;
    }
  | {
      ok: false;
      reason: 'misconfigured' | 'not-found' | 'expired' | 'already-joined' | 'unknown';
      message: string;
    };

function readTtlMinutes(ttlMinutes?: number) {
  const fromEnv = Number(process.env.WEBRTC_SESSION_TTL_MINUTES);
  const baseTtl = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_TTL_MINUTES;
  const requested = typeof ttlMinutes === 'number' && Number.isFinite(ttlMinutes) ? ttlMinutes : baseTtl;
  return Math.max(MIN_TTL_MINUTES, Math.min(MAX_TTL_MINUTES, Math.floor(requested)));
}

function makeTransferCode() {
  return `${randomBytes(2).toString('hex')}-${randomBytes(2).toString('hex')}`.toUpperCase();
}

function makeToken() {
  return randomBytes(24).toString('base64url');
}

function toPublicSession(row: DbSessionRow): TransferSessionPublic {
  const expiresAtMs = Date.parse(row.expires_at);
  const state: SessionState = Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now() ? 'expired' : row.state;

  return {
    transferId: row.transfer_id,
    transferCode: row.transfer_code,
    expiresAt: row.expires_at,
    state,
  };
}

function isUniqueViolation(message: string | null) {
  if (!message) {
    return false;
  }

  const lower = message.toLowerCase();
  return lower.includes('duplicate key') || lower.includes('unique constraint');
}

async function loadSessionByCode(transferCode: string) {
  const config = readSupabaseServerConfig();
  if (!config) {
    return { ok: false as const, reason: 'misconfigured' as const, row: null as DbSessionRow | null };
  }

  const query = new URLSearchParams({
    transfer_code: `eq.${transferCode}`,
    select: 'transfer_id,transfer_code,sender_token,receiver_token,state,created_at,expires_at',
    limit: '1',
  });

  const result = await supabaseServerRequest<DbSessionRow[]>(config, {
    method: 'GET',
    path: TABLE_NAME,
    query,
  });

  if (!result.ok) {
    return { ok: false as const, reason: 'unknown' as const, row: null as DbSessionRow | null };
  }

  const row = Array.isArray(result.data) ? result.data[0] || null : null;
  return { ok: true as const, row };
}

export async function createTransferSessionInSupabase(ttlMinutes?: number): Promise<CreateResult> {
  const config = readSupabaseServerConfig();
  if (!config) {
    return {
      ok: false,
      reason: 'misconfigured',
      message: 'Supabase session store is not configured.',
    };
  }

  const ttl = readTtlMinutes(ttlMinutes);
  const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();

  for (let attempt = 0; attempt < MAX_CREATE_RETRIES; attempt += 1) {
    const transferCode = makeTransferCode();
    const senderToken = makeToken();

    const result = await supabaseServerRequest<DbSessionRow[]>(config, {
      method: 'POST',
      path: TABLE_NAME,
      query: new URLSearchParams({ select: 'transfer_id,transfer_code,sender_token,receiver_token,state,created_at,expires_at' }),
      prefer: 'return=representation',
      body: {
        transfer_code: transferCode,
        sender_token: senderToken,
        state: 'created',
        expires_at: expiresAt,
      },
    });

    if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
      return {
        ok: true,
        session: toPublicSession(result.data[0]),
        senderToken,
      };
    }

    if (!result.ok && (result.status === 409 || isUniqueViolation(result.error))) {
      continue;
    }

    return {
      ok: false,
      reason: 'unknown',
      message: result.error || 'Could not create transfer session.',
    };
  }

  return {
    ok: false,
    reason: 'unknown',
    message: 'Could not create transfer session after retrying transfer code generation.',
  };
}

export async function joinTransferSessionInSupabase(transferCode: string): Promise<JoinResult> {
  const config = readSupabaseServerConfig();
  if (!config) {
    return {
      ok: false,
      reason: 'misconfigured',
      message: 'Supabase session store is not configured.',
    };
  }

  const initial = await loadSessionByCode(transferCode);
  if (!initial.ok) {
    return {
      ok: false,
      reason: initial.reason,
      message: 'Could not load transfer session.',
    };
  }

  if (!initial.row) {
    return {
      ok: false,
      reason: 'not-found',
      message: 'Transfer session not found.',
    };
  }

  const expiresAtMs = Date.parse(initial.row.expires_at);
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
    return {
      ok: false,
      reason: 'expired',
      message: 'Transfer session expired.',
    };
  }

  if (initial.row.receiver_token || initial.row.state === 'joined') {
    return {
      ok: false,
      reason: 'already-joined',
      message: 'Transfer session already has a receiver.',
    };
  }

  const receiverToken = makeToken();
  const nowIso = new Date().toISOString();
  const updateQuery = new URLSearchParams({
    transfer_code: `eq.${transferCode}`,
    receiver_token: 'is.null',
    state: 'eq.created',
    expires_at: `gt.${nowIso}`,
    select: 'transfer_id,transfer_code,sender_token,receiver_token,state,created_at,expires_at',
  });

  const updateResult = await supabaseServerRequest<DbSessionRow[]>(config, {
    method: 'PATCH',
    path: TABLE_NAME,
    query: updateQuery,
    prefer: 'return=representation',
    body: {
      receiver_token: receiverToken,
      state: 'joined',
    },
  });

  if (updateResult.ok && Array.isArray(updateResult.data) && updateResult.data.length > 0) {
    return {
      ok: true,
      session: toPublicSession(updateResult.data[0]),
      receiverToken,
    };
  }

  if (!updateResult.ok) {
    return {
      ok: false,
      reason: 'unknown',
      message: updateResult.error || 'Could not join transfer session.',
    };
  }

  const finalState = await loadSessionByCode(transferCode);
  if (!finalState.ok) {
    return {
      ok: false,
      reason: 'unknown',
      message: 'Could not load transfer session after join attempt.',
    };
  }

  if (!finalState.row) {
    return {
      ok: false,
      reason: 'not-found',
      message: 'Transfer session not found.',
    };
  }

  const finalExpiresMs = Date.parse(finalState.row.expires_at);
  if (Number.isFinite(finalExpiresMs) && finalExpiresMs <= Date.now()) {
    return {
      ok: false,
      reason: 'expired',
      message: 'Transfer session expired.',
    };
  }

  if (finalState.row.receiver_token || finalState.row.state === 'joined') {
    return {
      ok: false,
      reason: 'already-joined',
      message: 'Transfer session already has a receiver.',
    };
  }

  return {
    ok: false,
    reason: 'unknown',
    message: 'Could not join transfer session.',
  };
}
