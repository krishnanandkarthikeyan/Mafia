NAATILE MAFIA — INDEPENDENT HTML + MULTIPLAYER SERVER

This is the actual game code, not an iframe pointing at ChatGPT.
No ChatGPT account, OpenAI API key, or ChatGPT-hosted game service is needed.
The computer moderator uses game rules and device speech, not a GPT model.

FILES
Naatile-Mafia.html — full HTML, CSS, JavaScript, game art, fonts and audio.
server.mjs — HTTP server and persistent SQLite storage.
game-server.mjs — bundled authoritative game logic and private room API.
audio-runtime.js — readable announcement queue, readiness buffer and sequencing.
client.js — editable game client source, including the existing bundled UI.
role-card.css — scoped responsive styling for the enlarged role cards.
build.mjs — rebuilds the self-contained HTML from JavaScript, intro and card CSS.
intro.html — opening-screen title and OpenAI/Anthropic development credit.
tests/ — automated speech, sequencing, permissions and multiplayer API checks.
FONT-LICENSE.txt — bundled font license.

RUN LOCALLY
Install Node.js 22.13 or later, then run from this folder:
  node server.mjs
Open http://localhost:8080 to test.
The server has no npm dependencies. Room data is stored in ./data.

EDIT AND TEST
After editing client.js, audio-runtime.js, role-card.css or intro.html:
  npm run build
  npm test
Restart the server to load the rebuilt HTML. The delivered HTML is already built.

THIS UPDATE — COMPLETE AUDIO SEQUENCES
The supplied GitHub/Wix project is the base. All 21 embedded art/audio assets,
fonts, room API routes and deployment configuration are preserved. No audio
recordings were replaced or converted in this update.

God's voice uses an exclusive audio sequence, initializes the output device,
waits for installed voices, and allows 700ms for music to fade before speaking.
It keeps the complete utterance alive and waits for the actual engine end event
plus a 350ms output-buffer tail. No estimated duration marks speech successful.
A silent looping warmup source stays alive through initialization and speech.

Night Mafia kill: complete wake-up/death announcement -> chath(2).mp3 from its
first sample to natural end -> 250ms output tail -> existing death effects.
Vote elimination: complete elimination announcement -> mohanlal.mp3 from its
first sample to natural end -> 250ms output tail -> existing lightning effect.
Music remains lowered throughout the whole sequence and fades back afterward.
Death recordings have no fade-in or fade-out that could mask their syllables.
Cancelled playback cannot count as a successfully completed death recording.

Phase polls are deferred locally while audio is playing. The server also waits
for each foreground player's audio, using a 20-second renewable lease carried
by normal polls. An active connected player can renew past the old 150-second
limit. A disconnected player's lease expires. The existing legacy-host fallback
is retained. Decision deadlines are unchanged, and votes/actions remain usable
during reminders; they cannot advance the phase until protected audio ends.

God, death dialogue, victory clips and required effects run sequentially.
Countdown, chat and incidental effects are suppressed during protected audio.
Clearing chat audio cannot clear God's music-ducking state. Pause freezes the
game clock without cancelling speech or death audio. Returning from a hidden
tab replays the current announcement from its beginning.

The bottom role card has a 120 x 156 CSS-pixel touch area on larger displays,
102 x 144 on narrow portrait phones, and 144 x 94 in shallow landscape screens
(previous landscape size: 36 x 48). It has larger icons and bilingual labels.
The private hold-to-reveal card is enlarged too; releasing still hides the role.

HOST AND CO-HOST
Existing ownership and permissions remain. Only the primary host assigns or
removes a co-host, starts a game or rematches. Both managers may pause/resume
and skip permitted waits. Skip now requires their FULL presentation completion
and no connected player's active audio. It cannot cut a death or victory clip.
Neither manager can skip voting, required night decisions or role-card reading.
Secret roles and investigations are still private.

Muted/unsupported speech gives on-screen reading time and skips death dialogue.
Speech-engine errors are reported rather than falsely claiming successful audio.
Explicit mute, leaving the table, or hiding the browser can stop audio; ordinary
phase updates, pause/resume, sound-effect events and music changes cannot.

UPDATING YOUR EXISTING DEPLOYMENT
Replace the project files in your connected repository, including the rebuilt
Naatile-Mafia.html AND game-server.mjs, then deploy the new revision. Keep your
existing environment variables and persistent data configuration. No npm
dependencies were added. Reload every player's browser after deployment and
start a fresh room. HTML changes alone cannot update server permissions.
This package does not change the live GitHub or Render deployment by itself.

FRIENDS ON DIFFERENT NETWORKS
Run the server on your own Node-capable host with HTTPS and persistent storage.
Set PORT if your host requires it; DATA_DIR selects persistent data storage.
Run one server instance for this SQLite database. The API rejects secret-role
requests without the player's room token and preserves private investigations.
A plain HTML file alone cannot synchronize remote players or keep roles secret.
This package supplies the backend; it does not deploy or provision your hosting.

PASTING HTML INTO WIX
Open Naatile-Mafia.html in a text editor. Near its first script, find:
  globalThis.__MAFIA_ONLINE_URL__="";
Replace the empty value with YOUR server's HTTPS origin, without a trailing slash.
Then copy the HTML code into your website's HTML embed editor.
Because this file includes all MP3s and graphics, it is a large file. Some embed
editors may reject code this large. In that case, use the iframe code below to
load YOUR independently hosted game instead. Replace YOUR-GAME-DOMAIN:

<iframe src="https://YOUR-GAME-DOMAIN/" title="Naatile Mafia"
 style="width:100%;height:100dvh;border:0;background:#10271f"
 allow="autoplay; fullscreen; clipboard-write" allowfullscreen></iframe>

Use your own hosting address, not a ChatGPT address. All friends must connect
to the same server. Hosting the complete HTML on the same server needs no edit
to __MAFIA_ONLINE_URL__. Room-code multiplayer and text chat are included.
Audio calling/Discord integration is not provided by this standalone server.
Game music, dialogues and device voice announcements remain included.

VALIDATION
102 automated tests cover every generated English phase-command variant, all
reminders, delayed voice loading, cold startup, queuing, error/cancellation,
native speech events, death sequencing, sample-zero clip starts, co-host
assignment/revocation, protected decisions, and eight HTTP clients against
the real SQLite-backed server. Run npm test to reproduce them.

These are simulated speech-engine checks, not listening tests on real speakers.
The available browser environment blocked access to the local test server.
Device-specific audible verification and visual browser QA remain outstanding.
This package has not been deployed to your hosting or tested inside Wix.
See ACCEPTANCE-TEST.md for the final listening check on your actual devices.
