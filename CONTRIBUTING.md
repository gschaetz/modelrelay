# Contributing to modelrelay

Thanks for considering a contribution. This is a small, actively maintained project — issues and PRs are welcome. Please also read our [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting started

```bash
git clone https://github.com/gschaetz/modelrelay.git
cd modelrelay
npm install
npm test
```

`npm start` runs the router locally the same way the published CLI does (`node bin/modelrelay.js`).

## Making changes

- Keep PRs scoped to one fix or feature; unrelated cleanups make review harder and are easier to land as their own PR.
- Add or update tests in `test/test.js` for any behavior change — `npm test` should stay green (`node --test test/test.js`).
- Match the existing code style in the file you're editing rather than introducing a new convention.
- If a change affects routing/retry behavior, note in the PR description what you tested against a real provider, since a lot of the edge cases here (rate limits, retirements, provider-specific error shapes) only show up live.

## Reporting bugs

Open a GitHub issue with: what you ran, what you expected, what happened, and relevant log output (the `/api/logs` endpoint or console output from `modelrelay` is usually enough).

## Security issues

Please don't open a public issue for a security vulnerability — see [SECURITY.md](SECURITY.md).
