import { Dialog, Flex, Text, TextField, Button, Select, TextArea, Callout, Tabs, Box, Checkbox, Spinner } from '@radix-ui/themes';
import { ExclamationTriangleIcon, CheckIcon, PlusIcon } from '@radix-ui/react-icons';
import { useEffect, useState, useMemo } from 'react';
import type { ColumnInfo } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string;
  schema: string;
  table: string;
  columns: ColumnInfo[];
  onInserted: () => void;
}

export function AddRowDialog({ open, onOpenChange, connectionId, schema, table, columns, onInserted }: Props) {
  const [activeTab, setActiveTab] = useState<'form' | 'json' | 'sql'>('form');
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [enabledFields, setEnabledFields] = useState<Record<string, boolean>>({});
  const [jsonText, setJsonText] = useState('');
  const [sqlText, setSqlText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const initialForm: Record<string, string> = {};
      const initialEnabled: Record<string, boolean> = {};
      const jsonInitObj: Record<string, any> = {};

      for (const col of columns) {
        const name = col.column_name;
        // Bỏ qua các cột tự tăng (serial) hoặc có giá trị mặc định bằng cách tắt checkbox mặc định
        const hasDefault = col.column_default !== null || col.data_type.toLowerCase().includes('serial');
        initialEnabled[name] = !hasDefault;

        if (col.data_type.toLowerCase().includes('bool')) {
          initialForm[name] = 'true';
        } else {
          initialForm[name] = '';
        }

        if (!hasDefault) {
          if (col.data_type.toLowerCase().includes('bool')) {
            jsonInitObj[name] = true;
          } else if (
            col.data_type.toLowerCase().includes('int') ||
            col.data_type.toLowerCase().includes('num') ||
            col.data_type.toLowerCase().includes('double') ||
            col.data_type.toLowerCase().includes('float') ||
            col.data_type.toLowerCase().includes('real')
          ) {
            jsonInitObj[name] = null;
          } else {
            jsonInitObj[name] = '';
          }
        }
      }

      setFormData(initialForm);
      setEnabledFields(initialEnabled);
      setJsonText(JSON.stringify(jsonInitObj, null, 2));
      setActiveTab('form');
      setError(null);
      setLoading(false);
    }
  }, [open, columns]);

  const formSql = useMemo(() => {
    return buildInsertSql(schema, table, columns, formData, enabledFields);
  }, [schema, table, columns, formData, enabledFields]);

  const jsonSql = useMemo(() => {
    try {
      const parsed = JSON.parse(jsonText);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return '-- JSON must be a single non-null object';
      }

      const data: Record<string, string> = {};
      const enabled: Record<string, boolean> = {};

      for (const col of columns) {
        const name = col.column_name;
        if (name in parsed) {
          const val = parsed[name];
          data[name] = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '');
          enabled[name] = true;
        } else {
          enabled[name] = false;
        }
      }
      return buildInsertSql(schema, table, columns, data, enabled);
    } catch (e: any) {
      return `-- Invalid JSON syntax: ${e.message}`;
    }
  }, [schema, table, columns, jsonText]);

  const jsonError = useMemo(() => {
    if (jsonSql.startsWith('-- Invalid JSON syntax')) {
      return jsonSql.replace('-- Invalid JSON syntax: ', '');
    }
    if (jsonSql.startsWith('-- JSON must be')) {
      return jsonSql.replace('-- ', '');
    }
    return null;
  }, [jsonSql]);

  const handleTabChange = (tab: string) => {
    const nextTab = tab as 'form' | 'json' | 'sql';
    if (nextTab === 'sql') {
      if (activeTab === 'form') {
        setSqlText(formSql);
      } else if (activeTab === 'json') {
        setSqlText(jsonSql.startsWith('--') ? '' : jsonSql);
      }
    }
    setActiveTab(nextTab);
  };

  const handleSave = async () => {
    setError(null);
    setLoading(true);

    let sqlToRun = '';
    if (activeTab === 'form') {
      sqlToRun = formSql;
    } else if (activeTab === 'json') {
      if (jsonError) {
        setError('Cannot insert: Invalid JSON syntax.');
        setLoading(false);
        return;
      }
      sqlToRun = jsonSql;
    } else if (activeTab === 'sql') {
      sqlToRun = sqlText;
    }

    if (!sqlToRun || sqlToRun.trim() === '' || sqlToRun.startsWith('--')) {
      setError('Cannot insert: Empty or invalid SQL statement.');
      setLoading(false);
      return;
    }

    try {
      const res = await window.flashpostgre.query.run(connectionId, sqlToRun);
      if (res.ok) {
        onInserted();
        onOpenChange(false);
      } else {
        setError(res.error ?? 'Failed to insert row.');
      }
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="650px" style={{ display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}>
        <Dialog.Title>Add new row</Dialog.Title>
        <Dialog.Description size="2" mb="3" color="gray">
          Add a row to <b>{schema}.{table}</b>. Choose form fields, write raw JSON, or customize the SQL statement.
        </Dialog.Description>

        {error && (
          <Box mb="3">
            <Callout.Root color="red" size="1">
              <Callout.Icon>
                <ExclamationTriangleIcon />
              </Callout.Icon>
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          </Box>
        )}

        <Tabs.Root value={activeTab} onValueChange={handleTabChange} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Tabs.List>
            <Tabs.Trigger value="form">Form fields</Tabs.Trigger>
            <Tabs.Trigger value="json">Raw JSON</Tabs.Trigger>
            <Tabs.Trigger value="sql">SQL statement</Tabs.Trigger>
          </Tabs.List>

          <Box pt="3" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <Tabs.Content value="form">
              <Flex direction="column" gap="2" px="1">
                {columns.map((col) => {
                  const name = col.column_name;
                  const isEnabled = enabledFields[name];
                  const isBool = col.data_type.toLowerCase().includes('bool');
                  const isNum = col.data_type.toLowerCase().includes('int') ||
                                col.data_type.toLowerCase().includes('num') ||
                                col.data_type.toLowerCase().includes('double') ||
                                col.data_type.toLowerCase().includes('float') ||
                                col.data_type.toLowerCase().includes('real');

                  return (
                    <Flex key={name} gap="3" align="center" py="1" style={{ borderBottom: '1px solid var(--gray-a3)' }}>
                      <Flex align="center" gap="2" style={{ width: '220px', minWidth: '220px' }}>
                        <Checkbox
                          checked={isEnabled}
                          onCheckedChange={(checked) => {
                            setEnabledFields((prev) => ({ ...prev, [name]: !!checked }));
                          }}
                        />
                        <Flex direction="column">
                          <Text size="2" weight="medium" style={{ wordBreak: 'break-all' }}>{name}</Text>
                          <Text size="1" color="gray">{col.data_type}</Text>
                        </Flex>
                      </Flex>

                      <Box style={{ flex: 1 }}>
                        {isBool ? (
                          <Select.Root
                            disabled={!isEnabled}
                            value={formData[name] ?? 'true'}
                            onValueChange={(v) => {
                              setFormData((prev) => ({ ...prev, [name]: v }));
                            }}
                          >
                            <Select.Trigger style={{ width: '100%' }} />
                            <Select.Content>
                              <Select.Item value="true">true</Select.Item>
                              <Select.Item value="false">false</Select.Item>
                              <Select.Item value="NULL">NULL</Select.Item>
                            </Select.Content>
                          </Select.Root>
                        ) : (
                          <TextField.Root
                            disabled={!isEnabled}
                            placeholder={col.column_default ? `DEFAULT (${col.column_default})` : col.is_nullable === 'YES' ? 'NULL' : 'No default'}
                            type={isNum ? 'number' : 'text'}
                            value={formData[name] ?? ''}
                            onChange={(e) => {
                              setFormData((prev) => ({ ...prev, [name]: e.target.value }));
                            }}
                          />
                        )}
                      </Box>
                    </Flex>
                  );
                })}
              </Flex>
            </Tabs.Content>

            <Tabs.Content value="json" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <TextArea
                placeholder="{}"
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '12px',
                  flex: 1,
                  minHeight: '260px',
                }}
              />
              {jsonError && (
                <Text size="1" color="tomato" mt="1">
                  JSON error: {jsonError}
                </Text>
              )}
            </Tabs.Content>

            <Tabs.Content value="sql" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <TextArea
                placeholder="INSERT INTO ..."
                value={sqlText}
                onChange={(e) => setSqlText(e.target.value)}
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '12px',
                  flex: 1,
                  minHeight: '260px',
                }}
              />
              <Text size="1" color="gray" mt="1">
                You can edit this SQL insert statement directly.
              </Text>
            </Tabs.Content>
          </Box>
        </Tabs.Root>

        <Flex gap="2" mt="4" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray" disabled={loading}>
              Cancel
            </Button>
          </Dialog.Close>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? <Spinner size="1" /> : <PlusIcon />} Save row
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function buildInsertSql(
  schema: string,
  table: string,
  columns: ColumnInfo[],
  data: Record<string, string>,
  enabled: Record<string, boolean>
): string {
  const insertCols: string[] = [];
  const insertVals: string[] = [];

  for (const col of columns) {
    const colName = col.column_name;
    if (!enabled[colName]) continue;

    const val = data[colName];
    insertCols.push(`"${colName}"`);
    insertVals.push(formatSqlValue(val, col.data_type));
  }

  if (insertCols.length === 0) {
    return `INSERT INTO "${schema}"."${table}" DEFAULT VALUES;`;
  }

  return `INSERT INTO "${schema}"."${table}" (${insertCols.join(', ')})\nVALUES (${insertVals.join(', ')});`;
}

function formatSqlValue(val: string, dataType: string): string {
  if (val === '' || val === null || val === undefined || val.toUpperCase() === 'NULL') {
    return 'NULL';
  }

  const type = dataType.toLowerCase();

  if (type.includes('bool')) {
    return val === 'true' || val === 't' || val === '1' ? 'true' : 'false';
  }

  if (
    type.includes('int') ||
    type.includes('num') ||
    type.includes('double') ||
    type.includes('float') ||
    type.includes('real') ||
    type.includes('dec')
  ) {
    const num = Number(val);
    return isNaN(num) ? 'NULL' : String(num);
  }

  if (type.includes('json')) {
    const escaped = val.replace(/'/g, "''");
    return `'${escaped}'::${type}`;
  }

  const escaped = val.replace(/'/g, "''");
  return `'${escaped}'`;
}
