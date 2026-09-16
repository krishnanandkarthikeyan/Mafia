/* Kazhutha multiplayer. The host owns the game; guests receive only their own hand. */
(function (root) {
  'use strict';
  const fail = (message, status = 400) => Object.assign(new Error(message), { status });
  const randomHex = bytes => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  const validCode = code => typeof code === 'string' && /^KZH-[A-F0-9]{6}$/.test(code);
  const nameOf = name => String(name || 'Player').trim().slice(0, 24) || 'Player';

  class Room {
    constructor(engine, options, now = Date.now) {
      if (!Number.isInteger(options.count) || options.count < 2 || options.count > 6) throw fail('Choose 2 to 6 players.');
      this.engine = engine;
      this.now = now;
      this.code = options.code;
      this.rules = options.rules === 'trump' ? engine.trump : engine.classic;
      this.difficulty = ['Easy', 'Medium', 'Hard', 'Expert'].includes(options.difficulty) ? options.difficulty : 'Medium';
      this.seats = Array.from({ length: options.count }, (_, i) => ({ name: i ? 'Open seat' : nameOf(options.name), type: i ? 'open' : 'human' }));
      this.members = [{ token: randomHex(24), seat: 0, lastSeen: now() }];
      this.game = null;
      this.chat = [];
      this.nextStep = 0;
    }
    member(token) {
      const m = this.members.find(m => m.token === token);
      if (!m) throw fail('Your seat is no longer available. Join the room again.', 403);
      return m;
    }
    snapshot(member, includeToken = false) {
      return {
        code: this.code, seat: member.seat,
        ...(includeToken ? { token: member.token } : {}),
        lobby: { seats: this.seats.map(s => ({ ...s })) },
        chat: this.chat.map(m => ({ ...m })),
        game: this.game ? this.engine.view(this.game, member.seat) : null
      };
    }
    join(request) {
      let m = request.token && this.members.find(m => m.token === request.token);
      if (!m) {
        if (this.game) throw fail('This game has already started. Ask the host to create another room.');
        const seat = this.seats.findIndex(s => s.type === 'open');
        if (seat < 0) throw fail('This room is full.');
        m = { token: randomHex(24), seat, lastSeen: this.now() };
        this.members.push(m);
        this.seats[seat] = { name: nameOf(request.name), type: 'human' };
      }
      m.lastSeen = this.now();
      return this.snapshot(m, true);
    }
    handle(request) {
      if (!request || request.code !== this.code) throw fail('Room not found.', 404);
      if (request.op === 'join') return this.join(request);
      const m = this.member(request.token);
      m.lastSeen = this.now();
      switch (request.op) {
        case 'poll': break;
        case 'start':
        case 'rematch': {
          if (m.seat !== 0) throw fail('Only the host can start a round.', 403);
          if (this.game && this.game.status === 'playing') throw fail('Finish the current round first.', 409);
          this.seats = this.seats.map((s, i) => s.type === 'open' ? { name: 'AI ' + (i + 1), type: 'ai' } : s);
          const seed = crypto.getRandomValues(new Uint32Array(1))[0];
          this.game = this.engine.create(this.seats, this.rules, seed);
          // The original local engine embeds its shuffle seed in the game ID.
          // Online guests must not receive that ID, because it reveals the deal.
          this.game.id = randomHex(24);
          this.nextStep = this.now() + 1000;
          break;
        }
        case 'play':
          if (!this.game || this.game.id !== request.expectedGameId || this.game.moves !== request.expectedMoves) throw fail('The table changed. Check your hand and play again.', 409);
          this.game = this.engine.play(this.game, m.seat, request.card);
          this.nextStep = this.now() + (this.game.result ? 1600 : 900);
          break;
        case 'chat': {
          const text = typeof request.text === 'string' ? request.text.trim().slice(0, 180) : '';
          if (!text) throw fail('Enter a message.');
          if (m.lastChat && this.now() - m.lastChat < 700) throw fail('Please wait a moment before sending another message.');
          m.lastChat = this.now();
          this.chat.push({ id: randomHex(8), seat: m.seat, name: this.seats[m.seat].name, text, time: this.now() });
          this.chat = this.chat.slice(-60);
          break;
        }
        case 'replace': {
          if (m.seat !== 0) throw fail('Only the host can replace a disconnected player.', 403);
          const seat = request.seat;
          if (!Number.isInteger(seat) || seat <= 0 || seat >= this.seats.length) throw fail('Invalid seat.');
          const guest = this.members.find(p => p.seat === seat);
          if (guest && this.now() - guest.lastSeen < 30000) throw fail('This player is still connected. Wait 30 seconds after they disconnect.');
          this.members = this.members.filter(p => p.seat !== seat);
          this.seats[seat] = { name: this.seats[seat].name + ' (AI)', type: 'ai' };
          if (this.game) this.game.players[seat] = { ...this.game.players[seat], ...this.seats[seat] };
          break;
        }
        default: throw fail('Unknown room action.');
      }
      return this.snapshot(m);
    }
    tick() {
      if (!this.game || this.game.status !== 'playing' || this.now() < this.nextStep) return;
      if (this.game.result) this.game = this.engine.resolve(this.game);
      else if (this.game.players[this.game.currentPlayer].type === 'ai') {
        const choice = this.engine.ai(this.engine.view(this.game, this.game.currentPlayer), this.difficulty);
        this.game = this.engine.play(this.game, this.game.currentPlayer, choice.card.id);
      } else return;
      this.nextStep = this.now() + (this.game.result ? 1600 : 900);
    }
  }

  function loadPeer() {
    if (root.Peer) return Promise.resolve(root.Peer);
    if (loadPeer.pending) return loadPeer.pending;
    loadPeer.pending = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => finish(fail('The connection service did not respond. Check your internet connection.')), 15000);
      function finish(error) {
        clearTimeout(timer);
        script.onload = script.onerror = null;
        if (error) { script.remove(); loadPeer.pending = null; reject(error); }
        else resolve(root.Peer);
      }
      script.src = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js';
      script.onload = () => root.Peer ? finish() : finish(fail('Unable to load multiplayer. Please reload.'));
      script.onerror = () => finish(fail('Unable to load the connection service. Check your connection and try again.'));
      document.head.appendChild(script);
    });
    return loadPeer.pending;
  }

  function createClient(engine, localRequest) {
    let peer = null, room = null, connection = null, roomCode = '', serial = 0;
    let opening = null, connecting = null, timer = null;
    const pending = new Map();
    function clearPending(message) {
      for (const p of pending.values()) { clearTimeout(p.timer); p.reject(fail(message)); }
      pending.clear();
    }
    function leave() {
      clearInterval(timer); timer = null;
      clearPending('You left the room.');
      if (connection) connection.close();
      if (peer) peer.destroy();
      connection = peer = room = null; roomCode = ''; opening = connecting = null;
    }
    async function openPeer(id) {
      if (peer && !peer.destroyed && peer.open) return peer;
      if (opening) return opening;
      opening = (async () => {
        const Peer = await loadPeer();
        return new Promise((resolve, reject) => {
          const p = new Peer(id, { debug: 0 });
          peer = p;
          const timeout = setTimeout(() => { p.destroy(); reject(fail('Could not reach the room service. Try another network.')); }, 15000);
          p.on('open', () => { clearTimeout(timeout); resolve(p); });
          p.on('error', error => {
            clearTimeout(timeout);
            const message = error.type === 'peer-unavailable' ? 'Room not found. Check the code and ask the host to keep the game open.' : 'Room connection failed. Check your internet connection and try again.';
            reject(fail(message, error.type === 'peer-unavailable' ? 404 : 400));
            clearPending(message);
          });
          p.on('disconnected', () => { if (!p.destroyed) { try { p.reconnect(); } catch (_) {} } });
          p.on('connection', conn => {
            if (!room) { conn.close(); return; }
            let boundToken = null;
            let messages = 0, windowStart = Date.now();
            conn.on('data', packet => {
              if (!room || !packet || typeof packet.id !== 'string' || packet.id.length > 80) return;
              if (Date.now() - windowStart > 1000) { messages = 0; windowStart = Date.now(); }
              if (++messages > 20) { conn.close(); return; }
              try {
                const request = packet.request;
                if (!request || JSON.stringify(request).length > 2000) throw fail('Invalid request.');
                if (request.op !== 'join' && (!boundToken || request.token !== boundToken)) throw fail('Join this room first.', 403);
                if (request.op === 'join' && boundToken) throw fail('This connection already has a seat.', 403);
                if (request.op === 'join' && request.token === room.members[0].token) throw fail('The host seat cannot be joined remotely.', 403);
                const response = room.handle(request);
                if (request.op === 'join') boundToken = response.token;
                conn.send({ id: packet.id, response });
              } catch (error) { conn.send({ id: packet.id, error: error.message, status: error.status || 400 }); }
            });
            conn.on('error', () => {});
          });
        });
      })();
      try { return await opening; } finally { opening = null; }
    }
    async function connect(code) {
      if (connection && connection.open && roomCode === code) return;
      if (connecting) return connecting;
      connecting = (async () => {
        const p = await openPeer();
        if (connection) connection.close();
        roomCode = code;
        await new Promise((resolve, reject) => {
          const conn = p.connect('kazhutha-table-v1-' + code, { reliable: true, serialization: 'json' });
          connection = conn;
          const timeout = setTimeout(() => { conn.close(); reject(fail('Could not connect to the host. Ask them to keep the game open, or try another network.')); }, 18000);
          conn.on('open', () => { clearTimeout(timeout); resolve(); });
          conn.on('data', packet => {
            const q = packet && pending.get(packet.id);
            if (!q) return;
            pending.delete(packet.id); clearTimeout(q.timer);
            if (packet.error) q.reject(fail(packet.error, packet.status)); else q.resolve(packet.response);
          });
          conn.on('close', () => { clearTimeout(timeout); reject(fail('The host connection closed.')); if (connection === conn) clearPending('Disconnected from the host. Keep this page open to reconnect.'); });
          conn.on('error', () => { clearTimeout(timeout); reject(fail('Could not connect to the host.')); });
        });
      })();
      try { return await connecting; } finally { connecting = null; }
    }
    function rpc(request) {
      return new Promise((resolve, reject) => {
        if (!connection || !connection.open) { reject(fail('The host is disconnected.')); return; }
        const id = String(++serial);
        const timer = setTimeout(() => { pending.delete(id); reject(fail('The host did not respond. Check your connection.')); }, 12000);
        pending.set(id, { resolve, reject, timer });
        try { connection.send({ id, request }); } catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
      });
    }
    async function request(payload) {
      if (payload.op === 'stats' || payload.op === 'save') return localRequest(payload);
      if (payload.op === 'create') {
        leave();
        const code = 'KZH-' + randomHex(3);
        room = new Room(engine, { ...payload, code }); roomCode = code;
        try { await openPeer('kazhutha-table-v1-' + code); }
        catch (error) { leave(); throw error; }
        timer = setInterval(() => room && room.tick(), 200);
        return room.snapshot(room.members[0], true);
      }
      if (!validCode(payload.code)) throw fail('Enter a room code such as KZH-A1B2C3.');
      if (room && payload.code === room.code) return room.handle(payload);
      if (payload.op === 'join') {
        if (room) leave();
        // A fresh transport needs to establish its seat before any other action.
        if (connection) { connection.close(); connection = null; }
        await connect(payload.code);
        return rpc(payload);
      }
      const reconnecting = !connection || !connection.open;
      await connect(payload.code);
      if (reconnecting) await rpc({ op: 'join', code: payload.code, token: payload.token });
      return rpc(payload);
    }
    return { request, leave };
  }
  root.KazhuthaMultiplayer = { Room, createClient };
})(typeof window !== 'undefined' ? window : globalThis);
