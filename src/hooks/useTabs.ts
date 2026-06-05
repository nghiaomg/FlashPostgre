import { useCallback, useEffect, useState } from 'react';

export type Tab =
  | { id: string; kind: 'query'; title: string; sql: string }
  | {
      id: string;
      kind: 'table';
      title: string;
      schema: string;
      table: string;
    }
  | { id: string; kind: 'diagnostics'; title: string };

let counter = 0;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export function useTabs(activeConnectionId: string | null) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Reset tabs when the connection changes
  useEffect(() => {
    if (!activeConnectionId) {
      setTabs([]);
      setActiveId(null);
      return;
    }
    // Start with a single query tab on first connection
    const qid = uid('q');
    setTabs([
      {
        id: qid,
        kind: 'query',
        title: 'Query 1',
        sql: '-- Write your SQL here\n',
      },
    ]);
    setActiveId(qid);
  }, [activeConnectionId]);

  const activeTab = tabs.find((t) => t.id === activeId) ?? null;

  const setActive = useCallback((id: string) => setActiveId(id), []);

  const close = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        if (idx === -1) return prev;
        const next = prev.filter((t) => t.id !== id);
        if (id === activeId) {
          setActiveId(next[Math.max(0, idx - 1)]?.id ?? next[0]?.id ?? null);
        }
        if (next.length === 0) {
          // Always keep at least one query tab when a connection is active
          const qid = uid('q');
          setActiveId(qid);
          return [
            {
              id: qid,
              kind: 'query',
              title: 'Query 1',
              sql: '-- Write your SQL here\n',
            },
          ];
        }
        return next;
      });
    },
    [activeId]
  );

  const addQueryTab = useCallback(() => {
    const id = uid('q');
    setTabs((prev) => {
      const num = prev.filter((t) => t.kind === 'query').length + 1;
      return [
        ...prev,
        { id, kind: 'query', title: `Query ${num}`, sql: '' },
      ];
    });
    setActiveId(id);
  }, []);

  const openTable = useCallback((schema: string, table: string) => {
    const id = uid('t');
    setTabs((prev) => {
      // Reuse existing tab for the same table
      const existing = prev.find(
        (t) => t.kind === 'table' && t.schema === schema && t.table === table
      );
      if (existing) {
        setActiveId(existing.id);
        return prev;
      }
      return [
        ...prev,
        { id, kind: 'table', title: `${schema}.${table}`, schema, table },
      ];
    });
    setActiveId(id);
  }, []);

  const openDiagnosticsTab = useCallback(() => {
    const id = uid('d');
    setTabs((prev) => {
      const existing = prev.find((t) => t.kind === 'diagnostics');
      if (existing) {
        setActiveId(existing.id);
        return prev;
      }
      return [
        ...prev,
        { id, kind: 'diagnostics', title: 'Diagnostics & Monitor' },
      ];
    });
    setActiveId(id);
  }, []);

  const updateQuerySql = useCallback((id: string, sql: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id && t.kind === 'query' ? { ...t, sql } : t))
    );
  }, []);

  const renameTab = useCallback((id: string, title: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title } : t))
    );
  }, []);

  return {
    tabs,
    activeId,
    activeTab,
    setActive,
    close,
    addQueryTab,
    openTable,
    openDiagnosticsTab,
    updateQuerySql,
    renameTab,
  };
}
