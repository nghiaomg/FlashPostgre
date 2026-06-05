import { Dialog, Flex, Text, TextField, Button, TextArea, Select } from '@radix-ui/themes';
import { useEffect, useState } from 'react';
import type { Snippet } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Snippet | null;
  /** SQL to prefill when saving a new snippet from the current query. */
  defaultSql?: string;
  onSave: (snippet: Snippet) => void;
}

function makeId() {
  return `snip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const FOLDER_OPTIONS = ['schema', 'monitor', 'debug', 'migration', 'data', 'general'];

export function SnippetDialog({ open, onOpenChange, initial, defaultSql, onSave }: Props) {
  const [form, setForm] = useState<Snippet>({
    id: '',
    name: '',
    folder: 'general',
    sql: '',
    description: '',
    createdAt: 0,
    updatedAt: 0,
  });

  useEffect(() => {
    if (open) {
      if (initial) {
        setForm(initial);
      } else {
        setForm({
          id: makeId(),
          name: '',
          folder: 'general',
          sql: defaultSql ?? '',
          description: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }
  }, [open, initial, defaultSql]);

  const update = <K extends keyof Snippet>(key: K, value: Snippet[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    onSave({ ...form, updatedAt: Date.now() });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="540px">
        <Dialog.Title>{initial ? 'Edit snippet' : 'Save snippet'}</Dialog.Title>
        <Dialog.Description size="2" mb="3" color="gray">
          Reusable SQL you can re-insert into any query tab.
        </Dialog.Description>

        <Flex direction="column" gap="3">
          <Flex gap="3">
            <Flex direction="column" gap="1" style={{ flex: 2 }}>
              <Text as="label" size="2" weight="medium">
                Name
              </Text>
              <TextField.Root
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="Top tables by size"
              />
            </Flex>
            <Flex direction="column" gap="1" style={{ flex: 1 }}>
              <Text as="label" size="2" weight="medium">
                Folder
              </Text>
              <Select.Root value={form.folder} onValueChange={(v) => update('folder', v)}>
                <Select.Trigger style={{ width: '100%' }} />
                <Select.Content>
                  {FOLDER_OPTIONS.map((f) => (
                    <Select.Item key={f} value={f}>
                      {f}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Flex>
          </Flex>

          <Flex direction="column" gap="1">
            <Text as="label" size="2" weight="medium">
              Description (optional)
            </Text>
            <TextField.Root
              value={form.description ?? ''}
              onChange={(e) => update('description', e.target.value)}
              placeholder="What this snippet is for"
            />
          </Flex>

          <Flex direction="column" gap="1">
            <Text as="label" size="2" weight="medium">
              SQL
            </Text>
            <TextArea
              rows={10}
              value={form.sql}
              onChange={(e) => update('sql', e.target.value)}
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
            />
          </Flex>
        </Flex>

        <Flex gap="2" mt="4" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </Dialog.Close>
          <Button onClick={handleSave} disabled={!form.name.trim()}>
            Save
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
