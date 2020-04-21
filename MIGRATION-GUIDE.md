# This is the migration guide from 1.x.x => 2.x.x

## Backup
`sb-mig --all-components` => `sb-mig backup --all`
`sb-mig --component row` => `sb-mig backup --single row`

## Syncing components
`sb-mig --sync row column` => `sb-mig sync row column`

`sb-mig --sync --ext row column` => `sb-mig sync --ext row column`

`sb-mig --sync-all` => `sb-mig sync --all`

`sb-mig --sync-all --ext` => `sb-mig sync --all --ext`

## Other commands
`sb-mig --debug` => `sb-mig debug`