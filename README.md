# Kazhutha on Render

This package converts the downloaded Kazhutha HTML into the hosted edition and enables private online rooms with the existing peer-to-peer multiplayer client.

## Deploy

1. Put every file in this folder in the root of a GitHub repository.
2. In Render, choose **New > Blueprint**.
3. Connect the repository. Render detects `render.yaml` and creates the static site.
4. After the deploy finishes, open the generated `onrender.com` URL.

No environment variables or paid web server are required.

## Test locally

Run:

```bash
npm run build
python3 -m http.server 8000 --directory dist
```

Then open <http://localhost:8000>.

## Multiplayer notes

- The host creates a private room and shares the `KZH-XXXXXX` code or invite link.
- The host's browser owns the live game, so the host must keep the game page open.
- Players need internet access. The room transport loads PeerJS from jsDelivr and connects players directly.
- AI, local multiplayer, practice, and browser-saved statistics continue to work.
