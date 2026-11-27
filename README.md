# BigBlueButton Plugin Directory

The official list of BigBlueButton plugins endorsed by the project. This
repository keeps the catalog, builds every official plugin centrally, publishes
the files to object storage with the sha256 of each version, and generates a
showcase on GitHub Pages.

A sysadmin installs an official plugin by pointing BigBlueButton to a URL,
without building or hosting anything:

```properties
# /etc/bigbluebutton/bbb-web.properties
pluginManifests=[{"url":"https://<directory>/bbb/%%BBB_MAIN_VERSION%%/pick-random-user/manifest.json"}]
```

The search, the versions, their sha256 and copy-ready configuration of every
plugin are on the showcase. Plugins have no CD and hold no credentials: this
repository's CI holds the only write key to the storage.

## Where to go

| You are | Read |
|---|---|
| A sysadmin installing plugins | [docs/using-plugins.md](docs/using-plugins.md) |
| A plugin author asking for a plugin to become official | [docs/admission.md](docs/admission.md) |
| A plugin maintainer publishing a version | [docs/publishing.md](docs/publishing.md) and [docs/plugin-contract.md](docs/plugin-contract.md) |
| A directory maintainer setting up or operating the repository | [docs/setup.md](docs/setup.md) |
| Anyone wondering why it works this way | [docs/design.md](docs/design.md) |

## Repository layout

```
plugins/<id>/plugin.json        catalog data of the plugin (human review)
plugins/<id>/maintainers.json   who may publish versions (code owners only)
plugins/<id>/release.json       the version to publish (the only file a deploy PR changes)
data/bbb-sdk-versions.json      BigBlueButton release -> plugin SDK table
schemas/                        JSON Schemas of every file above and of what is published
src/                            build, publishing, catalog, showcase and bots (Node.js 24, no framework)
.github/workflows/              CI, verification build, bots, publishing, table update
```

## Development

```bash
npm ci
npm test                              # unit tests
node src/cli/validate-repo.js        # validates the input files
```

`scripts/local/storage-up.sh` starts a throwaway S3-compatible storage to try
the publishing scripts locally (see [docs/setup.md](docs/setup.md#trying-it-locally)).
