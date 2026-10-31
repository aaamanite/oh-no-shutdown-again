// Multiplayer rooms for the co-op SOC mode. The game itself is static files; only /room/<CODE> reaches this
// Worker (a WebSocket). Each room code is one Durable Object that relays messages between the three players and
// keeps the roster: who holds which role and who hosts. The host's browser runs the grid simulation.
import { DurableObject } from 'cloudflare:workers';

const ROLES = ['analyst', 'responder', 'engineer'];

export default {
  async fetch(req, env) {
    const m = new URL(req.url).pathname.match(/^\/room\/([A-Z0-9]{4,8})$/i);
    if (!m) return env.ASSETS.fetch(req);
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    return env.ROOMS.get(env.ROOMS.idFromName(m[1].toUpperCase())).fetch(req);
  },
};

export class Room extends DurableObject {
  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  players() {
    return this.ctx.getWebSockets().map(ws => ({ ws, p: ws.deserializeAttachment() })).filter(x => x.p);
  }

  roster() {
    const list = this.players().map(({ p }) => ({ role: p.role, name: p.name, host: p.host }));
    this.broadcast({ t: 'roster', players: list });
  }

  broadcast(msg, except) {
    const s = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) if (ws !== except && ws.deserializeAttachment()) try { ws.send(s); } catch { /* closing */ }
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 200000) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const me = ws.deserializeAttachment();

    if (msg.t === 'join') {
      const role = ROLES.includes(msg.role) ? msg.role : null;
      const name = String(msg.name || '').trim().slice(0, 24) || 'Player';
      const others = this.players().filter(x => x.ws !== ws);
      const err = text => { ws.send(JSON.stringify({ t: 'error', text })); ws.close(4000, text); };
      if (!role) return err('Pick a role.');
      if (msg.create && others.length) return err('That room code is already in use. Create a new room.');
      if (!msg.create && !others.some(x => x.p.host)) return err('Room not found. Check the code with your host.');
      if (others.some(x => x.p.role === role)) return err('That role is taken. Pick another one.');
      ws.serializeAttachment({ role, name, host: !!msg.create });
      ws.send(JSON.stringify({ t: 'joined', role, host: !!msg.create }));
      this.roster();
      return;
    }
    if (!me) return;
    if (msg.t === 'chat') {
      const text = String(msg.text || '').trim().slice(0, 400);
      if (text) this.broadcast({ t: 'chat', text, role: me.role, name: me.name, at: Date.now() });
      return;
    }
    // game traffic: state, records and toasts come from the host; actions go to the host
    if (['state', 'record', 'toast', 'log', 'start'].includes(msg.t) && !me.host) return;
    this.broadcast({ ...msg, from: me.role, name: me.name }, ws);
  }

  async webSocketClose(ws) {
    const me = ws.deserializeAttachment();
    ws.serializeAttachment(null);
    if (me?.host) this.broadcast({ t: 'host-left' });
    this.roster();
  }

  async webSocketError(ws) { await this.webSocketClose(ws); }
}
