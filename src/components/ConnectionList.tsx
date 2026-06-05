import { Flex, IconButton, Text, Tooltip, Box, Badge, TextField } from '@radix-ui/themes';
import { DotFilledIcon, Pencil1Icon, MagnifyingGlassIcon, ChevronDownIcon, ChevronRightIcon, PlusIcon } from '@radix-ui/react-icons';
import { useMemo, useState } from 'react';
import type { ConnectionConfig, Environment } from '@/types';

interface Props {
  connections: ConnectionConfig[];
  activeId: string | null;
  onConnect: (id: string) => Promise<{ ok: boolean; error?: string }>;
  /** Optional explicit selector (used when the parent wants to set the active
   *  id without going through the connect flow, e.g. restoring a session). */
  onSelect?: (id: string | null) => void | Promise<void>;
  onEdit: (cfg: ConnectionConfig) => void;
  onAddNew?: () => void;
}

const ENV_ORDER: Environment[] = ['prod', 'staging', 'dev', 'local', 'custom'];
const ENV_COLOR: Record<Environment, string> = {
  prod: 'var(--red-9)',
  staging: 'var(--amber-9)',
  dev: 'var(--green-9)',
  local: 'var(--gray-9)',
  custom: 'var(--indigo-9)',
};
const ENV_LABEL: Record<Environment, string> = {
  prod: 'Production',
  staging: 'Staging',
  dev: 'Dev',
  local: 'Local',
  custom: 'Custom',
};

export function ConnectionList({
  connections,
  activeId,
  onConnect,
  onSelect,
  onEdit,
  onAddNew,
}: Props) {
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const matches = (c: ConnectionConfig) =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.host.toLowerCase().includes(q) ||
      c.database.toLowerCase().includes(q) ||
      c.user.toLowerCase().includes(q);
    const out: Record<string, ConnectionConfig[]> = {};
    for (const c of connections.filter(matches)) {
      const k = c.env;
      if (!out[k]) out[k] = [];
      out[k].push(c);
    }
    return out;
  }, [connections, filter]);

  // Click anywhere on a connection row → connect (with spinner). This both
  // activates the connection and triggers the explorer load, so the user
  // never lands in a "highlighted but not connected" state.
  const handleActivate = async (c: ConnectionConfig) => {
    if (c.id === activeId) return;
    if (connectingId) return; // serialize — one connect at a time
    setConnectingId(c.id);
    setError(null);
    try {
      const res = await onConnect(c.id);
      if (!res.ok) {
        setError(res.error ?? 'Connection failed');
      }
    } finally {
      setConnectingId(null);
    }
  };

  if (connections.length === 0) {
    return (
      <Box className="fp-empty-state">
        <Text size="1" mb="2">No connections yet.</Text>
        {onAddNew && (
          <IconButton size="1" variant="soft" onClick={onAddNew}>
            <PlusIcon /> New connection
          </IconButton>
        )}
      </Box>
    );
  }

  const orderedEnvs = ENV_ORDER.filter((e) => grouped[e]?.length);

  return (
    <Flex
      direction="column"
      px="2"
      py="2"
      gap="2"
      style={{
        // Cap the connections pane so the explorer below can take the remaining
        // space and scroll independently. Without this, a long list of connections
        // pushes the explorer off-screen and breaks the tree scroll.
        flex: '0 0 auto',
        maxHeight: '50%',
        minHeight: 0,
        overflowY: 'auto',
      }}
    >
      <Flex align="center" gap="1" px="1">
        <MagnifyingGlassIcon color="var(--gray-9)" />
        <TextField.Root
          size="1"
          placeholder="Filter connections…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ flex: 1 }}
        />
      </Flex>

      {error && (
        <Text size="1" color="red">
          {error}
        </Text>
      )}

      {orderedEnvs.length === 0 && (
        <Box px="2" py="1">
          <Text size="1" color="gray">No matches.</Text>
        </Box>
      )}

      {orderedEnvs.map((env) => {
        const items = grouped[env];
        const isCollapsed = collapsed[env];
        return (
          <Box key={env}>
            <Flex
              align="center"
              gap="1"
              px="1"
              py="1"
              style={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setCollapsed((c) => ({ ...c, [env]: !c[env] }))}
            >
              {isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
              <Box
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 8,
                  background: ENV_COLOR[env],
                }}
              />
              <Text size="1" weight="medium" color="gray">
                {ENV_LABEL[env]}
              </Text>
              <Badge size="1" color="gray" variant="soft">
                {items.length}
              </Badge>
            </Flex>
            {!isCollapsed && (
              <Flex direction="column" gap="1">
                {items.map((c) => {
                  const isActive = c.id === activeId;
                  const isConnecting = c.id === connectingId;
                  const isBusy = connectingId !== null && !isConnecting;
                  return (
                    <Flex
                      key={c.id}
                      align="center"
                      gap="2"
                      px="2"
                      py="1"
                      style={{
                        borderRadius: 4,
                        background: isActive
                          ? 'var(--gray-a4)'
                          : isConnecting
                            ? 'var(--accent-a3)'
                            : 'transparent',
                        cursor: isBusy
                          ? 'not-allowed'
                          : isConnecting
                            ? 'wait'
                            : 'pointer',
                        opacity: isBusy ? 0.55 : 1,
                        transition: 'background 0.12s ease, opacity 0.12s ease',
                      }}
                      onClick={() => handleActivate(c)}
                      // We still surface the explicit selector for parents that
                      // need it (e.g. restoring a session at startup).
                      onDoubleClick={() => onSelect?.(c.id)}
                    >
                      {isConnecting ? (
                        <span
                          className="fp-spinner"
                          style={{ width: 10, height: 10 }}
                        />
                      ) : (
                        <DotFilledIcon
                          width={8}
                          height={8}
                          color={isActive ? 'var(--green-9)' : 'var(--gray-8)'}
                        />
                      )}
                      <Flex direction="column" style={{ flex: 1, minWidth: 0 }}>
                        <Text size="1" weight={isActive ? 'medium' : 'regular'} truncate>
                          {c.name}
                        </Text>
                        <Text size="1" color="gray" truncate>
                          {c.host}:{c.port}/{c.database}
                        </Text>
                      </Flex>
                      {isConnecting ? (
                        <Text size="1" color="gray">
                          Connecting…
                        </Text>
                      ) : !isActive ? (
                        <Tooltip content="Click row to connect">
                          <IconButton
                            size="1"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleActivate(c);
                            }}
                            disabled={isBusy}
                            aria-label="Connect"
                          >
                            Connect
                          </IconButton>
                        </Tooltip>
                      ) : null}
                      <Tooltip content="Edit">
                        <IconButton
                          size="1"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(c);
                          }}
                          disabled={isBusy}
                        >
                          <Pencil1Icon />
                        </IconButton>
                      </Tooltip>
                    </Flex>
                  );
                })}
              </Flex>
            )}
          </Box>
        );
      })}
    </Flex>
  );
}
