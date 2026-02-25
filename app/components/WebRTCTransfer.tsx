'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Check, Copy, Loader2, Radio, TriangleAlert, Users } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import {
  CreateTransferResponse,
  JoinTransferResponse,
  PeerRole,
  SignalPayload,
  SignalingClientMessage,
  SignalingProvider,
  SignalingServerMessage,
  TransferConfigResponse,
} from '@/lib/webrtc/protocol';

type TransferRole = 'sender' | 'receiver';

type TransferStatus =
  | 'idle'
  | 'creating-session'
  | 'waiting-peer'
  | 'joining-session'
  | 'connecting'
  | 'connected'
  | 'transferring'
  | 'completed'
  | 'failed';

type SignalingCreds = {
  transferId: string;
  token: string;
  role: PeerRole;
};

type UploadFallbackResult = {
  link: string;
  filename: string;
  size: number;
};

type SupabaseSignalEnvelope = {
  transferId: string;
  role: PeerRole;
  token: string;
  signal: SignalPayload;
};

type SignalingTelemetryEvent = 'signaling-delivery-success' | 'signaling-delivery-failure';

type IncomingFileState = {
  name: string;
  mimeType: string;
  size: number;
  received: number;
  chunks: BlobPart[];
};

type Props = {
  onUseClassic: () => void;
};

function statusLabel(status: TransferStatus) {
  switch (status) {
    case 'creating-session':
      return 'Creating session';
    case 'waiting-peer':
      return 'Waiting for peer';
    case 'joining-session':
      return 'Joining session';
    case 'connecting':
      return 'Connecting';
    case 'connected':
      return 'Connected';
    case 'transferring':
      return 'Transferring';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    default:
      return 'Idle';
  }
}

function defaultSignalingUrl() {
  if (typeof window === 'undefined') {
    return 'ws://127.0.0.1:3001';
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.hostname}:3001`;
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const level = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, level);
  return `${value.toFixed(level > 1 ? 2 : 0)} ${units[level]}`;
}

export default function WebRTCTransfer({ onUseClassic }: Props) {
  const [role, setRole] = useState<TransferRole>('sender');
  const [status, setStatus] = useState<TransferStatus>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [transferCode, setTransferCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [socketState, setSocketState] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [progress, setProgress] = useState(0);
  const [bytesDone, setBytesDone] = useState(0);
  const [bytesTotal, setBytesTotal] = useState(0);
  const [fallbackResult, setFallbackResult] = useState<UploadFallbackResult | null>(null);
  const [fallbackUploading, setFallbackUploading] = useState(false);
  const [fallbackCopied, setFallbackCopied] = useState(false);
  const [origin, setOrigin] = useState('');
  const [iceServers, setIceServers] = useState<RTCIceServer[]>([{ urls: 'stun:stun.l.google.com:19302' }]);
  const [maxUploadBytes, setMaxUploadBytes] = useState(25 * 1024 * 1024);
  const [signalingProvider, setSignalingProvider] = useState<SignalingProvider>('ws');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const supabaseChannelRef = useRef<RealtimeChannel | null>(null);
  const credsRef = useRef<SignalingCreds | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const incomingRef = useRef<IncomingFileState | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);
  const offerSentRef = useRef(false);
  const transferStartedRef = useRef(false);
  const fallbackAttemptedRef = useRef(false);
  const manualSocketCloseRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const statusRef = useRef<TransferStatus>('idle');

  const canCreate = role === 'sender' && !!selectedFile && status !== 'creating-session';
  const canJoin = role === 'receiver' && !!joinCode.trim() && status !== 'joining-session';

  const statusTone =
    status === 'failed'
      ? 'border-red-300/30 bg-red-500/10 text-red-200'
      : status === 'completed'
        ? 'border-emerald-300/30 bg-emerald-500/10 text-emerald-100'
        : 'border-zinc-700 bg-zinc-900/70 text-zinc-200';

  const statusIcon = useMemo(() => {
    if (status === 'creating-session' || status === 'joining-session' || status === 'connecting') {
      return <Loader2 className="h-4 w-4 animate-spin" />;
    }
    if (status === 'completed') {
      return <Check className="h-4 w-4" />;
    }
    if (status === 'failed') {
      return <TriangleAlert className="h-4 w-4" />;
    }
    return <Radio className="h-4 w-4" />;
  }, [status]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const clearConnectTimeout = () => {
    if (connectTimeoutRef.current) {
      window.clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
  };

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const resetTransferState = () => {
    incomingRef.current = null;
    offerSentRef.current = false;
    transferStartedRef.current = false;
    fallbackAttemptedRef.current = false;
    setProgress(0);
    setBytesDone(0);
    setBytesTotal(0);
    setFallbackResult(null);
    setFallbackUploading(false);
    setFallbackCopied(false);
  };

  const closePeerConnection = () => {
    clearConnectTimeout();
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
  };

  const closeSignalingSocket = () => {
    const ws = wsRef.current;
    const channel = supabaseChannelRef.current;
    const creds = credsRef.current;
    const supabase = getSupabaseBrowserClient();

    manualSocketCloseRef.current = true;
    clearReconnectTimer();

    if (ws && ws.readyState === WebSocket.OPEN && creds) {
      const leaveMsg: SignalingClientMessage = {
        type: 'leave-room',
        transferId: creds.transferId,
        role: creds.role,
        token: creds.token,
      };
      ws.send(JSON.stringify(leaveMsg));
    }

    if (ws) {
      ws.close();
    }

    wsRef.current = null;
    if (channel && supabase) {
      void channel.unsubscribe();
      void supabase.removeChannel(channel);
    }
    supabaseChannelRef.current = null;
    setSocketState('disconnected');
  };

  const fallbackToUpload = async (reason: string) => {
    if (role !== 'sender' || !selectedFile || fallbackAttemptedRef.current) {
      return;
    }
    if (selectedFile.size > maxUploadBytes) {
      setError(
        `${reason} Live transfer failed and fallback upload was skipped because file is larger than ${formatBytes(maxUploadBytes)}.`
      );
      return;
    }

    fallbackAttemptedRef.current = true;
    setFallbackUploading(true);
    setError(`${reason} Falling back to classic upload.`);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = (await response.json()) as {
        success?: boolean;
        link?: string;
        filename?: string;
        size?: number;
        message?: string;
      };

      if (!response.ok || !data.success || !data.link || !data.filename || typeof data.size !== 'number') {
        throw new Error(data.message || 'Fallback upload failed.');
      }

      setFallbackResult({
        link: data.link,
        filename: data.filename,
        size: data.size,
      });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Fallback upload failed.');
    } finally {
      setFallbackUploading(false);
    }
  };

  const handleLiveFailure = (message: string) => {
    setStatus('failed');
    closePeerConnection();
    void fallbackToUpload(message);
  };

  const scheduleReconnect = () => {
    const creds = credsRef.current;
    if (!creds || reconnectAttemptRef.current >= 3) {
      return;
    }

    clearReconnectTimer();
    const nextAttempt = reconnectAttemptRef.current + 1;
    const delay = Math.min(2500 * nextAttempt, 6000);
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectAttemptRef.current = nextAttempt;
      setReconnectAttempt(nextAttempt);
      connectSignaling(creds, true);
    }, delay);
  };

  const reportSignalingTelemetry = (event: SignalingTelemetryEvent, reason?: string) => {
    const payload = JSON.stringify({
      event,
      provider: signalingProvider,
      reason: reason || 'none',
    });

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/transfer/telemetry', blob);
        return;
      }
    } catch {
      // Fallback to fetch below.
    }

    void fetch('/api/transfer/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => undefined);
  };

  const sendSignal = (signal: SignalPayload) => {
    const creds = credsRef.current;
    if (!creds) {
      return;
    }

    if (signalingProvider === 'supabase') {
      const channel = supabaseChannelRef.current;
      if (!channel) {
        return;
      }

      const payload: SupabaseSignalEnvelope = {
        transferId: creds.transferId,
        role: creds.role,
        token: creds.token,
        signal,
      };
      void channel.send({
        type: 'broadcast',
        event: 'signal',
        payload,
      }).then((status) => {
        if (status === 'ok') {
          reportSignalingTelemetry('signaling-delivery-success');
          return;
        }
        reportSignalingTelemetry('signaling-delivery-failure', `supabase-${status}`);
      });
      return;
    }

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const msg: SignalingClientMessage = {
      type: 'relay',
      transferId: creds.transferId,
      role: creds.role,
      token: creds.token,
      signal,
    };

    try {
      ws.send(JSON.stringify(msg));
      reportSignalingTelemetry('signaling-delivery-success');
    } catch {
      reportSignalingTelemetry('signaling-delivery-failure', 'ws-send-throw');
    }
  };

  const sendReadySignal = () => {
    const roleValue = credsRef.current?.role;
    if (!roleValue) {
      return;
    }

    sendSignal({
      type: 'ready',
      payload: {
        note: `${roleValue}-ready`,
      },
    });
  };

  const waitForBufferLow = (channel: RTCDataChannel) => {
    if (channel.bufferedAmount <= 1024 * 1024) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const onLow = () => {
        channel.removeEventListener('bufferedamountlow', onLow);
        resolve();
      };

      channel.addEventListener('bufferedamountlow', onLow, { once: true });
      window.setTimeout(() => {
        channel.removeEventListener('bufferedamountlow', onLow);
        resolve();
      }, 750);
    });
  };

  const completeReceiverDownload = () => {
    const incoming = incomingRef.current;
    if (!incoming) {
      return;
    }

    const blob = new Blob(incoming.chunks, { type: incoming.mimeType || 'application/octet-stream' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = incoming.name || 'received-file';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

    setStatus('completed');
    setProgress(100);
  };

  const handleIncomingDataMessage = async (data: string | ArrayBuffer | Blob) => {
    if (typeof data === 'string') {
      let control:
        | { kind: 'meta'; name: string; mimeType: string; size: number }
        | { kind: 'done' }
        | { kind: 'cancel'; reason?: string };

      try {
        control = JSON.parse(data) as typeof control;
      } catch {
        return;
      }

      if (control.kind === 'meta') {
        incomingRef.current = {
          name: control.name,
          mimeType: control.mimeType,
          size: control.size,
          received: 0,
          chunks: [],
        };
        setBytesTotal(control.size);
        setBytesDone(0);
        setProgress(0);
        setStatus('transferring');
        return;
      }

      if (control.kind === 'done') {
        completeReceiverDownload();
        return;
      }

      if (control.kind === 'cancel') {
        handleLiveFailure(control.reason || 'Sender canceled transfer.');
      }
      return;
    }

    const payload = data instanceof Blob ? await data.arrayBuffer() : data;
    const incoming = incomingRef.current;
    if (!incoming) {
      return;
    }

    incoming.chunks.push(payload);
    incoming.received += payload.byteLength;

    const currentProgress = incoming.size > 0 ? Math.min(100, (incoming.received / incoming.size) * 100) : 0;
    setBytesDone(incoming.received);
    setProgress(currentProgress);
  };

  const setupDataChannel = (channel: RTCDataChannel) => {
    dataChannelRef.current = channel;
    channel.bufferedAmountLowThreshold = 256 * 1024;

    channel.onopen = () => {
      clearConnectTimeout();
      setStatus('connected');

      if (credsRef.current?.role === 'sender' && selectedFile && !transferStartedRef.current) {
        transferStartedRef.current = true;
        void (async () => {
          try {
            setStatus('transferring');
            setBytesTotal(selectedFile.size);
            setBytesDone(0);
            setProgress(0);

            channel.send(
              JSON.stringify({
                kind: 'meta',
                name: selectedFile.name,
                mimeType: selectedFile.type || 'application/octet-stream',
                size: selectedFile.size,
              })
            );

            const chunkSize = 64 * 1024;
            let offset = 0;

            while (offset < selectedFile.size) {
              if (channel.readyState !== 'open') {
                throw new Error('Data channel closed during transfer.');
              }

              const chunk = await selectedFile.slice(offset, offset + chunkSize).arrayBuffer();
              await waitForBufferLow(channel);
              channel.send(chunk);
              offset += chunk.byteLength;

              const pct = Math.min(100, (offset / selectedFile.size) * 100);
              setBytesDone(offset);
              setProgress(pct);
            }

            channel.send(JSON.stringify({ kind: 'done' }));
            setStatus('completed');
            setProgress(100);
          } catch (transferError) {
            handleLiveFailure(transferError instanceof Error ? transferError.message : 'File transfer failed.');
          }
        })();
      }
    };

    channel.onclose = () => {
      if (statusRef.current !== 'completed') {
        handleLiveFailure('Data channel closed before transfer completed.');
      }
    };

    channel.onerror = () => {
      handleLiveFailure('Data channel error.');
    };

    channel.onmessage = (event) => {
      void handleIncomingDataMessage(event.data as string | ArrayBuffer | Blob);
    };
  };

  const ensurePeerConnection = () => {
    if (pcRef.current) {
      return pcRef.current;
    }

    const connection = new RTCPeerConnection({ iceServers });

    connection.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }

      sendSignal({
        type: 'ice-candidate',
        payload: {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          usernameFragment: event.candidate.usernameFragment,
        },
      });
    };

    connection.ondatachannel = (event) => {
      setupDataChannel(event.channel);
    };

    connection.onconnectionstatechange = () => {
      const nextState = connection.connectionState;
      if (nextState === 'connected') {
        clearConnectTimeout();
        if (statusRef.current !== 'transferring' && statusRef.current !== 'completed') {
          setStatus('connected');
        }
        return;
      }

      if (nextState === 'failed' || nextState === 'disconnected') {
        handleLiveFailure('Peer connection failed.');
      }
    };

    pcRef.current = connection;

    if (credsRef.current?.role === 'sender') {
      const dc = connection.createDataChannel('file-transfer', { ordered: true });
      setupDataChannel(dc);
    }

    return connection;
  };

  const startConnectionTimeout = () => {
    clearConnectTimeout();
    connectTimeoutRef.current = window.setTimeout(() => {
      handleLiveFailure('Live connection timed out.');
    }, 15000);
  };

  const startSenderOffer = async () => {
    if (offerSentRef.current || credsRef.current?.role !== 'sender') {
      return;
    }

    const connection = ensurePeerConnection();
    offerSentRef.current = true;

    try {
      startConnectionTimeout();
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      if (!offer.sdp) {
        throw new Error('Failed to create SDP offer.');
      }

      sendSignal({
        type: 'offer',
        payload: { sdp: offer.sdp },
      });
    } catch (offerError) {
      handleLiveFailure(offerError instanceof Error ? offerError.message : 'Could not create offer.');
    }
  };

  const handleRelaySignal = async (signal: SignalPayload) => {
    if (signal.type === 'ready') {
      if (credsRef.current?.role === 'sender') {
        await startSenderOffer();
      }
      return;
    }

    if (signal.type === 'offer') {
      const offerSignal = signal as Extract<SignalPayload, { type: 'offer' }>;
      if (credsRef.current?.role !== 'receiver') {
        return;
      }

      try {
        startConnectionTimeout();
        const connection = ensurePeerConnection();
        await connection.setRemoteDescription({ type: 'offer', sdp: offerSignal.payload.sdp });
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        if (!answer.sdp) {
          throw new Error('Failed to create SDP answer.');
        }

        sendSignal({
          type: 'answer',
          payload: { sdp: answer.sdp },
        });
      } catch (offerHandlingError) {
        handleLiveFailure(offerHandlingError instanceof Error ? offerHandlingError.message : 'Could not process offer.');
      }
      return;
    }

    if (signal.type === 'answer') {
      const answerSignal = signal as Extract<SignalPayload, { type: 'answer' }>;
      if (credsRef.current?.role !== 'sender') {
        return;
      }

      try {
        const connection = ensurePeerConnection();
        await connection.setRemoteDescription({ type: 'answer', sdp: answerSignal.payload.sdp });
      } catch (answerHandlingError) {
        handleLiveFailure(answerHandlingError instanceof Error ? answerHandlingError.message : 'Could not process answer.');
      }
      return;
    }

    if (signal.type === 'ice-candidate') {
      const iceSignal = signal as Extract<SignalPayload, { type: 'ice-candidate' }>;
      try {
        const connection = ensurePeerConnection();
        await connection.addIceCandidate({
          candidate: iceSignal.payload.candidate,
          sdpMid: iceSignal.payload.sdpMid,
          sdpMLineIndex: iceSignal.payload.sdpMLineIndex,
          usernameFragment: iceSignal.payload.usernameFragment ?? undefined,
        });
      } catch (iceError) {
        handleLiveFailure(iceError instanceof Error ? iceError.message : 'Could not process ICE candidate.');
      }
      return;
    }

    if (signal.type === 'cancel') {
      const cancelSignal = signal as Extract<SignalPayload, { type: 'cancel' }>;
      handleLiveFailure(cancelSignal.payload?.reason || 'Peer canceled transfer.');
      return;
    }

    if (signal.type === 'error') {
      const errorSignal = signal as Extract<SignalPayload, { type: 'error' }>;
      handleLiveFailure(errorSignal.payload.message || 'Peer reported an error.');
    }
  };

  const connectSupabaseSignaling = (creds: SignalingCreds, isReconnect = false) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      handleLiveFailure('Supabase signaling is selected but Supabase environment variables are missing.');
      return;
    }

    const channel = supabase.channel(`webrtc-transfer:${creds.transferId}`, {
      config: {
        broadcast: { self: false, ack: false },
      },
    });
    supabaseChannelRef.current = channel;
    setSocketState('connecting');

    channel.on('broadcast', { event: 'signal' }, (event) => {
      if (supabaseChannelRef.current !== channel) {
        return;
      }

      const envelope = (event as { payload?: SupabaseSignalEnvelope }).payload;
      if (!envelope || envelope.transferId !== creds.transferId) {
        return;
      }

      if (envelope.role === creds.role && envelope.token === creds.token) {
        return;
      }

      if (envelope.signal.type === 'ready') {
        setError('');
        setStatus('connecting');
        startConnectionTimeout();
      }

      void handleRelaySignal(envelope.signal);
    });

    channel.subscribe((status) => {
      if (supabaseChannelRef.current !== channel) {
        return;
      }

      if (status === 'SUBSCRIBED') {
        setSocketState('connected');
        clearReconnectTimer();
        setStatus(creds.role === 'sender' ? 'waiting-peer' : 'connecting');
        if (isReconnect) {
          setStatus('connecting');
        }
        sendReadySignal();
        return;
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setSocketState('disconnected');
        if (!manualSocketCloseRef.current && statusRef.current !== 'completed') {
          scheduleReconnect();
        }
      }
    });
  };

  const connectWebSocketSignaling = (creds: SignalingCreds, isReconnect = false) => {
    const socketUrl = process.env.NEXT_PUBLIC_SIGNALING_URL || defaultSignalingUrl();
    const ws = new WebSocket(socketUrl);
    wsRef.current = ws;
    setSocketState('connecting');

    ws.onopen = () => {
      setSocketState('connected');
      clearReconnectTimer();
      if (isReconnect) {
        setStatus('connecting');
      }

      const joinMsg: SignalingClientMessage = {
        type: 'join-room',
        transferId: creds.transferId,
        role: creds.role,
        token: creds.token,
      };
      ws.send(JSON.stringify(joinMsg));
    };

    ws.onmessage = (event) => {
      let message: SignalingServerMessage;
      try {
        message = JSON.parse(String(event.data)) as SignalingServerMessage;
      } catch {
        return;
      }

      if (message.type === 'error') {
        handleLiveFailure(message.message || 'Signaling server error.');
        return;
      }

      if (message.type === 'joined-room') {
        if (message.peerPresent) {
          setStatus('connecting');
          startConnectionTimeout();
          sendReadySignal();
        } else {
          setStatus(creds.role === 'sender' ? 'waiting-peer' : 'connecting');
        }
        return;
      }

      if (message.type === 'peer-joined') {
        setError('');
        setStatus('connecting');
        startConnectionTimeout();
        sendReadySignal();
        return;
      }

      if (message.type === 'peer-left') {
        if (creds.role === 'sender') {
          setStatus('waiting-peer');
          setError('Receiver disconnected. Waiting for reconnect.');
          closePeerConnection();
          return;
        }

        handleLiveFailure('Sender disconnected from the signaling session.');
        return;
      }

      if (message.type === 'relay') {
        void handleRelaySignal(message.signal);
      }
    };

    ws.onclose = () => {
      setSocketState('disconnected');
      wsRef.current = null;
      if (!manualSocketCloseRef.current && statusRef.current !== 'completed') {
        scheduleReconnect();
      }
    };

    ws.onerror = () => {
      handleLiveFailure('Could not connect to signaling server. Verify signaling service and retry.');
    };
  };

  const connectSignaling = (creds: SignalingCreds, isReconnect = false) => {
    closeSignalingSocket();
    manualSocketCloseRef.current = false;
    closePeerConnection();
    if (!isReconnect) {
      resetTransferState();
      reconnectAttemptRef.current = 0;
      setReconnectAttempt(0);
    }
    credsRef.current = creds;

    if (signalingProvider === 'supabase') {
      connectSupabaseSignaling(creds, isReconnect);
      return;
    }

    connectWebSocketSignaling(creds, isReconnect);
  };

  useEffect(() => {
    setOrigin(window.location.origin);
    void (async () => {
      try {
        const response = await fetch('/api/transfer/config', { method: 'GET' });
        if (!response.ok) return;
        const data = (await response.json()) as TransferConfigResponse;
        if (!data.success || !Array.isArray(data.iceServers) || data.iceServers.length === 0) {
          if (typeof data.maxUploadBytes === 'number' && Number.isFinite(data.maxUploadBytes) && data.maxUploadBytes > 0) {
            setMaxUploadBytes(data.maxUploadBytes);
          }
          if (data.signalingProvider === 'ws' || data.signalingProvider === 'supabase') {
            setSignalingProvider(data.signalingProvider);
          }
          return;
        }

        const normalized = data.iceServers.map((item) => ({
          urls: item.urls,
          username: item.username,
          credential: item.credential,
        }));
        setIceServers(normalized);
        if (typeof data.maxUploadBytes === 'number' && Number.isFinite(data.maxUploadBytes) && data.maxUploadBytes > 0) {
          setMaxUploadBytes(data.maxUploadBytes);
        }
        if (data.signalingProvider === 'ws' || data.signalingProvider === 'supabase') {
          setSignalingProvider(data.signalingProvider);
        }
      } catch {
        // Keep default STUN when config endpoint is unavailable.
      }
    })();

    return () => {
      closeSignalingSocket();
      closePeerConnection();
      clearReconnectTimer();
    };
  }, []);

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setError('');
    setStatus('idle');
    setFallbackResult(null);
  };

  const handleCreateTransfer = async () => {
    if (!selectedFile) {
      setError('Select a file first.');
      return;
    }

    setError('');
    setStatus('creating-session');

    try {
      const response = await fetch('/api/transfer/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = (await response.json()) as CreateTransferResponse | { message?: string };
      if (!response.ok || !('success' in data) || data.success !== true) {
        const message = 'message' in data && data.message ? data.message : 'Could not create transfer session.';
        throw new Error(message);
      }

      setTransferCode(data.session.transferCode);
      setStatus('waiting-peer');
      connectSignaling({
        transferId: data.session.transferId,
        token: data.senderToken,
        role: 'sender',
      });
    } catch (err) {
      setStatus('failed');
      setError(err instanceof Error ? err.message : 'Could not create transfer session.');
    }
  };

  const handleJoinTransfer = async () => {
    if (!joinCode.trim()) {
      setError('Enter a transfer code.');
      return;
    }

    setError('');
    setStatus('joining-session');

    try {
      const response = await fetch('/api/transfer/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transferCode: joinCode.trim().toUpperCase() }),
      });
      const data = (await response.json()) as JoinTransferResponse | { message?: string };
      if (!response.ok || !('success' in data) || data.success !== true) {
        const message = 'message' in data && data.message ? data.message : 'Could not join transfer session.';
        throw new Error(message);
      }

      setJoinCode(data.session.transferCode);
      setStatus('connecting');
      connectSignaling({
        transferId: data.session.transferId,
        token: data.receiverToken,
        role: 'receiver',
      });
    } catch (err) {
      setStatus('failed');
      setError(err instanceof Error ? err.message : 'Could not join transfer session.');
    }
  };

  const copyCode = async () => {
    if (!transferCode) return;
    try {
      await navigator.clipboard.writeText(transferCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setError('Could not copy code to clipboard.');
    }
  };

  const copyFallbackLink = async () => {
    if (!fallbackResult?.link) {
      return;
    }

    const fullLink = `${origin}${fallbackResult.link}`;

    try {
      await navigator.clipboard.writeText(fullLink);
      setFallbackCopied(true);
      setTimeout(() => setFallbackCopied(false), 1400);
    } catch {
      setError('Could not copy fallback link to clipboard.');
    }
  };

  const resetForRole = (nextRole: TransferRole) => {
    closeSignalingSocket();
    closePeerConnection();
    credsRef.current = null;
    setRole(nextRole);
    setError('');
    setStatus('idle');
    setTransferCode('');
    resetTransferState();
    if (nextRole === 'sender') {
      setJoinCode('');
    }
  };

  return (
    <div className="space-y-4">
      {/* <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-3 md:p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-100">Live P2P transfer (WebRTC)</h3>
          <Badge variant="secondary" className="rounded-md bg-cyan-500/15 text-cyan-100">
            Phase 6: Supabase migration
          </Badge>
        </div>
        <p className="text-xs text-zinc-400">
          Live transfer includes signaling validation, retry logic, configurable ICE servers (TURN/STUN), and sender fallback upload.
        </p>
      </div> */}

      <div className="grid gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => resetForRole('sender')}
          className={`rounded-xl border p-3 text-left transition ${
            role === 'sender'
              ? 'border-emerald-300/50 bg-emerald-500/10'
              : 'border-zinc-700 bg-zinc-900/65 hover:border-zinc-500'
          }`}
        >
          <p className="text-sm font-medium text-zinc-100">I am sending a file</p>
          <p className="text-xs text-zinc-400">Create a transfer code and share it with the receiver.</p>
        </button>
        <button
          type="button"
          onClick={() => resetForRole('receiver')}
          className={`rounded-xl border p-3 text-left transition ${
            role === 'receiver'
              ? 'border-emerald-300/50 bg-emerald-500/10'
              : 'border-zinc-700 bg-zinc-900/65 hover:border-zinc-500'
          }`}
        >
          <p className="text-sm font-medium text-zinc-100">I am receiving a file</p>
          <p className="text-xs text-zinc-400">Use the transfer code from the sender to connect.</p>
        </button>
      </div>

      <div className="rounded-xl border border-zinc-700 bg-zinc-900/65 p-3 md:p-4">
        {role === 'sender' ? (
          <div key="sender-form" className="space-y-3">
            <label htmlFor="live-file" className="text-xs font-medium text-zinc-300">
              File to send
            </label>
            <Input id="live-file" type="file" onChange={handleFileSelect} className="border-zinc-700 bg-zinc-950 text-zinc-200" />
            {selectedFile && (
              <p className="text-xs text-zinc-400">
                Selected: <span className="text-zinc-200">{selectedFile.name}</span> ({Math.ceil(selectedFile.size / 1024)} KB)
              </p>
            )}

            <Button onClick={handleCreateTransfer} disabled={!canCreate} className="h-9 bg-emerald-400 text-zinc-900 hover:bg-emerald-300">
              {status === 'creating-session' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating session...
                </>
              ) : (
                'Create transfer code'
              )}
            </Button>

            {transferCode && (
              <div className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-950/80 p-2.5">
                <p className="text-xs text-zinc-400">Share this code with receiver:</p>
                <div className="flex items-center gap-2">
                  <Input readOnly value={transferCode} className="h-9 border-zinc-700 bg-zinc-900 text-sm tracking-[0.18em] text-zinc-100" />
                  <Button size="icon" onClick={copyCode} className="h-9 w-9 bg-emerald-400 text-zinc-900 hover:bg-emerald-300">
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div key="receiver-form" className="space-y-3">
            <label htmlFor="join-code" className="text-xs font-medium text-zinc-300">
              Transfer code
            </label>
            <Input
              id="join-code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ABCD-EFGH"
              className="border-zinc-700 bg-zinc-950 text-zinc-200"
            />
            <Button onClick={handleJoinTransfer} disabled={!canJoin} className="h-9 bg-emerald-400 text-zinc-900 hover:bg-emerald-300">
              {status === 'joining-session' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Joining...
                </>
              ) : (
                'Join transfer'
              )}
            </Button>
          </div>
        )}
      </div>

      <div className={`rounded-xl border p-3 ${statusTone}`}>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          {statusIcon}
          {statusLabel(status)}
        </div>
        <div className="h-2 rounded-full bg-zinc-800">
          <div className="h-2 rounded-full bg-emerald-300 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-xs text-zinc-300">
          {status === 'waiting-peer'
            ? 'Waiting for receiver to join and establish signaling.'
            : status === 'connected'
              ? 'Peer connection is up. Data channel ready.'
              : status === 'transferring'
                ? 'Transferring file chunks over WebRTC data channel.'
                : status === 'completed'
                  ? 'Transfer completed.'
                  : 'Start by creating or joining a transfer code.'}
        </p>
        <p className="mt-1 text-[11px] text-zinc-400">Progress: {formatBytes(bytesDone)} / {formatBytes(bytesTotal)}</p>
        <p className="mt-1 text-[11px] text-zinc-400">Signaling socket: {socketState}</p>
        {reconnectAttempt > 0 && status !== 'completed' && (
          <p className="mt-1 text-[11px] text-zinc-400">Reconnect attempts: {reconnectAttempt}/3</p>
        )}
      </div>

      {fallbackUploading && (
        <div className="rounded-lg border border-amber-300/30 bg-amber-500/10 p-3 text-xs text-amber-100">
          Live mode failed. Uploading fallback link...
        </div>
      )}

      {fallbackResult && (
        <div className="rounded-lg border border-emerald-300/30 bg-emerald-500/10 p-3 text-xs text-emerald-100">
          <p className="font-medium">Fallback upload ready: {fallbackResult.filename} ({formatBytes(fallbackResult.size)})</p>
          <div className="mt-2 flex gap-2">
            <Input readOnly value={`${origin}${fallbackResult.link}`} className="h-8 border-zinc-700 bg-zinc-900 text-xs text-zinc-200" />
            <Button size="icon" onClick={copyFallbackLink} className="h-8 w-8 bg-emerald-400 text-zinc-900 hover:bg-emerald-300">
              {fallbackCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-300/30 bg-red-500/10 p-3 text-xs text-red-200">
          {/* For Dev */}
          {/* {error} */}
          Failed
          {status === 'failed' && credsRef.current && (
            <div className="mt-2">
              <Button
                size="sm"
                onClick={() => connectSignaling(credsRef.current as SignalingCreds)}
                className="h-7 bg-red-200 text-red-900 hover:bg-red-100"
              >
                Retry live connection
              </Button>
            </div>
          )}
        </div>
      )}

      <Separator className="bg-zinc-700" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
          <Users className="h-3.5 w-3.5 text-cyan-300" />
          Classic upload remains available as backup.
        </div>
        <Button variant="outline" onClick={onUseClassic} className="h-8 border-zinc-600 text-zinc-200 hover:bg-zinc-800">
          Use classic upload flow
        </Button>
      </div>
    </div>
  );
}
