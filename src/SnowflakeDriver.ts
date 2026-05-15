import { type DatabaseConnection, type Driver } from 'kysely'
import snowflake, { type Connection } from 'snowflake-sdk'
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
  // Tracks the underlying SDK connection for each wrapper so we can release or destroy it.
  #resources = new Map<SnowflakeConnection, Connection>()

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
    const sdkConn = await this.#pool!.acquire()
    const conn = new SnowflakeConnection(sdkConn)
    this.#resources.set(conn, sdkConn)
    return conn
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
    const sdkConn = this.#resources.get(conn)
    if (sdkConn) {
      this.#resources.delete(conn)
      await this.#pool!.release(sdkConn)
    }
  }

  async destroyConnection(conn: SnowflakeConnection): Promise<void> {
    const sdkConn = this.#resources.get(conn)
    if (sdkConn) {
      this.#resources.delete(conn)
      await this.#pool!.destroy(sdkConn)
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
