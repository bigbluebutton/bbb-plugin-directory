# Publishing a version

For maintainers of a plugin that is already in the directory (see
[admission.md](admission.md) for the first step). Later versions do not go
through the committee and need no human review: two bots check the request and
merge it.

1. Create the tag in the plugin repository (`v1.2.3` or `1.2.3`).
2. Open a pull request in this repository:
   - title starting with `deploy:` (for example `deploy: pick-random-user 1.2.3`);
   - changing **only** `plugins/<id>/release.json`:

   ```json
   { "version": "1.2.3", "commit": "<full commit hash the tag points to>" }
   ```

3. **Bot 1** checks the title and the changed file and applies the `deploy`
   label. A new commit on the PR removes the label and checks again.
4. **Verification build** (`verify-build` check): the version is built at that
   commit, without credentials, exactly as it will be published.
5. **Bot 2** checks everything again, then that you are listed in the plugin's
   `maintainers.json` on the main branch, that the tag points to the commit and
   that the verification build passed. If so, it merges the PR.
6. **Publication** on merge: the version is built again at the commit, published
   to `<id>/<version>/`, copied to every stable URL it is compatible with, and
   checked over HTTPS (files present, sha256 and version as expected). The
   catalog and the showcase are regenerated.

If a check fails, the bot explains why in a comment on the PR, and a directory
maintainer reviews it like any other PR.

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
