import { useEffect, useState, useCallback, useMemo } from 'react';
import { Box, Text, Flex, Spinner, TextField, Badge } from '@radix-ui/themes';
import { ChevronRightIcon, ChevronDownIcon, TableIcon, EyeOpenIcon, MagnifyingGlassIcon } from '@radix-ui/react-icons';
import type { TableInfo } from '@/types';

interface SchemaNode {
  name: string;
  expanded: boolean;
  loading: boolean;
  tables: TableInfo[];
}

interface Props {
  connectionId: string;
  onOpenTable: (schema: string, table: string) => void;
}

export function SidebarTree({ connectionId, onOpenTable }: Props) {
  const [schemas, setSchemas] = useState<SchemaNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  // tableKey → row count (e.g. "public.users" → 4821)
  const [rowCounts, setRowCounts] = useState<Record<string, number>>({});
  const [countsLoading, setCountsLoading] = useState<Record<string, boolean>>({});

  const loadSchemas = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await window.flashpostgre.schema.schemas(connectionId);
    if (!res.ok) {
      setError(res.error ?? 'Failed to load schemas');
      setLoading(false);
      return;
    }
    const schemaList = res.rows ?? [];
    setSchemas(
      schemaList.map((name) => ({
        name,
        expanded: name === 'public',
        loading: false,
        tables: [],
      }))
    );
    setLoading(false);

    // Tự động tải danh sách bảng cho schema public nếu tồn tại
    if (schemaList.includes('public')) {
      setSchemas((prev) =>
        prev.map((s) => (s.name === 'public' ? { ...s, loading: true } : s))
      );
      const tablesRes = await window.flashpostgre.schema.tables(connectionId, 'public');
      if (tablesRes.ok) {
        setSchemas((prev) =>
          prev.map((s) =>
            s.name === 'public' ? { ...s, loading: false, tables: tablesRes.rows ?? [] } : s
          )
        );
      } else {
        setSchemas((prev) =>
          prev.map((s) => (s.name === 'public' ? { ...s, loading: false } : s))
        );
      }
    }
  }, [connectionId]);

  useEffect(() => {
    loadSchemas();
  }, [loadSchemas]);

  const toggle = useCallback(
    async (name: string) => {
      const wasExpanded = schemas.find((s) => s.name === name)?.expanded ?? false;

      setSchemas((prev) => {
        const idx = prev.findIndex((s) => s.name === name);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], expanded: !next[idx].expanded };
        return next;
      });

      if (!wasExpanded) {
        // Loading tables if needed
        const target = schemas.find((s) => s.name === name);
        if (target && target.tables.length === 0) {
          setSchemas((prev) =>
            prev.map((s) => (s.name === name ? { ...s, loading: true } : s))
          );
          const res = await window.flashpostgre.schema.tables(connectionId, name);
          if (res.ok) {
            setSchemas((prev) =>
              prev.map((s) =>
                s.name === name ? { ...s, loading: false, tables: res.rows ?? [] } : s
              )
            );
            // Fetch row counts for all tables in this schema
            const tables = res.rows ?? [];
            for (const t of tables) {
              const key = `${name}.${t.table_name}`;
              setCountsLoading((prev) => ({ ...prev, [key]: true }));
              try {
                const countRes = await window.flashpostgre.schema.count(connectionId, name, t.table_name);
                if (countRes.ok && countRes.total !== undefined) {
                  setRowCounts((prev) => ({ ...prev, [key]: countRes.total! }));
                }
              } finally {
                setCountsLoading((prev) => ({ ...prev, [key]: false }));
              }
            }
          } else {
            setSchemas((prev) =>
              prev.map((s) =>
                s.name === name ? { ...s, loading: false } : s
              )
            );
          }
        } else if (target && target.tables.length > 0) {
          // Tables already loaded — fetch counts if not already cached
          for (const t of target.tables) {
            const key = `${name}.${t.table_name}`;
            if (!(key in rowCounts) && !(key in countsLoading)) {
              setCountsLoading((prev) => ({ ...prev, [key]: true }));
              window.flashpostgre.schema.count(connectionId, name, t.table_name).then((countRes) => {
                if (countRes.ok && countRes.total !== undefined) {
                  setRowCounts((prev) => ({ ...prev, [key]: countRes.total! }));
                }
                setCountsLoading((prev) => {
                  const next = { ...prev };
                  delete next[key];
                  return next;
                });
              });
            }
          }
        }
      }
    },
    [connectionId, schemas, rowCounts, countsLoading]
  );

  const filteredSchemas = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return schemas;

    return schemas
      .map((s) => {
        const matchingTables = s.tables.filter((t) =>
          t.table_name.toLowerCase().includes(q)
        );
        const schemaNameMatches = s.name.toLowerCase().includes(q);

        if (schemaNameMatches || matchingTables.length > 0) {
          return {
            ...s,
            expanded: true, // Tự động mở rộng khi đang tìm kiếm
            tables: matchingTables.length > 0 ? matchingTables : s.tables,
          };
        }
        return null;
      })
      .filter(Boolean) as SchemaNode[];
  }, [schemas, filter]);

  if (loading) {
    return (
      <Flex align="center" gap="2" px="3" py="2">
        <Spinner size="1" /> <Text size="1">Loading schemas…</Text>
      </Flex>
    );
  }

  if (error) {
    return (
      <Box p="3">
        <Text size="1" color="red">
          {error}
        </Text>
      </Box>
    );
  }

  if (schemas.length === 0) {
    return (
      <Box className="fp-empty-state">
        <Text size="1">No schemas found.</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Box px="3" pb="2">
        <TextField.Root
          size="1"
          placeholder="Filter tables/schemas…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <TextField.Slot>
            <MagnifyingGlassIcon height="14" width="14" />
          </TextField.Slot>
        </TextField.Root>
      </Box>

      {filteredSchemas.map((s) => (
        <Box key={s.name}>
          <Flex
            className="fp-tree-row"
            data-kind="schema"
            onClick={() => toggle(s.name)}
          >
            {s.expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
            <Text size="2" weight="medium" style={{ flex: 1 }}>
              {s.name}
            </Text>
            {s.loading && <span className="fp-spinner" />}
          </Flex>
          {s.expanded && (
            <Box className="fp-tree-children">
              {s.tables.length === 0 && !s.loading && (
                <Box px="2" py="1">
                  <Text size="1" color="gray">No tables</Text>
                </Box>
              )}
              {s.tables.map((t) => {
                const countKey = `${t.table_schema}.${t.table_name}`;
                const count = rowCounts[countKey];
                const countIsLoading = countsLoading[countKey];
                return (
                  <Flex
                    key={countKey}
                    className="fp-tree-row"
                    data-kind="table"
                    align="center"
                  >
                    {t.table_type === 'VIEW' ? <EyeOpenIcon /> : <TableIcon />}
                    <Text
                      size="1"
                      style={{ flex: 1, cursor: 'pointer' }}
                      onClick={() => onOpenTable?.(t.table_schema, t.table_name)}
                    >
                      {t.table_name}
                    </Text>
                    {count !== undefined && (
                      <Badge
                        size="1"
                        variant="soft"
                        color="gray"
                        style={{ cursor: 'pointer', marginLeft: 4 }}
                        onClick={() => onOpenTable?.(t.table_schema, t.table_name)}
                        title={`${count.toLocaleString()} rows`}
                      >
                        {count >= 1000000
                          ? `${(count / 1000000).toFixed(1)}M`
                          : count >= 1000
                          ? `${(count / 1000).toFixed(1)}K`
                          : count}
                      </Badge>
                    )}
                    {countIsLoading && (
                      <Spinner size="1" style={{ marginLeft: 4 }} />
                    )}
                    <Text
                      size="1"
                      color="gray"
                      onClick={() => onOpenTable?.(t.table_schema, t.table_name)}
                      style={{ cursor: 'pointer', marginLeft: 4 }}
                    >
                      {t.table_type === 'VIEW' ? 'view' : 'table'}
                    </Text>
                  </Flex>
                );
              })}
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}
