import { useCallback, useEffect, useState } from 'react';
import { store } from '@/lib/store';
import type { ConnectionConfig } from '@/types';

function withDefaults(c: ConnectionConfig): ConnectionConfig {
  return {
    ...c,
    env: c.env ?? 'local',
  };
}

export function useConnections() {
  const [connections, setConnections] = useState<ConnectionConfig[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await store.getConnections();
    setConnections((list ?? []).map(withDefaults));
    setActiveIdState(null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(
    async (next: ConnectionConfig[]) => {
      const normalized = next.map(withDefaults);
      await store.setConnections(normalized);
      setConnections(normalized);
    },
    []
  );

  const setActiveId = useCallback(async (id: string | null) => {
    await store.setActiveConnectionId(id);
    setActiveIdState(id);
  }, []);

  return { connections, activeId, setActiveId, refresh, reload: load };
}
