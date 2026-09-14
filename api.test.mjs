import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

test('eight authenticated clients: co-host controls, revocation, decisions, and server-served build', async t => {
  process.env.PORT = '0';
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'mafia-api-test-'));
  const { server } = await import('../server.mjs');
  if (!server.listening) await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const api = async (body, status = 200) => {
    const response = await fetch(origin + '/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    assert.equal(response.status, status, JSON.stringify(data));
    return data;
  };
  const host = await api({ op: 'create', name: 'Host' });
  const clients = [host];
  for (let i = 1; i < 8; i++) clients.push(await api({ op: 'join', code: host.code, name: 'Player ' + i }));
  const [owner, cohost, normal] = clients;
  const command = (client, type, data = {}, status = 200) => api({ op: 'command', code: host.code, token: client.token, type, data }, status);
  const poll = client => api({ op: 'poll', code: host.code, token: client.token });
  const coId = cohost.view.me.id;
  await command(owner, 'cohost', { target: coId });
  const coView = (await poll(cohost)).view;
  assert.equal(coView.coHostId, coId); assert.equal(coView.me.host, false); assert.equal(coView.hostId, owner.view.me.id);
  await command(normal, 'cohost', { target: normal.view.me.id }, 400);
  await command(cohost, 'start', {}, 400);
  await api({ op: 'poll', code: host.code, token: 'invalid' }, 403);
  for (const client of clients) await command(client, 'ready', { ready: true });
  const started = (await command(owner, 'start')).view;
  assert.equal(started.phase, 'reveal');
  await command(cohost, 'continue', { epoch: started.epoch }, 400);

  // Test-owned database only: jump clocks/phases without waiting minutes in CI.
  const setPhase = async (phase, role = null) => {
    const db = globalThis.mafiaDatabase;
    const row = await db.prepare('SELECT state FROM mafia_rooms WHERE code=?').bind(host.code).first();
    const room = JSON.parse(row.state);
    Object.assign(room, { phase, nightRole: role, epoch: room.epoch + 1, phaseStartedAt: Date.now(), deadline: Date.now() + 60000, actionOpenAt: 0, roleCompleteAt: 0, announcementAcks: {}, presentationAcks: {}, presentationSkipped: false });
    room.revision++;
    await db.prepare('UPDATE mafia_rooms SET state=?,revision=? WHERE code=?').bind(JSON.stringify(room), room.revision, host.code).run();
    return room.epoch;
  };
  let epoch = await setPhase('discussion');
  await command(cohost, 'continue', { epoch }, 400);
  await command(normal, 'announcementDone', { epoch, playerId: coId });
  assert.equal((await poll(cohost)).view.canSkip, false);
  await command(cohost, 'announcementDone', { epoch });
  assert.equal((await poll(cohost)).view.canSkip, false);
  await command(cohost, 'presentationDone', { epoch });
  assert.equal((await poll(cohost)).view.canSkip, true);
  await command(normal, 'continue', { epoch }, 400);
  const voting = (await command(cohost, 'continue', { epoch })).view;
  assert.equal(voting.phase, 'vote');
  for (const client of clients) {
    await command(client, 'announcementDone', { epoch: voting.epoch });
    await command(client, 'continue', { epoch: voting.epoch }, 400);
  }
  // Simultaneous genuine decisions still resolve, without a host override.
  const ballots = await Promise.all(clients.map(client => command(client, 'vote', { epoch: voting.epoch, target: 'skip' })));
  assert.ok(ballots.some(result => result.view.phase === 'verdict'));
  assert.equal((await poll(owner)).view.phase, 'verdict');
  epoch = await setPhase('night', 'mafia');
  for (const client of [owner, cohost]) {
    await command(client, 'announcementDone', { epoch });
    await command(client, 'continue', { epoch }, 400);
    await command(client, 'advance', { epoch }, 400);
  }
  epoch = await setPhase('dawn');
  await command(cohost, 'announcementDone', { epoch });
  await command(owner, 'cohost', { target: null });
  assert.equal((await poll(cohost)).view.canSkip, false);
  await command(cohost, 'continue', { epoch }, 400);
  await command(cohost, 'pause', { epoch }, 400);
  await command(owner, 'announcementDone', { epoch });
  await command(owner, 'presentationDone', { epoch });
  assert.equal((await command(owner, 'continue', { epoch })).view.phase, 'discussion');

  // Real authenticated HTTP clients publish their own audio state. One slow
  // client must block the co-host even after the co-host's death clip has ended.
  epoch = await setPhase('dawn');
  const audioPoll = (client, busy) => api({op:'poll',code:host.code,token:client.token,audioProtocol:2,audioVisible:true,audioEpoch:epoch,audioBusy:busy});
  for (const client of clients) await audioPoll(client, true);
  await command(owner, 'announcementDone', {epoch});
  await command(owner, 'presentationDone', {epoch});
  for (const client of clients.slice(0,-1)) await audioPoll(client, false);
  assert.equal((await poll(owner)).view.audioBlocked, true);
  await command(owner, 'continue', {epoch}, 400);
  await audioPoll(clients.at(-1), false);
  assert.equal((await poll(owner)).view.canSkip, true);
  assert.equal((await command(owner, 'continue', {epoch})).view.phase, 'discussion');
  // All eight foreground clients are reserved in the next phase, before speech
  // can be submitted. A stale last-phase poll cannot clear those new holds.
  const next = await audioPoll(clients.at(-1), false);
  assert.equal(next.view.audioBlocked, true);
  assert.equal(next.view.audioHolds, undefined);

  const response = await fetch(origin);
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/html/);
  const html = await response.text();
  assert.ok(html.includes('const PRE_SPEECH_MS = 700'));
  assert.ok(html.includes('Assign or remove Co-Host'));
  assert.ok(html.includes('/audio/chath(2).mp3'));
  assert.ok(html.includes('/audio/mohanlal.mp3'));
});
