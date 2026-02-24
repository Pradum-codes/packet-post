export const SIGNALING_MESSAGE_TYPES = [
  'offer',
  'answer',
  'ice-candidate',
  'ready',
  'cancel',
  'error',
] as const;

export type SignalingMessageType = (typeof SIGNALING_MESSAGE_TYPES)[number];
export type PeerRole = 'sender' | 'receiver';
export type SessionState = 'created' | 'joined' | 'closed' | 'expired';

export type SignalMessageBase = {
  type: SignalingMessageType;
  transferId: string;
  from: PeerRole;
};

export type OfferMessage = SignalMessageBase & {
  type: 'offer';
  payload: { sdp: string };
};

export type AnswerMessage = SignalMessageBase & {
  type: 'answer';
  payload: { sdp: string };
};

export type IceCandidateMessage = SignalMessageBase & {
  type: 'ice-candidate';
  payload: {
    candidate: string;
    sdpMid: string | null;
    sdpMLineIndex: number | null;
    usernameFragment?: string | null;
  };
};

export type ReadyMessage = SignalMessageBase & {
  type: 'ready';
  payload?: { note?: string };
};

export type CancelMessage = SignalMessageBase & {
  type: 'cancel';
  payload?: { reason?: string };
};

export type ErrorMessage = SignalMessageBase & {
  type: 'error';
  payload: { code: string; message: string };
};

export type SignalingMessage =
  | OfferMessage
  | AnswerMessage
  | IceCandidateMessage
  | ReadyMessage
  | CancelMessage
  | ErrorMessage;

export type TransferSessionPublic = {
  transferId: string;
  transferCode: string;
  expiresAt: string;
  state: SessionState;
};

export type CreateTransferRequest = {
  ttlMinutes?: number;
};

export type CreateTransferResponse = {
  success: true;
  session: TransferSessionPublic;
  senderToken: string;
};

export type JoinTransferRequest = {
  transferCode: string;
};

export type JoinTransferResponse = {
  success: true;
  session: TransferSessionPublic;
  receiverToken: string;
};
