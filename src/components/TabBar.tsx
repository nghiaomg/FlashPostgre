import { Box, Flex, Text, IconButton, Tooltip } from '@radix-ui/themes';
import { PlusIcon, Cross1Icon } from '@radix-ui/react-icons';
import { useState, useRef, useEffect } from 'react';
import type { Tab } from '@/hooks/useTabs';

interface Props {
  tabs: Tab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAddQuery: () => void;
  onRename: (id: string, title: string) => void;
}

function EditableTabTitle({ title, onRename }: { title: string; onRename: (t: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(title); }, [title]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed) onRename(trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(title); setEditing(false); }
        }}
        style={{
          background: 'var(--color-panel-solid)',
          border: '1px solid var(--accent-8)',
          borderRadius: 3,
          padding: '1px 4px',
          fontSize: 12,
          color: 'var(--gray-12)',
          outline: 'none',
          width: 100,
        }}
      />
    );
  }

  return (
    <Text
      size="1"
      weight="medium"
      title="Double-click to rename"
      onDoubleClick={() => setEditing(true)}
      style={{ cursor: 'text', userSelect: 'none', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
    >
      {title}
    </Text>
  );
}

export function TabBar({ tabs, activeId, onSelect, onClose, onAddQuery, onRename }: Props) {
  if (tabs.length === 0) {
    return <Box className="fp-tabs" />;
  }
  return (
    <Flex className="fp-tabs" align="center" gap="1">
      {tabs.map((t) => (
        <Flex
          key={t.id}
          className="fp-tab"
          data-active={t.id === activeId}
          align="center"
          gap="1"
          onClick={() => onSelect(t.id)}
        >
          <EditableTabTitle title={t.title} onRename={(title) => onRename(t.id, title)} />
          <IconButton
            size="1"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onClose(t.id);
            }}
            aria-label="Close tab"
          >
            <Cross1Icon />
          </IconButton>
        </Flex>
      ))}
      <Tooltip content="New query tab">
        <IconButton size="1" variant="ghost" onClick={onAddQuery}>
          <PlusIcon />
        </IconButton>
      </Tooltip>
    </Flex>
  );
}
