import { useState, useCallback, useRef, useEffect } from 'react';
import { Box, Flex, Button, Text, Tooltip, Select, IconButton, Spinner, Callout, Tabs, TextField, Badge } from '@radix-ui/themes';
import { PlayIcon, ResetIcon, CodeIcon, BookmarkIcon, MagicWandIcon, SymbolIcon, MagnifyingGlassIcon, ClockIcon, TrashIcon, CopyIcon } from '@radix-ui/react-icons';
import type { Tab } from '@/hooks/useTabs';
import type { QueryResult, QueryField } from '@/types';
import { store } from '@/lib/store';
import { formatSqlText } from '@/lib/sqlFormat';
import { ResultView } from './ResultView';

interface HistoryEntry { id: string; sql: string; ts: number; connectionId: string }

interface Props {
  tab: Extract<Tab, { kind: 'query' }>;
  connectionId: string;
  onUpdateSql?: (sql: string) => void;
  onInsertSnippet?: (sql: string) => void;
}

export function QueryTab({ tab, connectionId, onUpdateSql, onInsertSnippet }: Props) {
  const [sql, setSql] = useState(tab.sql);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [results, setResults] = useState<QueryResult[]>([]); // multi-statement results
  const [statementCount, setStatementCount] = useState(0);
  const [explain, setExplain] = useState<any>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSql(tab.sql);
  }, [tab.id, tab.sql]);

  useEffect(() => {
    store.getQueryHistory().then((h) => setHistory(h ?? []));
  }, []);

  const run = useCallback(async () => {
    const text = sql.trim();
    if (!text) return;
    setRunning(true);
    setResult(null);
    setResults([]);
    setExplain(null);

    // Split into individual statements (handles comments and quoted strings)
    const statements = splitStatements(text);
    setStatementCount(statements.length);

    if (statements.length === 1) {
      const res = await window.flashpostgre.query.run(connectionId, text);
      setResult(res);
      setRunning(false);
      if (res.ok) await saveHistory(text);
    } else {
      // Multi-statement: run as batch
      const res = await window.flashpostgre.query.runBatch(connectionId, statements);
      if (res.ok) {
        setResults(res.results);
        setResult(null);
      } else {
        setResult({ ok: false, error: res.error ?? 'Unknown batch error' });
      }
      setRunning(false);
      if (res.ok) await saveHistory(text);
    }
  }, [sql, connectionId]);

  const runExplain = useCallback(async () => {
    const text = sql.trim();
    if (!text) return;
    setRunning(true);
    const res = await window.flashpostgre.query.explain(connectionId, text);
    setRunning(false);
    if (res.ok) setExplain(res.plan);
  }, [sql, connectionId]);

  const saveHistory = async (text: string) => {
    const entry: HistoryEntry = { id: `h-${Date.now()}`, sql: text, ts: Date.now(), connectionId };
    await store.pushQueryHistory(entry);
    setHistory((prev) => [entry, ...prev.filter((h) => h.sql !== text)].slice(0, 100));
  };

  /** Split SQL text into individual statements by semicolons, skipping empty ones. */
  function splitStatements(text: string): string[] {
    return text
      .split(/;/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));
  }

  const activeHistory = historySearch.trim()
    ? history.filter((h) => h.sql.toLowerCase().includes(historySearch.toLowerCase()))
    : history;

  const formatTs = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  const format = useCallback(async () => {
    const formatted = await formatSqlText(sql);
    setSql(formatted);
    if (editorRef.current) editorRef.current.textContent = formatted;
    onUpdateSql?.(formatted);
  }, [sql, onUpdateSql]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'F5' || ((e.metaKey || e.ctrlKey) && e.key === 'Enter')) {
      e.preventDefault();
      run();
    } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      format();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '  ');
    }
  };

  const onInput = (e: React.FormEvent<HTMLDivElement>) => {
    const next = e.currentTarget.textContent ?? '';
    setSql(next);
    onUpdateSql?.(next);
  };

  return (
    <Flex direction="column" height="100%" p="3" gap="3">
      <Flex align="center" gap="2" wrap="wrap">
        <Tooltip content="Run (⌘/Ctrl + Enter)">
          <Button size="2" onClick={run} disabled={running}>
            {running ? <Spinner size="1" /> : <PlayIcon />} Run
          </Button>
        </Tooltip>
        <Tooltip content="EXPLAIN (⌘/Ctrl + E)">
          <Button size="2" variant="soft" onClick={runExplain} disabled={running}>
            <SymbolIcon /> Explain
          </Button>
        </Tooltip>
        <Tooltip content="Format SQL (⌘/Ctrl + Shift + F)">
          <Button size="2" variant="soft" onClick={format}>
            <MagicWandIcon /> Format
          </Button>
        </Tooltip>
        <Tooltip content="Clear editor">
          <IconButton
            size="2"
            variant="soft"
            color="gray"
            onClick={() => {
              setSql('');
              if (editorRef.current) editorRef.current.textContent = '';
            }}
          >
            <ResetIcon />
          </IconButton>
        </Tooltip>

        {onInsertSnippet && (
          <Tooltip content="Insert selected snippet into editor">
            <Button size="2" variant="soft" onClick={() => onInsertSnippet('')}>
              <BookmarkIcon /> Insert snippet
            </Button>
          </Tooltip>
        )}

        <Box ml="auto">
          {statementCount > 1 && (
            <Badge color="indigo" variant="soft" mr="2">
              {statementCount} statements
            </Badge>
          )}
          <Button size="2" variant="soft" onClick={() => setHistoryOpen((o) => !o)}>
            <ClockIcon /> History
          </Button>
        </Box>
      </Flex>

      {/* History search panel */}
      {historyOpen && (
        <Box className="fp-history-panel" style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--gray-a4)', borderRadius: 6 }}>
          <TextField.Root size="1" mb="2" placeholder="Search history…" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)}>
            <TextField.Slot><MagnifyingGlassIcon /></TextField.Slot>
          </TextField.Root>
          {activeHistory.length === 0 ? (
            <Text size="1" color="gray">No matching queries.</Text>
          ) : (
            activeHistory.map((h) => (
              <Flex
                key={h.id}
                align="center"
                gap="1"
                py="1"
                px="1"
                style={{ borderBottom: '1px solid var(--gray-a2)', cursor: 'pointer', borderRadius: 3 }}
                className="fp-snippet-row"
                onClick={() => {
                  setSql(h.sql);
                  if (editorRef.current) editorRef.current.textContent = h.sql;
                  setHistoryOpen(false);
                }}
              >
                <Text size="1" style={{ flex: 1, fontFamily: 'JetBrains Mono, monospace', wordBreak: 'break-all' }}>
                  {h.sql.length > 120 ? h.sql.slice(0, 120) + '…' : h.sql}
                </Text>
                <Flex align="center" gap="1" style={{ flexShrink: 0 }}>
                  <Text size="1" color="gray">{formatTs(h.ts)}</Text>
                  <IconButton
                    size="1"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(h.sql);
                    }}
                    title="Copy to clipboard"
                  >
                    <CopyIcon />
                  </IconButton>
                  <IconButton
                    size="1"
                    variant="ghost"
                    color="red"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await store.deleteHistoryEntry(h.id);
                      setHistory((prev) => prev.filter((x) => x.id !== h.id));
                    }}
                    title="Delete from history"
                  >
                    <TrashIcon />
                  </IconButton>
                </Flex>
              </Flex>
            ))
          )}
        </Box>
      )}

      <Box
        ref={editorRef}
        className="fp-editor"
        contentEditable
        suppressContentEditableWarning
        onKeyDown={onKeyDown}
        onInput={onInput}
        spellCheck={false}
      >
        {tab.sql}
      </Box>

      <Box style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {running ? (
          <Flex align="center" gap="2" p="3">
            <Spinner size="2" /> <Text>Running…</Text>
          </Flex>
        ) : results.length > 0 ? (
          <Tabs.Root defaultValue="stmt-0">
            <Tabs.List>
              {results.map((r, i) => (
                <Tabs.Trigger key={i} value={`stmt-${i}`}>
                  #{i + 1} {r.ok ? `✓ ${r.rowCount ?? 0}` : '✗'}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <Box pt="3">
              {results.map((r, i) => (
                <Tabs.Content key={i} value={`stmt-${i}`}>
                  <ResultView result={r} />
                </Tabs.Content>
              ))}
            </Box>
          </Tabs.Root>
        ) : result || explain ? (
          <Tabs.Root defaultValue="result">
            <Tabs.List>
              <Tabs.Trigger value="result">Result</Tabs.Trigger>
              <Tabs.Trigger value="explain" disabled={!explain}>
                Plan
              </Tabs.Trigger>
            </Tabs.List>
            <Box pt="3">
              <Tabs.Content value="result">
                {result && <ResultView result={result} />}
              </Tabs.Content>
              <Tabs.Content value="explain">
                {explain && (
                  <Box className="fp-codeblock" style={{ maxHeight: 'unset' }}>
                    {JSON.stringify(explain, null, 2)}
                  </Box>
                )}
              </Tabs.Content>
            </Box>
          </Tabs.Root>
        ) : (
          <Flex direction="column" align="center" justify="center" p="6" gap="2">
            <CodeIcon width={22} height={22} color="var(--gray-9)" />
            <Text size="1" color="gray">Press ⌘/Ctrl + Enter or F5 to run. Semicolons run multiple statements.</Text>
          </Flex>
        )}
      </Box>
    </Flex>
  );
}
