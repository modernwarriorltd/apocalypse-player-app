# Native app release notes

This project is prepared for iOS and Android using Capacitor. The native apps must use the same Netlify backend as the website to retain all existing users, approvals, RIF logs, announcements, early access posts, images, contact messages, and admin data.

## Data safety rule

Do not create a new backend for the store apps. Keep the current Netlify site live and point the native apps at that same site in `app-config.js`.

Before any store release:

1. Log in as admin on the live web app.
2. Open `Admin > Backup`.
3. Use `Download backup`.
4. Keep that JSON file safe before submitting an app build.

## Configure the native apps

In `app-config.js`, set `apiBaseUrl` to the real live Netlify site that currently holds the data:

```js
window.APocalypse249Config = {
  apiBaseUrl: "https://YOUR-REAL-SITE.netlify.app"
};
```

Use the exact existing Netlify site, not a new Netlify site. If this value is blank, the web version works on Netlify but a packaged native app may fall back to local demo mode.

## Build setup

Run these once after installing Node dependencies:

```sh
npm install
npm run cap:add:ios
npm run cap:add:android
```

After app changes:

```sh
npm run cap:sync
```

The sync command runs `npm run build:native` first. That copies only the app files into `www/`, so the native builds do not bundle Netlify backend source files.

Then open the native projects:

```sh
npm run cap:open:ios
npm run cap:open:android
```

## Store release checks

- Confirm the native app login uses the same existing admin account.
- Confirm existing users appear in Admin.
- Confirm existing RIF logs and images load.
- Confirm creating a test announcement on web appears in the native app.
- Confirm creating a test Early Access post on native appears on web.
- Download another admin backup after testing.

## Android Play Store signing

Google Play requires a signed Android App Bundle (`.aab`). The local release signing files must stay on your Mac and must not be uploaded to GitHub.

Create the upload key once from the project folder:

```sh
keytool -genkeypair -v -keystore android/apocalypse-upload-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias apocalypse-upload
```

Use a strong password and keep it safe. Then create `android/keystore.properties` with your real password values:

```properties
storeFile=apocalypse-upload-key.jks
storePassword=YOUR_KEYSTORE_PASSWORD
keyAlias=apocalypse-upload
keyPassword=YOUR_KEY_PASSWORD
```

Build the signed Play Store bundle:

```sh
cd android
./gradlew bundleRelease
```

Upload this file in Play Console:

```text
android/app/build/outputs/bundle/release/app-release.aab
```
