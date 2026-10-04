/**
 * Live state over WebSocket.
 *
 * The server owns the swarm state and pushes a full snapshot on every change,
 * so the client only needs one message type to stay current. This hook owns the
 * socket lifecycle (connect, reconnect with backoff, subscribe) and exposes a
 * send function for the client -> server half of the protocol.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ClientMessage, ServerMessage } from '../core/protocol';
import { EMPTY_STATE, type AppState } from '../core/types';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

export interface SwarmSocket {
  state: AppState;
  status: ConnectionStatus;
  /** Last server notice or error, surfaced as a toast in the HUD. */
  message: { text: string; kind: 'info' | 'error'; at: number } | null;
  dismissMessage: () => void;
  send: (message: ClientMessage) => boolean;
  clearLogs: (agentId: string) => void;
}

const MAX_BACKOFF_MS = 8_000;
const NOTICE_TTL_MS = 6_000;

function socketUrl(): string {
  if (typeof window === 'undefined') return 'ws://127.0.0.1:8787/ws';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export function useSwarmSocket(): SwarmSocket {
  const [state, setState] = useState<AppState>(EMPTY_STATE);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [message, setMessage] = useState<SwarmSocket['message']>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const backoff = useRef(600);
  const closed = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    closed.current = false;

    const connect = () => {
      if (closed.current) return;
      setStatus((current) => (current === 'open' ? current : 'connecting'));

      let socket: WebSocket;
      try {
        socket = new WebSocket(socketUrl());
      } catch {
        scheduleReconnect();
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        backoff.current = 600;
        setStatus('open');
        socket.send(JSON.stringify({ t: 'subscribe' }));
      };

      socket.onmessage = (event) => {
        let parsed: ServerMessage;
        try {
          parsed = JSON.parse(String(event.data)) as ServerMessage;
        } catch {
          return;
        }
        handle(parsed);
      };

      socket.onerror = () => {
        // `onclose` always follows, so reconnection is handled there.
      };

      socket.onclose = () => {
        socketRef.current = null;
        setStatus('closed');
        scheduleReconnect();
      };
    };

    const handle = (message: ServerMessage) => {
      switch (message.t) {
        case 'state':
          setState(message.payload);
          break;
        case 'agentLog':
          setState((current) => {
            const existing = current.logs[message.payload.agentId] ?? [];
            const merged = [...existing, ...message.payload.lines].slice(-200);
            return { ...current, logs: { ...current.logs, [message.payload.agentId]: merged } };
          });
          break;
        case 'issueUpdated':
          setState((current) => ({
            ...current,
            issues: current.issues.some((i) => i.id === message.payload.id)
              ? current.issues.map((i) => (i.id === message.payload.id ? message.payload : i))
              : [...current.issues, message.payload],
          }));
          break;
        case 'prCreated':
          setState((current) =>
            current.prs.some((p) => p.id === message.payload.id)
              ? current
              : { ...current, prs: [...current.prs, message.payload] },
          );
          break;
        case 'error':
        case 'notice':
          setMessage({ text: message.payload, kind: message.t === 'error' ? 'error' : 'info', at: Date.now() });
          break;
        case 'pong':
          break;
      }
    };

    const scheduleReconnect = () => {
      if (closed.current) return;
      const delay = backoff.current;
      backoff.current = Math.min(MAX_BACKOFF_MS, Math.round(delay * 1.7));
      retryTimer.current = setTimeout(connect, delay);
    };

    connect();

    return () => {
      closed.current = true;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  // Notices auto-expire so the toast stack never becomes permanent furniture.
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), NOTICE_TTL_MS);
    return () => clearTimeout(timer);
  }, [message]);

  const send = useCallback((outgoing: ClientMessage): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(outgoing));
    return true;
  }, []);

  const dismissMessage = useCallback(() => setMessage(null), []);

  const clearLogs = useCallback((agentId: string) => {
    setState((current) => ({ ...current, logs: { ...current.logs, [agentId]: [] } }));
  }, []);

  return { state, status, message, send, clearLogs, dismissMessage };
}