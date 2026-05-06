import { DialectAdapterBase, type Kysely, type MigrationLockOptions } from 'kysely'

export class SnowflakeAdapter extends DialectAdapterBase {
  get supportsTransactionalDdl(): boolean {
    return true
  }

  get supportsReturning(): boolean {
    return false
  }

  get supportsCreateIfNotExists(): boolean {
    return true
  }

  get supportsOutput(): boolean {
    return false
  }

  async acquireMigrationLock(_db: Kysely<any>, _opt: MigrationLockOptions): Promise<void> {}

  async releaseMigrationLock(_db: Kysely<any>, _opt: MigrationLockOptions): Promise<void> {}
}
