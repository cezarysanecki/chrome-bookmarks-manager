---
name: chrome-store-release
description: >
  Use this skill when the user wants to prepare or publish a release of this
  Chrome extension. Activate on phrases such as "wydaj rozszerzenie",
  "przygotuj release do Chrome Web Store", "zbuduj paczke do Chrome Store",
  "opublikuj nowa wersje", "chrome store release", or "prepare extension
  release". The skill validates the project, updates the manifest version,
  creates a clean ZIP package, and provides the manual publishing checklist.
allowed-tools: ask_user, bash
---

# Chrome Store Release - Project Release Guardian

You are the release guardian for the Chrome Bookmarks Manager extension. Prepare
a reproducible, review-ready package for Chrome Web Store without including
development files or publishing an unverified build.

---

## Purpose

Run the complete local release process:

1. inspect the worktree and choose the next version,
2. validate the extension and its tests,
3. update `manifest.json`,
4. create a minimal ZIP under `dist/`,
5. verify the archive,
6. provide the exact manual steps for Chrome Developer Dashboard.

The Chrome Web Store upload remains manual. Never request, store, or print
Google account credentials.

## Versioning policy

Read the current version from `manifest.json` and choose the next version using
these rules:

| Change type | Version bump | Example |
|---|---|---|
| Bug fixes and small internal improvements | patch | `1.0.0` -> `1.0.1` |
| Backward-compatible user-facing features | minor | `1.0.1` -> `1.1.0` |
| Major scope or intentionally incompatible behavior | major | `1.1.0` -> `2.0.0` |

Infer the bump from the current diff and recent commits. If the intended scope
is genuinely ambiguous, use `ask_user` to select patch, minor, or major.

Chrome Web Store requires every uploaded package to have a version higher than
the previously uploaded package. If the latest Store version is not available
locally, ask the user for it before changing `manifest.json`.

## Workflow

### 1. Preflight

Run from the repository root:

```bash
git status --short
git diff --check
git diff --stat
node --version
npm --version
```

Review all staged and unstaged changes that will enter the package. Never
discard, overwrite, or silently exclude user changes. If unrelated or
unexpected changes could enter the release, stop and use `ask_user`.

Confirm these required release inputs exist:

```text
manifest.json
background.js
popup.html
popup.css
popup.js
fullpage.html
fullpage.css
fullpage.js
error.html
error.js
src/
icons/
```

### 2. Validate before changing the version

Install exact locked dependencies and run the complete existing test suite:

```bash
npm ci
npm test
```

Stop on any failure. Do not create a release package from failing tests and do
not hide errors with `|| true`.

Validate that `manifest.json` is valid JSON, uses Manifest V3, and references
files that exist. Also confirm that each JavaScript import resolves to a file in
the package.

### 3. Review Store-facing declarations

Compare the current functionality with:

```text
STORE_LISTING.md
store/privacy-policy.html
docs/index.html
manifest.json permissions
```

Pay particular attention to `tabs`, `storage`, `bookmarks`, and `<all_urls>`.
If behavior, permissions, external network calls, data handling, screenshots,
or the single-purpose statement changed, update the relevant listing or privacy
material before packaging. Do not claim that no data leaves the browser when a
feature sends requests to bookmark hosts or an external API.

### 4. Update the manifest version

Update only the top-level `version` in `manifest.json`. Preserve formatting and
all other fields. Validate the resulting JSON immediately.

Do not change `package.json`: this repository is private and its package version
is not the Chrome extension version.

Show the old and new versions before continuing.

### 5. Build a minimal package

Create:

```text
dist/chrome-bookmarks-manager-<version>.zip
```

The archive must contain only this whitelist:

```text
manifest.json
background.js
popup.html
popup.css
popup.js
fullpage.html
fullpage.css
fullpage.js
error.html
error.js
src/**
icons/**
```

The archive must not contain:

```text
.git/
.github/
node_modules/
tests/
docs/
store/
dist/
coverage/
package.json
package-lock.json
vitest.config.js
README.md
STORE_LISTING.md
.DS_Store
```

Build from an explicit whitelist, not by zipping the repository and excluding
known files. Ensure `manifest.json` is at the archive root, not inside an extra
parent directory.

### 6. Verify the artifact

Run all of these checks:

```bash
unzip -t dist/chrome-bookmarks-manager-<version>.zip
unzip -Z1 dist/chrome-bookmarks-manager-<version>.zip
shasum -a 256 dist/chrome-bookmarks-manager-<version>.zip
```

Inspect the full archive listing. Fail if a required file is absent, a forbidden
file is present, the manifest is not at the root, or the archive version differs
from `manifest.json`.

Extract the ZIP to a temporary directory and repeat the manifest and referenced
file checks against the extracted artifact. Remove only that explicitly created
temporary directory afterward.

### 7. Handoff for manual publication

Report:

| Field | Value |
|---|---|
| Previous version | version before the bump |
| Release version | version in the packaged manifest |
| Artifact | absolute path to the ZIP |
| SHA-256 | verified checksum |
| Tests | exact passing test command and result |
| Worktree | concise list of release-related changes |

Then provide these manual steps:

1. Open `https://chrome.google.com/webstore/devconsole`.
2. Select the existing Bookmarks Manager item.
3. Upload the generated ZIP in the package section.
4. Review Store Listing, Privacy, Distribution, and Test instructions.
5. Select deferred publishing unless the user explicitly wants automatic
   publication after approval.
6. Submit for review.
7. After approval, perform a final listing check and publish the staged version.

Mention that review commonly takes several days and may take longer because the
extension requests `tabs` and `<all_urls>`.

## Failure handling

- If tests fail, stop before versioning and packaging.
- If versioning fails after modifying `manifest.json`, restore only the exact
  version change made by this workflow; never revert other user changes.
- If packaging or archive verification fails, delete only the incomplete ZIP
  created by this run, fix the cause, and rebuild it.
- If Store declarations do not match behavior, stop packaging and report the
  exact mismatch.
- If required publishing information is unavailable, produce the verified local
  artifact when safe and clearly mark the remaining manual blocker.

## Rules

- Always use the version from `manifest.json` as the artifact version.
- Always run the complete test suite before packaging.
- Always package from the explicit whitelist.
- Never include source maps, dependencies, tests, repository metadata, or Store
  marketing assets in the extension ZIP.
- Never commit, tag, push, create a GitHub release, or upload to Chrome Web Store
  unless the user explicitly requests that separate action.
- Never use `npm audit fix --force` during a release.
- Never weaken permissions or privacy declarations merely to pass review.
- Never claim a release is ready until the ZIP itself has been extracted and
  validated.
