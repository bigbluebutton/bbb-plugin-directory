# Plugins

One folder per official plugin, named after its repository without `bbb-plugin-`:

```
plugins/<id>/plugin.json        catalog data (reviewed by the directory maintainers)
plugins/<id>/maintainers.json   GitHub logins allowed to publish versions (code owners only)
plugins/<id>/release.json       the version to publish (the only file a deploy PR changes)
```

See [docs/admission.md](../docs/admission.md) and [docs/publishing.md](../docs/publishing.md).
