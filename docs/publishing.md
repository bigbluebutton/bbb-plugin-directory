# Publishing a version

For maintainers of a plugin that is already in the directory (see
[admission.md](admission.md) for the first step). Later versions do not go
through the committee and need no human review: a bot checks the request and
merges it.

1. Create the tag in the plugin repository (`v1.2.3` or `1.2.3`).
2. Open a pull request in this repository:
   - title starting with `deploy:` (for example `deploy: pick-random-user 1.2.3`);
   - changing **only** `plugins/<id>/release.json`:

   ```json
   { "version": "1.2.3", "commit": "<full commit hash the tag points to>" }
   ```

3. **Verification build** (`verify-build` check): the version is built at that
   commit, without credentials, exactly as it will be published.
4. **The bot**, woken when the verification build (or CI) finishes, checks the
   title and the changed file, that you are listed in the plugin's
   `maintainers.json` on the main branch, that the tag points to the commit and
   that the verification build passed. If so, it merges the PR. It runs again on
   every new commit; editing only the title does not wake it, so push again.
5. **Publication** right after the merge: the version is built again at the commit, published
   to `<id>/<version>/`, copied to every stable URL it is compatible with, and
   checked over HTTPS (files present, sha256 and version as expected). The
   catalog and the showcase are regenerated.

If a check fails, the bot explains why in a comment on the PR, and a directory
maintainer reviews it like any other PR.

If the bot merged a deploy PR but its run is red at the dispatch step, nothing
was published; run the Publish workflow by hand with `plugin=<id>`. The daily
run does not publish missed versions, it only regenerates the catalog.

## What a deploy PR may not do

- Change any file other than one plugin's `release.json` (in particular
  `maintainers.json`, which only directory maintainers change).
- Republish a version: a published version folder never changes. Publish a new
  version instead.
- Remove or edit a security mark (below). That needs a reviewed PR.

## Marking a vulnerable version

A fix is published like any version. The same PR can mark the vulnerable
version(s) in `release.json`; marks are only ever added:

```json
{
  "version": "1.2.4",
  "commit": "<hash>",
  "security": [
    { "version": "1.2.3", "fixedIn": "1.2.4", "advisory": "https://github.com/<owner>/<repo>/security/advisories/<id>" }
  ]
}
```

The marked version stays at its address; the catalog and the showcase flag it.
For a severe case, prepare the fix privately (a GitHub security advisory in the
plugin repository) and only create the public tag when it is ready to publish:
with the automatic merge, the version is out minutes later.
