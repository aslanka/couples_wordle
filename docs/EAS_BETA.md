# Pairle week-long beta (EAS internal distribution)

This installs Pairle directly on both iPhones so it works without Expo Go and without keeping the Mac running.

## 1. Pull the beta branch

```bash
git checkout supabase-persistent-pairing
git pull
npm install
```

## 2. Install and sign into EAS

```bash
npm install -g eas-cli
eas login
```

## 3. Link the repo to an Expo/EAS project

```bash
eas init
```

Create/select the Pairle project when prompted. EAS may add `extra.eas.projectId` to `app.json`; commit that generated change afterward.

## 4. Add Supabase config to the EAS preview environment

Use the same values from your local `.env`:

```bash
eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value "YOUR_SUPABASE_URL" --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "YOUR_SUPABASE_ANON_KEY" --visibility plaintext
```

Never put a Supabase service-role key in the mobile app.

## 5. Register both iPhones

```bash
eas device:create
```

Open the generated registration link on your phone, then have the second tester register theirs too.

Verify:

```bash
eas device:list
```

## 6. Build the preview app

```bash
eas build --platform ios --profile preview
```

For the first iOS build, follow the Apple credential/provisioning prompts and let EAS manage credentials unless you already manage them yourself.

## 7. Install on both phones

Open the EAS installation URL from the completed build on each registered iPhone and install Pairle.

The app will then live on the Home Screen and talk directly to Supabase. Your Mac does not need to stay on.

## Updating during the beta

For now, create another preview build after changes:

```bash
eas build --platform ios --profile preview
```

Then install the new build from its EAS link.

## Troubleshooting

If a phone says it is not registered, run `eas device:create` for that phone and make a new preview build. If Supabase config is missing, run `eas env:list --environment preview` and rebuild.
