import { Dialog, Flex, Text, TextField, Button, Select, TextArea, Callout, Tabs, Badge, Box } from '@radix-ui/themes';
import { ExclamationTriangleIcon, CheckIcon, CopyIcon, EyeClosedIcon, EyeOpenIcon } from '@radix-ui/react-icons';
import { useEffect, useState } from 'react';
import type { ConnectionConfig, Environment } from '@/types';
import { parsePostgresUrl, urlToConfig, configToUrl } from '@/lib/postgresUrl';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (cfg: ConnectionConfig) => void;
  initial?: ConnectionConfig | null;
}

const empty: ConnectionConfig = {
  id: '',
  name: '',
  host: 'localhost',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: '',
  ssl: false,
  env: 'local',
  envLabel: undefined,
  color: undefined,
  connectionTimeoutMillis: 5000,
  statementTimeout: 30000,
};

function makeId() {
  return `conn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const ENV_OPTIONS: Array<{ value: Environment; label: string; color: string; hint: string }> = [
  { value: 'local', label: 'Local', color: 'var(--gray-9)', hint: 'localhost / docker' },
  { value: 'dev', label: 'Dev', color: 'var(--green-9)', hint: 'development server' },
  { value: 'staging', label: 'Staging', color: 'var(--amber-9)', hint: 'pre-prod mirror' },
  { value: 'prod', label: 'Production', color: 'var(--red-9)', hint: 'live data — be careful' },
  { value: 'custom', label: 'Custom', color: 'var(--indigo-9)', hint: 'custom environment' },
];

export function ConnectionDialog({ open, onOpenChange, onSaved, initial }: Props) {
  const [form, setForm] = useState<ConnectionConfig>(empty);
  const [mode, setMode] = useState<'form' | 'url'>('form');
  const [urlDraft, setUrlDraft] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const next = initial
        ? { ...empty, ...initial }
        : { ...empty, id: makeId() };
      setForm(next);
      setUrlDraft(configToUrl(next, false));
      setMode('form');
      setTestStatus('idle');
      setTestMessage('');
      setShowPassword(false);
    }
  }, [open, initial]);

  const update = <K extends keyof ConnectionConfig>(key: K, value: ConnectionConfig[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const switchMode = (next: 'form' | 'url') => {
    if (next === 'url' && mode === 'form') {
      setUrlDraft(configToUrl(form, false));
    } else if (next === 'form' && mode === 'url') {
      const parsed = urlToConfig(urlDraft, form);
      if (!('error' in parsed)) setForm(parsed.config);
    }
    setMode(next);
  };

  const handleTest = async () => {
    setTestStatus('testing');
    setTestMessage('');
    const cfg = mode === 'url' ? buildConfigFromUrl(urlDraft, form) : form;
    if ('error' in cfg) {
      setTestStatus('fail');
      setTestMessage(cfg.error);
      return;
    }
    const res = await window.flashpostgre.connection.test(cfg);
    if (res.ok) {
      setTestStatus('ok');
      setTestMessage(res.serverVersion ?? 'Connection successful');
    } else {
      setTestStatus('fail');
      setTestMessage(res.error ?? 'Connection failed');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const cfg = mode === 'url' ? buildConfigFromUrl(urlDraft, form) : form;
    if ('error' in cfg) {
      setTestStatus('fail');
      setTestMessage(cfg.error);
      setSaving(false);
      return;
    }
    onSaved(cfg);
    setSaving(false);
  };

  const copyUrl = async () => {
    const url = mode === 'url' ? urlDraft : configToUrl(form, true);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // ignore
    }
  };

  const envMeta = ENV_OPTIONS.find((e) => e.value === form.env)!;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="560px">
        <Dialog.Title>{initial ? 'Edit connection' : 'New connection'}</Dialog.Title>
        <Dialog.Description size="2" mb="3" color="gray">
          {initial
            ? 'Update this connection profile.'
            : 'Save a connection profile. You can connect right after saving.'}
        </Dialog.Description>

        <Flex direction="column" gap="3">
          <Flex direction="column" gap="1">
            <Text as="label" size="2" weight="medium">
              Name
            </Text>
            <TextField.Root
              placeholder="Staging — orders"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
            />
          </Flex>

          <Flex gap="3" align="end">
            <Flex direction="column" gap="1" style={{ flex: 1 }}>
              <Text as="label" size="2" weight="medium">
                Environment
              </Text>
              <Select.Root
                value={form.env}
                onValueChange={(v) => update('env', v as Environment)}
              >
                <Select.Trigger style={{ width: '100%' }} />
                <Select.Content>
                  {ENV_OPTIONS.map((e) => (
                    <Select.Item key={e.value} value={e.value}>
                      {e.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Flex>
            <Badge
              color="gray"
              size="2"
              style={{
                color: envMeta.color,
                borderColor: envMeta.color,
                background: 'transparent',
              }}
            >
              <Box style={{ width: 8, height: 8, borderRadius: 8, background: envMeta.color, marginRight: 6 }} />
              {envMeta.hint}
            </Badge>
          </Flex>

          {form.env === 'custom' && (
            <Flex gap="3">
              <Flex direction="column" gap="1" style={{ flex: 1 }}>
                <Text as="label" size="2" weight="medium">
                  Custom label
                </Text>
                <TextField.Root
                  placeholder="qa / sandbox / shadow"
                  value={form.envLabel ?? ''}
                  onChange={(e) => update('envLabel', e.target.value)}
                />
              </Flex>
              <Flex direction="column" gap="1" style={{ width: 140 }}>
                <Text as="label" size="2" weight="medium">
                  Color
                </Text>
                <input
                  type="color"
                  value={form.color ?? '#7c8aa0'}
                  onChange={(e) => update('color', e.target.value)}
                  style={{
                    width: '100%',
                    height: 30,
                    background: 'transparent',
                    border: '1px solid var(--gray-a5)',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                />
              </Flex>
            </Flex>
          )}

          <Tabs.Root value={mode} onValueChange={(v) => switchMode(v as 'form' | 'url')}>
            <Tabs.List>
              <Tabs.Trigger value="form">Form</Tabs.Trigger>
              <Tabs.Trigger value="url">Connection URL</Tabs.Trigger>
            </Tabs.List>

            <Box pt="3">
              <Tabs.Content value="form">
                <Flex direction="column" gap="3">
                  <Flex gap="3">
                    <Flex direction="column" gap="1" style={{ flex: 2 }}>
                      <Text as="label" size="2" weight="medium">
                        Host
                      </Text>
                      <TextField.Root
                        value={form.host}
                        onChange={(e) => update('host', e.target.value)}
                      />
                    </Flex>
                    <Flex direction="column" gap="1" style={{ width: 110 }}>
                      <Text as="label" size="2" weight="medium">
                        Port
                      </Text>
                      <TextField.Root
                        type="number"
                        value={form.port}
                        onChange={(e) => update('port', parseInt(e.target.value, 10) || 5432)}
                      />
                    </Flex>
                  </Flex>

                  <Flex direction="column" gap="1">
                    <Text as="label" size="2" weight="medium">
                      Database
                    </Text>
                    <TextField.Root
                      value={form.database}
                      onChange={(e) => update('database', e.target.value)}
                    />
                  </Flex>

                  <Flex gap="3">
                    <Flex direction="column" gap="1" style={{ flex: 1 }}>
                      <Text as="label" size="2" weight="medium">
                        User
                      </Text>
                      <TextField.Root
                        value={form.user}
                        onChange={(e) => update('user', e.target.value)}
                      />
                    </Flex>
                    <Flex direction="column" gap="1" style={{ flex: 1 }}>
                      <Flex align="center" justify="between">
                        <Text as="label" size="2" weight="medium">
                          Password
                        </Text>
                        <Button
                          size="1"
                          variant="ghost"
                          type="button"
                          onClick={() => setShowPassword((s) => !s)}
                        >
                          {showPassword ? <EyeClosedIcon /> : <EyeOpenIcon />}
                        </Button>
                      </Flex>
                      <TextField.Root
                        type={showPassword ? 'text' : 'password'}
                        value={form.password}
                        onChange={(e) => update('password', e.target.value)}
                      />
                    </Flex>
                  </Flex>

                  <Flex gap="3">
                    <Flex direction="column" gap="1" style={{ flex: 1 }}>
                      <Text as="label" size="2" weight="medium">
                        SSL
                      </Text>
                      <Select.Root
                        value={String(form.ssl ?? false)}
                        onValueChange={(v) =>
                          update('ssl', v === 'true' ? true : v === 'require' ? 'require' : false)
                        }
                      >
                        <Select.Trigger style={{ width: '100%' }} />
                        <Select.Content>
                          <Select.Item value="false">Disabled</Select.Item>
                          <Select.Item value="true">Prefer</Select.Item>
                          <Select.Item value="require">Require</Select.Item>
                        </Select.Content>
                      </Select.Root>
                    </Flex>
                    <Flex direction="column" gap="1" style={{ flex: 1 }}>
                      <Text as="label" size="2" weight="medium">
                        Timeout (ms)
                      </Text>
                      <TextField.Root
                        type="number"
                        value={form.connectionTimeoutMillis ?? 5000}
                        onChange={(e) =>
                          update('connectionTimeoutMillis', parseInt(e.target.value, 10) || 5000)
                        }
                      />
                    </Flex>
                  </Flex>
                </Flex>
              </Tabs.Content>

              <Tabs.Content value="url">
                <Flex direction="column" gap="2">
                  <Text as="label" size="2" weight="medium">
                    Paste a postgres:// URL
                  </Text>
                  <TextArea
                    rows={4}
                    placeholder="postgresql://user:password@host:5432/database?sslmode=require"
                    value={urlDraft}
                    onChange={(e) => setUrlDraft(e.target.value)}
                    style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
                  />
                  <Flex justify="end">
                    <Button size="1" variant="ghost" onClick={copyUrl}>
                      <CopyIcon /> Copy URL (with password)
                    </Button>
                  </Flex>
                  <Text size="1" color="gray">
                    Switching back to <b>Form</b> will populate the form fields from this URL.
                  </Text>
                </Flex>
              </Tabs.Content>
            </Box>
          </Tabs.Root>

          {testStatus !== 'idle' && (
            <Callout.Root
              color={testStatus === 'ok' ? 'green' : testStatus === 'fail' ? 'red' : 'gray'}
              size="1"
            >
              <Callout.Text>
                {testStatus === 'testing' && 'Testing connection…'}
                {testStatus === 'ok' && testMessage}
                {testStatus === 'fail' && testMessage}
              </Callout.Text>
            </Callout.Root>
          )}
        </Flex>

        <Flex gap="2" mt="4" justify="between">
          <Button variant="soft" onClick={handleTest} disabled={testStatus === 'testing'}>
            {testStatus === 'testing' ? 'Testing…' : 'Test connection'}
          </Button>
          <Flex gap="2">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </Dialog.Close>
            <Button onClick={handleSave} disabled={saving || !form.name}>
              {initial ? 'Save changes' : 'Save & connect'}
            </Button>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function buildConfigFromUrl(
  url: string,
  base: ConnectionConfig
): ConnectionConfig | { error: string } {
  const parsed = urlToConfig(url, base);
  if ('error' in parsed) return { error: parsed.error };
  return parsed.config;
}
