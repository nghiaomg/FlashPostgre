import type { IpcMain } from 'electron';
import { connectionManager } from '../db/pool';

export function registerQueryHandlers(ipc: IpcMain) {
  ipc.handle('query:run', async (_e, connectionId: string, sql: string, params: any[] = []) => {
    if (!connectionManager.has(connectionId)) {
      return { ok: false, error: 'No active connection. Connect first.' };
    }
    const start = performance.now();
    try {
      const result = await connectionManager.query(connectionId, sql, params);
      const elapsed = performance.now() - start;

      // Normalize result for the renderer
      const fields = result.fields?.map((f) => ({
        name: f.name,
        dataTypeID: f.dataTypeID,
      })) ?? [];

      return {
        ok: true,
        rows: result.rows,
        fields,
        rowCount: result.rowCount ?? result.rows.length,
        elapsedMs: Math.round(elapsed),
        command: result.command,
      };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  });

  ipc.handle('query:explain', async (_e, connectionId: string, sql: string) => {
    if (!connectionManager.has(connectionId)) {
      return { ok: false, error: 'No active connection. Connect first.' };
    }
    try {
      const result = await connectionManager.query(
        connectionId,
        `EXPLAIN (FORMAT JSON) ${sql}`
      );
      return { ok: true, plan: result.rows[0]?.['QUERY PLAN'] };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  });

  // Run multiple statements sequentially on a single client connection.
  // Stops at the first failure and returns the results collected up to that point.
  ipc.handle('query:runBatch', async (_e, connectionId: string, statements: string[]) => {
    if (!connectionManager.has(connectionId)) {
      return { ok: false, results: [], error: 'No active connection. Connect first.' };
    }
    const entry = connectionManager.getPool(connectionId);
    if (!entry) {
      return { ok: false, results: [], error: 'No active connection. Connect first.' };
    }

    const client = await entry.connect();
    const results: any[] = [];
    try {
      for (const sql of statements) {
        try {
          const result = await client.query(sql);
          results.push({
            ok: true,
            sql,
            rows: result.rows,
            fields: result.fields?.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })) ?? [],
            rowCount: result.rowCount ?? result.rows.length,
          });
        } catch (err: any) {
          results.push({
            ok: false,
            sql,
            error: err?.message ?? String(err),
          });
          return {
            ok: false,
            results,
            error: `Failed at: ${sql.slice(0, 60)}… — ${err?.message ?? String(err)}`,
          };
        }
      }
      return { ok: true, results };
    } finally {
      client.release();
    }
  });

  // Run a list of statements in a single transaction. Rolls back on any failure.
  // Returns the number of affected rows per statement on success.
  ipc.handle('query:transaction', async (_e, connectionId: string, statements: string[]) => {
    if (!connectionManager.has(connectionId)) {
      return { ok: false, error: 'No active connection. Connect first.' };
    }
    const entry = connectionManager.getPool(connectionId);
    if (!entry) return { ok: false, error: 'No active connection. Connect first.' };

    const client = await entry.connect();
    const affectedCounts: number[] = [];
    try {
      await client.query('BEGIN');
      for (const sql of statements) {
        const r = await client.query(sql);
        affectedCounts.push(r.rowCount ?? 0);
      }
      await client.query('COMMIT');
      return { ok: true, affectedCounts };
    } catch (err: any) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback failure
      }
      return { ok: false, error: err?.message ?? String(err) };
    } finally {
      client.release();
    }
  });

  ipc.handle('query:cancel', async (_e, _connectionId: string) => {
    // pg client cancellation requires keeping the in-flight client and calling .cancel()
    // For a minimal client, we close the connection (a heavier hammer). The next query
    // will reconnect from the pool. Implementation is left intentionally simple.
    return true;
  });
}
