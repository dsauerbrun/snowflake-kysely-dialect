import { type DatabaseConnection, type Driver } from 'kysely'
import snowflake from 'snowflake-sdk'
import { SnowflakeConnection } from './SnowflakeConnection.js'
import { type SnowflakeDialectConfig } from './SnowflakeDialect.js'

const DEFAULT_POOL_OPTIONS: snowflake.PoolOptions = {
  max: 10,
  min: 2,
  acquireTimeoutMillis: 60_000,
  idleTimeoutMillis: 600_000,
  evictionRunIntervalMillis: 300_000,
}

export class SnowflakeDriver implements Driver {
  readonly #config: SnowflakeDialectConfig
  #pool: ReturnType<typeof snowflake.createPool> | null = null
  #pendingReleases = new Map<SnowflakeConnection, () => void>()

  constructor(config: SnowflakeDialectConfig) {
    this.#config = config
  }

  async init(): Promise<void> {
    this.#pool = snowflake.createPool(
      this.#config.connection,
      { ...DEFAULT_POOL_OPTIONS, ...this.#config.poolOptions },
    )
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    return new Promise<DatabaseConnection>((resolveAcquire, rejectAcquire) => {
      this.#pool!.use(async (sdkConn) => {
        const conn = new SnowflakeConnection(sdkConn)
        return new Promise<void>((resolveRelease) => {
          this.#pendingReleases.set(conn, resolveRelease)
          resolveAcquire(conn)
        })
      }).catch(rejectAcquire)
    })
  }

  async beginTransaction(conn: SnowflakeConnection): Promise<void> {
    return conn.beginTransaction()
  }

  async commitTransaction(conn: SnowflakeConnection): Promise<void> {
    return conn.commitTransaction()
  }

  async rollbackTransaction(conn: SnowflakeConnection): Promise<void> {
    return conn.rollbackTransaction()
  }

  async releaseConnection(conn: SnowflakeConnection): Promise<void> {
    const release = this.#pendingReleases.get(conn)
    if (release) {
      this.#pendingReleases.delete(conn)
      release()
    }
  }

  async destroy(): Promise<void> {
    if (this.#pool) {
      await this.#pool.drain()
      this.#pool.clear()
      this.#pool = null
    }
  }
}
