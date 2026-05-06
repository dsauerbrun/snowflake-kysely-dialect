# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Kysely dialect for Snowflake, published as an npm package. There is no official dialect and no well-maintained community one (see kysely-org/kysely#1687). The package wraps `snowflake-sdk` and exposes a standard Kysely `Dialect` interface.

## Commands

```bash
npm run build      # tsc — compiles src/ → dist/
npm test           # vitest — requires a live Snowflake instance
npm run test -- --reporter=verbose   # single run with full output
npx vitest run tests/snowflake.spec.ts   # run one test file
```

Build publishes `dist/` (set in `package.json` `files`). The `prepare` script runs `tsc` on `npm publish`.

## File layout

Six files in `src/`, mirroring kysely-clickhouse:

| File | Role |
|---|---|
| `SnowflakeAdapter.ts` | Capability flags, no-op migration locks |
| `SnowflakeDriver.ts` | Lifecycle (init/destroy no-ops), connection factory |
| `SnowflakeConnection.ts` | Wraps snowflake-sdk; executeQuery, streamQuery, transactions |
| `SnowflakeDialect.ts` | Wires the four pieces together; exports config interface |
| `SnowflakeIntrospector.ts` | Queries `information_schema` for schema/table/column metadata |
| `index.ts` | Re-exports all five |

Reference repos cloned at `/tmp/kysely-refs/` (kysely-clickhouse, kysely-bigquery). ClickHouse is the primary template.

## Key architecture decisions

**PostgresQueryCompiler, not MysqlQueryCompiler.** This is the one place we diverge from both reference dialects. Snowflake uses double-quoted identifiers, standard string functions, and window functions — all matching Postgres. Import `PostgresQueryCompiler` from `kysely` in `SnowflakeDialect.ts`.

**No connection pooling.** `acquireConnection()` returns `new SnowflakeConnection(config)` every time. `releaseConnection()` is a no-op. `init()` and `destroy()` are empty. This matches both reference dialects exactly.

**Real transactions.** Unlike ClickHouse and BigQuery which throw, implement `beginTransaction`/`commitTransaction`/`rollbackTransaction` by issuing `BEGIN`/`COMMIT`/`ROLLBACK` SQL on the connection. Snowflake supports them properly.

**Adapter flags:**
```ts
supportsTransactionalDdl = true
supportsReturning = false       // no RETURNING clause in Snowflake
supportsCreateIfNotExists = true
supportsOutput = false
```
`acquireMigrationLock` and `releaseMigrationLock` are no-ops (v1).

**Placeholder translation.** `PostgresQueryCompiler` emits `$1, $2, …` parameters. Snowflake's SDK accepts `?` positional binds or `:1, :2` numbered binds. In `prepareQuery`, replace `$N` → either `?` or `:N` — test which works first. The digit positions match so `:N` may work without reindexing.

**Streaming.** Use `statement.streamRows({ start, end })` from snowflake-sdk. Yield `{ rows: [row] }` one at a time.

**Result mapping.** Return `{ rows, numAffectedRows: BigInt(statement.getNumUpdatedRows()), numChangedRows }`. No `insertId` — Snowflake has no auto-increment row ID equivalent.

## Snowflake-specific gotchas

- **Uppercase identifiers.** Snowflake folds unquoted identifiers to UPPERCASE. This affects introspector filtering (compare column/table names case-insensitively or use `current_database()` with matching case).
- **`current_database()` not `database()`.** The ClickHouse introspector uses `sql\`database()\`` — change this to `sql\`current_database()\`` for Snowflake.
- **IDENTITY columns, not `auto_increment`.** In `parseTableMetadata`, detect `isAutoIncrementing` by checking for `IDENTITY` in the column's `EXTRA`/generation expression, not `auto_increment`.
- **No RETURNING.** The adapter flag handles this. If any compiled SQL still contains `RETURNING`, throw at runtime with a clear message.
- **Type round-tripping risks.** The most likely source of bugs: `VARIANT`/`OBJECT` (JSON), `TIMESTAMP_NTZ` vs `TIMESTAMP_LTZ` vs `TIMESTAMP_TZ`, and `NUMBER` precision. Test these types explicitly.
- **No CREATE INDEX / DROP INDEX.** Snowflake uses micro-partitioning. Don't add compiler-level throwing — let Snowflake reject at the server.
- **Array binding for bulk inserts** (`binds: [[1,'a'],[2,'b']]`) is much faster than multi-row VALUES but is a v2 concern. Note as a future optimization, skip in v1.

## package.json shape

```json
{
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "peerDependencies": {
    "kysely": "*",
    "snowflake-sdk": "*"
  },
  "devDependencies": {
    "kysely": "^0.27.x",
    "snowflake-sdk": "...",
    "typescript": "^5.x",
    "vitest": "^1.x"
  }
}
```

## Build order

1. Scaffold all five files from the ClickHouse template (swap `MysqlQueryCompiler` → `PostgresQueryCompiler`).
2. Get `executeQuery` working for `SELECT` against a real Snowflake instance. Verify placeholder behavior first — this is the highest-risk unknown.
3. Add `INSERT`, `UPDATE`, `DELETE`.
4. Add transaction support (`BEGIN`/`COMMIT`/`ROLLBACK`).
5. Add the introspector.
6. Add streaming.
7. Write tests against a live warehouse.

## Tests

Tests use vitest and require a live Snowflake instance. Connection credentials should come from environment variables (never hardcoded). Test explicitly: SELECT, INSERT, UPDATE, DELETE, transactions, introspection, streaming, and type round-tripping for VARIANT/OBJECT, all three TIMESTAMP variants, and NUMBER precision.
