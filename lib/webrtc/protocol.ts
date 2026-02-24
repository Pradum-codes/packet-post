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

export type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type TransferConfigResponse = {
  success: true;
  iceServers: IceServerConfig[];
  maxUploadBytes: number;
};

export type SignalPayload =
  | {
      type: 'offer';
      payload: { sdp: string };
    }
  | {
      type: 'answer';
      payload: { sdp: string };
    }
  | {
      type: 'ice-candidate';
      payload: {
        candidate: string;
        sdpMid: string | null;
        sdpMLineIndex: number | null;
        usernameFragment?: string | null;
      };
    }
  | {
      type: 'ready';
      payload?: { note?: string };
    }
  | {
      type: 'cancel';
      payload?: { reason?: string };
    }
  | {
      type: 'error';
      payload: { code: string; message: string };
    };

export type SignalingClientMessage =
  | {
      type: 'join-room';
      transferId: string;
      role: PeerRole;
      token: string;
    }
  | {
      type: 'relay';
      transferId: string;
      role: PeerRole;
      token: string;
      signal: SignalPayload;
    }
  | {
      type: 'leave-room';
      transferId: string;
      role: PeerRole;
      token: string;
    };

export type SignalingServerMessage =
  | {
      type: 'joined-room';
      transferId: string;
      role: PeerRole;
      peerPresent: boolean;
    }
  | {
      type: 'peer-joined';
      transferId: string;
      role: PeerRole;
      peerRole: PeerRole;
    }
  | {
      type: 'peer-left';
      transferId: string;
      role: PeerRole;
      peerRole: PeerRole;
    }
  | {
      type: 'relay';
      transferId: string;
      role: PeerRole;
      from: PeerRole;
      signal: SignalPayload;
    }
  | {
      type: 'error';
      code: string;
      message: string;
    };
