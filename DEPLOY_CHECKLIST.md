# Netlify Function Deploy Checklist

If the app says local demo mode on Netlify, check these items.

## GitHub files that must exist

At the top level of the GitHub repository, these must be visible:

- `index.html`
- `app.js`
- `package.json`
- `netlify.toml`
- `netlify/functions/api.js`
- `netlify/functions/health.js`

If `netlify/functions/health.js` is missing in GitHub, Netlify cannot deploy the backend.

## Netlify settings

In Netlify, open the site then go to **Site configuration > Build & deploy > Continuous deployment**.

Check:

- Base directory: blank, unless the app files are inside a subfolder
- Build command: blank
- Publish directory: `.`
- Functions directory: `netlify/functions`

If the app files are inside a subfolder in GitHub, set Base directory to that subfolder.

## Expected test URLs

After deploy, these should return JSON:

- `https://YOUR-SITE.netlify.app/.netlify/functions/health`
- `https://YOUR-SITE.netlify.app/.netlify/functions/api/health`

Expected result:

```json
{"ok":true}
```

If either URL shows the app page instead, the function did not deploy.
