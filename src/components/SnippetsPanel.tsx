import { Box, Flex, Text, Heading, IconButton, TextField, Tooltip, Badge, ScrollArea } from '@radix-ui/themes';
import { PlusIcon, TrashIcon, ChevronRightIcon, ChevronDownIcon, MagnifyingGlassIcon, BookmarkIcon, CodeIcon } from '@radix-ui/react-icons';
import { useMemo, useState } from 'react';
import type { Snippet } from '@/types';

interface Props {
  snippets: Snippet[];
  onInsert: (sql: string) => void;
  onSaveCurrent?: (sql: string) => void;
  onEdit?: (snippet: Snippet) => void;
  onDelete: (id: string) => void;
  currentSql?: string;
}

export function SnippetsPanel({ snippets, onInsert, onSaveCurrent, onEdit, onDelete, currentSql }: Props) {
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const matches = (s: Snippet) =>
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.sql.toLowerCase().includes(q) ||
      (s.description?.toLowerCase().includes(q) ?? false) ||
      (s.tags?.some((t) => t.toLowerCase().includes(q)) ?? false);
    const out: Record<string, Snippet[]> = {};
    for (const s of snippets.filter(matches)) {
      const k = s.folder || 'general';
      if (!out[k]) out[k] = [];
      out[k].push(s);
    }
    return out;
  }, [snippets, filter]);

  return (
    <Flex direction="column" height="100%">
      <Flex align="center" gap="1" px="2" py="2" style={{ borderBottom: '1px solid var(--gray-a4)' }}>
        <BookmarkIcon />
        <Heading size="2" weight="medium" color="gray" style={{ flex: 1 }}>
          Snippets
        </Heading>
        {onSaveCurrent && currentSql?.trim() && (
          <Tooltip content="Save current query as snippet">
            <IconButton size="1" variant="soft" onClick={() => onSaveCurrent(currentSql)}>
              <PlusIcon />
            </IconButton>
          </Tooltip>
        )}
      </Flex>
      <Flex align="center" gap="1" px="2" py="1">
        <MagnifyingGlassIcon color="var(--gray-9)" />
        <TextField.Root
          size="1"
          placeholder="Search…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ flex: 1 }}
        />
      </Flex>
      <ScrollArea style={{ flex: 1 }}>
        <Box p="1">
          {Object.keys(grouped).length === 0 && (
            <Box px="2" py="2">
              <Text size="1" color="gray">No snippets yet. Run a query and click the + button to save it.</Text>
            </Box>
          )}
          {Object.entries(grouped).map(([folder, items]) => {
            const isCollapsed = collapsed[folder];
            return (
              <Box key={folder}>
                <Flex
                  align="center"
                  gap="1"
                  px="1"
                  py="1"
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => setCollapsed((c) => ({ ...c, [folder]: !c[folder] }))}
                >
                  {isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
                  <Text size="1" weight="medium" color="gray">
                    {folder}
                  </Text>
                  <Badge size="1" color="gray" variant="soft">
                    {items.length}
                  </Badge>
                </Flex>
                {!isCollapsed &&
                  items.map((s) => (
                    <Flex
                      key={s.id}
                      align="center"
                      gap="1"
                      px="2"
                      py="1"
                      style={{ borderRadius: 4, cursor: 'pointer' }}
                      className="fp-tree-row"
                    >
                      <CodeIcon />
                      <Box style={{ flex: 1, minWidth: 0 }} onClick={() => onInsert(s.sql)}>
                        <Text size="1" weight="medium" truncate>
                          {s.name}
                        </Text>
                        {s.description && (
                          <Text size="1" color="gray" as="div" truncate>
                            {s.description}
                          </Text>
                        )}
                      </Box>
                      {onEdit && (
                        <Tooltip content="Rename / edit">
                          <IconButton
                            size="1"
                            variant="ghost"
                            onClick={() => onEdit(s)}
                          >
                            <PlusIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip content="Delete">
                        <IconButton
                          size="1"
                          variant="ghost"
                          onClick={() => onDelete(s.id)}
                        >
                          <TrashIcon />
                        </IconButton>
                      </Tooltip>
                    </Flex>
                  ))}
              </Box>
            );
          })}
        </Box>
      </ScrollArea>
    </Flex>
  );
}
