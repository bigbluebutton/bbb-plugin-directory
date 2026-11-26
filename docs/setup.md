# Setting up and operating the directory

Everything below needs an administrator of the `bigbluebutton` organization
and of this repository. Nothing here is created by the code: until it is in
place, the workflows fail at the step that needs it.

## 1. GitHub App (the bots' identity)

Events created with the workflows' default token do not trigger other
workflows, so the label applied by bot 1 would not wake bot 2 and the merge by
bot 2 would not start the publication. The bots therefore act as a GitHub App.

Create an App owned by the organization and install it on this repository only:

| Repository permission | Access | Used for |
|---|---|---|
| Contents | Read and write | merging deploy PRs; pushing the `bot/bbb-sdk-table` branch |
| Pull requests | Read and write | reading PRs and their files, merging, opening the table PR |
| Issues | Read and write | the `deploy` label and the bot comment |
| Checks | Read | the result of the `verify-build` check |
| Metadata | Read | mandatory |

No webhook and no user permissions. Then, in this repository:

- variable `DIRECTORY_APP_ID`: the App ID;
- secret `DIRECTORY_APP_PRIVATE_KEY`: a private key of the App.

## 2. Team, label and branch ruleset

- Create the team `@bigbluebutton/plugin-directory-maintainers` with write
  access. It is the code owner of everything except `plugins/*/release.json`
  ([`.github/CODEOWNERS`](../.github/CODEOWNERS)). To use another team, edit
  CODEOWNERS (the CI checks its shape).
- Create the label `deploy`. Only bot 1 applies it (external maintainers cannot
  apply labels anyway).
- Ruleset on `main`:
  - require a pull request, with **0 required approvals** and **Require review
    from Code Owners**: a deploy PR only touches an unowned file and needs no
    approval, while any other change needs a directory maintainer's review;
  - require the status check `test` (workflow CI). Do **not** require
    `verify-build`: it only runs on PRs that change a `release.json`, and
    bot 2 already checks it;
  - block force pushes and deletion.
- Actions settings: workflow permissions read-only by default. With the default
  "require approval for first-time contributors", the verification build of an
  external maintainer's first PR waits until a maintainer approves the run
  (the bots are not affected).

## 3. Object storage

Any S3-compatible storage that serves HTTPS and CORS works; switching providers
means changing the variables below.

- A bucket readable by anyone (bucket policy, or `S3_OBJECT_ACL=public-read`
  so every uploaded object is public).
- CORS allowing `GET` and `HEAD` from any origin: every BigBlueButton server
  has its own origin. Apply it once with the publishing key:

  ```bash
  S3_ENDPOINT=... S3_BUCKET=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
    node src/cli/configure-bucket.mjs
  ```

- A key restricted to that bucket. If the provider can deny deleting and
  overwriting under the version folders while allowing it under `bbb/`, `sdk/`
  and `catalog.json`, use that. If not (DigitalOcean Spaces keys are per
  bucket, without per-prefix rules), the CI enforces it: it refuses to write
  into a version folder that already has any file.

Create the environment `publish` (deployment branches: `main` only) holding:

| Name | Kind | Example |
|---|---|---|
| `S3_ENDPOINT` | variable | `https://nyc3.digitaloceanspaces.com` |
| `S3_REGION` | variable | `us-east-1` (most providers ignore it) |
| `S3_BUCKET` | variable | `bigbluebutton-plugins` |
| `S3_PREFIX` | variable | optional folder inside the bucket, e.g. `plugins` |
| `S3_FORCE_PATH_STYLE` | variable | `true` only for providers that need it |
| `S3_OBJECT_ACL` | variable | `public-read`, or empty when a bucket policy makes it public |
| `PUBLIC_BASE_URL` | variable | public HTTPS address of the prefix, e.g. `https://nyc3.digitaloceanspaces.com/bigbluebutton-plugins/plugins` or `https://plugins.bigbluebutton.org` |
| `S3_ACCESS_KEY_ID` | secret | |
| `S3_SECRET_ACCESS_KEY` | secret | |

Only the `publish` and `catalog` jobs of [publish.yml](../.github/workflows/publish.yml)
use this environment. The job that runs a plugin's build never sees the key: it
hands the built files over as an artifact, and the publish job checks them
against their `contract.json` before uploading.

## 4. GitHub Pages

Settings > Pages > Source: **GitHub Actions**. The `pages` job of the publish
workflow deploys the showcase after each catalog regeneration. A custom domain
is set there too.

## 5. Running it

| Workflow | When | What |
|---|---|---|
| CI | every PR and push | unit tests, validation of the input files |
| Verify build | PRs changing a `release.json` | build without credentials; check `verify-build` |
| Bot - label deploy requests | PR opened/updated (`pull_request_target`) | bot 1 |
| Bot - merge deploy requests | `deploy` label, end of a verification build | bot 2 |
| Publish | push to `main` under `plugins/` or `data/`; daily; by hand | build, publish, post-deploy check, catalog, showcase |
| Update the BBB to SDK table | weekly; by hand | opens a PR when BigBlueButton released a version |

The bots run on `pull_request_target` / `workflow_run` with the base branch
checked out and only read data from the PR (changed files, `release.json`,
the remote tag). Nothing from a PR is checked out or run with a token that can
write.

**When the post-deploy check fails** the Publish run fails and its summary says
which address is wrong. A stable folder is copied again automatically once; a
version folder is never rebuilt automatically (a rebuild may change the sha256
someone pinned). Re-running the failed job reuses the same artifact, which is
safe: the version folder is accepted when it holds exactly that build.

The daily run regenerates the catalog from what the storage holds, which also
repairs a catalog left behind by two publications finishing out of order.

### Keeping the BBB to SDK table right

`data/bbb-sdk-versions.json` maps each BigBlueButton release to the plugin SDK
version its server checks plugins against (`html5PluginSdkVersion`). Two fields
per line are edited by hand in the weekly PR or on their own:

- `supported`: stable URLs of the line are only updated while it is `true`;
- `minSupported`: the oldest release of the line a stable URL must keep
  working on. Raising it lets plugins that need a newer SDK reach the line's
  stable URL; servers on older releases of the line keep the per-version and
  per-SDK-line URLs. Each plugin also needs `minSupported` at a release whose
  SDK satisfies its `requiredSdkVersion`: 3.0.6 shipped SDK 0.1.2 while the rest
  of 3.0 ships 0.0.x, and pick-random-user's 0.0.x versions declare `~0.0.92`
  (3.0.13 ships 0.0.90, 3.0.14 ships 0.0.94). That is why the 3.0 line is set
  to `3.0.14` (see [design.md](design.md)).

## Trying it locally

```bash
npm ci
scripts/local/storage-up.sh                          # S3-compatible storage on 127.0.0.1:8333
source <(scripts/local/storage-up.sh --env)
node src/cli/configure-bucket.mjs --create
# plugins/<id>/ must exist (plugin.json, maintainers.json, release.json)
node src/cli/build-plugin.mjs --plugin <id> --out out/publication
PUBLIC_BASE_URL=http://127.0.0.1:8333/plugins node src/cli/publish.mjs --dir out/publication
PUBLIC_BASE_URL=http://127.0.0.1:8333/plugins node src/cli/generate-catalog.mjs --out out/catalog.json
node src/cli/build-showcase.mjs --catalog out/catalog.json --out out/site
scripts/local/storage-up.sh --down
```

A BigBlueButton server refuses manifest URLs that resolve to private
addresses; to load plugins from a local storage, add its host name to
`fetchUrlAllowedLocalHosts` in `/etc/bigbluebutton/bbb-web.properties`, and
serve it over HTTPS, since the client page is HTTPS.
