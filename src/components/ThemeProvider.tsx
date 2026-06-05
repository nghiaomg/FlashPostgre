import { createContext, useCallback, useEffect, useState, ReactNode } from 'react';
import { Theme } from '@radix-ui/themes';
import { lightTheme, darkTheme } from '@/theme';
import { store } from '@/lib/store';
import type { ThemeMode } from '@/theme';

const LIGHT_BG = '#ffffff';
const DARK_BG = '#0f1115';

interface ThemeContextType {
  theme: ThemeMode;
  toggle: () => void;
  loaded: boolean;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface Props {
  children: ReactNode;
}

export function ThemeProvider({ children }: Props) {
  const [theme, setThemeState] = useState<ThemeMode>('light');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Lấy theme đã lưu lần trước từ store lúc startup
    window.flashpostgre.window.getInitialTheme().then((t) => {
      const initialTheme = t === 'dark' ? 'dark' : 'light';
      setThemeState(initialTheme);
      setLoaded(true);

      // Đồng bộ class dark/light lên documentElement
      if (initialTheme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
      }
    });
  }, []);

  const setTheme = useCallback(async (next: ThemeMode) => {
    setThemeState(next);
    await store.setTheme(next);

    // Đồng bộ class dark/light khi thay đổi theme
    if (next === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }

    // Sync native window background in Electron
    try {
      await window.flashpostgre.window.setBackground(next === 'dark' ? DARK_BG : LIGHT_BG);
    } catch {
      // ignore — not in an Electron context
    }
  }, []);

  const toggle = useCallback(() => {
    return setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const props = loaded ? (theme === 'dark' ? darkTheme : lightTheme) : lightTheme;

  return (
    <ThemeContext.Provider value={{ theme, toggle, loaded }}>
      <Theme {...props}>{children}</Theme>
    </ThemeContext.Provider>
  );
}
