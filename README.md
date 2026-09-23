# Pairle MVP

A pass-the-phone React Native MVP for a daily couples Wordle ritual.

## What works

- One-time couple onboarding
- Both partners secretly choose a 5-letter word
- Privacy handoff screens
- Full 6-guess Wordle loop
- Correct duplicate-letter scoring
- Daily completion
- Shared streak
- History of completed daily puzzles
- Local persistence with AsyncStorage
- Reset/demo flow

## Run it

Expo's current stable SDK is 57. This project targets Expo 57 / React Native 0.86.

```bash
npm install
npx expo start
```

Then open it in an iOS simulator, Android emulator, or a compatible Expo development environment.

If npm reports Expo dependency mismatches, run:

```bash
npx expo install --fix
```

## MVP product flow

1. Enter both names.
2. Player A chooses a secret word for Player B.
3. Pass the phone.
4. Player B chooses a secret word for Player A.
5. Player A solves Player B's word.
6. Player B solves Player A's word.
7. Results are saved to the daily history and the streak increments.

## Important MVP simplifications

This build deliberately does **not** require an account or backend. It is for validating the game loop on one phone.

For a real two-phone beta, the next backend model can be:

- `profiles`
- `pairs`
- `pair_members`
- `daily_puzzles`
- `guesses`
- `daily_results`

Supabase is a natural next step because you only need authentication, a relational database, realtime updates, and row-level security.

## Suggested next milestone

Turn pass-the-phone Pairle into remote Pairle:

- Magic-link / Apple / Google sign-in
- Invite partner via 6-character code or deep link
- Each partner submits their word from their own phone
- Push notification when both words are locked
- Unlock once per local day
- Remote guesses sync in realtime
- Shared streak freezes only after both have completed the day
- Optional hint / "why I chose this word"
