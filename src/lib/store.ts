// Thin wrapper around the IPC store API for renderer code
import type { ConnectionConfig, Snippet } from '@/types';

export const store = {
  getConnections: (): Promise<ConnectionConfig[]> =>
    window.flashpostgre.store.get('connections'),
  setConnections: (items: ConnectionConfig[]) =>
    window.flashpostgre.store.set('connections', items),

  getActiveConnectionId: (): Promise<string | null> =>
    window.flashpostgre.store.get('activeConnectionId'),
  setActiveConnectionId: (id: string | null) =>
    window.flashpostgre.store.set('activeConnectionId', id),

  getQueryHistory: (): Promise<Array<{ id: string; sql: string; ts: number; connectionId: string }>> =>
    window.flashpostgre.store.get('preferences.queryHistory'),
  pushQueryHistory: async (entry: { id: string; sql: string; ts: number; connectionId: string }) => {
    const history = await window.flashpostgre.store.get('preferences.queryHistory');
    const next = [entry, ...(history ?? []).filter((h: any) => h.sql !== entry.sql)].slice(0, 100);
    await window.flashpostgre.store.set('preferences.queryHistory', next);
  },
  deleteHistoryEntry: async (id: string) => {
    const history = await window.flashpostgre.store.get('preferences.queryHistory');
    const next = (history ?? []).filter((h: any) => h.id !== id);
    await window.flashpostgre.store.set('preferences.queryHistory', next);
  },

  // Snippets
  getSnippets: (): Promise<Snippet[]> =>
    window.flashpostgre.store.get('snippets'),
  setSnippets: (items: Snippet[]) =>
    window.flashpostgre.store.set('snippets', items),
  upsertSnippet: async (snippet: Snippet): Promise<Snippet[]> => {
    const list = (await window.flashpostgre.store.get('snippets')) ?? [];
    const idx = list.findIndex((s: Snippet) => s.id === snippet.id);
    const updated = { ...snippet, updatedAt: Date.now() };
    const next = idx === -1 ? [updated, ...list] : list.map((s: Snippet, i: number) => (i === idx ? updated : s));
    await window.flashpostgre.store.set('snippets', next);
    return next;
  },
  deleteSnippet: async (id: string): Promise<Snippet[]> => {
    const list = (await window.flashpostgre.store.get('snippets')) ?? [];
    const next = list.filter((s: Snippet) => s.id !== id);
    await window.flashpostgre.store.set('snippets', next);
    return next;
  },

  // UI preferences
  getTheme: (): Promise<'light' | 'dark'> =>
    window.flashpostgre.store.get('preferences.theme'),
  setTheme: (theme: 'light' | 'dark') =>
    window.flashpostgre.store.set('preferences.theme', theme),
  getPreferences: (): Promise<{ theme: 'light' | 'dark'; queryHistory: any[] }> =>
    window.flashpostgre.store.get('preferences'),
};
