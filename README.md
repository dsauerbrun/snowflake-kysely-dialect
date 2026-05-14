# snowflake-kysely-dialect

A [Kysely](https://kysely.dev) dialect for [Snowflake](https://www.snowflake.com).

## Installation

```bash
npm install snowflake-kysely-dialect kysely snowflake-sdk
# or
yarn add snowflake-kysely-dialect kysely snowflake-sdk
```

## Usage

```ts
import { Kysely } from 'kysely'
import { SnowflakeDialect } from 'snowflake-kysely-dialect'

interface Database {
  users: {
    id: number
    name: string
    email: string
  }
}

const db = new Kysely<Database>({
  dialect: new SnowflakeDialect({
    connection: {
      account: 'your-account',
      username: 'your-username',
      password: 'your-password',
      database: 'your-database',
      schema: 'your-schema',
      warehouse: 'your-warehouse',
    },
  }),
})

// Select
const users = await db.selectFrom('users').selectAll().execute()

// Insert
await db.insertInto('users').values({ id: 1, name: 'Alice', email: 'alice@example.com' }).execute()

// Update
await db.updateTable('users').set({ name: 'Bob' }).where('id', '=', 1).execute()

// Delete
await db.deleteFrom('users').where('id', '=', 1).execute()
```

## Transactions

Transactions are fully supported:

```ts
await db.transaction().execute(async (trx) => {
  await trx.insertInto('users').values({ id: 2, name: 'Carol', email: 'carol@example.com' }).execute()
  await trx.updateTable('users').set({ name: 'Dave' }).where('id', '=', 1).execute()
})
```

## Streaming

```ts
const stream = await db.selectFrom('users').selectAll().stream()

for await (const row of stream) {
  console.log(row)
}
```

## Introspection

```ts
const tables = await db.introspection.getTables()
```

## Notes

- Uses `PostgresQueryCompiler` under the hood — Snowflake's SQL dialect (double-quoted identifiers, window functions, standard string functions) is closer to Postgres than MySQL.
- Uses a connection pool backed by `snowflake-sdk`'s built-in pool. Pool size and timeouts are configurable via the `poolOptions` config key.
- `RETURNING` is not supported by Snowflake and is disabled in the adapter.
- Snowflake folds unquoted identifiers to uppercase. Use quoted identifiers (via `sql.id(...)`) when you need case-sensitive names.
- `VARIANT` / `OBJECT` columns (JSON), `TIMESTAMP_NTZ` / `TIMESTAMP_LTZ` / `TIMESTAMP_TZ`, and `NUMBER` precision are the most common sources of type round-tripping surprises — test these explicitly in your application.

## License

MIT
