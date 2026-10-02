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
| Config file, env vars, OpenAI-compatible endpoints | `docs/configuration.md` |
| Update and local-testing troubleshooting | `docs/troubleshooting.md` |

## Git Commits

When making a commit on behalf of the user, NEVER prefix your commit message with `fix:`, `feature:`, `feat:`, `chore:`, or any other prefix. 
Just write a descriptive sentence of what was changed.

## Release Process (MANDATORY)

When releasing a new version, follow this exact process:

1. **Version Check**: Check if version already exists with `git log --oneline | grep "^[a-f0-9]\+ [0-9]"`
2. **Version Bump**: Update version in `package.json`. If the releas only includes bug 
fixes, bump a patch version  (e.g., `1.23.3` → `1.23.4`). If it includes new features, bump a minor version  (e.g., `1.23.3` → `1.24.0`)
Do not bump the major version.
3. **Commit ALL Changed Files**: `git add . && git commit -m "Fixed issue with autostart"`
   - Always commit using a description of what was changed as the commit message. 
   - Include ALL modified files in the commit (bin/, lib/, test/, README.md, etc.)
4. **Push**: `git push origin master` — this repo's release branch is `master` (pushing does not publish)
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
2. Commit and push to `master`, then create the GitHub release (see Release Process step 5) — creating the release is what triggers the npm publish
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
