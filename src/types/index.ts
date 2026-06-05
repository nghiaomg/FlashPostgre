// Shared types between main and renderer

export type Environment = 'dev' | 'staging' | 'prod' | 'local' | 'custom';

export interface ConnectionConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean | 'require' | 'prefer';
  env: Environment;
  envLabel?: string; // for 'custom' env, free text
  color?: string; // for 'custom' env, hex
  connectionTimeoutMillis?: number;
  statementTimeout?: number;
}

export interface QueryField {
  name: string;
  dataTypeID: number;
}

export interface QueryResultOk {
  ok: true;
  rows: any[];
  fields: QueryField[];
  rowCount: number;
  elapsedMs: number;
  command?: string;
}

export interface QueryResultErr {
  ok: false;
  error: string;
}

export type QueryResult = QueryResultOk | QueryResultErr;

export interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  character_maximum_length: number | null;
  ordinal_position: number;
}

export interface TableInfo {
  table_schema: string;
  table_name: string;
  table_type: 'BASE TABLE' | 'VIEW';
}

export interface IndexInfo {
  indexname: string;
  indexdef: string;
}

export interface Snippet {
  id: string;
  name: string;
  folder: string; // top-level category like 'select', 'migration', 'debug', custom
  sql: string;
  description?: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface PrimaryKeyInfo {
  column_name: string;
}

export interface PendingEdit {
  rowIndex: number;        // index into the displayed result rows
  pkValue: unknown;        // primary key value(s) as object
  column: string;
  oldValue: unknown;
  newValue: unknown;
}

declare global {
  interface Window {
    flashpostgre: {
      store: {
        get: (key: string) => Promise<any>;
        set: (key: string, value: any) => Promise<boolean>;
        delete: (key: string) => Promise<boolean>;
      };
      window: {
        minimize: () => Promise<boolean>;
        maximize: () => Promise<boolean>;
        close: () => Promise<boolean>;
        isMaximized: () => Promise<boolean>;
        setBackground: (color: string) => Promise<boolean>;
        getInitialTheme: () => Promise<'light' | 'dark'>;
      };
      connection: {
        test: (config: ConnectionConfig) => Promise<{ ok: boolean; serverVersion?: string; error?: string }>;
        connect: (id: string) => Promise<{ ok: boolean; serverVersion?: string; error?: string }>;
        disconnect: (id: string) => Promise<boolean>;
        list: () => Promise<ConnectionConfig[]>;
        active: () => Promise<string | null>;
      };
      query: {
        run: (connectionId: string, sql: string, params?: any[]) => Promise<QueryResult>;
        cancel: (connectionId: string) => Promise<boolean>;
        explain: (connectionId: string, sql: string) => Promise<{ ok: boolean; plan?: any; error?: string }>;
        runBatch: (connectionId: string, statements: string[]) => Promise<{ ok: boolean; results: QueryResult[]; error?: string }>;
        transaction: (connectionId: string, statements: string[]) => Promise<{ ok: boolean; affectedCounts?: number[]; error?: string }>;
      };
      schema: {
        databases: (connectionId: string) => Promise<{ ok: boolean; rows?: string[]; error?: string }>;
        schemas: (connectionId: string) => Promise<{ ok: boolean; rows?: string[]; error?: string }>;
        tables: (connectionId: string, schema: string) => Promise<{ ok: boolean; rows?: TableInfo[]; error?: string }>;
        columns: (connectionId: string, schema: string, table: string) => Promise<{ ok: boolean; rows?: ColumnInfo[]; error?: string }>;
        indexes: (connectionId: string, schema: string, table: string) => Promise<{ ok: boolean; rows?: IndexInfo[]; error?: string }>;
        primaryKeys: (connectionId: string, schema: string, table: string) => Promise<{ ok: boolean; rows?: PrimaryKeyInfo[]; error?: string }>;
        preview: (connectionId: string, schema: string, table: string, limit?: number, offset?: number, orderBy?: string, orderDir?: 'ASC' | 'DESC', where?: string) => Promise<QueryResult>;
        count: (connectionId: string, schema: string, table: string, where?: string) => Promise<{ ok: boolean; total?: number; error?: string }>;
      };
    };
  }
}
