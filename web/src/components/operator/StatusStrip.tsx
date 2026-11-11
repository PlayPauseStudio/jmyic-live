'use client';

import { useEffect, useRef, useState } from 'react';
import { gameStateManager } from '@/lib/gameState';
import { OP } from '@/lib/realtime';

/** What op:status returns (server/src/socket/handlers/operator.ts). */
interface ServerStatus {
  serverTime: number;
  online: { operators: number; bigScreens: number; phones: number };
  players: number;
  fakePlayers: number;
  answersNow: number;
  worstStallMs: number;
  memoryMb: number;
  snapshots: string;
  savedAgoMs: number | null;
  uptimeS: number;
  logRows: number;
}

type Tone = 'good' | 'warn' | 'bad' | 'plain';

const TONE: Record<Tone, string> = {
  good: 'bg-green-900/60 text-green-200 border-green-700',
  warn: 'bg-amber-900/60 text-amber-200 border-amber-600',
  bad: 'bg-red-900/70 text-red-100 border-red-500',
  plain: 'bg-gray-800 text-gray-200 border-gray-600',
};

function Chip({ tone, label, value, title }: { tone: Tone; label: string; value: string; title?: string }) {
  return (
    <div className={`flex items-baseline gap-1.5 px-3 py-1.5 rounded-md border text-sm whitespace-nowrap ${TONE[tone]}`} title={title}>
      <span className="text-xs uppercase tracking-wide opacity-70">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

const POLL_MS = 2000;

function ago(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
}

function uptime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

/**
 * Show-day health at a glance: server link, big screen, phones, server load
 * and the Redis backup. Asks the server every two seconds while connected.
 */
export default function StatusStrip({ connected, hasQuestion }: { connected: boolean; hasQuestion: boolean }) {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [rttMs, setRttMs] = useState<number | null>(null);
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const inFlight = useRef(false);

  useEffect(() => {
    if (!connected) return;
    let alive = true;
    const poll = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      const started = performance.now();
      const ack = await gameStateManager.send(OP.STATUS);
      inFlight.current = false;
      if (!alive) return;
      setNow(Date.now());
      if (ack.ok && ack.status) {
        setStatus(ack.status as ServerStatus);
        setRttMs(Math.round(performance.now() - started));
        setLastOkAt(Date.now());
      }
    };
    void poll();
    const t = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [connected]);

  // Keep "x seconds ago" honest when polls stop coming back.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const stale = lastOkAt === null || now - lastOkAt > 8000;
  const chips: React.ReactNode[] = [];

  if (!connected) {
    chips.push(<Chip key="srv" tone="bad" label="Server" value="Reconnecting…" />);
  } else if (stale) {
    chips.push(<Chip key="srv" tone="bad" label="Server" value="Not answering" title="Connected, but status requests aren't coming back" />);
  } else {
    const slow = (rttMs ?? 0) > 400;
    chips.push(
      <Chip key="srv" tone={slow ? 'warn' : 'good'} label="Server" value={`Connected · ${rttMs} ms`} title={`Round trip from this laptop. Up ${uptime(status?.uptimeS ?? 0)}`} />,
    );
  }

  if (status && !stale) {
    const s = status;
    chips.push(
      <Chip
        key="screen"
        tone={s.online.bigScreens > 0 ? 'good' : 'bad'}
        label="Big screen"
        value={s.online.bigScreens > 0 ? `${s.online.bigScreens} connected` : 'Not connected'}
      />,
    );
    const real = s.players - s.fakePlayers;
    chips.push(
      <Chip
        key="phones"
        tone="plain"
        label="Phones"
        value={`${s.online.phones} online · ${real} registered`}
        title="Online = phones with the play page open right now. Registered = signed up this episode."
      />,
    );
    if (hasQuestion) chips.push(<Chip key="ans" tone="plain" label="Answers" value={`${s.answersNow}`} title="Play-along answers to the question on screen" />);

    const load = s.worstStallMs;
    chips.push(
      <Chip
        key="load"
        tone={load < 100 ? 'good' : load < 300 ? 'warn' : 'bad'}
        label="Server load"
        value={load < 100 ? `OK · ${load} ms` : load < 300 ? `Busy · ${load} ms` : `Overloaded · ${load} ms`}
        title={`Longest wait for the server in the last 10 seconds. Memory ${s.memoryMb} MB.`}
      />,
    );

    if (s.snapshots === 'disabled') {
      chips.push(<Chip key="backup" tone="warn" label="Backup" value="Off" title="No Redis: a server restart would lose the show" />);
    } else if (s.snapshots !== 'connected') {
      chips.push(<Chip key="backup" tone="bad" label="Backup" value={s.snapshots === 'connecting' ? 'Reconnecting' : 'Down'} title="Redis is unreachable: a server restart now would lose recent changes" />);
    } else {
      const old = s.savedAgoMs !== null && s.savedAgoMs > 30_000;
      chips.push(
        <Chip
          key="backup"
          tone="good"
          label="Backup"
          value={s.savedAgoMs === null ? 'Ready' : `Saved ${ago(s.savedAgoMs)}`}
          title={old ? 'Nothing has changed since — that is normal.' : 'Saved to Redis; survives a server restart'}
        />,
      );
    }
    chips.push(<Chip key="log" tone="plain" label="Log" value={`${s.logRows} rows`} title="Episode log rows — in the Excel export" />);
  }

  const fakes = status && !stale ? status.fakePlayers : 0;

  return (
    <div className="sticky top-0 z-40 mb-6 bg-gray-950/90 backdrop-blur border-b border-gray-700 px-6 py-2">
      <div className="flex flex-wrap items-center gap-2">{chips}</div>
      {fakes > 0 && (
        <div className="mt-2 px-3 py-1.5 rounded-md bg-amber-500 text-black text-sm font-bold">
          REHEARSAL MODE — {fakes} fake players are in the game and on the leaderboard. Remove them in the Rehearsal box (left column) before the real show.
        </div>
      )}
    </div>
  );
}
