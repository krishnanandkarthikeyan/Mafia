// self-host:@/db/raw
var database = () => globalThis.mafiaDatabase;

// self-host:cloudflare:workers
var env = {};

// game/death-audio.mjs
var DEATH_TRACKS = [{ key: "night-death", path: "/audio/chath(2).mp3", seconds: 15.94 }];
function deathAudioPlan(events, eventId) {
  const e = events.find((e) => e.id === eventId);
  return e?.type === "dawn" && e.mafiaVictims?.length ? [{ ...DEATH_TRACKS[0], target: e.mafiaVictims[0] }] : [];
}
function deathRevealSeconds(events, eventId) {
  if (events.find((e) => e.id === eventId)?.type === "eliminated") return 35;
  return Math.max(40, 20 + Math.ceil(deathAudioPlan(events, eventId).reduce((n, clip) => n + clip.seconds + 0.3, 0)));
}

// game/mafia.mjs
var DECISION_SECONDS = 30;
var DAY_SECONDS = 120;
var DISCUSSION_SECONDS = 60;
var VOTING_SECONDS = 60;
var uid = () => crypto.randomUUID();
var living = (r) => r.players.filter((p) => p.kind === "player" && p.alive);
function setup(n, c = false) {
  if (!Number.isInteger(n) || n < 8 || n > 20) throw Error("Use 8\u201320 players, plus God.");
  if (c && n < 12) throw Error("Cannibal mode needs 12 or more players.");
  let m = n <= 10 ? 2 : n <= 14 ? 3 : n <= 18 ? 4 : 5;
  const roles = [...Array(m - (c ? 1 : 0)).fill("mafia"), "doctor", ...Array(n >= 18 ? 2 : 1).fill("detective"), ...n >= 12 ? ["gunner"] : [], ...c ? ["cannibal"] : []];
  while (roles.length < n) roles.push("villager");
  return roles;
}
var clean = (s) => String(s || "").trim().slice(0, 24);
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    let x, lim = Math.floor(4294967296 / (i + 1)) * (i + 1);
    do {
      x = crypto.getRandomValues(new Uint32Array(1))[0];
    } while (x >= lim);
    const j = x % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function createRoom(name, options = {}) {
  const r = { phaseStartedAt: 0, actionOpenAt: 0, roleCompleteAt: 0, id: uid(), phase: "lobby", epoch: 0, night: 0, players: [{ id: uid(), name: "God", kind: "god", role: "god", alive: true, ready: true, notes: [] }], config: { moderator: "computer", local: !!options.local, cannibal: !!options.cannibal, hidden: true, environment: options.environment || "Backwater Evening", duration: DECISION_SECONDS, discussion: DAY_SECONDS }, actions: {}, votes: {}, marks: {}, events: [], messages: [], ballots: [], runoff: [], winner: null, cycles: 0, deathless: 0, cycleDeaths: 0, deadline: 0, paused: false, sessions: {}, revision: 0, hostId: null, mafiaDecision: null, nightRoles: [], nightRole: null };
  const host = join(r, name);
  r.hostId = host.id;
  return r;
}
function join(r, name) {
  if (r.phase !== "lobby") throw Error("The cards have already been dealt. Reconnect from your original device.");
  name = clean(name);
  if (!name) throw Error("Enter your name.");
  if (r.players.some((p2) => p2.name.toLowerCase() === name.toLowerCase())) throw Error("Choose a different name for each seat.");
  if (r.players.length >= 21) throw Error("The table is full: 20 players plus God.");
  const p = { id: uid(), name, kind: "player", alive: true, ready: false, role: null, notes: [], bullet: 1, selfSave: 1, hand: false };
  r.players.push(p);
  return p;
}
var event = (r, type, data = {}) => r.events.push({ id: uid(), type, night: r.night, at: Date.now(), ...data });
function phase(r, p, seconds = 60) {
  r.phase = p;
  r.epoch++;
  r.phaseStartedAt = Date.now();
  r.actionOpenAt = 0;
  r.roleCompleteAt = 0;
  r.announcementAcks = {};
  r.presentationAcks = {};
  r.presentationSkipped = false;
  r.deadline = Date.now() + seconds * 1e3;
  r.paused = false;
  r.players.forEach((p2) => p2.hand = false);
}
function start(r) {
  if (r.phase !== "lobby") throw Error("The match has already started.");
  const ps = r.players.filter((p) => p.kind === "player");
  const a = shuffle(setup(ps.length, r.config.cannibal));
  if (ps.some((p) => !p.ready)) throw Error("Everyone must confirm readiness before God deals.");
  ps.forEach((p, i) => {
    p.role = a[i];
    p.alive = true;
    p.notes = [];
    p.bullet = 1;
    p.selfSave = 1;
  });
  phase(r, "reveal", 60);
  event(r, "dealt");
}
function channel(r, p) {
  if (p.kind === "god") return null;
  if (r.phase === "end" || r.phase === "lobby") return "public";
  if (!p.alive) return "ghosts";
  if (r.phase === "night") return p.role === "mafia" && (!r.nightRole || r.nightRole === "mafia") ? "mafia" : null;
  return ["intro", "discussion", "vote", "runoff", "verdict"].includes(r.phase) ? "public" : null;
}
function winners(r) {
  const ps = living(r), m = ps.filter((p) => p.role === "mafia").length, c = ps.some((p) => p.role === "cannibal"), v = ps.length - m - (c ? 1 : 0);
  const winner = !ps.length ? "draw" : c && ps.length === 1 ? "cannibal" : v > 0 && !m ? "village" : m > 0 && !c && m >= v ? "mafia" : null;
  if (winner) {
    r.winner = winner;
    phase(r, "end", 0);
    event(r, "winner", { winner });
  }
  return winner;
}
var tops = (values) => {
  const n = {};
  values.forEach((v) => n[v] = (n[v] || 0) + 1);
  const max = Math.max(0, ...Object.values(n));
  return Object.keys(n).filter((k) => n[k] === max);
};
function resolveNight(r) {
  const ps = living(r), find = (id) => ps.find((p) => p.id === id), deaths = /* @__PURE__ */ new Set(), mafiaDeaths = /* @__PURE__ */ new Set(), attacks = [];
  const mv = tops(ps.filter((p) => p.role === "mafia").map((p) => r.actions[p.id]).filter(Boolean)), target = mv.length ? shuffle([...mv])[0] : null, doc = ps.find((p) => p.role === "doctor"), protection = doc ? r.actions[doc.id] : null;
  r.mafiaDecision = { night: r.night, target, tied: mv.length > 1 };
  if (target) {
    if (r.marks[target]) {
      deaths.add(target);
      mafiaDeaths.add(target);
      if (find(r.marks[target])) {
        deaths.add(r.marks[target]);
        mafiaDeaths.add(r.marks[target]);
      }
    } else attacks.push({ target, type: "mafia" });
  }
  ps.forEach((p) => {
    const t = r.actions[p.id];
    if (t && p.role === "gunner" && p.bullet && r.night >= 2) {
      p.bullet = 0;
      attacks.push({ target: t, type: "gunner" });
    }
    if (t && p.role === "cannibal" && r.night >= 2) attacks.push({ target: t, type: "cannibal" });
  });
  attacks.forEach((a) => {
    if (protection === a.target) {
      if (a.type === "mafia") {
        r.marks[a.target] = doc.id;
        find(a.target).notes.push({ type: "marked", night: r.night });
        if (a.target !== doc.id) doc.notes.push({ type: "saved", target: a.target, night: r.night });
      }
    } else {
      deaths.add(a.target);
      if (a.type === "mafia") mafiaDeaths.add(a.target);
    }
  });
  ps.forEach((p) => {
    if (deaths.has(p.id)) p.alive = false;
  });
  r.cycleDeaths += deaths.size;
  event(r, "dawn", { victims: [...deaths], mafiaVictims: [...mafiaDeaths] });
  r.actions = {};
  phase(r, "dawn", deaths.size ? deathRevealSeconds(r.events, r.events.at(-1).id) : 20);
}
function cycle(r) {
  r.cycles++;
  r.deathless = r.cycleDeaths ? 0 : r.deathless + 1;
  r.cycleDeaths = 0;
  if (winners(r)) return;
  if (r.deathless >= 3 || r.cycles >= 20) {
    r.winner = "draw";
    phase(r, "end", 0);
    event(r, "winner", { winner: "draw" });
  } else {
    phase(r, "verdict", r.events.filter((e) => ["eliminated", "skipped"].includes(e.type)).at(-1)?.type === "eliminated" ? deathRevealSeconds(r.events, r.events.filter((e) => e.type === "eliminated").at(-1).id) : 18);
    if (r.deathless === 2 || r.cycles === 19) event(r, "drawWarning");
  }
}
function resolveVote(r, early = false) {
  r.ballots = living(r).map((p) => ({ voter: p.id, target: r.votes[p.id] || "skip" }));
  event(r, "ballots", { ballots: r.ballots, early });
  const top = tops(r.ballots.map((b) => b.target)), selected = top.some((x) => x !== "skip") ? shuffle(top.filter((x) => x !== "skip"))[0] : "skip";
  if (top.length > 1) event(r, "tieBreak", { candidates: top, selected });
  if (selected !== "skip") {
    r.players.find((p) => p.id === selected).alive = false;
    r.cycleDeaths++;
    event(r, "eliminated", { target: selected });
  } else event(r, "skipped");
  r.votes = {};
  cycle(r);
}
function tick(r) {
  if (r.config.local || r.paused || ["lobby", "end"].includes(r.phase)) return false;
  if (Date.now() < r.deadline && !(r.phase === "night" && r.roleCompleteAt && Date.now() >= r.roleCompleteAt)) return false;
  // Death playback uses real completion, not an estimated speech duration.
  // A bounded fallback keeps a disconnected primary host from blocking the room.
  if (["dawn", "verdict"].includes(r.phase) && !r.presentationAcks?.[r.hostId] && Date.now() < r.phaseStartedAt + 150000) return false;
  advance(r);
  return true;
}
function beginNight(r) {
  r.night++;
  r.actions = {};
  r.nightRole = null;
  const n = r.players.filter((p) => p.kind === "player").length;
  r.nightRoles = ["mafia", "doctor", "detective", ...n >= 12 && r.night >= 2 ? ["gunner"] : [], ...r.config.cannibal && r.night >= 2 ? ["cannibal"] : []];
  phase(r, "sleep", 12);
  event(r, "night");
}
function nextNightRole(r) {
  if (r.nightRole) event(r, "roleClosed", { role: r.nightRole, timedOut: Date.now() >= r.deadline });
  const next = r.nightRoles?.[r.nightRole ? r.nightRoles.indexOf(r.nightRole) + 1 : 0];
  if (!next) {
    r.nightRole = null;
    return resolveNight(r);
  }
  r.nightRole = next;
  phase(r, "night", DECISION_SECONDS + 5);
  r.actionOpenAt = r.phaseStartedAt + 5e3;
}
function advance(r) {
  switch (r.phase) {
    case "reveal":
      phase(r, "intro", 30);
      break;
    case "intro":
    case "verdict":
      beginNight(r);
      break;
    case "sleep":
      nextNightRole(r);
      break;
    case "night":
      nextNightRole(r);
      break;
    case "dawn":
      if (!winners(r)) {
        r.votes = {};
        phase(r, "discussion", DISCUSSION_SECONDS);
      }
      break;
    case "discussion":
      r.votes = {};
      phase(r, "vote", VOTING_SECONDS);
      break;
    case "vote":
    case "runoff":
      resolveVote(r);
      break;
    default:
      throw Error("This phase cannot advance.");
  }
}
function act(r, pid, type, data = {}, local = false) {
  const p = r.players.find((p2) => p2.id === pid && p2.kind === "player");
  if (!p) throw Error("Your seat was not found.");
  if (type === "cohost") {
    if (pid !== r.hostId) throw Error("Only the primary host can assign or remove the co-host.");
    if (data.target !== null && !r.players.some((x) => x.id === data.target && x.kind === "player" && x.id !== r.hostId)) throw Error("Choose another player as co-host.");
    r.coHostId = data.target;
    return;
  }
  if (["announcementDone", "presentationDone"].includes(type)) {
    if (data.epoch !== r.epoch) throw Error("The phase changed.");
    if (r.paused) throw Error("Resume the round first.");
    const key = type === "announcementDone" ? "announcementAcks" : "presentationAcks";
    if (type === "presentationDone" && !r.announcementAcks?.[pid]) throw Error("Finish the announcement first.");
    (r[key] ||= {})[pid] = true;
    return;
  }
  if (type === "ready") {
    if (r.phase !== "lobby" || p.kind !== "player") throw Error("Only players in the lobby can ready up.");
    p.ready = !!data.ready;
    return;
  }
  if (["start", "advance", "pause", "rematch", "continue"].includes(type)) {
    if (pid !== r.hostId && !(pid === r.coHostId && ["continue", "pause"].includes(type))) throw Error("Only the room host can use this control.");
    if (type === "start") return start(r);
    if (type === "continue") {
      if (data.epoch !== r.epoch) throw Error("The phase changed.");
      if (r.paused) throw Error("Resume the round first.");
      if (!canSkip(r, pid)) throw Error("Finish God's announcement first. Voting and role decisions cannot be skipped.");
      if (r.phase === "end") { r.presentationSkipped = true; return; }
      return advance(r);
    }
    if (type === "advance") {
      if (!r.config.local || !local) throw Error("Computer God advances online rounds automatically.");
      if (data.epoch !== r.epoch) throw Error("The phase changed. Check the table.");
      if (r.paused) throw Error("Resume the round first.");
      if (!canSkip(r, pid) || r.phase === "end") throw Error("Required decisions cannot be skipped.");
      return advance(r);
    }
    if (type === "pause") {
      if (["lobby", "end"].includes(r.phase)) throw Error("There is no active round to pause.");
      if (r.paused) {
        r.deadline = Date.now() + r.remaining;
        if (r.roleCompleteAt) r.roleCompleteAt = Date.now() + r.roleRemaining;
        r.phaseStartedAt += Date.now() - r.pausedAt;
        r.paused = false;
      } else {
        r.remaining = Math.max(0, r.deadline - Date.now());
        r.roleRemaining = Math.max(0, r.roleCompleteAt - Date.now());
        r.pausedAt = Date.now();
        r.paused = true;
      }
      return;
    }
    if (type === "rematch") {
      if (r.phase !== "end") throw Error("Finish this match first.");
      const fresh = createRoom(p.name, r.config);
      fresh.epoch = r.epoch + 1;
      for (const k of Object.keys(fresh)) if (!["id", "players", "sessions", "revision", "hostId", "coHostId"].includes(k)) r[k] = fresh[k];
      r.announcementAcks = {};
      r.presentationAcks = {};
      r.presentationSkipped = false;
      r.players.forEach((p2) => {
        p2.alive = true;
        p2.role = p2.kind === "god" ? "god" : null;
        p2.ready = p2.kind === "god";
        p2.notes = [];
      });
      return;
    }
  }
  if (type === "chat") {
    if (data.epoch !== r.epoch) throw Error("The phase changed. Review the chat channel before sending again.");
    const ch = channel(r, p);
    if (!ch) throw Error("Your table is quiet during this phase.");
    const text = String(data.text || "").trim().slice(0, 400);
    if (!text) return;
    const last = r.messages.filter((m) => m.from === pid).at(-1);
    if (last && Date.now() - last.at < 900) throw Error("Give the table a moment.");
    r.messages.push({ id: uid(), from: pid, channel: ch, text, at: Date.now(), epoch: r.epoch });
    r.messages = r.messages.slice(-120);
    return;
  }
  if (type === "hand") {
    if (data.epoch !== r.epoch) throw Error("The phase changed.");
    if (!p.alive || p.kind !== "player" || channel(r, p) !== "public") throw Error("Raise your hand during a public discussion.");
    p.hand = !!data.hand;
    return;
  }
  if (!["action", "vote"].includes(type)) throw Error("Unknown table action.");
  if (p.kind !== "player" || !p.alive || r.paused) throw Error("You cannot act now.");
  if (data.epoch !== r.epoch) throw Error("This phase has ended.");
  if (!local && Date.now() >= r.deadline) throw Error("Decisions are locked. Waiting for God.");
  const target = r.players.find((x) => x.id === data.target && x.kind === "player" && x.alive);
  if (type === "vote") {
    if (!["vote", "runoff"].includes(r.phase)) throw Error("Voting is not open.");
    if (data.target !== "skip" && (!target || target.id === pid || r.phase === "runoff" && !r.runoff.includes(target.id))) throw Error("Choose an eligible player or Skip.");
    r.votes[pid] = data.target;
    if (living(r).every((x) => Object.hasOwn(r.votes, x.id))) resolveVote(r, true);
    return;
  }
  if (r.phase !== "night") throw Error("Night actions are not open.");
  if (r.nightRole && p.role !== r.nightRole) throw Error("Wait for your role\u2019s turn.");
  if (r.actionOpenAt && Date.now() < r.actionOpenAt) throw Error("Listen to God\u2019s command first.");
  if (r.nightRole && p.role !== r.nightRole) throw Error("Wait for your role\u2019s turn.");
  if (p.role === "detective") {
    const checked = p.notes.find((n) => n.type === "investigation" && n.night === r.night);
    if (checked) {
      if (data.target === checked.target) return;
      throw Error("Your investigation is final. You can check one player per night.");
    }
  }
  if (Object.hasOwn(r.actions, pid)) {
    if (r.actions[pid] === (data.target || null)) return;
    throw Error("Your confirmed choice is final.");
  }
  if (!data.target) {
    r.actions[pid] = null;
    completeRole(r);
    return;
  }
  if (!target) throw Error("Choose a living player.");
  if (p.role === "villager") throw Error("Villagers have no night action.");
  if (p.role === "mafia" && target.role === "mafia") throw Error("Mafia cannot target its own team.");
  if (p.role !== "doctor" && pid === target.id) throw Error("Choose somebody else.");
  if (["gunner", "cannibal"].includes(p.role) && r.night < 2) throw Error("This role acts from Night 2.");
  if (p.role === "gunner" && !p.bullet) throw Error("Your bullet has been used.");
  if (p.role === "doctor" && target.id === pid) {
    if (!p.selfSave && r.actions[pid] !== pid) throw Error("Your self-save has been used.");
    p.selfSave = 0;
  }
  r.actions[pid] = target.id;
  if (p.role === "detective") p.notes.push({ type: "investigation", target: target.id, mafia: target.role === "mafia", night: r.night });
  completeRole(r);
}
function completeRole(r) {
  const actors = living(r).filter((p) => p.role === r.nightRole);
  if (actors.length && actors.every((p) => Object.hasOwn(r.actions, p.id))) r.roleCompleteAt = Date.now() + 1200;
}
function canSkip(r, pid) {
  return (pid === r.hostId || pid === r.coHostId) && !r.paused &&
    ["intro", "sleep", "discussion", "dawn", "verdict", "end"].includes(r.phase) && !r.presentationSkipped && !!r.announcementAcks?.[pid];
}
function publicView(r, pid) {
  const p = r.players.find((x) => x.id === pid && x.kind === "player");
  if (!p) throw Error("No human can take the computer God seat.");
  const ch = channel(r, p);
  const known = (x) => r.phase === "end" || p.role === "mafia" && x.role === "mafia";
  return {
    id: r.id,
    hostId: r.hostId,
    coHostId: r.coHostId || null,
    canSkip: canSkip(r, pid),
    presentationSkipped: !!r.presentationSkipped,
    phase: r.phase,
    epoch: r.epoch,
    night: r.night,
    phaseStartedAt: r.phaseStartedAt,
    actionOpenAt: r.actionOpenAt,
    nightRole: r.phase === "night" ? r.nightRole : null,
    config: r.config,
    players: r.players.filter((x) => x.kind === "player").map((x) => ({ id: x.id, name: x.name, kind: x.kind, alive: x.alive, ready: x.ready, hand: ch === "public" ? x.hand : false, inCall: !!ch && channel(r, x) === ch ? !!x.inCall : false, role: x.kind === "god" ? "god" : known(x) ? x.role : null })),
    me: { id: p.id, name: p.name, kind: p.kind, host: p.id === r.hostId, alive: p.alive, role: p.role, bullet: p.bullet, selfSave: p.selfSave, notes: p.notes, actionSubmitted: Object.hasOwn(r.actions, p.id), action: r.actions[p.id] || null, vote: r.votes[p.id] || null, teammates: p.role === "mafia" ? r.players.filter((x) => x.role === "mafia").map((x) => x.id) : [], mafiaDecision: p.role === "mafia" ? r.mafiaDecision : null },
    god: null,
    channel: ch,
    messages: r.messages.filter((m) => m.channel === ch || m.channel === "god").slice(-40),
    events: r.events,
    ballots: r.ballots,
    runoff: [],
    votedPlayers: ["vote", "runoff"].includes(r.phase) ? Object.keys(r.votes) : [],
    voteCount: ["vote", "runoff"].includes(r.phase) ? Object.keys(r.votes).length : 0,
    deadline: r.deadline,
    serverNow: Date.now(),
    paused: r.paused,
    remaining: r.remaining,
    winner: r.winner,
    revision: r.revision
  };
}

// app/api/game/route.ts
var dynamic = "force-dynamic";
var responseHeaders = { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
function OPTIONS() {
  return new Response(null, { status: 204, headers: responseHeaders });
}
var fail = (error, status = 400) => Response.json({ error }, { status, headers: responseHeaders });
var hash = async (value) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((b) => b.toString(16).padStart(2, "0")).join("");
var newToken = () => crypto.randomUUID() + crypto.randomUUID();
var json = (data) => Response.json(data, { headers: responseHeaders });
async function POST(req) {
  try {
    if (Number(req.headers.get("content-length") || 0) > 1e5) return fail("That request is too large.", 413);
    const raw = await req.text();
    if (raw.length > 1e5) return fail("That request is too large.", 413);
    const b = JSON.parse(raw);
    if (!b || typeof b !== "object") return fail("Invalid request.");
    const db = database(), now = Date.now();
    if (b.op === "create") {
      const owner = await hash(req.headers.get("cf-connecting-ip") || "guest-network");
      const recent = await db.prepare("SELECT COUNT(*) AS count FROM mafia_rooms WHERE owner=? AND updated>?").bind(owner, now - 6e5).first();
      if (recent?.count >= 12) return fail("Several tables were opened recently. Try again in a few minutes.", 429);
      const code2 = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase(), token2 = newToken(), r = createRoom(b.name, { ...b.config, local: false });
      r.sessions[await hash(token2)] = { pid: r.hostId };
      await db.prepare("INSERT INTO mafia_rooms(code,owner,state,revision,updated) VALUES(?,?,?,0,?)").bind(code2, owner, JSON.stringify(r), now).run();
      return json({ code: code2, token: token2, view: publicView(r, r.hostId) });
    }
    const code = String(b.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8), token = String(b.token || ""), sessionKey = token ? await hash(token) : "";
    for (let attempt = 0; attempt < 3; attempt++) {
      const row = await db.prepare("SELECT state,revision,updated FROM mafia_rooms WHERE code=?").bind(code).first();
      if (!row || now - row.updated > 864e5) return fail("Table not found or expired. Ask your friend for the room code.", 404);
      const r = JSON.parse(row.state);
      if (r.config?.moderator !== "computer") return fail("This older table uses human God. Start a new computer-moderated table.", 410);
      r.revision = row.revision;
      const sess = r.sessions[sessionKey];
      if (b.op === "join" && !sess) {
        const p2 = join(r, b.name), issued = newToken();
        r.sessions[await hash(issued)] = { pid: p2.id };
        r.revision++;
        const result = await db.prepare("UPDATE mafia_rooms SET state=?,revision=revision+1,updated=? WHERE code=? AND revision=?").bind(JSON.stringify(r), now, code, row.revision).run();
        if (!result.meta.changes) continue;
        return json({ code, token: issued, view: publicView(r, p2.id) });
      }
      if (!sess) return fail("Seat not found. Reconnect using this browser, or join a new table.", 403);
      const pid = sess.pid, p = r.players.find((x) => x.id === pid && x.kind === "player");
      if (!p) return fail("Invalid seat.", 403);
      if (tick(r)) {
        r.revision++;
        const result = await db.prepare("UPDATE mafia_rooms SET state=?,revision=revision+1,updated=? WHERE code=? AND revision=?").bind(JSON.stringify(r), now, code, row.revision).run();
        if (!result.meta.changes) continue;
        row.revision = r.revision;
      }
      const ch = channel(r, p);
      if (b.op === "join") return json({ code, token, view: publicView(r, pid) });
      if (b.op === "command") {
        act(r, pid, b.type, b.data || {});
        r.revision = row.revision + 1;
        const result = await db.prepare("UPDATE mafia_rooms SET state=?,revision=revision+1,updated=? WHERE code=? AND revision=?").bind(JSON.stringify(r), now, code, row.revision).run();
        if (!result.meta.changes) continue;
      } else if (b.op !== "poll") return fail("Unknown table request.");
      const voiceBucket = env.BUCKET;
      if (voiceBucket) {
        const expired = await db.prepare("SELECT id,key FROM mafia_audio WHERE created<? LIMIT 100").bind(now - 3e4).all();
        if (expired.results.length) {
          await voiceBucket.delete(expired.results.map((x) => x.key));
          await db.prepare("DELETE FROM mafia_audio WHERE id IN (" + expired.results.map(() => "?").join(",") + ")").bind(...expired.results.map((x) => x.id)).run();
        }
      }
      const view = publicView(r, pid);
      const latest = await db.prepare("SELECT revision FROM mafia_rooms WHERE code=?").bind(code).first();
      if (latest && latest.revision !== r.revision) {
        if (b.op === "poll") continue;
        const fresh = await db.prepare("SELECT state FROM mafia_rooms WHERE code=?").bind(code).first();
        return json({ view: publicView(JSON.parse(fresh.state), pid), audio: [] });
      }
      return json({ view });
    }
    return fail("Several players acted together. Please try again.", 409);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "The table is temporarily unavailable.");
  }
}
export {
  OPTIONS,
  POST,
  dynamic
};
