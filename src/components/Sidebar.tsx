import { Box, Flex, Heading, IconButton, Tooltip, Button } from '@radix-ui/themes';
import { PlusIcon } from '@radix-ui/react-icons';
import { ConnectionList } from './ConnectionList';
import { SidebarTree } from './SidebarTree';
import type { ConnectionConfig } from '@/types';

interface Props {
  connections: ConnectionConfig[];
  activeId: string | null;
  onConnect: (id: string) => Promise<{ ok: boolean; error?: string }>;
  onSelect: (id: string | null) => void | Promise<void>;
  onAddNew: () => void;
  onEdit: (cfg: ConnectionConfig) => void;
  onOpenTable: (schema: string, table: string) => void;
  onOpenMonitor: () => void;
}

export function Sidebar({
  connections,
  activeId,
  onConnect,
  onSelect,
  onAddNew,
  onEdit,
  onOpenTable,
  onOpenMonitor,
}: Props) {
  return (
    <Flex direction="column" height="100%">
      <Flex
        align="center"
        justify="between"
        px="3"
        py="2"
        style={{ borderBottom: '1px solid var(--gray-a4)' }}
      >
        <Heading size="2" weight="medium" color="gray">
          Connections
        </Heading>
        <Tooltip content="Add connection">
          <IconButton size="1" variant="ghost" onClick={onAddNew}>
            <PlusIcon />
          </IconButton>
        </Tooltip>
      </Flex>

      <ConnectionList
        connections={connections}
        activeId={activeId}
        onConnect={onConnect}
        onSelect={onSelect}
        onEdit={onEdit}
        onAddNew={onAddNew}
      />

      {activeId && (
        <Box
          style={{
            borderTop: '1px solid var(--gray-a4)',
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Flex align="center" justify="between" px="3" py="2" style={{ flex: '0 0 auto' }}>
            <Heading size="2" weight="medium" color="gray">
              Explorer
            </Heading>
            <Button
              size="1"
              variant="ghost"
              style={{ cursor: 'pointer' }}
              onClick={onOpenMonitor}
            >
              📈 Monitor
            </Button>
          </Flex>
          <Box style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <SidebarTree connectionId={activeId} onOpenTable={onOpenTable} />
          </Box>
        </Box>
      )}
    </Flex>
  );
}
