# Hollow Chess — phone app

The Android (and later iOS) app is the website itself inside a native shell
(Capacitor). There is one codebase: change the game in `../js`, `../index.html`,
`../styles.css`, then rebuild the app. Accounts, ratings and games live in the
same Supabase database as hollowchess.com.

## One-time setup (already done on this Mac)

```bash
brew install openjdk@21
brew install --cask android-commandlinetools
```

Every shell that builds needs:

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
```

## Everyday

```bash
cd app
npm install          # first time only
npm run apk          # copies the site into www/, syncs, builds a debug APK
```

The debug APK lands in `android/app/build/outputs/apk/debug/app-debug.apk`.
Install it on a phone with USB debugging on: `adb install -r <that file>`.

## Release (Google Play)

`npm run bundle` builds `android/app/build/outputs/bundle/release/app-release.aab`,
signed with the upload key described in `android/keystore.properties`
(kept out of git). Upload the .aab in Play Console.

Bump `versionCode` (+1 every upload) and `versionName` in
`android/app/build.gradle` before each release.

## What only the app does (`../js/native.js`)

- vibration on moves, captures, board turns, check and results
- Android back button closes panels; with nothing open it backgrounds the app
- room and game links go through the share sheet instead of "Copy"
- status bar matches the page; splash is the deco arch on cream

## Store requirements already covered

- Delete account: Profile → Delete account (edge function `delete-account`)
- Privacy policy: https://hollowchess.com/privacy.html
- Account deletion page: https://hollowchess.com/delete-account.html
- 512px icon: `store/icon-512.png`
