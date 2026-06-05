import type { IpcMain } from 'electron';
import Store from 'electron-store';
import { connectionManager, ConnectionConfig } from '../db/pool';

interface Snippet {
  id: string;
  name: string;
  folder: string;
  sql: string;
  description?: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

interface StoreSchema {
  connections: ConnectionConfig[];
  activeConnectionId: string | null;
  snippets: Snippet[];
  preferences: {
    theme: 'light' | 'dark';
    queryHistory: Array<{ id: string; sql: string; ts: number; connectionId: string }>;
  };
}

export const store = new Store<StoreSchema>({
  name: 'flashpostgre',
  defaults: {
    connections: [],
    activeConnectionId: null,
    snippets: defaultSnippets(),
    preferences: {
      theme: 'light',
      queryHistory: [],
    },
  },
});

function defaultSnippets(): Snippet[] {
  const now = Date.now();
  return [
    {
      id: 'snip-default-tables-size',
      name: 'Top 20 largest tables',
      folder: 'schema',
      sql: `-- Top 20 largest tables by total size
SELECT
  schemaname AS schema,
  relname AS table_name,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  pg_size_pretty(pg_relation_size(relid)) AS table_size,
  pg_size_pretty(pg_indexes_size(relid)) AS index_size,
  n_live_tup AS row_estimate
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;`,
      description: 'Quickly find heavy tables in a database.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'snip-default-active-queries',
      name: 'Currently running queries',
      folder: 'monitor',
      sql: `-- Currently running queries (with duration in seconds)
SELECT
  pid,
  now() - pg_stat_activity.query_start AS duration,
  state,
  wait_event_type,
  wait_event,
  query
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '1 second'
  AND state IS NOT NULL
  AND datname = current_database()
ORDER BY duration DESC;`,
      description: 'Inspect long-running queries blocking your app.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'snip-default-kill',
      name: 'Kill query by pid',
      folder: 'monitor',
      sql: `-- Replace <pid> with the target process id
SELECT pg_cancel_backend(<pid>);
-- Forceful termination if cancel does not work:
-- SELECT pg_terminate_backend(<pid>);`,
      description: 'Cancel a running query without restarting the server.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'snip-default-explain',
      name: 'EXPLAIN ANALYZE wrapper',
      folder: 'debug',
      sql: `-- Paste your query below
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT)
SELECT 1;`,
      description: 'Standard EXPLAIN ANALYZE for performance debugging.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'snip-default-locks',
      name: 'Active locks',
      folder: 'monitor',
      sql: `-- Lock contention
SELECT
  blocked_locks.pid AS blocked_pid,
  blocked_activity.usename AS blocked_user,
  blocking_locks.pid AS blocking_pid,
  blocking_activity.usename AS blocking_user,
  blocked_activity.query AS blocked_statement,
  blocking_activity.query AS blocking_statement,
  blocked_activity.application_name AS blocked_application
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity
  ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks
  ON blocking_locks.locktype = blocked_locks.locktype
 AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
 AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
 AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
 AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
 AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
 AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
 AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
 AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
 AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
 AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity
  ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;`,
      description: 'Find which query is blocking another.',
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function registerStoreHandlers(ipc: IpcMain) {
  ipc.handle('store:get', (_e, key: string) => {
    return (store as any).get(key);
  });
  ipc.handle('store:set', (_e, key: string, value: any) => {
    (store as any).set(key, value);
    return true;
  });
  ipc.handle('store:delete', (_e, key: string) => {
    (store as any).delete(key);
    return true;
  });
}
