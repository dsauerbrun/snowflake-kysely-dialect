import { type CompiledQuery, type DatabaseConnection, type QueryResult } from 'kysely'
import snowflake, { type Connection, type RowStatement } from 'snowflake-sdk'
import { type SnowflakeDialectConfig } from './SnowflakeDialect.js'

export class SnowflakeConnection implements DatabaseConnection {
  readonly #conn: Connection

  constructor(config: SnowflakeDialectConfig) {
    this.#conn = snowflake.createConnection(config.connection)
  }

  async connect(): Promise<void> {
    await this.#conn.connectAsync()
  }

  async disconnect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.#conn.destroy((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async #executeRaw(sqlText: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.#conn.execute({
        sqlText,
        complete: (err) => {
          if (err) reject(err)
          else resolve()
        },
      })
    })
  }

  async beginTransaction(): Promise<void> {
    await this.#executeRaw('BEGIN')
  }

  async commitTransaction(): Promise<void> {
    await this.#executeRaw('COMMIT')
  }

  async rollbackTransaction(): Promise<void> {
    await this.#executeRaw('ROLLBACK')
  }

  // PostgresQueryCompiler emits $1, $2, ... — translate to ? for snowflake-sdk positional binds.
  #translatePlaceholders(sql: string): string {
    return sql.replace(/\$\d+/g, '?')
  }

  async executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
    const sqlText = this.#translatePlaceholders(compiledQuery.sql)
    const binds = compiledQuery.parameters as snowflake.Binds

    return new Promise((resolve, reject) => {
      this.#conn.execute({
        sqlText,
        binds,
        complete(err, stmt, rows) {
          if (err) return reject(err)

          if (compiledQuery.query.kind === 'SelectQueryNode') {
            resolve({ rows: (rows ?? []) as O[] })
          } else {
            const n = BigInt((stmt as RowStatement).getNumUpdatedRows() ?? 0)
            resolve({ rows: [], numAffectedRows: n, numChangedRows: n })
          }
        },
      })
    })
  }

  async *streamQuery<O>(
    compiledQuery: CompiledQuery,
    _chunkSize: number,
  ): AsyncIterableIterator<QueryResult<O>> {
    const sqlText = this.#translatePlaceholders(compiledQuery.sql)
    const binds = compiledQuery.parameters as snowflake.Binds

    const readable = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
      this.#conn.execute({
        sqlText,
        binds,
        streamResult: true,
        complete: (err, stmt) => {
          if (err) return reject(err)
          resolve((stmt as RowStatement).streamRows())
        },
      })
    })

    for await (const row of readable) {
      yield { rows: [row as O] }
    }
  }
}
