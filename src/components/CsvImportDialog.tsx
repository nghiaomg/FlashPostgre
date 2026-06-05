import { Dialog, Flex, Text, Button, Select, TextArea, Callout, Spinner, Box, Tabs, Badge, Progress } from '@radix-ui/themes';
import { UploadIcon, ExclamationTriangleIcon, CheckIcon } from '@radix-ui/react-icons';
import { useEffect, useState, useRef, useMemo } from 'react';
import type { ColumnInfo } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string;
  schema: string;
  table: string;
  columns: ColumnInfo[];
  onImported: () => void;
}

type Step = 'upload' | 'map' | 'importing' | 'done';

interface ColumnMapping {
  csvCol: string;
  tableCol: string | null; // null = skip
}

interface ImportResult {
  ok: boolean;
  inserted: number;
  errors: string[];
}

export function CsvImportDialog({ open, onOpenChange, connectionId, schema, table, columns, onImported }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [rawCsv, setRawCsv] = useState('');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping[]>([]);
  const [batchSize, setBatchSize] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStep('upload');
      setFileName('');
      setRawCsv('');
      setCsvHeaders([]);
      setCsvRows([]);
      setMapping([]);
      setError(null);
      setResult(null);
      setProgress(0);
    }
  }, [open]);

  const parseCsv = (text: string): { headers: string[]; rows: string[][] } => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };

    const parseRow = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseRow(lines[0]);
    const rows = lines.slice(1).map(parseRow);
    return { headers, rows };
  };

  const handleFileSelect = (text: string, name: string) => {
    const { headers, rows } = parseCsv(text);
    if (headers.length === 0) {
      setError('CSV appears to be empty.');
      return;
    }

    setFileName(name);
    setRawCsv(text);
    setCsvHeaders(headers);
    setCsvRows(rows);

    // Auto-map by column name similarity
    const autoMap: ColumnMapping[] = headers.map((h) => {
      const match = columns.find(
        (c) => c.column_name.toLowerCase() === h.toLowerCase()
      );
      return { csvCol: h, tableCol: match ? match.column_name : null };
    });
    setMapping(autoMap);
    setStep('map');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
      const reader = new FileReader();
      reader.onload = () => handleFileSelect(String(reader.result), file.name);
      reader.readAsText(file);
    } else {
      setError('Please drop a .csv file.');
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => handleFileSelect(String(reader.result), file.name);
      reader.readAsText(file);
    }
  };

  const selectedCols = mapping.filter((m) => m.tableCol !== null);

  const generateInserts = useMemo(() => {
    if (selectedCols.length === 0) return [];
    const colMap = new Map(mapping.map((m) => [m.csvCol, m.tableCol!]));
    const tableColNames = selectedCols.map((m) => m.tableCol!);
    const tableColsMeta = columns.filter((c) => tableColNames.includes(c.column_name));

    return csvRows.map((row) => {
      const vals = selectedCols.map(({ tableCol }) => {
        const csvIdx = mapping.find((m) => m.tableCol === tableCol)!.csvCol;
        const headerIdx = csvHeaders.indexOf(csvIdx);
        const raw = headerIdx >= 0 ? (row[headerIdx] ?? '') : '';
        const colMeta = tableColsMeta.find((c) => c.column_name === tableCol)!;
        return formatCsvValue(raw, colMeta);
      });
      return `INSERT INTO "${schema}"."${table}" (${tableColNames.map((n) => `"${n}"`).join(', ')}) VALUES (${vals.join(', ')});`;
    });
  }, [csvRows, mapping, csvHeaders, columns, schema, table]);

  const handleImport = async () => {
    setLoading(true);
    setProgress(0);
    setError(null);
    setResult({ ok: true, inserted: 0, errors: [] });

    const total = generateInserts.length;
    let inserted = 0;
    const errors: string[] = [];

    for (let i = 0; i < total; i += batchSize) {
      const batch = generateInserts.slice(i, i + batchSize);
      const res = await window.flashpostgre.query.transaction(connectionId, batch);
      if (res.ok) {
        inserted += res.affectedCounts?.reduce((a, b) => a + b, 0) ?? batch.length;
      } else {
        errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${res.error ?? 'Unknown error'}`);
      }
      setProgress(Math.round(((i + batch.length) / total) * 100));
    }

    setResult({ ok: errors.length === 0, inserted, errors });
    setStep('done');
    setLoading(false);
  };

  const previewRows = csvRows.slice(0, 5);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="720px" style={{ display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}>
        <Dialog.Title>Import CSV → {schema}.{table}</Dialog.Title>
        <Dialog.Description size="2" mb="3" color="gray">
          Map CSV columns to table columns and import in a single transaction.
        </Dialog.Description>

        {error && (
          <Box mb="3">
            <Callout.Root color="red" size="1">
              <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          </Box>
        )}

        <Box style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {step === 'upload' && (
            <Box
              style={{
                border: `2px dashed ${isDragging ? 'var(--accent-9)' : 'var(--gray-a6)'}`,
                borderRadius: 8,
                padding: '40px 24px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadIcon width={32} height={32} color="var(--gray-8)" style={{ marginBottom: 8 }} />
              <Text size="2" color="gray">Drop a CSV file here, or click to browse</Text>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={handleFileInput}
              />
            </Box>
          )}

          {step === 'map' && (
            <Flex direction="column" gap="3">
              <Flex align="center" gap="2">
                <Badge variant="soft" size="2">{fileName}</Badge>
                <Text size="1" color="gray">{csvRows.length} rows detected</Text>
                <Button size="1" variant="ghost" ml="auto" onClick={() => setStep('upload')}>Change file</Button>
              </Flex>

              {/* Mapping table */}
              <Box className="fp-codeblock" style={{ maxHeight: 280, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--gray-a4)' }}>
                      <th style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--gray-9)', fontWeight: 500 }}>CSV Column</th>
                      <th style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--gray-9)', fontWeight: 500 }}>→ Table Column</th>
                      <th style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--gray-9)', fontWeight: 500 }}>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapping.map((m) => {
                      const colMeta = m.tableCol ? columns.find((c) => c.column_name === m.tableCol) : null;
                      return (
                        <tr key={m.csvCol} style={{ borderBottom: '1px solid var(--gray-a2)' }}>
                          <td style={{ padding: '4px 8px', fontFamily: 'JetBrains Mono, monospace' }}>{m.csvCol}</td>
                          <td style={{ padding: '4px 4px' }}>
                            <Select.Root
                              value={m.tableCol ?? '__skip__'}
                              onValueChange={(v) => {
                                setMapping((prev) =>
                                  prev.map((x) =>
                                    x.csvCol === m.csvCol
                                      ? { ...x, tableCol: v === '__skip__' ? null : v }
                                      : x
                                  )
                                );
                              }}
                            >
                              <Select.Trigger style={{ fontSize: 12 }} />
                              <Select.Content>
                                <Select.Item value="__skip__">— skip —</Select.Item>
                                {columns.map((c) => (
                                  <Select.Item key={c.column_name} value={c.column_name}>
                                    {c.column_name}
                                  </Select.Item>
                                ))}
                              </Select.Content>
                            </Select.Root>
                          </td>
                          <td style={{ padding: '4px 8px', color: 'var(--gray-9)', fontSize: 11 }}>
                            {colMeta ? colMeta.data_type : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Box>

              {/* Preview */}
              {previewRows.length > 0 && (
                <Box>
                  <Text size="1" weight="medium" mb="1">Preview (first {previewRows.length} rows)</Text>
                  <Box className="fp-codeblock" style={{ maxHeight: 160, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--gray-a4)' }}>
                          {csvHeaders.map((h) => (
                            <th key={h} style={{ padding: '3px 6px', textAlign: 'left', color: 'var(--gray-9)', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--gray-a2)' }}>
                            {row.map((cell, j) => (
                              <td key={j} style={{ padding: '3px 6px', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Box>
                </Box>
              )}

              <Flex align="center" gap="3">
                <Text size="1" color="gray">Batch size</Text>
                <Select.Root value={String(batchSize)} onValueChange={(v) => setBatchSize(parseInt(v, 10))}>
                  <Select.Trigger style={{ fontSize: 12 }} />
                  <Select.Content>
                    {[10, 50, 100, 250, 500].map((n) => (
                      <Select.Item key={n} value={String(n)}>{n} rows / transaction</Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
                <Text size="1" color="gray">{generateInserts.length} INSERT statements will run</Text>
              </Flex>
            </Flex>
          )}

          {step === 'importing' && (
            <Flex direction="column" align="center" gap="3" py="6">
              <Spinner size="3" />
              <Text size="2">Importing…</Text>
              <Progress value={progress} style={{ width: '60%' }} />
              <Text size="1" color="gray">{progress}%</Text>
            </Flex>
          )}

          {step === 'done' && result && (
            <Flex direction="column" gap="3" py="2">
              <Callout.Root color={result.ok ? 'green' : 'amber'} size="2">
                <Callout.Icon>{result.ok ? <CheckIcon /> : <ExclamationTriangleIcon />}</Callout.Icon>
                <Callout.Text>
                  {result.ok
                    ? `Successfully inserted ${result.inserted} row${result.inserted === 1 ? '' : 's'}.`
                    : `Inserted ${result.inserted} row${result.inserted === 1 ? '' : 's'}, but ${result.errors.length} batch(es) failed.`}
                </Callout.Text>
              </Callout.Root>
              {result.errors.length > 0 && (
                <Box className="fp-codeblock" style={{ maxHeight: 200 }}>
                  <Text size="1" color="red" weight="medium" mb="1">Errors:</Text>
                  {result.errors.map((e, i) => (
                    <Text key={i} size="1" style={{ display: 'block', color: 'var(--red-11)' }}>{e}</Text>
                  ))}
                </Box>
              )}
            </Flex>
          )}
        </Box>

        <Flex gap="2" mt="4" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray" disabled={loading}>
              {step === 'done' ? 'Close' : 'Cancel'}
            </Button>
          </Dialog.Close>
          {step === 'map' && (
            <Button
              onClick={() => {
                if (selectedCols.length === 0) {
                  setError('Map at least one CSV column to a table column.');
                  return;
                }
                setStep('importing');
                handleImport();
              }}
              disabled={loading}
            >
              Import {generateInserts.length} rows
            </Button>
          )}
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function formatCsvValue(raw: string, col: ColumnInfo): string {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed.toUpperCase() === 'NULL') return 'NULL';
  const type = col.data_type.toLowerCase();
  if (type.includes('bool')) return trimmed === '1' || /^(true|t|y|yes)$/i.test(trimmed) ? 'TRUE' : 'FALSE';
  if (type.includes('int') || type.includes('num') || type.includes('double') || type.includes('float') || type.includes('dec') || type.includes('real')) {
    const n = Number(trimmed);
    return Number.isNaN(n) ? 'NULL' : String(n);
  }
  return `'${trimmed.replace(/'/g, "''")}'`;
}
