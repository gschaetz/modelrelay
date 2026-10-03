# Agent Instructions

## Post-Feature Testing

After completing any feature or fix, the agent MUST:

1. Run `pnpm test` to verify the complete unit-test suite passes
2. If any test fails, fix the issue immediately
3. Re-run `pnpm test` until all tests pass

This ensures the codebase remains in a working state at all times.

## Documentation Sync (MANDATORY)

User-facing reference documentation lives in `docs/` (one page per topic) and the `README.md` is the landing page (pitch, install, quick start, links into `docs/`). The two MUST stay in sync:

1. **Any change to user-facing behavior updates the matching `docs/` page in the same commit.** That includes routing selectors, endpoints, CLI flags, config keys and environment variables, integrations, and anything exposed under `/api/`. A feature or fix without its docs update is not done.
2. **If the README also covers the topic, update it in the same commit.** Do not let the README and `docs/` disagree. Keep one source of truth per topic: the README summarizes and links to the `docs/` page instead of restating the details.
3. **Keep generated snippets in sync too.** `lib/onboard.js` prints config snippets (OpenClaw, OpenCode, PicoClaw) that duplicate the examples in `docs/integrations.md`, `docs/openclaw.md` and the README. Change them together.
4. **Before finishing, check the docs.** Run a quick `grep` of `README.md` and `docs/` for any flag, endpoint, key or selector you changed, and confirm no stale mention remains. Verify internal links between `docs/` pages still resolve.
5. **New `docs/` pages need front matter** (`title` and `nav_order`) so they appear in the site's sidebar, and a row in the table below and in `docs/index.md`. The site is built by GitHub Pages from `docs/` (Jekyll with the just-the-docs theme, config in `docs/_config.yml`) and published at https://schaetzkc.com/modelrelay/ (the custom domain of the `gschaetz.github.io` user site; the github.io URL redirects there) after every push to `master`. Link between pages with relative `.md` links; from the README use the full site URLs.
6. **Releases:** the npm package page shows the README as of the last published version, so README changes only reach npm on the next release. `docs/` is not part of the npm package (it is not in `files`).

| Topic | Page |
|---|---|
| Install, quick start | `README.md` |
| `modelrelay onboard`, OpenCode | `docs/integrations.md` |
| OpenClaw setup and routing selectors | `docs/openclaw.md` |
| CLI commands, autostart, auto-update | `docs/cli.md` |
| `/v1/chat/completions`, `/v1/models` | `docs/endpoints.md` |
| Tags, `min_ctx`, `exclude`, QoS | `docs/routing.md` |
| Telemetry, `/api/telemetry` | `docs/telemetry.md` |
| Dashboard UI, search syntax, filters, request logs | `docs/dashboard.md` |
| Config file, env vars, OpenAI-compatible endpoints | `docs/configuration.md` |
| Update and local-testing troubleshooting | `docs/troubleshooting.md` |

## Pull Request Workflow (MANDATORY)

Nothing goes straight to `master`. Every change — features, fixes, docs-only edits, version bumps — lands through a pull request:

1. **Branch from an up-to-date `master`**, named by kind: `feat/<slug>`, `fix/<slug>` or `docs/<slug>`. Never commit or push to `master` directly.
2. **Run `pnpm test` before pushing**, and make sure the docs are in sync (see Documentation Sync). Include the `package.json` version bump in the PR when the change is releasable.
3. **Push the branch and open a PR**: `gh pr create --repo gschaetz/modelrelay --base master`. This repo is a fork, so always pass `--repo gschaetz/modelrelay` or `gh` targets the archived upstream. The PR title is a descriptive sentence with no `fix:`/`feat:` prefix (same rule as commit messages). The body covers what changed and why, how it was tested, and which docs were updated. End the body with the attribution line.
4. **CI must pass** (`ci.yml` runs the tests, `npm audit` and the license check; CodeQL runs on the PR too). Fix failures on the branch.
5. **Agents open PRs but do not merge them.** The owner reviews and merges, or explicitly tells the agent to merge. After the merge, update local `master` (`git checkout master && git pull`) before releasing.
6. **Releasing happens from `master` after the merge**, using the Release Process below. Creating the release is what publishes to npm.
7. One logical change per PR; keep unrelated work (for example a docs tweak and a feature) in separate PRs unless they are inseparable.

**Branch protection enforces this on GitHub.** `master` requires a pull request and the `test` and `Analyze (javascript-typescript)` checks to pass, blocks force pushes and deletion, and applies to admins too, so a direct push is rejected. If a push is rejected, open a PR instead. Never disable or bypass branch protection, and never change its settings, without the owner explicitly asking for it.

The `docker-images` repo on GitLab is a separate project with its own flow and is not covered by this section.

## Dashboard Markup Safety (MANDATORY)

`public/index.html` builds most of its UI with template strings assigned to `innerHTML`, and much of the data it shows is untrusted: model ids and labels discovered from custom endpoints, provider/endpoint names set through the settings API, and request fields recorded in the logs (the router API has no auth). Treat all of it as hostile:

1. **Text and attribute values**: wrap every interpolated value in `escapeHtml(...)` (it escapes `& < > " '`, so it is safe in text and in quoted attributes), including `id="..."`, `title="..."`, `value="..."`, `data-*` and `href`.
2. **Inline event handlers**: never write `onclick="fn('${value}')"`, never embed JSON in a handler, and never use a single-quoted handler attribute. Pass arguments with `jsArg(...)`: `onclick="fn(${jsArg(value)})"`. Loop indexes may be interpolated directly. Better still, pass a stable key and look the object up in the handler (see `openDrawerByRow`), or use a `data-*` attribute with a delegated listener.
3. **Don't double-escape**: `escapeHtml` is for HTML, `jsArg` already escapes for the attribute, and `textContent` needs neither.
4. **The tests enforce this** (`dashboard inline handler and markup safety`, `dashboard HTML escaping`). If one fails, fix the markup instead of loosening the test.
5. **When you add a new place that renders model, provider, log, or request data, check it with hostile values** (quotes, `<img onerror>`, a `'` breakout) in a browser before opening the PR.

||||||| ccff78f
## Input Safety (MANDATORY)

The admin API and the proxy are unauthenticated, accept request bodies of several megabytes, and run in one single-threaded process, so any API input is hostile. These rules come from real findings (a one-request denial of service via a quadratic regex, and prototype pollution through `POST /api/config`):

1. **No quadratic regexes on user input.** Do not use trailing-anchored or edge-trimming patterns such as `/x+$/`, `/^x+|x+$/` or `/\s+word\s*$/` on anything a caller can influence (endpoint names, tags, model ids, API keys, labels from discovered endpoints). Use the linear helpers in `lib/text.js` (`trimWhile`, `trimEndWhile`, `stripTrailingSuffixes`), or `capLength` before the regex. Keep behavior identical and prove it with a parity test against the old regex.
2. **Never index a plain object with a user-supplied key unchecked.** `obj['__proto__']` resolves to `Object.prototype`, so `obj[key].x = 1` pollutes every object. Validate keys with `isSafeObjectKey`, validate provider keys with `isKnownProviderKey`, and use own-property checks (`Object.prototype.hasOwnProperty.call`) instead of truthiness on plain objects such as `sources` or `MODEL_ID_ALIASES`.
3. **Bound input sizes.** Admin routes parse JSON with a 1 MB limit (`MODELRELAY_API_JSON_LIMIT`); validate string lengths on routes that store them.
4. **Don't print secrets.** The CLI never prints any part of a key, nor counts derived from the key list; `modelrelay accounts` identifies keys by a short one-way fingerprint (`#a1b2c3`).
5. The suites `regex replacements keep their exact behavior`, `adversarial input cannot stall the router` and `prototype pollution guards` enforce this. Extend them when you add a new input path.

## Git Commits

When making a commit on behalf of the user, NEVER prefix your commit message with `fix:`, `feature:`, `feat:`, `chore:`, or any other prefix. 
Just write a descriptive sentence of what was changed.

## Release Process (MANDATORY)

When releasing a new version, follow this exact process:

1. **Version Check**: Check if version already exists with `git log --oneline | grep "^[a-f0-9]\+ [0-9]"`
2. **Version Bump**: Update version in `package.json`. If the releas only includes bug 
fixes, bump a patch version  (e.g., `1.23.3` → `1.23.4`). If it includes new features, bump a minor version  (e.g., `1.23.3` → `1.24.0`)
Do not bump the major version.
3. **Commit ALL Changed Files on your feature branch** (never on `master`): `git add . && git commit -m "Fixed issue with autostart"`
   - Always commit using a description of what was changed as the commit message. 
   - Include ALL modified files in the commit (bin/, lib/, test/, README.md, etc.)
4. **Open a PR and get it merged**: push the branch and open a pull request into `master` (see Pull Request Workflow above), then `git checkout master && git pull` once it is merged. The version bump from step 2 is part of that PR, and pushing to `master` does not publish.
5. **Create GitHub Release** — this is what triggers the GitHub Actions npm publish. This repo is a fork, so always pass `--repo gschaetz/modelrelay` (or run `gh repo set-default gschaetz/modelrelay` once), otherwise `gh` targets the archived upstream and fails:
   ```bash
   gh release create VERSION --repo gschaetz/modelrelay --target master --title "VERSION" --notes "Release notes"
   ```
   (e.g., `gh release create 1.5.0 --repo gschaetz/modelrelay --target master --title "1.5.0" --notes "Fixed an issue with ABC"`)
   When writing the release notes, summarize the changes from all commits since the last release.
6. **Wait for npm Publish":
   ```bash
   for i in $(seq 1 30); do sleep 10; v=$(npm view @schaetzkc/modelrelay version 2>/dev/null); echo "Attempt $i: npm version = $v"; if [ "$v" = "1.23.4" ]; then echo "✅ published!"; break; fi; done
   ```
7. **Install and Verify**: `npm install -g @schaetzkc/modelrelay@1.23.4`
8. **Test Binary**: `modelrelay --help` (or any other command to verify it works)
9. **Only when the global npm-installed version works → the release is confirmed**

**Why:** A local `npm install -g .` can mask issues because it symlinks the repo. The real npm package is a tarball built from the `files` field — only a real npm install will catch missing files.

## Real-World npm Verification (MANDATORY for every fix/feature)

**Never trust local-only testing.** `pnpm start` runs from the repo and won't catch missing files in the published package. Always run the full npm verification:

1. Bump version in `package.json` (e.g. `1.23.3` → `1.23.4`)
2. Get the change merged to `master` through a PR (see Pull Request Workflow), then create the GitHub release from `master` (see Release Process step 5) — creating the release is what triggers the npm publish
3. Wait for the new version to appear on npm:
   ```bash
   # Poll until npm has the new version
   for i in $(seq 1 30); do sleep 10; v=$(npm view @schaetzkc/modelrelay version 2>/dev/null); echo "Attempt $i: npm version = $v"; if [ "$v" = "NEW_VERSION" ]; then echo "✅ published!"; break; fi; done
   ```
4. Install the published version globally:
   ```bash
   npm install -g @schaetzkc/modelrelay@NEW_VERSION
   ```
5. Run the global binary and verify it works:
   ```bash
   modelrelay
   ```
6. Only if the global npm-installed version works → the fix is confirmed

**Why:** A local `npm install -g .` can mask issues because it symlinks the repo. The real npm package is a tarball built from the `files` field — if something is missing there, only a real npm install will catch it.

## Test Architecture

- Tests live in `test/test.js` using Node.js built-in `node:test` + `node:assert` (zero deps)
- Pure logic functions are in `lib/utils.js` (extracted from the main CLI for testability)
- The main CLI (`bin/modelrelay.js`) imports from `lib/utils.js`
- If you add new pure logic (calculations, parsing, filtering), add it to `lib/utils.js` and write tests
- If you modify existing logic in `lib/utils.js`, update the corresponding tests

### What's tested:
- **sources.js data integrity** — model structure, valid tiers, no duplicates, count consistency
- **Core logic** — getAvg, getVerdict, getUptime, sortResults, findBestModel
- **CLI arg parsing** — current router flags (`--port`, `--no-log`, `--ban`, `--onboard`)
- **Package sanity** — package.json fields, bin entry exists, shebang, ESM imports

## Model Quality Scores

Model quality is refreshed from OpenRouter's public Models API at runtime and cached for 24 hours. Use this source hierarchy, in order:

1. `benchmarks.artificial_analysis.coding_index / 100` (preferred)
2. Design Arena `models/codecategories` Elo converted to a 0–1 coding score by the regression trained from catalog models that have both values
3. The bounded metadata estimate in `lib/model-quality.js` (popularity, recency, coding capabilities, and context length)
4. `scores.js` as an offline fallback
5. `0.45` only when no catalog match or local fallback exists

Design Arena, metadata, local, and default scores MUST remain labeled as fallbacks. Never describe an estimated score as verified or silently substitute an invented benchmark.

### Audit Command

From the project checkout, always run the source version of the command—not a globally installed package:

```powershell
node .\bin\modelrelay.js refresh-scores
```

The command requires network access. It prints every configured or discovered model in descending score order, the source used, fallback markers, source counts, and provider-discovery warnings. A provider warning means the audit is incomplete; do not conclude that all models were checked.

When model aliases appear as separate rows, add canonical aliases in `sources.js` and a dated offline fallback in `scores.js`, then rerun the command. Keep score computation in `lib/model-quality.js` and add pure-logic tests in `test/test.js` whenever the hierarchy, matching, regression, or metadata formula changes.
