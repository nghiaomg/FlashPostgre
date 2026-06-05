import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  Box,
  Flex,
  Button,
  Text,
  TextField,
  IconButton,
  Tooltip,
  Spinner,
  Select,
  Callout,
  Dialog,
  Badge,
  Checkbox,
  ContextMenu,
} from '@radix-ui/themes';
import {
  ReloadIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  TrashIcon,
  DownloadIcon,
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  UploadIcon,
  Cross2Icon,
} from '@radix-ui/react-icons';
import { CsvImportDialog } from './CsvImportDialog';
import type { QueryResult, ColumnInfo, PrimaryKeyInfo, QueryField } from '@/types';
import { rowsToCsv, rowsToJson, downloadText } from '@/lib/exporters';
import { buildRowUpdates, PendingCellEdit, isBoolOid, isNumericOid, isJsonOid, valueToSqlLiteral } from '@/lib/sqlBuilders';
import { AddRowDialog } from './AddRowDialog';

interface Props {
  connectionId: string;
  schema: string;
  table: string;
  initialLimit?: number;
}

type SortDir = 'ASC' | 'DESC' | null;

export function DataExplorer({ connectionId, schema, table, initialLimit = 50 }: Props) {
  const [primaryKeys, setPrimaryKeys] = useState<string[]>([]);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [fields, setFields] = useState<QueryField[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialLimit);
  const [filter, setFilter] = useState('');
  const [debouncedFilter, setDebouncedFilter] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce 400ms cho việc gõ tìm kiếm
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedFilter(filter);
    }, 400);

    return () => {
      clearTimeout(handler);
    };
  }, [filter]);

  // Tạo whereClause quét tất cả các cột
  const whereClause = useMemo(() => {
    const escapedQuery = debouncedFilter.trim().replace(/'/g, "''");
    if (!escapedQuery || columns.length === 0) return undefined;
    return columns.map((c) => `"${c.column_name}"::text ILIKE '%${escapedQuery}%'`).join(' OR ');
  }, [debouncedFilter, columns]);

  // Pending edits: rowKey -> column -> {oldValue, newValue, dataTypeID}
  const [pending, setPending] = useState<
    Map<string, Map<string, { oldValue: unknown; newValue: unknown; dataTypeID: number }>>
  >(new Map());
  const [editing, setEditing] = useState<{ rowKey: string; column: string } | null>(null);
  const [editDraft, setEditDraft] = useState<string>('');
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyResult, setApplyResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [applying, setApplying] = useState(false);
  const [addRowOpen, setAddRowOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);

  const oidByColumn = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of fields) m.set(f.name, f.dataTypeID);
    return m;
  }, [fields]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pkRes, colsRes, countRes, previewRes] = await Promise.all([
        window.flashpostgre.schema.primaryKeys(connectionId, schema, table),
        window.flashpostgre.schema.columns(connectionId, schema, table),
        window.flashpostgre.schema.count(connectionId, schema, table, whereClause),
        window.flashpostgre.schema.preview(
          connectionId,
          schema,
          table,
          pageSize,
          page * pageSize,
          sortColumn ?? undefined,
          sortDir ?? undefined,
          whereClause
        ),
      ]);
      if (!pkRes.ok) {
        setError(pkRes.error ?? 'Failed to load primary keys');
        return;
      }
      if (!colsRes.ok) {
        setError(colsRes.error ?? 'Failed to load columns');
        return;
      }
      if (!previewRes.ok) {
        setError(previewRes.error ?? 'Failed to load rows');
        return;
      }
      setPrimaryKeys((pkRes.rows ?? []).map((r) => r.column_name));
      setColumns(colsRes.rows ?? []);
      setFields(previewRes.fields);
      setRows(previewRes.rows);
      if (countRes.ok) setTotal(countRes.total ?? null);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, [connectionId, schema, table, page, pageSize, sortColumn, sortDir, whereClause]);

  // Reset everything when the table changes
  useEffect(() => {
    setPending(new Map());
    setEditing(null);
    setPage(0);
    setFilter('');
    setDebouncedFilter('');
    setSortColumn(null);
    setSortDir(null);
    firstRunRef.current = true;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, schema, table]);

  // Re-fetch when pagination or sort changes (skip the first run because the effect above
  // already requested a load)
  const firstRunRef = useRef(true);
  useEffect(() => {
    if (firstRunRef.current) {
      firstRunRef.current = false;
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, sortColumn, sortDir, whereClause]);

  // Reset page when filter changes
  const prevWhereRef = useRef(whereClause);
  useEffect(() => {
    if (prevWhereRef.current !== whereClause) {
      prevWhereRef.current = whereClause;
      setPage(0);
    }
  }, [whereClause]);

  const rowKey = useCallback(
    (row: any): string => {
      if (primaryKeys.length === 0) return `__row_${rows.indexOf(row)}`;
      return primaryKeys.map((pk) => `${pk}=${formatKey(row[pk])}`).join('|');
    },
    [primaryKeys, rows]
  );

  const pkValues = useCallback(
    (row: any): Record<string, unknown> => {
      const out: Record<string, unknown> = {};
      for (const pk of primaryKeys) out[pk] = row[pk];
      return out;
    },
    [primaryKeys]
  );

  const beginEdit = (row: any, column: string) => {
    if (primaryKeys.length === 0) {
      setError('Editing is disabled because the table has no primary key.');
      return;
    }
    if (primaryKeys.includes(column)) {
      setError('Primary key columns cannot be edited inline.');
      return;
    }
    const rk = rowKey(row);
    const oid = oidByColumn.get(column) ?? 0;
    const pendingRow = pending.get(rk);
    const initial = pendingRow?.get(column)?.newValue ?? row[column];
    setEditing({ rowKey: rk, column });
    setEditDraft(formatForEdit(initial, oid));
  };

  const commitEdit = (row: any) => {
    if (!editing) return;
    const { rowKey: rk, column } = editing;
    const oid = oidByColumn.get(column) ?? 0;
    const newVal = parseForType(editDraft, oid);
    const oldVal = row[column];
    setPending((prev) => {
      const next = new Map(prev);
      const rowMap = new Map(next.get(rk) ?? []);
      if (valuesEqual(newVal, oldVal)) {
        rowMap.delete(column);
      } else {
        rowMap.set(column, { oldValue: oldVal, newValue: newVal, dataTypeID: oid });
      }
      if (rowMap.size === 0) next.delete(rk);
      else next.set(rk, rowMap);
      return next;
    });
    setEditing(null);
    setEditDraft('');
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditDraft('');
  };

  const revertAll = () => {
    setPending(new Map());
  };

  const pendingList: PendingCellEdit[] = useMemo(() => {
    const out: PendingCellEdit[] = [];
    for (const [rk, cols] of pending.entries()) {
      const baseRow = rows.find((r) => rowKey(r) === rk);
      if (!baseRow) continue;
      const pks = pkValues(baseRow);
      for (const [column, c] of cols.entries()) {
        out.push({
          pkValues: pks,
          column,
          oldValue: c.oldValue,
          newValue: c.newValue,
          dataTypeID: c.dataTypeID,
        });
      }
    }
    return out;
  }, [pending, rows, rowKey, pkValues]);

  const updateStatements = useMemo(
    () => buildRowUpdates(schema, table, pendingList, primaryKeys),
    [schema, table, pendingList, primaryKeys]
  );

  const applyChanges = async () => {
    if (updateStatements.length === 0) return;
    setApplying(true);
    const res = await window.flashpostgre.query.transaction(connectionId, updateStatements);
    setApplying(false);
    if (res.ok) {
      const affected = (res.affectedCounts ?? []).reduce((a, b) => a + b, 0);
      setApplyResult({ ok: true, message: `Updated ${affected} row${affected === 1 ? '' : 's'} across ${updateStatements.length} statement${updateStatements.length === 1 ? '' : 's'}.` });
      setPending(new Map());
      await load();
    } else {
      setApplyResult({ ok: false, message: res.error ?? 'Transaction failed' });
    }
  };

  const totalPages = total !== null ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const pendingCount = pendingList.length;
  const canEdit = primaryKeys.length > 0;

  const getCompleteRowObj = useCallback(
    (row: any, rk: string) => {
      const rowEdits = pending.get(rk);
      const obj: Record<string, any> = {};
      for (const f of fields) {
        const pendingEdit = rowEdits?.get(f.name);
        obj[f.name] = pendingEdit ? pendingEdit.newValue : row[f.name];
      }
      return obj;
    },
    [pending, fields]
  );

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {error && (
        <Box p="2">
          <Callout.Root color="red" size="1">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        </Box>
      )}

      <Flex align="center" gap="2" px="3" py="2" wrap="wrap">
        <Flex align="center" gap="1" style={{ flex: '1 1 240px', maxWidth: 360 }}>
          <MagnifyingGlassIcon color="var(--gray-9)" />
          <TextField.Root
            size="1"
            placeholder="Search all columns (debounced)…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ flex: 1 }}
          />
        </Flex>
        <Flex align="center" gap="2">
          <Text size="1" color="gray">
            {total === null ? '…' : total.toLocaleString()} rows
          </Text>
        </Flex>
        <Flex align="center" gap="1" ml="auto">
          {pendingCount > 0 && (
            <Flex align="center" gap="2" mr="2">
              <Badge color="amber" variant="soft">
                {pendingCount} unsaved change{pendingCount === 1 ? '' : 's'}
              </Badge>
              <Button size="1" variant="soft" color="gray" onClick={revertAll}>
                Revert
              </Button>
              <Button size="1" onClick={() => setApplyOpen(true)}>
                Apply changes
              </Button>
            </Flex>
          )}
          <Button
            size="1"
            color="green"
            variant="soft"
            style={{ cursor: 'pointer' }}
            onClick={() => setAddRowOpen(true)}
          >
            <PlusIcon /> Add Row
          </Button>
          <Button size="1" variant="soft" onClick={() => setCsvImportOpen(true)}>
            <UploadIcon /> Import CSV
          </Button>
          <Button
            size="1"
            variant="soft"
            onClick={() => downloadText(`${schema}.${table}.csv`, rowsToCsv(rows, fields), 'text/csv;charset=utf-8')}
            disabled={rows.length === 0}
          >
            <DownloadIcon /> CSV
          </Button>
          <Button
            size="1"
            variant="soft"
            onClick={() => downloadText(`${schema}.${table}.json`, rowsToJson(rows), 'application/json;charset=utf-8')}
            disabled={rows.length === 0}
          >
            <DownloadIcon /> JSON
          </Button>
          <Tooltip content="Refresh">
            <IconButton size="1" variant="ghost" onClick={load} disabled={loading}>
              {loading ? <Spinner size="1" /> : <ReloadIcon />}
            </IconButton>
          </Tooltip>
        </Flex>
      </Flex>

      {!canEdit && (
        <Box px="3" pb="2">
          <Callout.Root color="amber" size="1">
            <Callout.Text>
              <ExclamationTriangleIcon /> This table has no primary key. Inline editing is disabled.
            </Callout.Text>
          </Callout.Root>
        </Box>
      )}

      {/* Sort / Filter chips */}
      {(sortColumn || debouncedFilter) && (
        <Flex gap="1" px="3" py="1" style={{ borderBottom: '1px solid var(--gray-a3)', flexWrap: 'wrap' }}>
          {sortColumn && (
            <span className="fp-chip">
              <span className="fp-chip-label">
                Sort: <b>{sortColumn}</b> {sortDir}
              </span>
              <button
                className="fp-chip-x"
                onClick={() => {
                  setSortColumn(null);
                  setSortDir(null);
                  setPage(0);
                }}
                title="Remove sort"
              >
                <Cross2Icon width={10} height={10} />
              </button>
            </span>
          )}
          {debouncedFilter && (
            <span className="fp-chip">
              <span className="fp-chip-label">
                Filter: <b>"{debouncedFilter}"</b>
              </span>
              <button
                className="fp-chip-x"
                onClick={() => {
                  setFilter('');
                  setDebouncedFilter('');
                }}
                title="Remove filter"
              >
                <Cross2Icon width={10} height={10} />
              </button>
            </span>
          )}
        </Flex>
      )}

      <Box style={{ overflow: 'auto', maxHeight: 'calc(100vh - 360px)' }}>
        <table className="fp-result-table">
            <thead>
            <tr>
              {fields.map((f) => {
                const isPk = primaryKeys.includes(f.name);
                const isSorted = sortColumn === f.name;
                const colInfo = columns.find((c) => c.column_name === f.name);
                const isNullable = colInfo?.is_nullable === 'YES';
                const dotColor = typeDotColor(f.dataTypeID);
                return (
                  <th key={f.name} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                    <Flex align="center" gap="1" wrap="nowrap">
                      {dotColor && <span className="fp-type-dot" style={{ background: dotColor }} title={typeLabel(f.dataTypeID)} />}
                      {isPk && <Badge size="1" color="gray" variant="soft">PK</Badge>}
                      {isNullable && <span className="fp-nullable-badge" title="Nullable">?</span>}
                      <Text
                        size="1"
                        onClick={() => {
                          if (sortColumn === f.name) {
                            setSortDir(sortDir === 'ASC' ? 'DESC' : sortDir === 'DESC' ? null : 'ASC');
                            if (sortDir === 'DESC') setSortColumn(null);
                          } else {
                            setSortColumn(f.name);
                            setSortDir('ASC');
                          }
                          setPage(0);
                        }}
                      >
                        {f.name}
                      </Text>
                      {isSorted && (sortDir === 'ASC' ? <ChevronUpIcon /> : <ChevronDownIcon />)}
                    </Flex>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const rk = rowKey(row);
              const rowEdits = pending.get(rk);
              return (
                <tr key={i}>
                  {fields.map((f) => {
                    const isPk = primaryKeys.includes(f.name);
                    const pendingEdit = rowEdits?.get(f.name);
                    const isEditing = editing?.rowKey === rk && editing.column === f.name;
                    const value = pendingEdit ? pendingEdit.newValue : row[f.name];

                    return (
                      <DataCell
                        key={f.name}
                        row={row}
                        rk={rk}
                        field={f}
                        isPk={isPk}
                        pendingEdit={pendingEdit}
                        isEditing={isEditing}
                        value={value}
                        canEdit={canEdit}
                        editDraft={editDraft}
                        setEditDraft={setEditDraft}
                        beginEdit={beginEdit}
                        commitEdit={commitEdit}
                        cancelEdit={cancelEdit}
                        getCompleteRowObj={getCompleteRowObj}
                        allFields={fields}
                        schema={schema}
                        table={table}
                      />
                    );
                  })}
                </tr>
              );
            })}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={fields.length || 1}>
                  <Flex align="center" justify="center" p="6">
                    <Text size="2" color="gray">No rows.</Text>
                  </Flex>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Box>

      <Flex align="center" gap="2" px="3" py="2" style={{ borderTop: '1px solid var(--gray-a4)' }}>
        <Flex align="center" gap="1">
          <IconButton
            size="1"
            variant="ghost"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeftIcon />
          </IconButton>
          <Text size="1" color="gray">
            Page {page + 1} of {totalPages}
          </Text>
          <IconButton
            size="1"
            variant="ghost"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRightIcon />
          </IconButton>
        </Flex>
        <Flex align="center" gap="1" ml="auto">
          <Text size="1" color="gray">Page size</Text>
          <Select.Root
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(parseInt(v, 10));
              setPage(0);
            }}
          >
            <Select.Trigger />
            <Select.Content>
              {[25, 50, 100, 200, 500, 1000].map((n) => (
                <Select.Item key={n} value={String(n)}>
                  {n}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </Flex>
      </Flex>

      <ApplyDialog
        open={applyOpen}
        onOpenChange={(o) => {
          setApplyOpen(o);
          if (!o) setApplyResult(null);
        }}
        statements={updateStatements}
        applying={applying}
        applyResult={applyResult}
        onApply={applyChanges}
      />
      <AddRowDialog
        open={addRowOpen}
        onOpenChange={setAddRowOpen}
        connectionId={connectionId}
        schema={schema}
        table={table}
        columns={columns}
        onInserted={load}
      />
      <CsvImportDialog
        open={csvImportOpen}
        onOpenChange={setCsvImportOpen}
        connectionId={connectionId}
        schema={schema}
        table={table}
        columns={columns}
        onImported={load}
      />
    </Box>
  );
}

function formatForEdit(v: unknown, oid: number): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string' && isJsonOid(oid)) return v;
  return String(v);
}

function parseForType(s: string, oid: number): unknown {
  if (s === '' || s === 'null' || s === 'NULL') return null;
  if (isBoolOid(oid)) {
    if (/^(true|t|1|yes|y)$/i.test(s)) return true;
    if (/^(false|f|0|no|n)$/i.test(s)) return false;
    return s;
  }
  if (isNumericOid(oid)) {
    const n = Number(s);
    if (!Number.isNaN(n)) return n;
    return s;
  }
  if (isJsonOid(oid)) {
    try {
      return JSON.parse(s);
    } catch {
      return s;
    }
  }
  return s;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return String(a) === String(b);
}

function formatKey(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function formatCellText(v: unknown): JSX.Element {
  if (v === null || v === undefined) return <span className="fp-null">NULL</span>;
  if (typeof v === 'object') {
    const s = JSON.stringify(v);
    return <span>{s.length > 200 ? s.slice(0, 200) + '…' : s}</span>;
  }
  if (typeof v === 'string' && v.length > 200) {
    return <span title={v}>{v.slice(0, 200)}…</span>;
  }
  if (typeof v === 'boolean') return <span>{v ? 'true' : 'false'}</span>;
  return <span>{String(v)}</span>;
}

/** Colored type dot based on PostgreSQL OID. */
function typeDotColor(oid: number): string | null {
  if (isBoolOid(oid)) return '#3b82f6';          // blue
  if (isNumericOid(oid)) return '#8b5cf6';       // purple
  if (oid === 25 || oid === 1043) return '#64748b'; // gray
  if (isJsonOid(oid)) return '#f97316';         // orange
  if (oid === 17) return '#14b8a6';              // teal (bytea)
  // date/time types: 1082, 1114, 1184, 600, 601, 702, 703, 790, 1969
  if ([1082, 1114, 1184, 600, 601, 702, 703, 790, 1969].includes(oid)) return '#22c55e'; // green
  return null;
}

function typeLabel(oid: number): string {
  if (isBoolOid(oid)) return 'boolean';
  if (isNumericOid(oid)) return 'numeric';
  if (isJsonOid(oid)) return 'json/jsonb';
  if (oid === 25 || oid === 1043) return 'text/varchar';
  if (oid === 17) return 'bytea';
  if ([1082, 1114, 1184, 600, 601, 702, 703, 790, 1969].includes(oid)) return 'date/time';
  return `oid:${oid}`;
}

/** Build an INSERT statement for a single row object. */
function buildRowInsertSql(schema: string, table: string, row: Record<string, unknown>, fields: QueryField[]): string {
  const cols: string[] = [];
  const vals: string[] = [];
  for (const f of fields) {
    cols.push(`"${f.name}"`);
    vals.push(valueToSqlLiteral(row[f.name], f.dataTypeID));
  }
  return `INSERT INTO "${schema}"."${table}" (${cols.join(', ')}) VALUES (${vals.join(', ')});`;
}

interface ApplyDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  statements: string[];
  applying: boolean;
  applyResult: { ok: boolean; message: string } | null;
  onApply: () => void;
}

function ApplyDialog({ open, onOpenChange, statements, applying, applyResult, onApply }: ApplyDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="640px">
        <Dialog.Title>Apply changes</Dialog.Title>
        <Dialog.Description size="2" mb="3" color="gray">
          The following <b>UPDATE</b> statements will run inside a single transaction.
          Any failure rolls everything back.
        </Dialog.Description>

        {applyResult ? (
          <Callout.Root color={applyResult.ok ? 'green' : 'red'} size="1" mb="3">
            <Callout.Text>{applyResult.message}</Callout.Text>
          </Callout.Root>
        ) : (
          <Box className="fp-codeblock" style={{ maxHeight: 300 }}>
            BEGIN;
{statements.join(';\n') + (statements.length ? ';' : '')}
            COMMIT;
          </Box>
        )}

        <Flex gap="2" mt="4" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray" disabled={applying}>
              {applyResult ? 'Close' : 'Cancel'}
            </Button>
          </Dialog.Close>
          {!applyResult && (
            <Button onClick={onApply} disabled={applying || statements.length === 0}>
              {applying ? <Spinner size="1" /> : null} Run transaction
            </Button>
          )}
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

interface DataCellProps {
  row: any;
  rk: string;
  field: QueryField;
  isPk: boolean;
  pendingEdit: any;
  isEditing: boolean;
  value: any;
  canEdit: boolean;
  editDraft: string;
  setEditDraft: (s: string) => void;
  beginEdit: (row: any, column: string) => void;
  commitEdit: (row: any) => void;
  cancelEdit: () => void;
  getCompleteRowObj: (row: any, rk: string) => any;
  allFields: QueryField[];
  schema: string;
  table: string;
}

function DataCell({
  row,
  rk,
  field,
  isPk,
  pendingEdit,
  isEditing,
  value,
  canEdit,
  editDraft,
  setEditDraft,
  beginEdit,
  commitEdit,
  cancelEdit,
  getCompleteRowObj,
  allFields,
  schema,
  table,
}: DataCellProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleCopyCell = () => {
    const text = value === null || value === undefined
      ? 'NULL'
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
    navigator.clipboard.writeText(text);
  };

  const handleCopyRowJson = () => {
    const obj = getCompleteRowObj(row, rk);
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
  };

  // buildInsertSql is lifted into the parent scope
  // We get it via a prop to avoid circular imports
  const handleCopyRowAsInsert = (allFields: QueryField[], schema: string, table: string) => {
    const obj = getCompleteRowObj(row, rk);
    navigator.clipboard.writeText(buildRowInsertSql(schema, table, obj, allFields));
  };

  const cellStyle: React.CSSProperties = {
    background: isEditing
      ? 'var(--accent-a3)'
      : menuOpen
        ? 'var(--accent-a2)'
        : pendingEdit
          ? 'var(--amber-a3)'
          : undefined,
    outline: menuOpen ? '2px solid var(--accent-8)' : undefined,
    outlineOffset: '-2px',
    cursor: isPk || !canEdit ? 'default' : 'cell',
    maxWidth: 360,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    padding: 0,
    position: 'relative',
  };

  return (
    <td
      onDoubleClick={() => beginEdit(row, field.name)}
      style={cellStyle}
      title={
        pendingEdit
          ? `Original: ${formatCellText(pendingEdit.oldValue)?.props?.children ?? ''}`
          : undefined
      }
    >
      {isEditing ? (
        <input
          autoFocus
          value={editDraft}
          onChange={(e) => setEditDraft(e.target.value)}
          onBlur={() => commitEdit(row)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitEdit(row);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelEdit();
            }
          }}
          style={{
            width: '100%',
            background: 'var(--color-panel-solid)',
            border: '1px solid var(--accent-8)',
            borderRadius: 3,
            color: 'var(--gray-12)',
            padding: '2px 4px',
            font: 'inherit',
            outline: 'none',
          }}
        />
      ) : (
        <ContextMenu.Root onOpenChange={setMenuOpen}>
          <ContextMenu.Trigger>
            <div
              style={{
                padding: '6px 8px',
                width: '100%',
                height: '100%',
                minHeight: '28px',
                display: 'flex',
                alignItems: 'center',
                boxSizing: 'border-box',
              }}
            >
              {formatCellText(value)}
            </div>
          </ContextMenu.Trigger>
          <ContextMenu.Content>
            <ContextMenu.Item onClick={handleCopyCell}>
              Copy Cell Value
            </ContextMenu.Item>
            <ContextMenu.Item onClick={handleCopyRowJson}>
              Copy Row as JSON
            </ContextMenu.Item>
            <ContextMenu.Item onClick={() => handleCopyRowAsInsert(allFields, schema, table)}>
              Copy Row as INSERT
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Root>
      )}
    </td>
  );
}
