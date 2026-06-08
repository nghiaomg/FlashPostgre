import type { IpcMain } from 'electron';
import { connectionManager } from '../db/pool';

export function registerSchemaHandlers(ipc: IpcMain) {
  ipc.handle('schema:databases', async (_e, connectionId: string) => {
    if (!connectionManager.has(connectionId)) {
      return { ok: false, error: 'No active connection' };
    }
    try {
      const result = await connectionManager.query(
        connectionId,
        `SELECT datname FROM pg_database
         WHERE datistemplate = false
         ORDER BY datname`
      );
      return { ok: true, rows: result.rows.map((r) => r.datname) };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  });

  ipc.handle('schema:schemas', async (_e, connectionId: string) => {
    if (!connectionManager.has(connectionId)) {
      return { ok: false, error: 'No active connection' };
    }
    try {
      const result = await connectionManager.query(
        connectionId,
        `SELECT schema_name
         FROM information_schema.schemata
         WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
            AND schema_name NOT LIKE 'pg_toast%'
         ORDER BY schema_name`
      );
      return { ok: true, rows: result.rows.map((r) => r.schema_name) };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  });

  ipc.handle('schema:tables', async (_e, connectionId: string, schema: string) => {
    if (!connectionManager.has(connectionId)) {
      return { ok: false, error: 'No active connection' };
    }
    try {
      const result = await connectionManager.query(
        connectionId,
        `SELECT table_schema, table_name, table_type
         FROM information_schema.tables
         WHERE table_schema = $1
         ORDER BY table_type, table_name`,
        [schema]
      );
      return { ok: true, rows: result.rows };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  });

  ipc.handle('schema:columns', async (_e, connectionId: string, schema: string, table: string) => {
    if (!connectionManager.has(connectionId)) {
      return { ok: false, error: 'No active connection' };
    }
    try {
      const result = await connectionManager.query(
        connectionId,
        `SELECT
           column_name,
           data_type,
           is_nullable,
           column_default,
           character_maximum_length,
           ordinal_position
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2
         ORDER BY ordinal_position`,
        [schema, table]
      );
      return { ok: true, rows: result.rows };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  });

  ipc.handle('schema:indexes', async (_e, connectionId: string, schema: string, table: string) => {
    if (!connectionManager.has(connectionId)) {
      return { ok: false, error: 'No active connection' };
    }
    try {
      const result = await connectionManager.query(
        connectionId,
        `SELECT indexname, indexdef
         FROM pg_indexes
         WHERE schemaname = $1 AND tablename = $2
         ORDER BY indexname`,
        [schema, table]
      );
      return { ok: true, rows: result.rows };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  });

  // Returns primary key columns in order. Used to identify rows for inline edits.
  ipc.handle('schema:primaryKeys', async (_e, connectionId: string, schema: string, table: string) => {
    if (!connectionManager.has(connectionId)) {
      return { ok: false, error: 'No active connection' };
    }
    try {
      const result = await connectionManager.query(
        connectionId,
        `SELECT a.attname AS column_name
         FROM pg_index i
         JOIN pg_attribute a
           ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
         JOIN pg_class c ON c.oid = i.indrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE i.indisprimary
           AND n.nspname = $1
           AND c.relname = $2
         ORDER BY array_position(i.indkey, a.attnum)`,
        [schema, table]
      );
      return { ok: true, rows: result.rows };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  });

  // Total row count, optionally with a WHERE clause. The WHERE clause is appended verbatim,
  // so callers MUST validate or whitelist input.
  ipc.handle('schema:count', async (_e, connectionId: string, schema: string, table: string, where?: string) => {
    if (!connectionManager.has(connectionId)) {
      return { ok: false, error: 'No active connection' };
    }
    const whereClause = where && where.trim() ? ` WHERE ${where}` : '';
    const sql = `SELECT COUNT(*)::bigint AS total FROM "${schema}"."${table}"${whereClause}`;
    try {
      const result = await connectionManager.query(connectionId, sql);
      const total = Number(result.rows[0]?.total ?? 0);
      return { ok: true, total };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  });

  ipc.handle(
    'schema:preview',
    async (
      _e,
      connectionId: string,
      schema: string,
      table: string,
      limit: number = 50,
      offset: number = 0,
      orderBy?: string,
      orderDir: 'ASC' | 'DESC' = 'ASC',
      where?: string,
      selectFields?: string[]
    ) => {
      if (!connectionManager.has(connectionId)) {
        return { ok: false, error: 'No active connection' };
      }
      const safeLimit = Math.min(Math.max(parseInt(String(limit), 10) || 50, 1), 1000);
      const safeOffset = Math.max(parseInt(String(offset), 10) || 0, 0);
      // Validate orderBy as a simple identifier to avoid SQL injection through ORDER BY
      const orderByClause =
        orderBy && /^[A-Za-z_][A-Za-z0-9_]*$/.test(orderBy)
          ? ` ORDER BY "${orderBy}" ${orderDir === 'DESC' ? 'DESC' : 'ASC'}`
          : '';
      const whereClause = where && where.trim() ? ` WHERE ${where}` : '';
      const selectClause =
        selectFields && selectFields.length > 0
          ? selectFields.map((f) => `"${f}"`).join(', ')
          : '*';
      const sql = `SELECT ${selectClause} FROM "${schema}"."${table}"${whereClause}${orderByClause} LIMIT ${safeLimit} OFFSET ${safeOffset}`;
      try {
        const result = await connectionManager.query(connectionId, sql);
        return {
          ok: true,
          rows: result.rows,
          fields: result.fields?.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })) ?? [],
          rowCount: result.rowCount,
        };
      } catch (err: any) {
        return { ok: false, error: err?.message ?? String(err) };
      }
    }
  );
}
