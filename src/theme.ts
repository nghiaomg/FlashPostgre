import { Theme } from '@radix-ui/themes';
import type { ThemeProps } from '@radix-ui/themes';

export type ThemeMode = 'light' | 'dark';

// Shared base theme — accent + gray + radius are stable across modes.
const baseTheme: Omit<ThemeProps, 'appearance'> = {
  accentColor: 'gray',
  grayColor: 'slate',
  radius: 'small',
  scaling: '100%',
  panelBackground: 'solid',
};

export const lightTheme: ThemeProps = { ...baseTheme, appearance: 'light' };
export const darkTheme: ThemeProps = { ...baseTheme, appearance: 'dark' };

export { Theme };
