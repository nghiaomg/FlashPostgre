import type { IpcMain } from 'electron';
import Store from 'electron-store';
import { connectionManager, ConnectionConfig } from '../db/pool';

interface StoreSchema {
  connections: ConnectionConfig[];
  activeConnectionId: string | null;
  preferences: {
    theme: 'light' | 'dark';
    queryHistory: Array<{ id: string; sql: string; ts: number; connectionId: string }>;
  };
}

const store = new Store<StoreSchema>({
  name: 'flashpostgre',
  defaults: {
    connections: [],
    activeConnectionId: null,
    preferences: {
      theme: 'dark',
      queryHistory: [],
    },
  },
});

export function registerStoreHandlers(ipc: IpcMain) {
  ipc.handle('store:get', (_e, key: string) => {
    return (store as any).get(key);
  });
  ipc.handle('store:set', (_e, key: string, value: any) => {
    (store as any).set(key, value);
    return true;
  });
  ipc.handle('store:delete', (_e, key: string) => {
    (store as any).delete(key);
    return true;
  });
}

export function registerConnectionHandlers(ipc: IpcMain) {
  ipc.handle('connection:test', async (_e, config: ConnectionConfig) => {
    return connectionManager.testConnection(config);
  });

  ipc.handle('connection:connect', async (_e, id: string) => {
    const connections: ConnectionConfig[] = (store as any).get('connections') || [];
    const cfg = connections.find((c) => c.id === id);
    if (!cfg) return { ok: false, error: 'Connection profile not found' };
    const result = await connectionManager.testConnection(cfg);
    if (result.ok) {
      (store as any).set('activeConnectionId', id);
    }
    return result;
  });

  ipc.handle('connection:disconnect', async (_e, id: string) => {
    await connectionManager.disconnect(id);
    if ((store as any).get('activeConnectionId') === id) {
      (store as any).set('activeConnectionId', null);
    }
    return true;
  });

  ipc.handle('connection:list', async () => {
    return (store as any).get('connections') || [];
  });

  ipc.handle('connection:active', async () => {
    return (store as any).get('activeConnectionId') || null;
  });
}
