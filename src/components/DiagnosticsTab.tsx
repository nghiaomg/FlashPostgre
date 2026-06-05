import { Box, Flex, Heading, Text, Table, Button, Badge, Spinner, Callout, IconButton, Tooltip } from '@radix-ui/themes';
import { ReloadIcon, TrashIcon, ExclamationTriangleIcon } from '@radix-ui/react-icons';
import { useEffect, useState, useCallback } from 'react';

interface Props {
  tab: { id: string; kind: 'diagnostics'; title: string };
  connectionId: string;
}

type DiagnosticsTool = 'active' | 'slow' | 'size' | 'unused' | 'hitrate';

export function DiagnosticsTab({ connectionId }: Props) {
  const [activeTool, setActiveTool] = useState<DiagnosticsTool>('active');
  const [rows, setRows] = useState<any[]>([]);
  const [fields, setFields] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pgStatEnabled, setPgStatEnabled] = useState<boolean | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const checkPgStatStatements = useCallback(async () => {
    try {
      const res = await window.flashpostgre.query.run(
        connectionId,
        "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') AS enabled;"
      );
      if (res.ok && res.rows.length > 0) {
        setPgStatEnabled(res.rows[0].enabled);
        return res.rows[0].enabled;
      }
      setPgStatEnabled(false);
      return false;
    } catch {
      setPgStatEnabled(false);
      return false;
    }
  }, [connectionId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let sql = '';

      if (activeTool === 'active') {
        sql = `
          SELECT
            pid AS "PID",
            usename AS "User",
            client_addr AS "Client IP",
            substring(cast(now() - query_start as text) from 1 for 8) AS "Duration",
            state AS "State",
            query AS "Query"
          FROM pg_stat_activity
          WHERE state != 'idle' AND query NOT LIKE '%pg_stat_activity%' AND pid != pg_backend_pid()
          ORDER BY now() - query_start DESC;
        `;
      } else if (activeTool === 'slow') {
        const enabled = await checkPgStatStatements();
        if (!enabled) {
          setRows([]);
          setFields([]);
          setLoading(false);
          return;
        }

        // Kiểm tra xem PG bản cũ (total_time) hay bản mới (total_exec_time)
        const checkCols = await window.flashpostgre.query.run(
          connectionId,
          "SELECT column_name FROM information_schema.columns WHERE table_name = 'pg_stat_statements' AND column_name = 'total_exec_time';"
        );
        const hasNewCol = checkCols.ok && checkCols.rows.length > 0;

        const totalCol = hasNewCol ? 'total_exec_time' : 'total_time';
        const meanCol = hasNewCol ? 'mean_exec_time' : 'mean_time';

        sql = `
          SELECT
            calls AS "Calls",
            round(${totalCol}::numeric, 2) AS "Total Time (ms)",
            round(${meanCol}::numeric, 2) AS "Mean Time (ms)",
            rows AS "Rows",
            query AS "Query Template"
          FROM pg_stat_statements
          ORDER BY ${totalCol} DESC
          LIMIT 20;
        `;
      } else if (activeTool === 'size') {
        sql = `
          SELECT
            schemaname AS "Schema",
            relname AS "Table Name",
            pg_size_pretty(pg_total_relation_size(relid)) AS "Total Size",
            pg_size_pretty(pg_relation_size(relid)) AS "Table Size",
            pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS "Index Size",
            n_live_tup AS "Row Estimate"
          FROM pg_stat_user_tables
          ORDER BY pg_total_relation_size(relid) DESC
          LIMIT 20;
        `;
      } else if (activeTool === 'unused') {
        sql = `
          SELECT
            schemaname AS "Schema",
            relname AS "Table",
            indexrelname AS "Index Name",
            idx_scan AS "Index Scans"
          FROM pg_stat_user_indexes
          JOIN pg_index USING(indexrelid)
          WHERE idx_scan = 0 AND indisunique = 'f'
          ORDER BY indexrelname;
        `;
      } else if (activeTool === 'hitrate') {
        sql = `
          SELECT
            'Index Hit Rate' AS "Metric",
            coalesce(round(100.0 * sum(idx_blks_hit) / nullif(sum(idx_blks_hit + idx_blks_read), 0), 2), 0.0) AS "Rate (%)"
          FROM pg_statio_user_indexes
          UNION ALL
          SELECT
            'Table Cache Hit Rate' AS "Metric",
            coalesce(round(100.0 * sum(heap_blks_hit) / nullif(sum(heap_blks_hit + heap_blks_read), 0), 2), 0.0) AS "Rate (%)"
          FROM pg_statio_user_tables;
        `;
      }

      const res = await window.flashpostgre.query.run(connectionId, sql);
      if (res.ok) {
        setRows(res.rows);
        if (res.rows.length > 0) {
          setFields(Object.keys(res.rows[0]));
        } else {
          setFields([]);
        }
      } else {
        setError(res.error ?? 'Failed to load diagnostics data');
      }
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, [connectionId, activeTool, checkPgStatStatements]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshKey]);

  const handleCancelQuery = async (pid: number, force: boolean) => {
    const action = force ? 'pg_terminate_backend' : 'pg_cancel_backend';
    const res = await window.flashpostgre.query.run(connectionId, `SELECT ${action}(${pid}) AS ok;`);
    if (res.ok && res.rows.length > 0 && res.rows[0].ok) {
      setRefreshKey((k) => k + 1);
    } else {
      alert(res.ok ? 'Query termination failed' : (res.error ?? 'Failed to cancel query'));
    }
  };

  const handleEnablePgStat = async () => {
    setLoading(true);
    const res = await window.flashpostgre.query.run(connectionId, 'CREATE EXTENSION IF NOT EXISTS pg_stat_statements;');
    if (res.ok) {
      setRefreshKey((k) => k + 1);
    } else {
      setError(res.error ?? 'Failed to enable extension');
      setLoading(false);
    }
  };

  return (
    <Box p="3" style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Heading size="4" mb="3" weight="medium">
        Diagnostics & Performance Monitor
      </Heading>

      <Flex gap="3" style={{ flex: 1, minHeight: 0 }}>
        {/* Left Sidebar Menu */}
        <Box
          style={{
            width: '200px',
            minWidth: '200px',
            borderRight: '1px solid var(--gray-a4)',
            paddingRight: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <Button
            size="2"
            variant={activeTool === 'active' ? 'solid' : 'ghost'}
            color={activeTool === 'active' ? undefined : 'gray'}
            onClick={() => setActiveTool('active')}
            style={{ justifyContent: 'flex-start', textAlign: 'left' }}
          >
            📊 Active Queries
          </Button>
          <Button
            size="2"
            variant={activeTool === 'slow' ? 'solid' : 'ghost'}
            color={activeTool === 'slow' ? undefined : 'gray'}
            onClick={() => setActiveTool('slow')}
            style={{ justifyContent: 'flex-start', textAlign: 'left' }}
          >
            ⏱️ Slowest Queries
          </Button>
          <Button
            size="2"
            variant={activeTool === 'size' ? 'solid' : 'ghost'}
            color={activeTool === 'size' ? undefined : 'gray'}
            onClick={() => setActiveTool('size')}
            style={{ justifyContent: 'flex-start', textAlign: 'left' }}
          >
            📦 Tables Size
          </Button>
          <Button
            size="2"
            variant={activeTool === 'unused' ? 'solid' : 'ghost'}
            color={activeTool === 'unused' ? undefined : 'gray'}
            onClick={() => setActiveTool('unused')}
            style={{ justifyContent: 'flex-start', textAlign: 'left' }}
          >
            🔍 Unused Indexes
          </Button>
          <Button
            size="2"
            variant={activeTool === 'hitrate' ? 'solid' : 'ghost'}
            color={activeTool === 'hitrate' ? undefined : 'gray'}
            onClick={() => setActiveTool('hitrate')}
            style={{ justifyContent: 'flex-start', textAlign: 'left' }}
          >
            🧠 Cache Hit Rates
          </Button>
        </Box>

        {/* Right Content Panel */}
        <Flex direction="column" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {/* Toolbar */}
          <Flex align="center" justify="between" mb="3" px="2">
            <Heading size="3" weight="medium">
              {activeTool === 'active' && 'Active Queries Monitor'}
              {activeTool === 'slow' && 'Slowest Queries (Top 20)'}
              {activeTool === 'size' && 'Tables Size Analyzer'}
              {activeTool === 'unused' && 'Unused Indexes'}
              {activeTool === 'hitrate' && 'Cache Hit Rates'}
            </Heading>
            <Button
              size="1"
              variant="soft"
              onClick={() => setRefreshKey((k) => k + 1)}
              disabled={loading}
              style={{ cursor: 'pointer' }}
            >
              <ReloadIcon /> Refresh
            </Button>
          </Flex>

          {/* Table / Content View */}
          <Box style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {loading ? (
              <Flex align="center" justify="center" p="6" style={{ height: '100%' }}>
                <Spinner size="3" />
              </Flex>
            ) : error ? (
              <Callout.Root color="red" size="2">
                <Callout.Icon>
                  <ExclamationTriangleIcon />
                </Callout.Icon>
                <Callout.Text>{error}</Callout.Text>
              </Callout.Root>
            ) : activeTool === 'slow' && !pgStatEnabled ? (
              <Flex direction="column" align="center" justify="center" p="6" gap="3" style={{ height: '100%', textAlign: 'center' }}>
                <Text size="3" weight="medium">Extension `pg_stat_statements` is not enabled</Text>
                <Text size="2" color="gray" style={{ maxWidth: '480px' }}>
                  This extension is required to track query history and execute times. Click the button below to enable it. Note: some managed database providers may require a reboot.
                </Text>
                <Button onClick={handleEnablePgStat} style={{ cursor: 'pointer' }}>
                  Enable Extension
                </Button>
              </Flex>
            ) : rows.length === 0 ? (
              <Flex align="center" justify="center" p="6" style={{ height: '100%' }}>
                <Text color="gray" size="2">No diagnostics data found.</Text>
              </Flex>
            ) : (
              <Table.Root variant="surface">
                <Table.Header>
                  <Table.Row>
                    {fields.map((f) => (
                      <Table.ColumnHeaderCell key={f}>{f}</Table.ColumnHeaderCell>
                    ))}
                    {activeTool === 'active' && (
                      <Table.ColumnHeaderCell style={{ width: '130px' }}>Actions</Table.ColumnHeaderCell>
                    )}
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {rows.map((row, i) => (
                    <Table.Row key={i}>
                      {fields.map((f) => {
                        const val = row[f];
                        const isQuery = f.toLowerCase().includes('query') || f.toLowerCase().includes('template');
                        return (
                          <Table.Cell key={f} style={{ verticalAlign: 'middle' }}>
                            {isQuery ? (
                              <code
                                style={{
                                  fontSize: '11px',
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-all',
                                  display: 'block',
                                  maxHeight: '100px',
                                  overflowY: 'auto',
                                }}
                              >
                                {val}
                              </code>
                            ) : typeof val === 'object' && val !== null ? (
                              JSON.stringify(val)
                            ) : val === null || val === undefined ? (
                              <span className="fp-null">NULL</span>
                            ) : (
                              String(val)
                            )}
                          </Table.Cell>
                        );
                      })}
                      {activeTool === 'active' && (
                        <Table.Cell style={{ verticalAlign: 'middle' }}>
                          <Flex gap="1">
                            <Button
                              size="1"
                              color="orange"
                              variant="soft"
                              style={{ cursor: 'pointer' }}
                              onClick={() => handleCancelQuery(row['PID'], false)}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="1"
                              color="red"
                              variant="soft"
                              style={{ cursor: 'pointer' }}
                              onClick={() => handleCancelQuery(row['PID'], true)}
                            >
                              Kill
                            </Button>
                          </Flex>
                        </Table.Cell>
                      )}
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            )}
          </Box>
        </Flex>
      </Flex>
    </Box>
  );
}
