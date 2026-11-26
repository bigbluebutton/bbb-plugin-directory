# Design notes

The directory follows the Plugin Directory specification. This page records
how the open points of that specification were settled for this first version
of the infrastructure, and which ones are still open.

## Settled in this version

**Stable URLs follow the oldest supported release of a line.** A version is
copied to `bbb/<line>/<id>/` only when its `requiredSdkVersion` is satisfied by
the SDK of every release of that line from `minSupported` on, and to
`sdk/<line>/<id>/` only when it is satisfied by every SDK version of that line
still shipped by a supported release. A stable folder only moves to a newer
version. Pre-release plugin versions only get their fixed folder.

**The 3.0 line starts at 3.0.14.** With `minSupported` at the first release of
the line, `bbb/3.0/` would never receive a plugin: 3.0.6 shipped SDK 0.1.2
between releases on 0.0.x, and no 0.0.x range accepts it. 3.0.14 is the first
release whose SDK (0.0.94) satisfies `~0.0.92`, the range of pick-random-user's
0.0.x versions, so that plugin reaches `bbb/3.0/`. Servers on 3.0.0 to 3.0.13
use the per-version URL or `sdk/%%HTML5_PLUGIN_SDK_MAIN_VERSION%%/`, which
follows their own SDK. The 4.0 line starts at 4.0.0 (every 4.0 release ships
SDK 1.0.0-beta.3).

**The BBB to SDK table is data, generated from the BigBlueButton tags.** For
each release tag from 3.0 on it reads `html5PluginSdkVersion` from
`bigbluebutton.properties` (the value the server checks plugins against),
falling back to the SDK dependency of `bigbluebutton-html5` for older tags. A
weekly workflow proposes updates as a PR; `supported` and `minSupported` are
human decisions kept across regenerations.

**Compatibility is decided exactly as the server decides it.**
[`src/lib/semver.mjs`](../src/lib/semver.mjs) is a port of the server's range
evaluator (`SemverRange.scala` in akka-bbb-apps). Its test runs a table of 392
cases whose expected answers were produced by running the server's compiled
class, and the line names follow `PluginUtils`
(`%%HTML5_PLUGIN_SDK_MAIN_VERSION%%` is `0.<minor>` below 1.0 and the major
from 1.0 on).

**No `latest` route in this version.** A `latest` without a line would serve
versions that may not load on a given server. Adding it later breaks nobody;
removing it after people use it would.

**Published files and formats.** Each version folder holds the build output,
the completed manifest (relative paths, `version` set), `contract.json`
(provenance: repository, commit, tag, sha256 of every file, build settings and
run) and `SHA256SUMS`. Formats of every input and output file are JSON Schemas
in [`schemas/`](../schemas/); `catalog.json` is described by
`catalog.schema.json` for integrations.

**The catalog is generated from the storage.** Versions and stable routes come
from the `contract.json` files actually published, so the catalog describes
what servers download; descriptive data and security marks come from this
repository. A folder without a contract (an interrupted upload) is not listed.

**Immutability is enforced by the CI.** A version folder that holds any file is
never written again, whatever the storage key allows. The only exception is a
re-run of the same deploy (same `contract.json`), so a failed post-deploy step
can be retried without a rebuild.

**Upload order.** Assets first, then the manifest, then `SHA256SUMS` and
`contract.json`: a server never reads a manifest whose bundle is not there yet,
and the contract marks the folder as complete. Stable folders are overwritten
in the same order and leftover files of the previous version removed last.

**Showcase generated at build time**, in the same workflow that publishes the
catalog: no CORS, it stays up during a storage outage, and every plugin has its
own page. Search runs in the page over its own content.

**Code owners.** Everything is owned by the directory maintainers except
`plugins/*/release.json`; with zero required approvals plus "Require review
from Code Owners", deploy PRs need no approval and every other change does. The
merge decision of a deploy PR stays with bot 2.

**Destination fully configurable.** Endpoint, bucket, prefix, public address and
ACL are variables, so reusing the current `bigbluebutton.nyc3` bucket or
creating a new one, and a custom domain, need no code change.

**Bundle integrity in the browser stays off** (`javascriptEntrypointIntegrity`
is removed from published manifests) until the client loader sets
`crossorigin`, as the specification plans.

## Still open (not needed for the infrastructure)

- Mirror with `bbb-plugin-cli` (subset, synchronization, targets).
- Moderator warning for vulnerable versions (who reads the catalog, automatic or
  not, silencing, translation). The catalog already carries the `security`
  status it needs.
- `crossorigin` in the client loader and integrity from the storage; build
  attestation (`gh attestation`).
- Committee composition, quorum and response time; formal security checklist,
  telemetry, partial overlap, loss of status.
- Removing the entry of a deleted plugin repository.
- Reuse of the current bucket and migration of the `bbb30/latest` URLs; own
  domain.
