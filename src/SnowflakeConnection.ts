import { type CompiledQuery, type DatabaseConnection, type QueryResult } from 'kysely'
import snowflake, { type Connection, type RowStatement } from 'snowflake-sdk'

export class SnowflakeQueryTimeoutError extends Error {
  readonly connectionIsUsable: boolean

  constructor(message: string, connectionIsUsable: boolean) {
    super(message)
    this.name = 'SnowflakeQueryTimeoutError'
    this.connectionIsUsable = connectionIsUsable
  }
}

export class SnowflakeConnection implements DatabaseConnection {
  readonly #conn: Connection
  #queryTimeoutMs: number | undefined

  constructor(conn: Connection) {
    this.#conn = conn
  }

  setQueryTimeout(ms: number | undefined): void {
    this.#queryTimeoutMs = ms
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

  #translatePlaceholders(sql: string): string {
    return sql.replace(/\$\d+/g, '?')
  }

  async executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
    const sqlText = this.#translatePlaceholders(compiledQuery.sql)
    const binds = compiledQuery.parameters as snowflake.Binds
    const timeoutMs = this.#queryTimeoutMs

    return new Promise((resolve, reject) => {
      let settled = false
      let timer: ReturnType<typeof setTimeout> | undefined

      const settle = (fn: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        fn()
      }

      const executeOptions: Parameters<Connection['execute']>[0] = {
        sqlText,
        binds,
        // Pass server-side timeout so Snowflake kills the query at the deadline even
        // if the client-side cancel doesn't reach the server in time.
        ...(timeoutMs != null && {
          parameters: { STATEMENT_TIMEOUT_IN_SECONDS: Math.ceil(timeoutMs / 1000) },
        }),
        complete(err, stmt, rows) {
          if (err) return settle(() => reject(err))

          const numUpdated = (stmt as RowStatement).getNumUpdatedRows()
          if (numUpdated != null && numUpdated >= 0) {
            const n = BigInt(numUpdated)
            settle(() => resolve({ rows: (rows ?? []) as O[], numAffectedRows: n, numChangedRows: n }))
          } else {
            settle(() => resolve({ rows: (rows ?? []) as O[] }))
          }
        },
      }

      const statement = this.#conn.execute(executeOptions) as RowStatement

      if (timeoutMs != null) {
        timer = setTimeout(() => {
          statement.cancel((cancelErr) => {
            // Cancel succeeded → Snowflake aborted cleanly, session is usable.
            // Cancel failed → session state is unknown, caller should destroy the connection.
            settle(() =>
              reject(
                new SnowflakeQueryTimeoutError(
                  `Query timed out after ${timeoutMs}ms`,
                  cancelErr == null,
                ),
              ),
            )
          })
        }, timeoutMs)
      }
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
