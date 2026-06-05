import { useCallback, useEffect, useState } from 'react';
import { Titlebar } from './components/Titlebar';
import { Sidebar } from './components/Sidebar';
import { Statusbar } from './components/Statusbar';
import { EmptyState } from './components/EmptyState';
import { ConnectionDialog } from './components/ConnectionDialog';
import { SnippetDialog } from './components/SnippetDialog';
import { SnippetsPanel } from './components/SnippetsPanel';
import { TabBar } from './components/TabBar';
import { QueryTab } from './components/QueryTab';
import { TableTab } from './components/TableTab';
import { DiagnosticsTab } from './components/DiagnosticsTab';
import { useConnections } from './hooks/useConnections';
import { useTabs } from './hooks/useTabs';
import { useSnippets } from './hooks/useSnippets';
import { useTheme } from './hooks/useTheme';

import type { ConnectionConfig, Snippet } from '@/types';

export default function App() {
  const { connections, activeId, setActiveId, refresh } = useConnections();
  const tabs = useTabs(activeId);
  const snippets = useSnippets();
  const { theme, toggle: toggleTheme } = useTheme();
  const [dialogOpen, setDialogOpen] = useState(connections.length === 0);
  const [editing, setEditing] = useState<ConnectionConfig | null>(null);
  const [snippetDialogOpen, setSnippetDialogOpen] = useState(false);
  const [snippetEditing, setSnippetEditing] = useState<Snippet | null>(null);
  const [snippetDefaultSql, setSnippetDefaultSql] = useState<string>('');
  const [showSnippets, setShowSnippets] = useState(true);

  const handleConnect = useCallback(
    async (id: string) => {
      const res = await window.flashpostgre.connection.connect(id);
      if (res.ok) await setActiveId(id);
      return res;
    },
    [setActiveId]
  );



  useEffect(() => {
    if (connections.length === 0) setDialogOpen(true);
  }, [connections.length]);

  const handleSaved = useCallback(
    async (cfg: ConnectionConfig) => {
      const next = [...connections.filter((c) => c.id !== cfg.id), cfg];
      await refresh(next);
      const res = await window.flashpostgre.connection.connect(cfg.id);
      if (res.ok) await setActiveId(cfg.id);
      setDialogOpen(false);
      setEditing(null);
    },
    [connections, refresh, setActiveId]
  );

  const handleDisconnect = useCallback(async () => {
    if (activeId) {
      await window.flashpostgre.connection.disconnect(activeId);
      await setActiveId(null);
    }
  }, [activeId, setActiveId]);

  const activeConn = activeId ? connections.find((c) => c.id === activeId) ?? null : null;
  const activeQueryTab = tabs.activeTab?.kind === 'query' ? tabs.activeTab : null;

  const openSnippetDialogForNew = (sql: string) => {
    setSnippetEditing(null);
    setSnippetDefaultSql(sql);
    setSnippetDialogOpen(true);
  };

  const openSnippetDialogForEdit = (s: Snippet) => {
    setSnippetEditing(s);
    setSnippetDefaultSql('');
    setSnippetDialogOpen(true);
  };

  return (
    <div className="fp-app">
      <Titlebar
        activeConnection={activeConn}
        onNewConnection={() => {
          setEditing(null);
          setDialogOpen(true);
        }}
        onDisconnect={handleDisconnect}
        onToggleSnippets={() => setShowSnippets((s) => !s)}
        snippetsVisible={showSnippets}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* fp-body: column — content row fills remaining space, Statusbar pins to bottom */}
      <div className="fp-body">
        <div className="fp-content-row">
          <div className="fp-sidebar">
            <Sidebar
              connections={connections}
              activeId={activeId}
              onConnect={handleConnect}
              onSelect={setActiveId}
              onAddNew={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
              onEdit={(cfg) => {
                setEditing(cfg);
                setDialogOpen(true);
              }}
              onOpenTable={(schema, table) => tabs.openTable(schema, table)}
              onOpenMonitor={tabs.openDiagnosticsTab}
            />
          </div>

          <div className="fp-main">
            <TabBar
              tabs={tabs.tabs}
              activeId={tabs.activeId}
              onSelect={tabs.setActive}
              onClose={tabs.close}
              onAddQuery={() => tabs.addQueryTab()}
              onRename={tabs.renameTab}
            />

            <div className="fp-content">
              {!activeId ? (
                <EmptyState
                  title="No active connection"
                  description="Create or select a PostgreSQL connection from the sidebar to start exploring databases and running queries."
                  actionLabel="New connection"
                  onAction={() => {
                    setEditing(null);
                    setDialogOpen(true);
                  }}
                />
              ) : tabs.activeTab?.kind === 'query' ? (
                <QueryTab
                  key={tabs.activeTab.id}
                  tab={tabs.activeTab}
                  connectionId={activeId}
                  onUpdateSql={(sql) => tabs.activeTab && tabs.updateQuerySql(tabs.activeTab.id, sql)}
                  onInsertSnippet={() => {}}
                />
              ) : tabs.activeTab?.kind === 'table' ? (
                <TableTab
                  key={tabs.activeTab.id}
                  tab={tabs.activeTab}
                  connectionId={activeId}
                />
              ) : tabs.activeTab?.kind === 'diagnostics' ? (
                <DiagnosticsTab
                  key={tabs.activeTab.id}
                  tab={tabs.activeTab}
                  connectionId={activeId}
                />
              ) : (
                <EmptyState
                  title="Pick something to start"
                  description="Select a table from the sidebar to preview data, or open a new query tab to write SQL."
                  actionLabel="New query"
                  onAction={() => tabs.addQueryTab()}
                />
              )}
            </div>
          </div>

          {showSnippets && (
            <div className="fp-snippets">
              <SnippetsPanel
                snippets={snippets.snippets}
                onInsert={(sql) => {
                  if (activeQueryTab) {
                    tabs.updateQuerySql(activeQueryTab.id, appendSql(activeQueryTab.sql, sql));
                  }
                }}
                onSaveCurrent={(sql) => openSnippetDialogForNew(sql)}
                onEdit={openSnippetDialogForEdit}
                onDelete={snippets.deleteSnippet}
                currentSql={activeQueryTab?.sql}
              />
            </div>
          )}
        </div>

        <Statusbar
          activeConnection={activeConn}
          tabCount={tabs.tabs.length}
          snippetCount={snippets.snippets.length}
        />
      </div>

      <ConnectionDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setEditing(null);
        }}
        onSaved={handleSaved}
        initial={editing}
      />

      <SnippetDialog
        open={snippetDialogOpen}
        onOpenChange={setSnippetDialogOpen}
        initial={snippetEditing}
        defaultSql={snippetDefaultSql}
        onSave={snippets.saveSnippet}
      />
    </div>
  );
}

function appendSql(current: string, snippet: string): string {
  const a = current.replace(/\s+$/g, '');
  if (!a.trim()) return snippet;
  return `${a}\n\n${snippet}`;
}