# Minimum plugin contract

What a plugin repository must provide for the directory to build and publish
it. The verification build of every deploy request checks all of it.

| Requirement | Why |
|---|---|
| A public GitHub repository named `bbb-plugin-<id>` | The directory keeps no copy of the source; the name names the folders on the storage and never changes after the first publication. |
| `package-lock.json` | The build runs `npm ci`: reproducible. |
| An `npm run build-bundle` script | What the build runs. |
| The build output folder (`dist` unless declared otherwise) holds `manifest.json` | The directory publishes that folder. |
| `manifest.json` with `name` (equal to the catalog's `name`), `requiredSdkVersion` (a valid range) and `javascriptEntrypointUrl` | What BigBlueButton reads. |
| `javascriptEntrypointUrl` and `localesBaseUrl` as paths relative to the manifest, without a leading `/` | The same files are copied byte for byte to several addresses (the version folder and the stable folders), so they must not name an address. |
| `version` in `manifest.json` equal to the version requested (or absent: the directory fills it in) | The client appends it to the bundle URL, so browsers do not reuse a cached bundle when a stable URL moves. |
| A semver tag (`v1.2.3` or `1.2.3`) pointing to the commit requested | Ties the version to the commit. The build uses the commit, never the tag, since a tag can be moved. |
| The build works without network access and without npm install scripts | Security of the central build. |

## How the directory builds

1. Fetches exactly the requested commit.
2. In a throwaway `node:24` container with no capabilities and no credentials:
   `npm ci --ignore-scripts` (the only step with network access), then
   `npm run build-bundle` with **no network**.
3. Completes the manifest: sets `version` if missing and removes
   `javascriptEntrypointIntegrity` (the browser cannot verify a bundle from
   another origin yet, see [using-plugins.md](using-plugins.md)).
4. Computes the sha256 of every file and writes `contract.json` and `SHA256SUMS`.

Exceptions (network during the build, install scripts, another Node.js major,
another output folder) are declared in the plugin's `plugin.json` under
`build`, and every exception is reviewed by the committee:

```json
"build": { "allowNetwork": false, "allowInstallScripts": false, "nodeVersion": "24", "outputDir": "dist" }
```

You can reproduce the build of a version locally with the same script the CI
runs (Docker and git required):

```bash
node src/cli/build-plugin.js --plugin <id> --out out/publication
```
