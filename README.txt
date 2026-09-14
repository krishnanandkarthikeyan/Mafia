NAATILE MAFIA — INDEPENDENT HTML + MULTIPLAYER SERVER

This is the actual game code, not an iframe pointing at ChatGPT.
No ChatGPT account, OpenAI API key, or ChatGPT-hosted game service is needed.
The computer moderator uses game rules and device speech, not a GPT model.

FILES
Naatile-Mafia.html — full HTML, CSS, JavaScript, game art, fonts and audio.
server.mjs — HTTP server and persistent SQLite storage.
game-server.mjs — bundled authoritative game logic and private room API.
FONT-LICENSE.txt — bundled font license.

RUN LOCALLY
Install Node.js 22.13 or later, then run from this folder:
  node server.mjs
Open http://localhost:8080 to test.
The server has no npm dependencies. Room data is stored in ./data.

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
Because this file includes all MP3s and graphics, it is about 19 MB. Some embed
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
Independent server tested for room creation, joining from separate clients,
private token enforcement, and HTML serving. Existing game logic is preserved.
This package has not been deployed to your hosting or tested inside your Wix
account. Supplied recordings and artwork remain the same as your game.
