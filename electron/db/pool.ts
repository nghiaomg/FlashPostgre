import { Pool, PoolClient, QueryResult } from 'pg';
import { EventEmitter } from 'events';

function resolveSsl(value: ConnectionConfig['ssl']): false | { rejectUnauthorized: boolean } {
  if (value === true || value === 'require' || value === 'prefer') {
    return { rejectUnauthorized: false };
  }
  return false;
}

export interface ConnectionConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean | 'require' | 'prefer';
  connectionTimeoutMillis?: number;
  statementTimeout?: number;
}

interface PoolEntry {
  pool: Pool;
  config: ConnectionConfig;
}

class ConnectionManager extends EventEmitter {
  private pools = new Map<string, PoolEntry>();
  private activeClients = new Map<string, Set<PoolClient>>();

  getOrCreate(config: ConnectionConfig): Pool {
    const existing = this.pools.get(config.id);
    if (existing) return existing.pool;

    const pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: resolveSsl(config.ssl),
      connectionTimeoutMillis: config.connectionTimeoutMillis ?? 5000,
      statement_timeout: config.statementTimeout ?? 30000,
      max: 8,
      idleTimeoutMillis: 30000,
    });

    pool.on('error', (err) => {
      // Surface unexpected idle-client errors; query errors flow through query()
      console.error(`[pg pool ${config.id}] idle error:`, err.message);
    });

    this.pools.set(config.id, { pool, config });
    this.activeClients.set(config.id, new Set());
    return pool;
  }

  has(id: string): boolean {
    return this.pools.has(id);
  }

  getPool(id: string): Pool | null {
    return this.pools.get(id)?.pool ?? null;
  }

  async query(
    id: string,
    sql: string,
    params: any[] = []
  ): Promise<QueryResult> {
    const entry = this.pools.get(id);
    if (!entry) throw new Error(`Connection "${id}" is not active`);

    const client = await entry.pool.connect();
    this.activeClients.get(id)!.add(client);
    try {
      const result = await client.query(sql, params);
      return result;
    } finally {
      this.activeClients.get(id)!.delete(client);
      client.release();
    }
  }

  async testConnection(config: ConnectionConfig): Promise<{
    ok: boolean;
    serverVersion?: string;
    error?: string;
  }> {
    const pool = this.getOrCreate(config);
    try {
      const res = await pool.query<{ version: string }>('SELECT version()');
      return { ok: true, serverVersion: res.rows[0]?.version };
    } catch (err: any) {
      // Tear down the failed pool so we don't keep a broken client around
      await this.disconnect(config.id);
      return { ok: false, error: err?.message ?? String(err) };
    }
  }

  async disconnect(id: string): Promise<void> {
    const entry = this.pools.get(id);
    if (!entry) return;
    // Release any in-flight clients gracefully
    const clients = this.activeClients.get(id);
    if (clients) {
      for (const c of clients) {
        try { c.release(true); } catch { /* ignore */ }
      }
    }
    await entry.pool.end().catch(() => undefined);
    this.pools.delete(id);
    this.activeClients.delete(id);
  }

  async disconnectAll(): Promise<void> {
    const ids = Array.from(this.pools.keys());
    await Promise.allSettled(ids.map((id) => this.disconnect(id)));
  }
}

export const connectionManager = new ConnectionManager();
