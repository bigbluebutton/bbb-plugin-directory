# Admission of a plugin

The BigBlueButton name is attached to every official plugin, so admission is a
reviewed, deliberate step. Once admitted, the plugin's maintainers publish
versions on their own ([publishing.md](publishing.md)).

1. The plugin author opens an issue in this repository using the "Plugin
   request" form, stating the plugin's **main feature in one sentence**.
2. Everyone discusses it.
3. A directory maintainer opens a PR **without a deploy** adding
   `plugins/<id>/plugin.json` and `plugins/<id>/maintainers.json` (no
   `release.json`).
4. The committee approves on that PR; a directory maintainer merges it.
5. From then on the plugin maintainer publishes through deploy PRs; the first
   one adds `release.json`.

```json
// plugins/pick-random-user/plugin.json
{
  "name": "BbbPluginPickRandomUser",
  "repository": "https://github.com/bigbluebutton/bbb-plugin-pick-random-user",
  "description": "Picks a random user from the meeting.",
  "status": "production"
}
// plugins/pick-random-user/maintainers.json
{ "maintainers": ["<github-login>"] }
```

The `<id>` is the repository name without `bbb-plugin-`; it names the plugin's
folders on the storage and cannot change after the first publication.

## Criteria

1. **Security:** network calls outside the server, npm dependencies, use of
   meeting data, dynamic code.
2. **Duplication:** if a plugin already does this, or part of it, the way
   forward is to contribute to it.
3. **Narrow scope:** one main feature. Variations of it are fine; a clear line
   between two or more main features means two plugins.

The repository must be public and meet the [plugin contract](plugin-contract.md).
Private plugins can never be official.

## Status

`status` in `plugin.json`: `production` (official, publishes versions),
`discontinued` (kept for existing users, receives no security fixes, publishes
no new versions) or `archived` (no longer listed on the showcase; its published
versions stay at their addresses). Changing it is a reviewed PR.
