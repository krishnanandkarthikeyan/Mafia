# Final device check

Run `npm test` first, then start the game with `npm start` or deploy this whole
folder to your existing host. Reload all devices and create a fresh room.
Use eight players/devices or independent browser sessions. Do not share a
player's session token. Keep music and God's narration enabled.

The automated suite uses simulated speech engines. It verifies complete strings,
the pre-speech delay, real end-event ordering, failure handling, and server
permissions. It cannot certify the first audible syllable on a phone, Bluetooth
speaker, or a particular operating-system voice.

## Listening

1. On a cold page load, confirm the welcome announcement starts with **Welcome**.
2. Start a match. Listen from the first word of the card-reveal, introduction,
   everyone-sleep, Mafia, Doctor, and Detective announcements. The music should
   begin lowering before speech. No role name should be missing or shortened.
3. Test Gunner and Cannibal in a suitable 12-plus-player match from Night 2.
4. Check waking up after both a saved night and a lethal night, discussion,
   voting, tied results, elimination, and each winning team's announcement.
5. Use Replay after speech finishes. Try it while speaking too: it must refuse
   to interrupt. Change window focus and confirm speech is not cancelled.
   Hide the tab and return: the current phase should be announced again.
6. Repeat with the devices and output routes your group actually uses,
   particularly Bluetooth headphones or speakers. If clipping persists, record
   the affected line and note device, OS, browser, voice, and audio output.

## Death sequence

- Mafia kill: God first wakes everyone and says every victim's name. After the
  final spoken word, hear `chath(2).mp3`. Death cards and the blood/death effect
  appear after the recording ends. Multiple Mafia victims use one recording.
- Daytime elimination: God first announces the eliminated player's name. After
  the final spoken word, hear `mohanlal.mp3`, followed by the lightning effect.
- A saved Mafia target must not trigger the Mafia-death recording. Unrelated
  role deaths must not accidentally trigger it either.
- Replaying God after a completed death sequence must not replay its recording.
- Also check an elimination that ends the game and a reconnect directly into
  the winner phase. Names must still precede a pending death recording.
- When voice is muted or unavailable, the text-reading fallback must not start
  a recording as though God had successfully spoken.

## Controls

1. As Host, open **Players** and assign a Co-Host with the selector. Verify the
   label on that player and the Host label on the original host.
2. During discussion, both managers should see Skip. A normal player should not.
3. During dawn or verdict, Skip remains disabled until that manager's God
   announcement AND death dialogue AND required effect finish, and all connected
   players have finished their protected audio. It must not bypass a playing clip.
4. Neither manager can skip voting, runoff, Mafia selection, Doctor selection,
   Detective selection, Gunner/Cannibal selection, or secret-card reading.
5. Co-Host can pause/resume, but cannot start/rematch or assign another co-host.
6. Remove Co-Host status. That player's management controls must disappear,
   and even an old request must be rejected by the server.
7. Confirm co-host assignment reveals no other player's secret role or notes.
8. After a rematch, the primary host is unchanged. All required decisions still
   require the correct player or their normal timer to finish.

Deployment restarts can remove active rooms if the host has no persistent disk.
Update between games and test with a new room.

## Audio races and the bottom card

- During each wake-up command, try chat, card taps, Replay, and pause/resume.
  The complete announcement must remain audible without overlapping effects.
- Have a second player press Skip while the first player still hears a death
  recording. Skip must remain unavailable or be rejected by the server.
- During a last-second reminder, confirm a vote/night choice. The decision must
  still be accepted before its deadline; phase advancement waits for speech.
- In a landscape browser window (for example 800 x 360), verify the larger bottom card
  and its label are fully visible and easy to tap, with adjacent controls usable.
  Switch to Malayalam and repeat. Open the card, hold to reveal, release to hide.
- The automated checks passed, including an eight-session HTTP/SQLite test,
  31 complete phase-announcement variants, every reminder, four literal wake-up
  commands, full mixer sequencing and multiplayer audio leases. MP3s were fully
  decoded without errors and match the supplied files byte-for-byte.
- Browser visual checks and listening on physical audio hardware were
  not available in the editing environment; the steps above remain device QA.
