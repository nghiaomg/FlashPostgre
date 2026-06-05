import { Box, Flex, Heading, Text, Tabs, Spinner, Badge, Table, Button, IconButton, Tooltip } from '@radix-ui/themes';
import { ReloadIcon, CodeIcon, GearIcon, RowsIcon, CopyIcon, CheckIcon } from '@radix-ui/react-icons';
import { useEffect, useState } from 'react';
import type { ColumnInfo, IndexInfo } from '@/types';
import { DataExplorer } from './DataExplorer';

interface Props {
  tab: { id: string; kind: 'table'; title: string; schema: string; table: string };
  connectionId: string;
}

export function TableTab({ tab, connectionId }: Props) {
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [indexes, setIndexes] = useState<IndexInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copiedNames, setCopiedNames] = useState(false);
  const [copiedRow, setCopiedRow] = useState<string | null>(null);

  const handleCopyColumns = () => {
    const textToCopy = columns
      .map(
        (c) =>
          `${c.column_name.padEnd(32)} ${c.data_type}${
            c.is_nullable === 'YES' ? '' : ' NOT NULL'
          }${c.column_default ? ` DEFAULT ${c.column_default}` : ''}`
      )
      .join('\n');
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleCopyNames = () => {
    const textToCopy = columns.map((c) => c.column_name).join(', ');
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedNames(true);
      setTimeout(() => setCopiedNames(false), 1500);
    });
  };

  const handleCopyRow = (colName: string) => {
    navigator.clipboard.writeText(colName).then(() => {
      setCopiedRow(colName);
      setTimeout(() => setCopiedRow(null), 1500);
    });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [cols, idx] = await Promise.all([
        window.flashpostgre.schema.columns(connectionId, tab.schema, tab.table),
        window.flashpostgre.schema.indexes(connectionId, tab.schema, tab.table),
      ]);
      if (cancelled) return;
      if (cols.ok) setColumns(cols.rows ?? []);
      if (idx.ok) setIndexes(idx.rows ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [connectionId, tab.schema, tab.table, refreshKey]);

  return (
    <Box p="3" style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Flex align="center" justify="between" mb="3">
        <Flex direction="column" gap="1">
          <Heading size="3" weight="medium">
            {tab.schema}.{tab.table}
          </Heading>
          <Flex gap="2" align="center">
            <Badge size="1" color="gray" variant="soft">
              {columns.length} column{columns.length === 1 ? '' : 's'}
            </Badge>
            <Badge size="1" color="gray" variant="soft">
              {indexes.length} index{indexes.length === 1 ? '' : 'es'}
            </Badge>
          </Flex>
        </Flex>
      </Flex>

      <Tabs.Root defaultValue="data" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Tabs.List>
          <Tabs.Trigger value="data">
            <RowsIcon /> Data
          </Tabs.Trigger>
          <Tabs.Trigger value="columns">
            <CodeIcon /> Columns
          </Tabs.Trigger>
          <Tabs.Trigger value="indexes">
            <GearIcon /> Indexes
          </Tabs.Trigger>
        </Tabs.List>

        <Box style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Tabs.Content value="data" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <DataExplorer
              key={`${connectionId}:${tab.schema}.${tab.table}:${refreshKey}`}
              connectionId={connectionId}
              schema={tab.schema}
              table={tab.table}
            />
          </Tabs.Content>

          <Tabs.Content value="columns" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Flex align="center" justify="between" mb="2" px="1">
              <Badge size="1" color="gray" variant="soft">{columns.length} columns</Badge>
              <Flex gap="2">
                <Button
                  size="1"
                  color={copied ? 'green' : 'gray'}
                  variant="soft"
                  style={{ cursor: 'pointer' }}
                  onClick={handleCopyColumns}
                >
                  <CopyIcon /> {copied ? 'Struct Copied!' : 'Copy Struct'}
                </Button>
                <Button
                  size="1"
                  color={copiedNames ? 'green' : 'gray'}
                  variant="soft"
                  style={{ cursor: 'pointer' }}
                  onClick={handleCopyNames}
                >
                  <CopyIcon /> {copiedNames ? 'Names Copied!' : 'Copy Names'}
                </Button>
                <Button
                  size="1"
                  color="gray"
                  variant="soft"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setRefreshKey((k) => k + 1)}
                >
                  <ReloadIcon /> Refresh
                </Button>
              </Flex>
            </Flex>
            <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 250px)' }}>
              {loading ? (
                <Flex align="center" justify="center" p="4">
                  <Spinner size="3" />
                </Flex>
              ) : columns.length === 0 ? (
                <Box p="3">
                  <Text color="gray" size="2">
                    No columns found.
                  </Text>
                </Box>
              ) : (
                <Table.Root variant="surface">
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell style={{ width: '100px' }}>Nullable</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Default</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell style={{ width: '60px' }}></Table.ColumnHeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {columns.map((c) => (
                      <Table.Row key={c.column_name}>
                        <Table.RowHeaderCell style={{ verticalAlign: 'middle' }}>
                          <code style={{ fontSize: '12px', fontWeight: 'bold' }}>{c.column_name}</code>
                        </Table.RowHeaderCell>
                        <Table.Cell style={{ verticalAlign: 'middle' }}>
                          <code style={{ fontSize: '12px', color: 'var(--blue-9)' }}>{c.data_type}</code>
                        </Table.Cell>
                        <Table.Cell style={{ verticalAlign: 'middle' }}>
                          <Badge color={c.is_nullable === 'YES' ? 'gray' : 'tomato'} size="1">
                            {c.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}
                          </Badge>
                        </Table.Cell>
                        <Table.Cell style={{ verticalAlign: 'middle' }}>
                          {c.column_default ? (
                            <code style={{ fontSize: '11px', color: 'var(--gray-9)' }}>{c.column_default}</code>
                          ) : (
                            <Text size="1" color="gray">-</Text>
                          )}
                        </Table.Cell>
                        <Table.Cell style={{ verticalAlign: 'middle', textAlign: 'center' }}>
                          <Tooltip content={copiedRow === c.column_name ? 'Copied!' : 'Copy column name'}>
                            <IconButton
                              size="1"
                              variant="ghost"
                              color={copiedRow === c.column_name ? 'green' : 'gray'}
                              onClick={() => handleCopyRow(c.column_name)}
                              style={{ cursor: 'pointer' }}
                            >
                              {copiedRow === c.column_name ? <CheckIcon /> : <CopyIcon />}
                            </IconButton>
                          </Tooltip>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
              )}
            </div>
          </Tabs.Content>

          <Tabs.Content value="indexes" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="fp-codeblock" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 250px)' }}>
              {loading
                ? 'Loading…'
                : indexes.length === 0
                  ? 'No indexes.'
                  : indexes.map((i) => i.indexdef).join('\n\n')}
            </div>
          </Tabs.Content>
        </Box>
      </Tabs.Root>
    </Box>
  );
}
