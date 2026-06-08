import { Box, Flex, Text, IconButton, Tooltip, Button } from '@radix-ui/themes';
import {
  PlusIcon,
  ExitIcon,
  DotFilledIcon,
  BookmarkIcon,
  SunIcon,
  MoonIcon,
  MinusIcon,
  SquareIcon,
  Cross1Icon,
  CopyIcon,
} from '@radix-ui/react-icons';
import type { ConnectionConfig } from '@/types';
import type { ThemeMode } from '@/theme';
import { useEffect, useState } from 'react';
import { APP_VERSION } from '@/version';

interface Props {
  activeConnection: ConnectionConfig | null;
  onNewConnection: () => void;
  onDisconnect: () => void;
  onToggleSnippets: () => void;
  snippetsVisible: boolean;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

const ENV_COLOR: Record<string, string> = {
  prod: 'var(--red-9)',
  staging: 'var(--amber-9)',
  dev: 'var(--green-9)',
  local: 'var(--gray-9)',
  custom: 'var(--indigo-9)',
};

export function Titlebar({
  activeConnection,
  onNewConnection,
  onDisconnect,
  onToggleSnippets,
  snippetsVisible,
  theme,
  onToggleTheme,
}: Props) {
  const [maximized, setMaximized] = useState(false);
  const [isMac, setIsMac] = useState(false);
  // Detect platform by trying to call into the bridge. If the window bridge is
  // available we're in Electron; the userAgent hint is the simplest cross-check.
  useEffect(() => {
    // macOS: traffic lights are still rendered by the OS even with hiddenInset,
    // so we leave room for them. On Windows/Linux the bridge tells us.
    setIsMac(navigator.platform.toLowerCase().includes('mac'));
    window.flashpostgre.window.isMaximized().then(setMaximized).catch(() => undefined);
  }, []);

  const isProd = activeConnection?.env === 'prod';

  return (
    <Flex className="fp-titlebar" align="center" gap="2">


      <Flex align="center" gap="2" style={{ position: 'relative' }}>
        <Text size="2" weight="medium" color="gray">
          FlashPostgre <Text as="span" color="gray" highContrast>v{APP_VERSION}</Text>
        </Text>
      </Flex>

      {activeConnection && (
        <Flex align="center" gap="2" ml="4" style={{ minWidth: 0, position: 'relative' }}>
          <Box
            style={{
              width: 8,
              height: 8,
              borderRadius: 8,
              flexShrink: 0,
              background:
                activeConnection.color || ENV_COLOR[activeConnection.env] || 'var(--gray-9)',
            }}
          />
          <DotFilledIcon width={10} height={10} color="var(--green-9)" aria-label="connected" />
          <Text size="1" color="gray" truncate>
            <Text as="span" weight="medium" color="gray">
              {activeConnection.name}
            </Text>
            <Text as="span" color="gray">
              {' '}
              · {activeConnection.host}:{activeConnection.port}/{activeConnection.database}
            </Text>
            <Text as="span" color="gray">
              {' '}
              · {activeConnection.envLabel ?? activeConnection.env}
            </Text>
          </Text>
        </Flex>
      )}

      <Flex
        className="fp-titlebar-actions"
        align="center"
        gap="1"
        style={{ position: 'relative' }}
      >
        <Tooltip content={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
          <IconButton size="1" variant="ghost" onClick={onToggleTheme} aria-label="Toggle theme">
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </IconButton>
        </Tooltip>
        <Button
          size="1"
          variant={snippetsVisible ? 'soft' : 'ghost'}
          onClick={onToggleSnippets}
          aria-label="Toggle snippets"
        >
          <BookmarkIcon /> Snippets
        </Button>
        <Button size="1" variant="soft" onClick={onNewConnection}>
          <PlusIcon /> New connection
        </Button>
        {activeConnection && (
          <Button
            size="1"
            variant="soft"
            color={isProd ? 'red' : 'gray'}
            onClick={onDisconnect}
          >
            <ExitIcon /> Disconnect
          </Button>
        )}

        {/* Custom window controls — Windows / Linux only. macOS uses native traffic lights. */}
        {!isMac && (
          <Flex align="center" gap="0" ml="2" className="fp-window-controls">
            <Tooltip content="Minimize">
              <button
                className="fp-window-btn"
                onClick={() => window.flashpostgre.window.minimize()}
                aria-label="Minimize"
              >
                <MinusIcon width={12} height={12} />
              </button>
            </Tooltip>
            <Tooltip content={maximized ? 'Restore' : 'Maximize'}>
              <button
                className="fp-window-btn"
                onClick={async () => {
                  const m = await window.flashpostgre.window.maximize();
                  setMaximized(m);
                }}
                aria-label="Maximize"
              >
                {maximized ? <CopyIcon width={12} height={12} /> : <SquareIcon width={11} height={11} />}
              </button>
            </Tooltip>
            <Tooltip content="Close">
              <button
                className="fp-window-btn fp-window-btn-close"
                onClick={() => window.flashpostgre.window.close()}
                aria-label="Close"
              >
                <Cross1Icon width={11} height={11} />
              </button>
            </Tooltip>
          </Flex>
        )}
      </Flex>
    </Flex>
  );
}
