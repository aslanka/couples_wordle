# Pairle — persistent Supabase MVP

This branch replaces temporary rooms with a permanent two-person pairing.

## What works

- Email/password account creation and sign-in
- One-time partner pairing by invite code
- Pair membership persists forever unless you later add an unpair flow
- A fresh daily game is created automatically when either partner opens the app
- Each partner independently creates a five-letter word
- Each partner independently solves the word made for them
- Secret answers stay in Supabase and are scored server-side
- Six-guess Wordle scoring with duplicate-letter handling
- Daily completion and shared streak tracking
- Supabase-backed state works across separate phones, simulators, and browsers
- App sessions persist with AsyncStorage

## 1. Supabase setup

Create a Supabase project, then open the SQL Editor and run the entire file:

```text
supabase/schema.sql
```

For easiest local testing, under Authentication settings you can temporarily disable email confirmation. If email confirmation stays enabled, each test account must confirm its email before signing in.

## 2. Add local environment variables

Copy the example file:

```bash
cp .env.example .env
```

Fill in:

```text
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Use the public/anon client key, never the service-role key in the React Native app.

## 3. Pull and install

```bash
git fetch origin
git checkout supabase-persistent-pairing
git pull
npm install
npx expo start
```

`npm install` will update `package-lock.json` locally because Supabase dependencies were added on this branch.

## 4. Test with two screens

Use any two independent app runtimes, for example:

- iOS Simulator + browser
- two browser profiles/private windows
- iOS Simulator + Android emulator
- two physical phones

### Screen A

1. Create account / sign in.
2. Tap **Create pair**.
3. Share the displayed 6-character invite code.

### Screen B

1. Create a different account / sign in.
2. Tap **Join partner**.
3. Enter the invite code.

That code is only needed once. Both accounts now belong to the same permanent pair.

## Daily flow

Every day the home screen is automatically scoped to today's date.

1. Each partner sees **Create word** until they send a word.
2. As soon as one partner submits, the other device sees that today's word is ready (the app polls Supabase every few seconds for the MVP).
3. Each player solves independently.
4. When both puzzles finish, the daily game is marked complete and the pair streak updates.
5. The next calendar day automatically produces a new daily game. No new room or invite code is needed.

## Notifications

The database/app flow is ready for the notification phase, but true remote push notifications need Expo push credentials and an EAS project. Expo recommends testing push with a development build rather than relying on Expo Go for all platforms.

The intended events are:

- Morning reminder: **Create a word for your partner**
- Partner submits: **Your partner just sent today's Pairle**
- Partner finishes: **Your partner solved your word**
- Evening reminder if one player has not completed the day

Next implementation step: add `expo-notifications`, register each device's Expo push token into `profiles.expo_push_token`, and deploy a Supabase Edge Function that sends the partner notifications through Expo Push Service.

## Security notes

- The React Native app only contains the public Supabase anon key.
- Pairle gameplay is performed through authenticated RPC functions.
- The secret word is not returned to the solver until their puzzle is finished.
- Row Level Security is enabled on the underlying tables.
- Never put a Supabase service-role key in `.env` for the client app.
