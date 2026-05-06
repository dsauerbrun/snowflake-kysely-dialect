import {
  type DatabaseIntrospector,
  type Dialect,
  type Driver,
  type Kysely,
  PostgresQueryCompiler,
  type QueryCompiler,
} from 'kysely'
import type { ConnectionOptions } from 'snowflake-sdk'
import { SnowflakeAdapter } from './SnowflakeAdapter.js'
import { SnowflakeDriver } from './SnowflakeDriver.js'
import { SnowflakeIntrospector } from './SnowflakeIntrospector.js'

export interface SnowflakeDialectConfig {
  connection: ConnectionOptions
}

export class SnowflakeDialect implements Dialect {
  readonly #config: SnowflakeDialectConfig

  constructor(config: SnowflakeDialectConfig) {
    this.#config = config
  }

  createAdapter() {
    return new SnowflakeAdapter()
  }

  createDriver(): Driver {
    return new SnowflakeDriver(this.#config)
  }

  createQueryCompiler(): QueryCompiler {
    return new PostgresQueryCompiler()
  }

  createIntrospector(db: Kysely<any>): DatabaseIntrospector {
    return new SnowflakeIntrospector(db)
  }
}
