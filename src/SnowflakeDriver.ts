import { type DatabaseConnection, type Driver } from 'kysely'
import { SnowflakeConnection } from './SnowflakeConnection.js'
import { type SnowflakeDialectConfig } from './SnowflakeDialect.js'

export class SnowflakeDriver implements Driver {
  readonly #config: SnowflakeDialectConfig
  #connection: SnowflakeConnection | null = null

  constructor(config: SnowflakeDialectConfig) {
    this.#config = config
  }

  async init(): Promise<void> {
    this.#connection = new SnowflakeConnection(this.#config)
    await this.#connection.connect()
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    return this.#connection!
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

  async releaseConnection(_conn: SnowflakeConnection): Promise<void> {}

  async destroy(): Promise<void> {
    await this.#connection?.disconnect()
    this.#connection = null
  }
}
