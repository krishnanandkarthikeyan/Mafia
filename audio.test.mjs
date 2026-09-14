import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const runtime = fs.readFileSync(new URL('../audio-runtime.js', import.meta.url), 'utf8');
const lines = source.slice(source.indexOf('  function Lu('), source.indexOf('  function Qm('));
const reminders = source.slice(source.indexOf('  function bL('), source.indexOf('  function $m('));
const mapping = source.slice(source.indexOf('  var Tu ='), source.indexOf('  var qd ='));
const flush = async () => { for (let n = 0; n < 20; n++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
function rig({ native = false, voices = [{ lang: 'en-US', name: 'Natural English', default: true }], cold = null } = {}) {
  let now = 0, id = 0;
  const timers = new Map(), events = [], listeners = new Map(), utterances = [], notices = [];
  const setTimeout = (fn, delay) => { timers.set(++id, { fn, at: now + delay }); return id; };
  const clearTimeout = id => timers.delete(id);
  const advance = async (duration) => {
    await flush();
    const end = now + duration;
    for (;;) {
      const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].fn(); await flush();
    }
    now = end; await flush();
  };
  const synth = {
    resume() { events.push(['resume', now]); },
    cancel() { events.push(['cancel', now]); },
    getVoices() { return voices; },
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name) { listeners.delete(name); },
    speak(u) { events.push(['speak', now, u.text]); utterances.push(u); u.onstart?.(); }
  };
  const window = { speechSynthesis: synth, addEventListener: (n, f) => listeners.set(n, f), removeEventListener: n => listeners.delete(n) };
  if (native) window.NativeGod = { command(json) { const command = JSON.parse(json); events.push([command.op, now, command]); } };
  const context = vm.createContext({ window, document: { hidden: false }, crypto, setTimeout, clearTimeout, queueMicrotask,
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } } });
  vm.runInContext(runtime + lines + reminders + mapping, context);
  const audio = { duck: value => events.push(['duck', now, value]) };
  if (cold) audio.ctx = { state: 'suspended', resume: () => cold.promise };
  const god = new context.MafiaAudio.GodVoice(audio, value => events.push(['speaking', now, value]), n => notices.push(n), context.Lu, context.bL);
  return { god, events, utterances, synth, context, listeners, notices, advance, setVoices(v) { voices = v; listeners.get('voiceschanged')?.(); } };
}
const levels = { master: 1, voice: 1, muted: false };
const view = (phase, extra = {}) => ({ id: 'room', epoch: 1, phase, night: 1, players: [{ id: 'a', name: 'Anu' }, { id: 'b', name: 'Binu' }], events: [], winner: 'village', ...extra });
const scenarios = [
  ...['lobby', 'reveal', 'intro', 'sleep', 'discussion', 'vote', 'runoff', 'verdict', 'end'].map(p => view(p)),
  view('lobby', { epoch: 0 }),
  ...['mafia', 'doctor', 'detective', 'gunner', 'cannibal', null].flatMap(role => [view('night', { nightRole: role }), view('night', { nightRole: role, events: [{ type: 'roleClosed', night: 1, timedOut: true }] })]),
  view('dawn'), view('dawn', { events: [{ type: 'dawn', night: 1, victims: ['a', 'b'], mafiaVictims: ['a'] }] }),
  ...['verdict', 'end'].flatMap(phase => [false, true].map(early => view(phase, { events: [{ type: 'ballots', night: 1, early }, { type: 'tieBreak', night: 1, selected: 'a' }, { type: 'eliminated', night: 1, target: 'a' }] }))),
  ...['mafia', 'cannibal', 'draw'].map(winner => view('end', { winner }))
];
for (const [index, state] of scenarios.entries()) test(`full announcement ${index + 1}: ${state.phase}/${state.nightRole || state.winner}`, async () => {
  const r = rig(), completions = [];
  const expected = r.context.Lu(state, false);
  assert.ok(expected.length);
  assert.equal(r.god.say(state, false, levels, 0, undefined, status => completions.push(status)), true);
  assert.deepEqual(r.events[0], ['duck', 0, true]);
  await r.advance(699); assert.equal(r.utterances.length, 0);
  await r.advance(1); assert.equal(r.utterances[0].text, expected);
  assert.equal(r.events.filter(e => e[0] === 'cancel').length, 0);
  assert.equal(completions.length, 0);
  await r.advance(60000); assert.equal(completions.length, 0, 'long speech must not be force-finished');
  r.utterances[0].onend(); await flush();
  assert.deepEqual(completions, ['ended']);
  assert.equal(r.events.filter(e => e[0] === 'duck' && e[2] === false).length, 1);
});
test('every reminder retains its full text and uses the same pre-duck buffer', async () => {
  for (const phase of ['lobby', 'end', 'discussion', 'vote', 'runoff', 'night', 'reveal', 'intro', 'sleep']) for (const seconds of [0, 5, 10, 30]) {
    const r = rig(), state = view(phase, { nightRole: 'detective' });
    const expected = r.context.bL(state, seconds);
    assert.equal(r.god.remind(state, seconds, levels), true);
    await r.advance(700);
    assert.equal(r.utterances[0].text, expected);
    assert.equal(r.god.remind(state, seconds, levels), false);
    r.utterances[0].onend();
  }
});
test('cold output resumes before the complete 700ms buffer', async () => {
  const ready = deferred(), r = rig({ cold: ready });
  r.god.say(view('night', { nightRole: 'mafia' }), false, levels);
  await r.advance(1000); assert.equal(r.utterances.length, 0);
  ready.resolve(); await flush();
  await r.advance(699); assert.equal(r.utterances.length, 0);
  await r.advance(1); assert.match(r.utterances[0].text, /^Mafia, wake up\./);
});
test('late-loaded voices get a buffer; no installed voices uses the device fallback', async () => {
  const r = rig({ voices: [] });
  r.god.say(view('night', { nightRole: 'doctor' }), false, levels);
  await r.advance(1000); r.setVoices([{ lang: 'en-GB', name: 'English' }]); await flush();
  await r.advance(699); assert.equal(r.utterances.length, 0);
  await r.advance(1); assert.equal(r.utterances[0].voice.lang, 'en-GB');
  const empty = rig({ voices: [] }); empty.god.say(view('intro'), false, levels);
  await empty.advance(2500); assert.equal(empty.utterances.length, 1); assert.equal(empty.utterances[0].lang, 'en-US');
});
test('phase changes queue without interrupting God; reminders cannot interrupt', async () => {
  const r = rig();
  r.god.say(view('night', { nightRole: 'mafia' }), false, levels);
  await r.advance(700);
  r.god.cancelPending(); // Same cleanup used by the React phase effect.
  r.god.say(view('night', { nightRole: 'doctor' }), false, levels);
  assert.equal(r.god.remind(view('night'), 5, levels), false);
  await r.advance(9000); assert.equal(r.utterances.length, 1);
  r.utterances[0].onend(); await flush(); await r.advance(700);
  assert.match(r.utterances[1].text, /^Doctor, wake up\./);
  assert.ok(!r.events.some(e => e[0] === 'cancel'));
});
test('cancelling in the buffer never submits speech or reports a successful end', async () => {
  const r = rig(), statuses = [];
  r.god.say(view('intro'), false, levels, 0, undefined, s => statuses.push(s));
  r.god.stop(); await r.advance(5000);
  assert.equal(r.utterances.length, 0); assert.deepEqual(statuses, ['cancelled']);
  assert.equal(r.god.busy, false);
});
test('speech errors and spurious end-before-start cannot trigger death audio', async () => {
  for (const mode of ['error', 'no-start']) {
    const r = rig(), statuses = [];
    if (mode === 'no-start') r.synth.speak = u => r.utterances.push(u);
    r.god.say(view('dawn'), false, levels, 0, undefined, s => statuses.push(s));
    await r.advance(700);
    mode === 'error' ? r.utterances[0].onerror() : r.utterances[0].onend();
    assert.deepEqual(statuses, ['error']); assert.equal(r.notices.length, 1);
  }
});
test('native speech uses pre-duck, complete text, matching IDs, and only real end', async () => {
  const r = rig({ native: true }), statuses = [];
  const state = view('night', { nightRole: 'detective' });
  r.god.say(state, false, levels, 0, undefined, s => statuses.push(s));
  await r.advance(699); assert.ok(!r.events.some(e => e[0] === 'speak'));
  await r.advance(1);
  const command = r.events.find(e => e[0] === 'speak')[2];
  assert.equal(command.text, r.context.Lu(state, false));
  r.listeners.get('mafia-god')({ detail: { id: 'wrong', status: 'end' } }); assert.equal(statuses.length, 0);
  r.listeners.get('mafia-god')({ detail: { id: command.id, status: 'start' } });
  await r.advance(60000); assert.equal(statuses.length, 0);
  r.listeners.get('mafia-god')({ detail: { id: command.id, status: 'end' } });
  assert.deepEqual(statuses, ['ended']);
});
test('native startup failure releases ducking and never reports success', async () => {
  const r = rig({ native: true }), statuses = [];
  r.god.say(view('sleep'), false, levels, 0, undefined, s => statuses.push(s));
  await r.advance(12700);
  assert.deepEqual(statuses, ['error']); assert.equal(r.god.busy, false);
});
test('an engine that never sends its end event fails safely instead of playing a clip', async () => {
  const r = rig(), statuses = [];
  r.god.say(view('dawn'), false, levels, 0, undefined, s => statuses.push(s));
  await r.advance(180700);
  assert.deepEqual(statuses, ['error']); assert.equal(r.god.busy, false);
});
for (const kind of ['dawn', 'eliminated']) test(`${kind}: speech end → exact recording → animation → presentation completion`, async () => {
  const r = rig(), log = [], clip = deferred(), animation = deferred();
  const event = { id: 'death', type: kind, mafiaVictims: ['a', 'b'], victims: ['a', 'b'], target: 'a' };
  const tracks = kind === 'dawn' ? r.context.qy([event], event.id) : [r.context.Jm];
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].path, kind === 'dawn' ? '/audio/chath(2).mp3' : '/audio/mohanlal.mp3');
  let done;
  const presenting = r.context.MafiaAudio.presentAnnouncement({
    text: 'Everyone wakes. Anu died.', current: () => true,
    speak: callback => { done = callback; return true; }, wait: () => Promise.resolve(),
    acknowledge: async type => { log.push(type); return true; },
    playDeath: () => { log.push(tracks[0].path); return clip.promise; },
    animate: () => { log.push('animation'); return animation.promise; },
    finished: () => log.push('finished')
  });
  await flush(); assert.deepEqual(log, []);
  done('ended'); await flush(); assert.deepEqual(log, ['announcementDone', tracks[0].path]);
  clip.resolve(); await flush(); assert.equal(log.at(-1), 'animation');
  animation.resolve(); await presenting;
  assert.deepEqual(log, ['announcementDone', tracks[0].path, 'animation', 'finished', 'presentationDone']);
});
test('muted or failed speech waits for reading and never starts a death recording', async () => {
  for (const status of ['text', 'error']) {
    const r = rig(), log = [], reading = deferred();
    const presentation = r.context.MafiaAudio.presentAnnouncement({
      text: 'Everyone wakes. Anu died.', current: () => true,
      speak: done => { if (status === 'text') return false; done(status); return true; },
      wait: ms => { assert.ok(ms >= 6000); return reading.promise; },
      acknowledge: async type => { log.push(type); return true; },
      playDeath: () => assert.fail('death recording cannot follow failed speech'),
      animate: async () => log.push('animation'), finished: () => log.push('finished')
    });
    await flush(); assert.deepEqual(log, []);
    reading.resolve(); await presentation; assert.equal(log[0], 'announcementDone');
  }
});
test('skipping or changing phase during a clip cancels stale animation and completion', async () => {
  const r = rig(), clip = deferred(), log = []; let current = true;
  const presentation = r.context.MafiaAudio.presentAnnouncement({ text: 'Anu died.', current: () => current,
    speak: done => { done('ended'); return true; }, wait: () => Promise.resolve(),
    acknowledge: async type => { log.push(type); return true; }, playDeath: () => clip.promise,
    animate: () => assert.fail('stale animation'), finished: () => assert.fail('stale completion') });
  await flush(); current = false; clip.resolve(); await presentation;
  assert.deepEqual(log, ['announcementDone']);
});
test('reconnecting into a night-ending victory still announces death names before the clip', () => {
  const r = rig();
  const state = view('end', { events: [{ id: 'dawn', type: 'dawn', night: 1, victims: ['a'], mafiaVictims: ['a'] }] });
  const text = r.context.MafiaAudio.phaseText(state, r.context.Lu, new Set());
  assert.match(text, /^The village wakes\. Everyone, open your eyes\. Anu did not survive the night\./);
  const alreadyHeard = r.context.MafiaAudio.phaseText(state, r.context.Lu, new Set(['dawn']));
  assert.equal(alreadyHeard, r.context.Lu(state, false));
});
test('no night-death clip when the Mafia kill is saved or there are only other-role deaths', () => {
  const r = rig();
  for (const victims of [[], ['a']]) assert.equal(r.context.qy([{ id: 'd', type: 'dawn', victims, mafiaVictims: [] }], 'd').length, 0);
});
test('recordings begin at sample zero without a fade-in that hides the first syllable', async () => {
  const calls = [], param = { setValueAtTime: (...v) => calls.push(['gain', ...v]), linearRampToValueAtTime() {} };
  const gain = { gain: param, connect() {}, disconnect() {} };
  const sourceNode = { connect() { return gain; }, start: (...args) => calls.push(['start', ...args]), disconnect() {} };
  const context = vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('  function Wd('), source.indexOf('  var Yy =')), context);
  context.Wd({ currentTime: 10, createBufferSource: () => sourceNode, createGain: () => gain }, { duration: 16 }, {}, 0, false, 0);
  assert.deepEqual(calls[0], ['gain', 1, 10]); assert.deepEqual(calls.at(-1), ['start', 0, 0]);
});
test('HTML embeds the current runtime, fixed MP3 assets, and no removed recording references', () => {
  const html = fs.readFileSync(new URL('../Naatile-Mafia.html', import.meta.url), 'utf8');
  assert.ok(html.includes(runtime)); assert.ok(html.includes(source));
  const assets = JSON.parse(html.match(/globalThis\.__MAFIA_ASSETS__=(\{[^]*?\});<\/script>/)[1]);
  for (const name of ['/audio/chath(2).mp3', '/audio/mohanlal.mp3']) assert.match(assets[name], /^data:audio\/mpeg;base64,/);
  const removedName = ['kum', 'bidi', '.mp3'].join('');
  assert.equal(html.toLowerCase().includes(removedName), false);
  assert.equal(source.includes('i.serverNow - kt.at <= 7e3'), false, 'late join must not silently omit the current death clip');
});
