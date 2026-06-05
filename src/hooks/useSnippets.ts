import { useCallback, useEffect, useState } from 'react';
import { store } from '@/lib/store';
import type { Snippet } from '@/types';

export function useSnippets() {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const list = (await store.getSnippets()) ?? [];
    setSnippets(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveSnippet = useCallback(
    async (snippet: Snippet) => {
      const next = await store.upsertSnippet(snippet);
      setSnippets(next);
      return snippet;
    },
    []
  );

  const deleteSnippet = useCallback(async (id: string) => {
    const next = await store.deleteSnippet(id);
    setSnippets(next);
  }, []);

  return { snippets, loading, saveSnippet, deleteSnippet, reload: load };
}
