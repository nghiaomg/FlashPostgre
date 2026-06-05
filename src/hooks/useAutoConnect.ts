import { useEffect, useRef } from 'react';

/**
 * Watches `activeId` and `connections`. When both resolve (activeId is set,
 * connection config exists) it attempts a real Postgres TCP connection so the
 * Explorer sidebar can load schemas right away.
 */
export function useAutoConnect(
  activeId: string | null,
  connections: Array<{ id: string }>,
  onConnect: (id: string) => Promise<unknown>
) {
  const didRun = useRef(false);
  const connectionsRef = useRef(connections);
  connectionsRef.current = connections;

  useEffect(() => {
    if (didRun.current) return;
    if (!activeId) return;
    const cfg = connectionsRef.current.find((c) => c.id === activeId);
    if (!cfg) return;
    didRun.current = true;
    onConnect(activeId);
  }, [activeId, onConnect]);
}