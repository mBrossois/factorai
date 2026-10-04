/**
 * WebSocket event hub.
 *
 * Owns the set of connected browsers. Also defines the narrow `EventBus`
 * interface that the rest of the server depends on, so `agents/manager.ts`
 * never imports `ws` and can be unit-tested with a fake bus.
 */

import type { IncomingMessage } from 'node:http';
import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';

import { decodeClientMessage, encode, type ClientMessage, type ServerMessage } from '../../src/core/protocol';
import type { AppState } from '../../src/core/types';
import { store } from './store';

export interface EventBus {
  send(message: ServerMessage): void;
}

export type MessageRouter = (message: ClientMessage, reply: EventBus) => void | Promise<void>;

export class WebSocketHub implements EventBus {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private router: MessageRouter | null = null;

  attach(server: Server, path = '/ws'): void {
    this.wss = new WebSocketServer({ server, path });
    this.wss.on('connection', (socket: WebSocket, _request: IncomingMessage) => {
      this.clients.add(socket);
      this.sendTo(socket, { t: 'state', payload: store.snapshot() });

      socket.on('message', (data: Buffer | string) => {
        const raw = typeof data === 'string' ? data : data.toString('utf8');
        const message = decodeClientMessage(raw);
        if (!message) {
          this.sendTo(socket, { t: 'error', payload: 'malformed frame' });
          return;
        }
        void Promise.resolve(this.router?.(message, this.scoped(socket))).catch((err: unknown) => {
          this.sendTo(socket, { t: 'error', payload: errorMessage(err) });
        });
      });

      socket.on('close', () => this.clients.delete(socket));
      socket.on('error', () => this.clients.delete(socket));
    });
  }

  setRouter(router: MessageRouter): void {
    this.router = router;
  }

  /** A bus that only talks to one socket (used to answer a specific request). */
  private scoped(socket: WebSocket): EventBus {
    return { send: (message) => this.sendTo(socket, message) };
  }

  private sendTo(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState !== socket.OPEN) return;
    socket.send(encode(message));
  }

  send(message: ServerMessage): void {
    for (const socket of this.clients) this.sendTo(socket, message);
  }

  /** Push a full state frame (the store subscription does this on every change). */
  broadcastState(state: AppState): void {
    this.send({ t: 'state', payload: state });
  }

  get clientCount(): number {
    return this.clients.size;
  }

  async close(): Promise<void> {
    for (const socket of this.clients) socket.terminate();
    this.clients.clear();
    await new Promise<void>((resolve) => {
      if (!this.wss) return resolve();
      this.wss.close(() => resolve());
    });
    this.wss = null;
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export const hub = new WebSocketHub();
