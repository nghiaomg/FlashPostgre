import { app, BrowserWindow, shell, ipcMain, nativeTheme } from 'electron';
import path from 'path';
import { registerConnectionHandlers } from './ipc/connection';
import { registerQueryHandlers } from './ipc/query';
import { registerSchemaHandlers } from './ipc/schema';
import { registerStoreHandlers, store } from './ipc/store';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const isMac = process.platform === 'darwin';

let mainWindow: BrowserWindow | null = null;

function getBackgroundForTheme(theme: 'light' | 'dark'): string {
  // Match the in-app theme so the title bar transition is seamless.
  return theme === 'dark' ? '#0f1115' : '#ffffff';
}

function createWindow(initialTheme: 'light' | 'dark' = 'light') {
  const iconPath = process.platform === 'win32'
    ? (isDev ? path.join(__dirname, '../public/icon.ico') : path.join(__dirname, '../dist/icon.ico'))
    : (isDev ? path.join(__dirname, '../public/icon.png') : path.join(__dirname, '../dist/icon.png'));

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    icon: iconPath,
    backgroundColor: getBackgroundForTheme(initialTheme),
    // macOS keeps the native traffic lights (hiddenInset) so the OS handles them.
    // Windows/Linux get a fully frameless window — we draw our own controls.
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    trafficLightPosition: isMac ? { x: 14, y: 14 } : undefined,
    frame: isMac,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Read the persisted theme before creating the window so the initial
  // background color matches (avoids a white flash when the user has dark mode).
  const initialTheme = ((store as any).get('preferences.theme') ?? 'light') as
    | 'light'
    | 'dark';

  // Register IPC handlers
  registerStoreHandlers(ipcMain);
  registerConnectionHandlers(ipcMain);
  registerQueryHandlers(ipcMain);
  registerSchemaHandlers(ipcMain);
  registerWindowHandlers(ipcMain);

  createWindow(initialTheme);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(initialTheme);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function registerWindowHandlers(ipc: Electron.IpcMain) {
  ipc.handle('window:minimize', () => {
    mainWindow?.minimize();
    return true;
  });
  ipc.handle('window:maximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipc.handle('window:close', () => {
    mainWindow?.close();
    return true;
  });
  ipc.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);
  ipc.handle('window:setBackground', (_e, color: string) => {
    if (mainWindow && /^#[0-9a-fA-F]{6}$/.test(color)) {
      mainWindow.setBackgroundColor(color);
    }
    return true;
  });
  // Synchronous access to the initial theme — avoids async round-trip and
  // eliminates the flash where the renderer starts as 'light' then switches.
  ipc.handle('window:getInitialTheme', () => {
    return ((store as any).get('preferences.theme') ?? 'light') as 'light' | 'dark';
  });
}

export { registerWindowHandlers };
