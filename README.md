# AXIS ICON STRUCTURE website

Astro site with pre-rendered pages, served by `server.mjs`. Forms send through the Brevo email API.

## Run locally

```
npm install
copy .env.example .env
npx astro build
npm start
```

The site runs at http://localhost:4321. To test forms without sending real email, run `node tools/brevo-mock.mjs` and set `BREVO_API_URL=http://127.0.0.1:4555/v3/smtp/email` in `.env`.

## Production settings

Set these on the server: `BREVO_API_KEY`, `MAIL_FROM`, `MAIL_TO`, `PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` and `NODE_ENV=production`. Do not set `BREVO_API_URL`. `MAIL_FROM` must be a verified Brevo sender. `PUBLIC_TURNSTILE_SITE_KEY` must be set before the build.

## Add a blog post

Copy `src/content/blog/example-post.md`, rename it, fill in the details, delete the `draft` line, then rebuild and deploy. Blog links appear automatically once one post is published. Preview drafts by building with `SHOW_DRAFTS=true`.

## Tests

Start the server, then run `node tools/verify.mjs`, `node tools/browser-test.mjs`, and `node tools/form-test.mjs browser` with the Brevo mock running.

## Page source

`src/generated` holds the page content as HTML fragments (`pages/*.html` and their `*.css`), the shared header, footer and styles. Edit these files directly for content changes.
