import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../game-server.mjs', import.meta.url), 'utf8').replace(/export\s*\{[^}]*\};?\s*$/, '');
function table() {
  let now = 1000000;
  class Clock extends Date { static now() { return now; } }
  const game = vm.createContext({ crypto, Date: Clock });
  vm.runInContext(source, game);
  const room = game.createRoom('Host');
  for (let i = 1; i < 8; i++) game.join(room, 'Player ' + i);
  const players = room.players.filter(p => p.kind === 'player');
  const [host, cohost, normal] = players;
  players.forEach((p, i) => { p.ready = true; p.role = i < 2 ? 'mafia' : i === 2 ? 'doctor' : i === 3 ? 'detective' : 'villager'; });
  const command = (p, type, data = {}) => game.act(room, p.id, type, { epoch: room.epoch, ...data });
  command(host, 'cohost', { target: cohost.id });
  return { game, room, players, host, cohost, normal, command, advanceTime: ms => now += ms };
}
test('only the primary host can assign, replace, or remove a co-host', () => {
  const t = table(), { room, host, cohost, normal, command, game } = t;
  assert.equal(room.coHostId, cohost.id); assert.equal(room.hostId, host.id);
  for (const player of [cohost, normal]) {
    assert.throws(() => command(player, 'cohost', { target: normal.id }), /primary host/);
    assert.throws(() => command(player, 'cohost', { target: null }), /primary host/);
  }
  for (const target of [host.id, 'missing', room.players[0].id, undefined]) assert.throws(() => command(host, 'cohost', { target }), /another player/);
  command(host, 'cohost', { target: normal.id }); assert.equal(room.coHostId, normal.id);
  assert.equal(game.publicView(room, normal.id).me.host, false);
  command(host, 'cohost', { target: null }); assert.equal(room.coHostId, null);
  assert.equal(room.hostId, host.id);
});
for (const phase of ['intro', 'sleep', 'discussion', 'dawn', 'verdict', 'end']) {
  for (const manager of ['host', 'cohost']) test(`${manager} can skip ${phase} only after their announcement finishes`, () => {
    const t = table(), { game, room, command } = t;
    game.phase(room, phase, 40);
    if (phase === 'dawn') room.events.push({ id: 'death', type: 'dawn', victims: [t.normal.id], mafiaVictims: [t.normal.id], night: room.night });
    if (phase === 'verdict') room.events.push({ id: 'death', type: 'eliminated', target: t.normal.id, night: room.night });
    const player = t[manager];
    assert.equal(game.publicView(room, player.id).canSkip, false);
    assert.throws(() => command(player, 'continue'), /Finish God's announcement/);
    command(player, 'announcementDone');
    assert.equal(game.publicView(room, player.id).canSkip, true);
    const epoch = room.epoch;
    command(player, 'continue');
    if (phase === 'end') { assert.equal(room.phase, 'end'); assert.equal(room.presentationSkipped, true); }
    else assert.equal(room.epoch, epoch + 1);
  });
}
for (const [phase, role] of [['vote', null], ['runoff', null], ['reveal', null], ['night', 'mafia'], ['night', 'doctor'], ['night', 'detective'], ['night', 'gunner'], ['night', 'cannibal']]) test(`nobody can skip required ${phase}/${role || 'timer'}`, () => {
  const t = table(), { game, room, command } = t;
  game.phase(room, phase, 60); room.nightRole = role;
  const deadline = room.deadline, epoch = room.epoch;
  for (const player of [t.host, t.cohost, t.normal]) {
    command(player, 'announcementDone');
    assert.equal(game.publicView(room, player.id).canSkip, false);
    assert.throws(() => command(player, 'continue'));
    assert.throws(() => command(player, 'advance'));
  }
  assert.equal(room.epoch, epoch); assert.equal(room.deadline, deadline);
});
test('normal players cannot use shared controls even after acknowledging speech', () => {
  const t = table(); t.game.phase(t.room, 'discussion', 60);
  t.command(t.normal, 'announcementDone');
  for (const action of ['continue', 'pause', 'start', 'rematch', 'advance']) assert.throws(() => t.command(t.normal, action), /Only the room host/);
});
test('legacy local advance cannot bypass required decisions either', () => {
  const t = table(); t.room.config.local = true;
  for (const phase of ['reveal', 'vote', 'runoff', 'night']) {
    t.game.phase(t.room, phase, 60); t.command(t.host, 'announcementDone');
    assert.throws(() => t.game.act(t.room, t.host.id, 'advance', { epoch: t.room.epoch }, true), /Required decisions/);
  }
});
test('co-host cannot start/rematch or inherit primary ownership', () => {
  const t = table();
  assert.throws(() => t.command(t.cohost, 'start'), /Only the room host/);
  t.game.phase(t.room, 'end', 0);
  assert.throws(() => t.command(t.cohost, 'rematch'), /Only the room host/);
  t.command(t.host, 'rematch');
  assert.equal(t.room.hostId, t.host.id); assert.equal(t.room.coHostId, t.cohost.id);
  assert.equal(t.room.phase, 'lobby'); assert.deepEqual(Object.keys(t.room.announcementAcks), []);
});
test('revocation takes effect immediately on the server and in public controls', () => {
  const t = table(); t.game.phase(t.room, 'discussion', 60);
  t.command(t.cohost, 'announcementDone'); assert.equal(t.game.canSkip(t.room, t.cohost.id), true);
  t.command(t.host, 'cohost', { target: null });
  assert.equal(t.game.publicView(t.room, t.cohost.id).canSkip, false);
  assert.throws(() => t.command(t.cohost, 'continue'), /Only the room host/);
  assert.throws(() => t.command(t.cohost, 'pause'), /Only the room host/);
});
test('stale acknowledgements and stale skip requests cannot affect a new phase', () => {
  const t = table(); t.game.phase(t.room, 'discussion', 60); const old = t.room.epoch;
  t.command(t.host, 'announcementDone'); t.command(t.host, 'continue');
  assert.equal(t.room.phase, 'vote');
  for (const action of ['announcementDone', 'presentationDone', 'continue']) assert.throws(() => t.command(t.host, action, { epoch: old }), /phase changed/);
  assert.equal(t.game.canSkip(t.room, t.host.id), false);
});
test('a player can acknowledge only their own playback, not enable another manager', () => {
  const t = table(); t.game.phase(t.room, 'dawn', 40);
  t.command(t.normal, 'announcementDone', { playerId: t.host.id });
  assert.equal(t.room.announcementAcks[t.host.id], undefined);
  assert.equal(t.game.canSkip(t.room, t.host.id), false);
  assert.throws(() => t.command(t.host, 'presentationDone'), /Finish the announcement/);
});
test('death phase automatic advance waits for actual host presentation completion', () => {
  const t = table(); t.game.phase(t.room, 'dawn', 40);
  t.advanceTime(41000); assert.equal(t.game.tick(t.room), false);
  t.command(t.host, 'announcementDone'); assert.equal(t.game.tick(t.room), false);
  t.command(t.normal, 'announcementDone'); t.command(t.normal, 'presentationDone'); assert.equal(t.game.tick(t.room), false);
  t.command(t.host, 'presentationDone'); assert.equal(t.game.tick(t.room), true); assert.equal(t.room.phase, 'discussion');
});
test('disconnected-host fallback is bounded and does not change decision timers', () => {
  const t = table(); t.game.phase(t.room, 'dawn', 40);
  t.advanceTime(149999); assert.equal(t.game.tick(t.room), false);
  t.advanceTime(1); assert.equal(t.game.tick(t.room), true);
  t.game.phase(t.room, 'vote', 60); t.advanceTime(60000); assert.equal(t.game.tick(t.room), true);
});
test('co-host pause/resume preserves the full remaining decision interval', () => {
  const t = table(); t.game.phase(t.room, 'night', 35); t.room.nightRole = 'doctor';
  t.advanceTime(7000); t.command(t.cohost, 'pause'); const remaining = t.room.remaining;
  t.advanceTime(90000); assert.equal(t.game.tick(t.room), false);
  assert.throws(() => t.command(t.cohost, 'continue'), /Resume/);
  t.command(t.cohost, 'pause'); assert.equal(t.room.deadline - t.game.Date.now(), remaining);
  assert.equal(t.game.tick(t.room), false); assert.equal(t.room.phase, 'night');
});
test('completed-role settle timer is preserved across pause, not elapsed in the background', () => {
  const t = table(); t.game.phase(t.room, 'night', 35); t.room.nightRole = 'doctor';
  t.room.roleCompleteAt = t.game.Date.now() + 1200;
  t.advanceTime(200); t.command(t.cohost, 'pause'); t.advanceTime(10000); t.command(t.cohost, 'pause');
  assert.equal(t.room.roleCompleteAt - t.game.Date.now(), 1000);
  assert.equal(t.game.tick(t.room), false);
});
test('co-host management does not reveal any additional secret roles or notes', () => {
  const t = table(); t.cohost.role = 'villager'; t.game.phase(t.room, 'night', 35);
  const view = t.game.publicView(t.room, t.cohost.id);
  assert.ok(view.players.every(p => p.role === null)); assert.equal(view.god, null);
  assert.equal(view.coHostId, t.cohost.id); assert.equal(view.hostId, t.host.id);
});
