import { contextBridge, ipcRenderer } from 'electron';

// Exposed API surface for the renderer
contextBridge.exposeInMainWorld('flashpostgre', {
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('store:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('store:delete', key),
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    setBackground: (color: string) => ipcRenderer.invoke('window:setBackground', color),
    // Sync — reads electron-store directly in main process, no async round-trip.
    getInitialTheme: () => ipcRenderer.invoke('window:getInitialTheme'),
  },
  connection: {
    test: (config: any) => ipcRenderer.invoke('connection:test', config),
    connect: (id: string) => ipcRenderer.invoke('connection:connect', id),
    disconnect: (id: string) => ipcRenderer.invoke('connection:disconnect', id),
    list: () => ipcRenderer.invoke('connection:list'),
    active: () => ipcRenderer.invoke('connection:active'),
  },
  query: {
    run: (connectionId: string, sql: string, params?: any[]) =>
      ipcRenderer.invoke('query:run', connectionId, sql, params),
    cancel: (connectionId: string) => ipcRenderer.invoke('query:cancel', connectionId),
    explain: (connectionId: string, sql: string) =>
      ipcRenderer.invoke('query:explain', connectionId, sql),
    runBatch: (connectionId: string, statements: string[]) =>
      ipcRenderer.invoke('query:runBatch', connectionId, statements),
    transaction: (connectionId: string, statements: string[]) =>
      ipcRenderer.invoke('query:transaction', connectionId, statements),
  },
  schema: {
    databases: (connectionId: string) => ipcRenderer.invoke('schema:databases', connectionId),
    schemas: (connectionId: string) => ipcRenderer.invoke('schema:schemas', connectionId),
    tables: (connectionId: string, schema: string) =>
      ipcRenderer.invoke('schema:tables', connectionId, schema),
    columns: (connectionId: string, schema: string, table: string) =>
      ipcRenderer.invoke('schema:columns', connectionId, schema, table),
    indexes: (connectionId: string, schema: string, table: string) =>
      ipcRenderer.invoke('schema:indexes', connectionId, schema, table),
    primaryKeys: (connectionId: string, schema: string, table: string) =>
      ipcRenderer.invoke('schema:primaryKeys', connectionId, schema, table),
    preview: (
      connectionId: string,
      schema: string,
      table: string,
      limit?: number,
      offset?: number,
      orderBy?: string,
      orderDir?: 'ASC' | 'DESC',
      where?: string
    ) => ipcRenderer.invoke('schema:preview', connectionId, schema, table, limit, offset, orderBy, orderDir, where),
    count: (connectionId: string, schema: string, table: string, where?: string) =>
      ipcRenderer.invoke('schema:count', connectionId, schema, table, where),
  },
});
