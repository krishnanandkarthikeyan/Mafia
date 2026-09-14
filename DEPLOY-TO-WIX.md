# Put Naatile Mafia on Wix with multiplayer

The simplest working setup is:

1. Store this folder in a GitHub repository.
2. Deploy the repository as one Node web service.
3. Embed the service's HTTPS URL in Wix.

The Node service serves both the game page and `/api/game`. This is important:
GitHub Pages alone can host the page, but it cannot run the multiplayer server.

## 1. Upload to GitHub

Create a new repository, such as `naatile-mafia`, and upload every file in this
folder. Keep `Naatile-Mafia.html`, `server.mjs`, and `game-server.mjs` together
at the repository root.

Do not upload the generated `data` folder. It contains live room data and is
already excluded by `.gitignore`.

## 2. Deploy the GitHub repository

One straightforward option is Render:

1. In Render, choose **New > Blueprint**.
2. Connect the GitHub repository.
3. Render will read `render.yaml` and create the web service.
4. Wait for the deployment to finish.
5. Open the assigned `https://...onrender.com` address and test the game.

For casual testing, the default filesystem is enough. For reliable use, attach
a persistent disk and set `DATA_DIR` to its mount path. Without persistent
storage, active rooms can disappear when the service restarts or redeploys.

You can use another Node host instead. It must run `npm start`, expose the
provider's `PORT` environment variable, support Node 22.13 or newer, and provide
HTTPS.

## 3. Embed the deployed game in Wix

In the Wix editor:

1. Open the page where the game should appear.
2. Choose **Add Elements > Embed Code > Embed a Site**.
3. Select **Enter Website Address**.
4. Paste the deployed HTTPS game address, not the GitHub repository URL.
5. Apply it and stretch the embed to the full page width. Use about `900 px` or
   `100 vh` height so the game is not cropped.
6. Preview the desktop and mobile layouts, then publish the Wix site.

If Wix asks for HTML code instead of a website address, use:

```html
<iframe
  src="https://YOUR-GAME-HOST.example/"
  title="Naatile Mafia"
  style="width:100%;height:100dvh;border:0;background:#10271f"
  allow="autoplay; fullscreen; clipboard-write"
  allowfullscreen>
</iframe>
```

Replace the placeholder with the deployed HTTPS address. The included server
does not block iframe embedding.

## 4. Test multiplayer before sharing

1. Open the live Wix page in a normal browser and create a room.
2. Open the same live page in a private window or on another device.
3. Join with the room code and a different name.
4. Confirm that both screens update, chat is separated correctly, and each
   player sees only their own role.

All players must use the same deployed game URL. Room reconnect tokens are kept
in each player's browser, so clearing site data removes that player's reconnect
access.
