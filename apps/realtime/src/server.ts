import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Limiter, clientIp, pinClientIp } from './limits.ts';
import { PartyRoom } from './party-room.ts';

/** The realtime server, not yet listening (tests boot it their own way). */
export function createPartyServer(): { server: Server; http: HttpServer } {
  const http = createServer();
  // Before the transport's own upgrade handler: rooms see only the address we trust.
  http.prependListener('upgrade', pinClientIp);
  const server = new Server({
    transport: new WebSocketTransport({ server: http }),
    greet: false,
    gracefullyShutdown: false,
  });
  server.define('party', PartyRoom);
  return { server, http };
}

/**
 * SECURITY.md §5: room codes can't be brute-forced — at most `limit` matchmaking requests
 * (create or join-by-code) per IP per hour. Call after `listen()`: Colyseus registers its
 * HTTP handler then, and this wraps every handler behind one gate.
 */
export function guardHttp(http: HttpServer, limiter = new Limiter(1000, 60 * 60 * 1000)): void {
  const handlers = http.listeners('request') as Array<(...args: unknown[]) => void>;
  http.removeAllListeners('request');
  http.on('request', (req, res) => {
    if (
      req.method === 'POST' &&
      req.url?.startsWith('/matchmake/') &&
      !limiter.hit(clientIp(req))
    ) {
      res.writeHead(429, { 'content-type': 'text/plain' }).end('Too many attempts. Try later.');
      return;
    }
    for (const h of handlers) h(req, res);
  });
}
