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
build.mjs — rebuilds the self-contained HTML from the two JavaScript sources.
tests/ — automated speech, sequencing, permissions and multiplayer API checks.
FONT-LICENSE.txt — bundled font license.

RUN LOCALLY
Install Node.js 22.13 or later, then run from this folder:
  node server.mjs
Open http://localhost:8080 to test.
The server has no npm dependencies. Room data is stored in ./data.

EDIT AND TEST
After editing client.js or audio-runtime.js:
  npm run build
  npm test
Restart the server to load the rebuilt HTML. The delivered HTML is already built.

THIS UPDATE
God's voice lowers the music before speaking, resumes audio output, and waits
700 milliseconds before submitting the complete command to the voice engine.
Phase updates queue behind an announcement already speaking. Reminders and
Replay cannot interrupt an active command. Merely changing window focus no
longer cancels speech; returning from a hidden tab replays the current phase.

Night Mafia kill: finish God's wake-up/death announcement, then play
chath(2).mp3 once for that event, then reveal the existing death effects.
Voting elimination: finish God's elimination announcement, then play
mohanlal.mp3, then show the existing lightning/elimination effect.
The previous voting recording is removed from the embedded assets and code.
The Chath recording already in the game was converted from WAV to MP3; it is
not a new or substituted performance. The existing Mohanlal recording is kept.

Only an actual speech-end event releases a death recording. If narration is
muted, unsupported, or fails, the game gives time to read the on-screen text
and proceeds without falsely treating failed speech as successful playback.

HOST AND CO-HOST
The primary host opens Players and uses the Co-Host selector to assign another
player. Choose "No Co-Host (remove status)" to revoke it. Changing the selector
replaces the previous co-host. The primary host remains the owner, including
after a rematch. Co-host status does not reveal secret roles or investigations.

Both managers can pause/resume and skip introductions, sleep-transition waits,
discussion, and remaining dawn/verdict effects or waiting. The skip button is
disabled until their own announcement finishes (or text-reading time completes).
At the end of a game, it dismisses remaining effects, not starts a new game.
Voting, runoff voting, role-card reading, and every night-role decision remain
unskippable. These permissions are enforced by the server, not just the UI.
Only the primary host can start/rematch or assign/remove the co-host.

Automatic dawn/verdict transitions wait for the primary host's presentation
completion. If that host disconnects, a 150-second phase limit prevents a
permanent stall. An acknowledged host/co-host can still skip sooner. Voting
and required-role timers are not shortened by this fallback.

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
Automated tests cover every generated English phase-command variant, all
reminders, delayed voice loading, cold startup, queuing, error/cancellation,
native speech events, death sequencing, sample-zero clip starts, co-host
assignment/revocation, protected decisions, and eight HTTP clients against
the real SQLite-backed server. Run npm test to reproduce them.

These are simulated speech-engine checks, not listening tests on real speakers.
The available browser environment blocked access to the local test server.
Device-specific audible verification and visual browser QA remain outstanding.
This package has not been deployed to your hosting or tested inside Wix.
See ACCEPTANCE-TEST.md for the final listening check on your actual devices.
