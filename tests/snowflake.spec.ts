import { expect, test } from 'vitest'
import { Kysely } from 'kysely'
import { SnowflakeDialect } from '../src'

// Requires a live Snowflake instance. Set these env vars before running:
//   SNOWFLAKE_ACCOUNT, SNOWFLAKE_USERNAME, SNOWFLAKE_PASSWORD,
//   SNOWFLAKE_DATABASE, SNOWFLAKE_SCHEMA, SNOWFLAKE_WAREHOUSE
const config = {
  account: process.env.SNOWFLAKE_ACCOUNT!,
  username: process.env.SNOWFLAKE_USERNAME!,
  password: process.env.SNOWFLAKE_PASSWORD!,
  database: process.env.SNOWFLAKE_DATABASE!,
  schema: process.env.SNOWFLAKE_SCHEMA!,
  warehouse: process.env.SNOWFLAKE_WAREHOUSE!,
}

const db = new Kysely<any>({
  dialect: new SnowflakeDialect({ connection: config }),
})

test('select 1', async () => {
  const result = await db.selectFrom(db.fn.val(1).as('n')).selectAll().execute()
  expect(result).toHaveLength(1)
})

test('placeholder translation', async () => {
  const compiled = db
    .selectFrom(db.fn.val(1).as('n'))
    .where(db.fn.val(1), '=', 1)
    .selectAll()
    .compile()
  // PostgresQueryCompiler emits $1; after translation we must send ? to snowflake-sdk
  expect(compiled.sql).toContain('$1')
})

test('introspection', async () => {
  const tables = await db.introspection.getTables()
  expect(Array.isArray(tables)).toBe(true)
})
