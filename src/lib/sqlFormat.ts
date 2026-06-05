// Thin wrapper around sql-formatter with sensible Postgres defaults.
// Lazy-loaded so it doesn't bloat the initial bundle.
import type { FormatOptions } from 'sql-formatter';

const DEFAULT_OPTIONS: FormatOptions = {
  keywordCase: 'upper',
  identifierCase: 'preserve',
  dataTypeCase: 'preserve',
  functionCase: 'upper',
  tabWidth: 2,
  useTabs: false,
  logicalOperatorNewline: 'before',
  indentStyle: 'standard',
  expressionWidth: 50,
  linesBetweenQueries: 2,
  denseOperators: false,
  newlineBeforeSemicolon: false,
};

let _formatter: typeof import('sql-formatter') | null = null;

async function getFormatter() {
  if (!_formatter) {
    _formatter = await import('sql-formatter');
  }
  return _formatter;
}

export async function formatSqlText(input: string, options?: Partial<FormatOptions>): Promise<string> {
  if (!input.trim()) return input;
  try {
    const { format } = await getFormatter();
    return format(input, { ...DEFAULT_OPTIONS, ...options });
  } catch (err: any) {
    // If the formatter can't parse, return the original text so the user can keep editing.
    return input;
  }
}
