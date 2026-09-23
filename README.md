# Pairle — two-device MVP

Pairle is a daily couples Wordle where each partner secretly chooses a five-letter word for the other person.

This branch replaces the original pass-the-phone demo with a real two-screen workflow.

## What works

- Create a shared Pairle room on screen 1
- Join by 6-character code on screen 2
- Each screen has its own player identity
- Each partner independently chooses a secret five-letter word
- Room state refreshes automatically every 1.5 seconds
- Each player independently solves the word created for them
- Six-guess Wordle scoring, including duplicate-letter handling
- Secret answers remain on the local room server while the puzzle is active
- Each player can see when their partner has set a word / finished

## 1. Pull the branch

```bash
git fetch origin
git checkout two-device-mvp
git pull
npm install
```

## 2. Start the local room server

Open terminal 1 from the project directory:

```bash
node server.mjs
```

You should see:

```text
Pairle local server running on http://0.0.0.0:8787
```

The server stores rooms in memory, so stopping it clears all rooms. That is intentional for this MVP.

## 3. Start Expo

Open terminal 2:

```bash
npx expo start
```

## 4. Test with two screens

### Easiest: two separate runtimes

Good combinations are:

- iOS Simulator + web browser
- iOS Simulator + physical phone
- Android emulator + iOS Simulator
- two physical phones

Create a room on one screen, then use the displayed code to join on the other.

### Server URL

Each screen asks for the local server URL.

For web or iOS Simulator on the same Mac, this normally works:

```text
http://localhost:8787
```

For a physical phone, `localhost` points to the phone itself. Use your Mac's LAN IP instead, for example:

```text
http://192.168.1.25:8787
```

To find your Mac's Wi-Fi IP you can run:

```bash
ipconfig getifaddr en0
```

Then enter:

```text
http://YOUR_MAC_IP:8787
```

Make sure both devices are on the same Wi-Fi network.

For the standard Android emulator, the Mac host is commonly available at:

```text
http://10.0.2.2:8787
```

## Test flow

1. Screen A: enter a name and tap **Create Pairle**.
2. Copy the six-character room code.
3. Screen B: choose **Join room**, enter a second name and the room code.
4. Both screens choose a secret five-letter word.
5. When the other person's word is ready, **Play partner's word** appears automatically.
6. Both players can solve independently.

## Important MVP limitations

- No production authentication yet.
- Rooms disappear when `server.mjs` stops.
- No database or historical daily games yet.
- No dictionary validation yet; any five letters are accepted.
- No push notifications yet.
- A refresh/restart of the app requires joining/creating again because device sessions are intentionally kept in memory for easy two-tab/two-runtime testing.

## Next production step

Once the two-device loop feels right, replace the in-memory server with Supabase:

- Auth
- Persistent pairs
- Invite/deep links
- Daily puzzles
- Realtime room updates
- Persistent streak/history
- Push notifications
- Row-level security so each secret word is only readable by its creator until the puzzle ends
