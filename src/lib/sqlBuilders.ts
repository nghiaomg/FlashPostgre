// Generates safe UPDATE statements for inline edits and a WHERE clause from a filter string.

const NUMERIC_OIDS = new Set([21, 23, 20, 700, 701, 1700]); // int2, int4, int8, float4, float8, numeric
const BOOL_OIDS = new Set([16]);
const JSON_OIDS = new Set([114, 3802]); // json, jsonb
const BYTEA_OIDS = new Set([17]);

export function isNumericOid(oid: number): boolean {
  return NUMERIC_OIDS.has(oid);
}
export function isBoolOid(oid: number): boolean {
  return BOOL_OIDS.has(oid);
}
export function isJsonOid(oid: number): boolean {
  return JSON_OIDS.has(oid);
}

function quoteIdent(name: string): string {
  // Defensive: identifier is double-quoted; embedded double quotes are escaped.
  return `"${String(name).replace(/"/g, '""')}"`;
}

/**
 * Convert a JS value to its SQL literal form. The `oid` argument hints at the
 * Postgres type so we can format numbers/booleans/json correctly.
 */
export function valueToSqlLiteral(value: unknown, oid?: number): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'NULL';
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) {
    // ISO format, assume timestamptz
    return `'${value.toISOString()}'::timestamptz`;
  }
  if (oid && JSON_OIDS.has(oid)) {
    try {
      const obj = typeof value === 'string' ? JSON.parse(value) : value;
      return `'${JSON.stringify(obj).replace(/'/g, "''")}'::jsonb`;
    } catch {
      // fallthrough
    }
  }
  if (oid && BYTEA_OIDS.has(oid)) {
    // Accept either \x... or base64 strings. Otherwise just escape.
    return `'${String(value).replace(/'/g, "''")}'`;
  }
  // String (or anything else coerced to string)
  return `'${String(value).replace(/'/g, "''")}'`;
}

export interface ColumnLike {
  name: string;
  dataTypeID: number;
}

export interface PendingCellEdit {
  pkValues: Record<string, unknown>; // primary key columns → values
  column: string;
  oldValue: unknown;
  newValue: unknown;
  dataTypeID: number;
}

/**
 * Build an UPDATE statement for a single cell change. Returns null if no primary
 * key info is available to form a safe WHERE clause.
 */
export function buildUpdateSql(
  schema: string,
  table: string,
  edit: PendingCellEdit,
  primaryKeys: string[]
): string | null {
  if (primaryKeys.length === 0) return null;
  const setClause = `${quoteIdent(edit.column)} = ${valueToSqlLiteral(edit.newValue, edit.dataTypeID)}`;
  const whereClause = primaryKeys
    .map((pk) => {
      const v = edit.pkValues[pk];
      if (v === null || v === undefined) {
        return `${quoteIdent(pk)} IS NULL`;
      }
      return `${quoteIdent(pk)} = ${valueToSqlLiteral(v)}`;
    })
    .join(' AND ');
  return `UPDATE ${quoteIdent(schema)}.${quoteIdent(table)} SET ${setClause} WHERE ${whereClause}`;
}

/**
 * Group cell edits by row (pk) and emit at most one UPDATE per row.
 * This keeps the generated SQL compact.
 */
export function buildRowUpdates(
  schema: string,
  table: string,
  edits: PendingCellEdit[],
  primaryKeys: string[]
): string[] {
  const byRow = new Map<string, { pkValues: Record<string, unknown>; columnEdits: PendingCellEdit[] }>();
  for (const e of edits) {
    const k = primaryKeys.map((pk) => `${pk}=${JSON.stringify(e.pkValues[pk])}`).join('|');
    let entry = byRow.get(k);
    if (!entry) {
      entry = { pkValues: e.pkValues, columnEdits: [] };
      byRow.set(k, entry);
    }
    entry.columnEdits.push(e);
  }
  const out: string[] = [];
  for (const { pkValues, columnEdits } of byRow.values()) {
    if (primaryKeys.length === 0) continue;
    const setClause = columnEdits
      .map((c) => `${quoteIdent(c.column)} = ${valueToSqlLiteral(c.newValue, c.dataTypeID)}`)
      .join(', ');
    const whereClause = primaryKeys
      .map((pk) => {
        const v = pkValues[pk];
        if (v === null || v === undefined) {
          return `${quoteIdent(pk)} IS NULL`;
        }
        return `${quoteIdent(pk)} = ${valueToSqlLiteral(v)}`;
      })
      .join(' AND ');
    out.push(`UPDATE ${quoteIdent(schema)}.${quoteIdent(table)} SET ${setClause} WHERE ${whereClause}`);
  }
  return out;
}
