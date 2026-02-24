'use client';

import { ChangeEvent, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Check, Copy, Loader2, Radio, TriangleAlert, Users } from 'lucide-react';
import { CreateTransferResponse, JoinTransferResponse } from '@/lib/webrtc/protocol';

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

export default function WebRTCTransfer({ onUseClassic }: Props) {
  const [role, setRole] = useState<TransferRole>('sender');
  const [status, setStatus] = useState<TransferStatus>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [transferCode, setTransferCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [progress] = useState(0);

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

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setError('');
    setStatus('idle');
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
      window.setTimeout(() => setStatus('connected'), 300);
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

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-3 md:p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-100">Live P2P transfer (WebRTC)</h3>
          <Badge variant="secondary" className="rounded-md bg-cyan-500/15 text-cyan-100">
            Phase 2: Sessions
          </Badge>
        </div>
        <p className="text-xs text-zinc-400">
          Session creation/join APIs are active. Signaling, SDP/ICE exchange, and real byte transfer are in Phase 3+.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            setRole('sender');
            setError('');
            setStatus('idle');
          }}
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
          onClick={() => {
            setRole('receiver');
            setError('');
            setStatus('idle');
          }}
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
            ? 'Waiting for receiver to join the transfer code.'
            : status === 'connected'
              ? 'Peer connected. Real data channel transfer will be wired in the next phase.'
              : 'Transfer progress will update here once WebRTC data channel is integrated.'}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300/30 bg-red-500/10 p-3 text-xs text-red-200">
          {error}
        </div>
      )}

      <Separator className="bg-zinc-700" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
          <Users className="h-3.5 w-3.5 text-cyan-300" />
          Fallback remains available if live mode fails.
        </div>
        <Button variant="outline" onClick={onUseClassic} className="h-8 border-zinc-600 text-zinc-200 hover:bg-zinc-800">
          Use classic upload flow
        </Button>
      </div>
    </div>
  );
}
