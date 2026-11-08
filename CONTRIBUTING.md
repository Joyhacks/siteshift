# Contributing to Siteshift

Thanks for helping. A few ground rules keep the project easy to work on.

## Setup

```bash
npm install
npm run setup:browser
npm test
```

Try a capture against your own dev server with `npm run capture -- http://localhost:3000 --allow-local`.

## Before you open a pull request

- Keep changes focused. One feature or fix per pull request.
- Add or update tests for any logic you touch. Run `npm test`.
- Business logic belongs in `packages/core`. The CLI, web app and bot only call it.
- Never weaken the URL safety checks in `packages/core/src/url-safety.js`. Hosted versions depend on them.
- Don't add a dependency when a few lines of code will do.

## Reporting a bug

Include the command you ran, the full output, your OS and Node version, and the URL if it is public. If a capture looks wrong, attach the screenshots from the capture folder next to a screenshot of the live page.

## Security issues

Please don't open a public issue for a security problem. Use GitHub's private vulnerability reporting on this repository instead.
