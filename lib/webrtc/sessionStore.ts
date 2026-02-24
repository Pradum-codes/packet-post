import { randomBytes, randomUUID } from 'crypto';
import { SessionState, TransferSessionPublic } from '@/lib/webrtc/protocol';

const DEFAULT_TTL_MINUTES = 15;
const MIN_TTL_MINUTES = 10;
const MAX_TTL_MINUTES = 30;

export type TransferSessionRecord = {
  transferId: string;
  transferCode: string;
  senderToken: string;
  receiverToken?: string;
  createdAt: number;
  expiresAt: number;
  state: SessionState;
};

type JoinResult =
  | { ok: true; session: TransferSessionRecord; receiverToken: string }
  | { ok: false; reason: 'not-found' | 'expired' | 'already-joined' };

type TransferStore = {
  byId: Map<string, TransferSessionRecord>;
  byCode: Map<string, string>;
};

const globalStore = globalThis as typeof globalThis & {
  __webrtcTransferStore?: TransferStore;
};

const store: TransferStore =
  globalStore.__webrtcTransferStore ??
  (() => {
    const initialStore: TransferStore = {
      byId: new Map<string, TransferSessionRecord>(),
      byCode: new Map<string, string>(),
    };
    globalStore.__webrtcTransferStore = initialStore;
    return initialStore;
  })();

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

function removeSession(session: TransferSessionRecord) {
  store.byId.delete(session.transferId);
  store.byCode.delete(session.transferCode);
}

export function pruneExpiredSessions() {
  const now = Date.now();
  for (const session of store.byId.values()) {
    if (session.expiresAt <= now) {
      removeSession(session);
    }
  }
}

export function createTransferSession(ttlMinutes?: number) {
  pruneExpiredSessions();

  let transferCode = makeTransferCode();
  while (store.byCode.has(transferCode)) {
    transferCode = makeTransferCode();
  }

  const ttl = readTtlMinutes(ttlMinutes);
  const createdAt = Date.now();
  const session: TransferSessionRecord = {
    transferId: randomUUID(),
    transferCode,
    senderToken: makeToken(),
    createdAt,
    expiresAt: createdAt + ttl * 60 * 1000,
    state: 'created',
  };

  store.byId.set(session.transferId, session);
  store.byCode.set(session.transferCode, session.transferId);

  return session;
}

export function joinTransferSession(transferCode: string): JoinResult {
  pruneExpiredSessions();
  const normalizedCode = transferCode.trim().toUpperCase();
  const transferId = store.byCode.get(normalizedCode);
  if (!transferId) {
    return { ok: false, reason: 'not-found' };
  }

  const session = store.byId.get(transferId);
  if (!session) {
    store.byCode.delete(normalizedCode);
    return { ok: false, reason: 'not-found' };
  }

  if (session.expiresAt <= Date.now()) {
    removeSession(session);
    return { ok: false, reason: 'expired' };
  }

  if (session.state === 'joined') {
    return { ok: false, reason: 'already-joined' };
  }

  const receiverToken = makeToken();
  session.receiverToken = receiverToken;
  session.state = 'joined';
  store.byId.set(session.transferId, session);

  return { ok: true, session, receiverToken };
}

export function toPublicSession(session: TransferSessionRecord): TransferSessionPublic {
  const state: SessionState = session.expiresAt <= Date.now() ? 'expired' : session.state;
  return {
    transferId: session.transferId,
    transferCode: session.transferCode,
    expiresAt: new Date(session.expiresAt).toISOString(),
    state,
  };
}
