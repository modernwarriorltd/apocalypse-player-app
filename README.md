# Apocalypse 249 Player App

Static prototype for the Apocalypse 249 player app.

## Deploy to Netlify

This version includes a shared Netlify backend, so deploy it from a GitHub repository or with the Netlify CLI. A simple drag-and-drop static upload will not run the backend build.

Recommended route:

1. Put this folder into a GitHub repository.
2. In Netlify, choose **Add new site**.
3. Choose **Import an existing project**.
4. Pick the GitHub repository.
5. Leave the build command blank.
6. Use `/` as the publish directory.
7. Deploy the site.

Netlify will install the dependency in `package.json`, deploy the function in `netlify/functions`, and use Netlify Blobs for shared storage.

After it is live, create the first admin by registering with `chrisyoungairsoft@gmail.com`. That email is treated as the owner admin account.

## Demo logins

- Admin: `admin@apocalypse249.co.uk` / `admin123`
- Player: `player@example.com` / `player123`

## Important note

When deployed to Netlify with the included function, users, approvals, RIFs, events, announcements and thumbs up reactions are shared across devices.

Uploaded profile, RIF and announcement images are stored separately in a Netlify Blobs image store. The main app data stores only image URLs, which keeps updates faster and avoids browser storage quota problems.

## iOS and Android app store builds

The project includes Capacitor setup for native iOS and Android shells. See `NATIVE_APP_RELEASE.md` before building store versions.

Data is retained by keeping the existing Netlify site as the single backend. Before building native apps, set the live Netlify URL in `app-config.js` so iOS and Android logins use the same user database and image store as the web app.

Do not create a new Netlify site for the store apps unless you first export and import the data from Admin > Backup.

Calendar events can be one-off or recurring daily, weekly, monthly or yearly, with an optional repeat-until date and booking link.

The app includes Site Rules, a Joules/FPS chart, and a Contact Us form. Contact form submissions are saved into the admin backend for review and reply.

When opened locally without Netlify Functions, the app still falls back to browser storage for testing.

Password reset is still a simple prototype reset. A production version should use email verification before changing passwords.
