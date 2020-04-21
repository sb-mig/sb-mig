# This is the migration guide from 1.x.x => 2.x.x

The main changes that have occurred are changes to command syntax, below is comparison of version `1.3.11` and `2.0.0`:

Worth mentioning: now by default while syncing component we don't sync presets automatically (looking for presets is expensive operation so it is avaialble now as `--presets` option)

## Syncing components

### Sync specified components without presets and without extension

v1.3.11

```
sb-mig --sync --no-presets row column
```

v2.0.0

```
sb-mig sync components row column
```

---

### Sync specified components without presets defined with filename with `.sb.js`(by default) extension

v1.3.11

```
sb-mig --sync --ext --no-presets row column
```

v2.0.0

```
sb-mig sync components --ext row column
```

---

### Sync all components without presets and without extension

v1.3.11

```
sb-mig --sync-all --no-presets
```

v2.0.0

```
sb-mig sync comoponents --all
```

---

### Sync all components with presets and with `.sb.js`(by default) extension

v1.3.11

```
sb-mig --sync-all --ext --no-presets
```

v2.0.0

```
sb-mig sync components --all --ext
```

---

### Sync all components with presets and with `.sb.js`(by default) extension

v1.3.11

```
sb-mig --sync-all --ext
```

v2.0.0

```
sb-mig sync components --all --ext --presets
```

## Other commands

v1.3.11

```
sb-mig --debug
```

v2.0.0

```
sb-mig debug
```
