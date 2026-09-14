/* Shared, testable announcement lifecycle. No estimated duration can finish speech. */
(() => {
  const PRE_SPEECH_MS = 700;
  const POST_SPEECH_MS = 350; // Let the device drain its output buffer after the engine end event.
  class GodVoice {
    constructor(audio, speaking, notice = () => {}, lines, reminders) {
      Object.assign(this, { audio, speaking, notice, lines, reminders });
      this.queue = [];
      this.active = null;
      this.utterance = null; // Keep a strong reference until the engine finishes.
    }
    get busy() { return !!this.active || this.queue.length > 0; }
    unlock() { window.speechSynthesis?.resume(); }
    cancelPending() { this.queue.splice(0).forEach(job => job.done?.("cancelled")); }
    stop() {
      this.cancelPending();
      this.active?.finish("cancelled");
      window.speechSynthesis?.cancel();
      try { window.NativeGod?.command(JSON.stringify({ op: "stop" })); } catch {}
    }
    volume(levels) {
      if (levels.muted || !levels.master || !levels.voice) this.stop();
      else if (this.utterance) this.utterance.volume = levels.master * levels.voice;
    }
    remind(view, seconds, levels) {
      if (this.busy) return false;
      const text = this.reminders(view, seconds);
      return text ? this.say(view, false, levels, 0, text) : false;
    }
    say(view, ml, levels, delay = 0, override, done) {
      if (levels.muted || !levels.master || !levels.voice) return false;
      if (!window.NativeGod && !window.speechSynthesis) return false;
      const text = override || this.lines(view, false);
      if (!text) return false;
      this.queue.push({ text, levels: { ...levels }, delay, done });
      this.drain();
      return true;
    }
    async drain() {
      if (this.active || !this.queue.length) return;
      const job = this.queue.shift();
      const cleanups = [];
      const state = { finished: false, started: false, ducked: false };
      this.active = state;
      state.finish = (status) => {
        if (state.finished) return;
        state.finished = true;
        cleanups.splice(0).forEach((cleanup) => cleanup());
        this.utterance = null;
        this.active = null;
        if (state.ducked) this.audio.duck(false);
        if (state.exclusive) this.audio.endExclusive();
        this.speaking(false);
        if (status === "error") this.notice("God's voice could not finish. Read the announcement on screen or use Replay to try again.");
        job.done?.(status);
        queueMicrotask(() => this.drain());
      };
      const wait = (ms) => new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        cleanups.push(() => { clearTimeout(timer); resolve(); });
      });
      try {
        // Reserve the same protected lane used by the full death presentation.
        if (this.audio.beginExclusive) {
          const acquired = await this.audio.beginExclusive();
          if (!acquired) return state.finish("cancelled");
          if (state.finished) { this.audio.endExclusive(); return; }
          state.exclusive = true;
        }
        // Duck BEFORE submitting speech, including a cold audio device start.
        this.audio.duck(true);
        state.ducked = true;
        this.speaking(true);
        const context = this.audio.ctx;
        if (context?.state === "suspended") await context.resume();
        if (state.finished) return;
        if (context?.state === "running") {
          const pad = context.createBufferSource();
          pad.buffer = context.createBuffer(1, Math.ceil(context.sampleRate * .8), context.sampleRate);
          pad.loop = true; // Keep the output device warm through voice loading AND speech.
          pad.connect(context.destination);
          pad.start();
          cleanups.push(() => { try { pad.stop(); } catch {} pad.disconnect(); });
        }
        const synth = window.speechSynthesis;
        if (!window.NativeGod) {
          synth.resume();
          if (!synth.getVoices().length) {
            await new Promise((resolve) => {
              const timer = setTimeout(resolve, 1800);
              const loaded = () => { if (synth.getVoices().length) resolve(); };
              synth.addEventListener("voiceschanged", loaded);
              cleanups.push(() => { clearTimeout(timer); synth.removeEventListener("voiceschanged", loaded); resolve(); });
            });
          }
        }
        await wait(Math.max(PRE_SPEECH_MS, job.delay));
        if (state.finished) return;
        if (document.hidden) return state.finish("cancelled");
        let startTimer;
        const started = () => { state.started = true; clearTimeout(startTimer); };
        const ended = () => {
          if (!state.started) return state.finish("error");
          if (state.ending || state.finished) return;
          state.ending = true;
          clearTimeout(failureTimer);
          const tail = setTimeout(() => state.finish("ended"), POST_SPEECH_MS);
          cleanups.push(() => clearTimeout(tail));
        };
        startTimer = setTimeout(() => {
          if (!state.started) {
            state.finish("error");
            try { window.NativeGod ? window.NativeGod.command(JSON.stringify({ op: "stop" })) : synth.cancel(); } catch {}
          }
        }, 12000);
        cleanups.push(() => clearTimeout(startTimer));
        // A broken engine may never send end/error. This is failure recovery,
        // never a successful completion and never permission to play a death clip.
        const failureTimer = setTimeout(() => {
          state.finish("error");
          try { window.NativeGod ? window.NativeGod.command(JSON.stringify({ op: "stop" })) : synth.cancel(); } catch {}
        }, 180000);
        cleanups.push(() => clearTimeout(failureTimer));
        if (window.NativeGod) {
          const id = crypto.randomUUID();
          const listener = ({ detail }) => {
            if (detail?.id !== id || state.finished) return;
            if (detail.status === "start") started();
            else if (detail.status === "end") ended();
            else if (detail.status === "error") state.finish("error");
          };
          window.addEventListener("mafia-god", listener);
          cleanups.push(() => window.removeEventListener("mafia-god", listener));
          window.NativeGod.command(JSON.stringify({ op: "speak", id, text: job.text, volume: job.levels.master * job.levels.voice }));
        } else {
          const utterance = new SpeechSynthesisUtterance(job.text);
          this.utterance = utterance;
          const voices = synth.getVoices().filter((v) => /^en([-_]|$)/i.test(v.lang));
          const score = (v) => (/^en[-_]US$/i.test(v.lang) ? 50 : 0) + (/natural|neural|premium|enhanced/i.test(v.name) ? 30 : 0) + (v.default ? 1 : 0);
          const voice = voices.sort((a, b) => score(b) - score(a))[0];
          if (voice) utterance.voice = voice;
          utterance.lang = voice?.lang || "en-US";
          utterance.rate = .98;
          utterance.pitch = .97;
          utterance.volume = job.levels.master * job.levels.voice;
          utterance.onstart = started;
          utterance.onend = ended;
          utterance.onerror = () => state.finish("error");
          cleanups.push(() => { utterance.onstart = utterance.onend = utterance.onerror = null; });
          // Never cancel immediately before speak: several engines lose the attack.
          synth.speak(utterance);
        }
      } catch {
        state.finish("error");
      }
    }
  }
  async function presentAnnouncement({ text, speak, wait, current, acknowledge, playDeath, animate, finished }) {
    const result = await new Promise((resolve) => {
      if (!speak(resolve)) resolve("text");
    });
    if (!current() || result === "cancelled") return;
    // Muted/unsupported devices get reading time, never a falsely successful speech end.
    if (result !== "ended") {
      await wait(Math.max(6000, text.split(/\s+/).length / 2.5 * 1000));
      if (!current()) return;
    }
    const acknowledged = acknowledge("announcementDone");
    if (result === "ended" && await playDeath() === "cancelled") return;
    if (!current()) return;
    await animate();
    if (!current()) return;
    await finished();
    if (await acknowledged && current()) await acknowledge("presentationDone");
  }
  function phaseText(view, lines, completedDeaths = new Set()) {
    const death = view?.events?.filter(event => event.night === view.night && ["dawn", "eliminated", "skipped"].includes(event.type)).at(-1);
    // A reconnect straight into a night-ending victory still needs the names
    // before its death recording. Existing clients have already heard dawn.
    const dawn = view?.phase === "end" && death?.type === "dawn" && death.victims?.length && !completedDeaths.has(death.id);
    return (dawn ? lines({ ...view, phase: "dawn" }, false) + " " : "") + lines(view, false);
  }
  globalThis.MafiaAudio = { GodVoice, PRE_SPEECH_MS, POST_SPEECH_MS, presentAnnouncement, phaseText };
})();
