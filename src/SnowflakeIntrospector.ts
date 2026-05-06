import {
  type DatabaseIntrospector,
  type DatabaseMetadata,
  type DatabaseMetadataOptions,
  DEFAULT_MIGRATION_LOCK_TABLE,
  DEFAULT_MIGRATION_TABLE,
  type Kysely,
  type SchemaMetadata,
  type TableMetadata,
} from 'kysely'

interface RawSchemaMetadata {
  SCHEMA_NAME: string
}

// Column names are uppercase because Snowflake folds unquoted identifiers to uppercase
// and INFORMATION_SCHEMA column names are all uppercase.
interface RawColumnMetadata {
  COLUMN_NAME: string
  COLUMN_DEFAULT: string | null
  TABLE_NAME: string
  TABLE_SCHEMA: string
  TABLE_TYPE: string
  IS_NULLABLE: 'YES' | 'NO'
  DATA_TYPE: string
  IS_IDENTITY: 'YES' | 'NO'
}

export class SnowflakeIntrospector implements DatabaseIntrospector {
  readonly #db: Kysely<any>

  constructor(db: Kysely<any>) {
    this.#db = db
  }

  async getSchemas(): Promise<SchemaMetadata[]> {
    // Use uppercase table reference — PostgresQueryCompiler double-quotes identifiers,
    // so lowercase "information_schema" would miss Snowflake's INFORMATION_SCHEMA.
    const rows = await this.#db
      .selectFrom('INFORMATION_SCHEMA.SCHEMATA')
      .select('SCHEMA_NAME')
      .$castTo<RawSchemaMetadata>()
      .execute()

    return rows.map((it) => ({ name: it.SCHEMA_NAME }))
  }

  async getTables(
    options: DatabaseMetadataOptions = { withInternalKyselyTables: false },
  ): Promise<TableMetadata[]> {
    let query = this.#db
      .selectFrom('INFORMATION_SCHEMA.COLUMNS as columns')
      .innerJoin('INFORMATION_SCHEMA.TABLES as tables', (b) =>
        b
          .onRef('columns.TABLE_CATALOG', '=', 'tables.TABLE_CATALOG')
          .onRef('columns.TABLE_SCHEMA', '=', 'tables.TABLE_SCHEMA')
          .onRef('columns.TABLE_NAME', '=', 'tables.TABLE_NAME'),
      )
      .select([
        'columns.COLUMN_NAME',
        'columns.COLUMN_DEFAULT',
        'columns.TABLE_NAME',
        'columns.TABLE_SCHEMA',
        'tables.TABLE_TYPE',
        'columns.IS_NULLABLE',
        'columns.DATA_TYPE',
        'columns.IS_IDENTITY',
      ])
      // Exclude the virtual INFORMATION_SCHEMA schema from results
      .where('columns.TABLE_SCHEMA', '!=', 'INFORMATION_SCHEMA')
      .orderBy('columns.TABLE_NAME')
      .orderBy('columns.ORDINAL_POSITION')
      .$castTo<RawColumnMetadata>()

    if (!options.withInternalKyselyTables) {
      query = query
        .where('columns.TABLE_NAME', '!=', DEFAULT_MIGRATION_TABLE)
        .where('columns.TABLE_NAME', '!=', DEFAULT_MIGRATION_LOCK_TABLE)
    }

    const rawColumns = await query.execute()
    return this.#parseTableMetadata(rawColumns)
  }

  async getMetadata(options?: DatabaseMetadataOptions): Promise<DatabaseMetadata> {
    return {
      tables: await this.getTables(options),
    }
  }

  #parseTableMetadata(columns: RawColumnMetadata[]): TableMetadata[] {
    return columns.reduce<TableMetadata[]>((tables, it) => {
      let table = tables.find((tbl) => tbl.name === it.TABLE_NAME && tbl.schema === it.TABLE_SCHEMA)

      if (!table) {
        table = Object.freeze({
          name: it.TABLE_NAME,
          isView: it.TABLE_TYPE === 'VIEW',
          schema: it.TABLE_SCHEMA,
          columns: [],
        })

        tables.push(table)
      }

      table.columns.push(
        Object.freeze({
          name: it.COLUMN_NAME,
          dataType: it.DATA_TYPE,
          isNullable: it.IS_NULLABLE === 'YES',
          // Snowflake uses IDENTITY columns (sequences), not auto_increment
          isAutoIncrementing: it.IS_IDENTITY === 'YES',
          hasDefaultValue: it.COLUMN_DEFAULT !== null,
        }),
      )

      return tables
    }, [])
  }
}
