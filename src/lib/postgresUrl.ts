// Parse and format postgresql:// connection URLs.
// Supports both `postgresql://` and `postgres://` schemes.
//
// Examples:
//   postgresql://user:pass@localhost:5432/mydb
//   postgresql://user:pass@host:5432/mydb?sslmode=require&connect_timeout=10
//   postgres://user@host/db?ssl=true
import type { ConnectionConfig } from '@/types';

export interface ParsedUrl {
  user: string;
  password: string;
  host: string;
  port: number;
  database: string;
  sslmode?: 'disable' | 'allow' | 'prefer' | 'require' | 'verify-ca' | 'verify-full';
  connectTimeoutMillis?: number;
  statementTimeout?: number;
  applicationName?: string;
  // Catch-all for unknown query params, preserved for round-tripping
  extraQuery: Record<string, string>;
}

const DEFAULT_PORT = 5432;

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function encode(s: string): string {
  return encodeURIComponent(s);
}

function parseQuery(qs: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!qs) return out;
  for (const part of qs.split('&')) {
    if (!part) continue;
    const idx = part.indexOf('=');
    const key = idx === -1 ? part : part.slice(0, idx);
    const val = idx === -1 ? '' : part.slice(idx + 1);
    out[decode(key)] = decode(val);
  }
  return out;
}

function parseSslmode(value: string | undefined): ParsedUrl['sslmode'] {
  if (!value) return undefined;
  const v = value.toLowerCase();
  if (['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'].includes(v)) {
    return v as ParsedUrl['sslmode'];
  }
  return undefined;
}

function parseInt0(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : undefined;
}

export function parsePostgresUrl(url: string): ParsedUrl | { error: string } {
  if (!url || typeof url !== 'string') {
    return { error: 'Empty URL' };
  }
  const trimmed = url.trim();
  if (!/^postgres(ql)?:\/\//i.test(trimmed)) {
    return { error: 'URL must start with postgresql:// or postgres://' };
  }
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch (e: any) {
    return { error: `Invalid URL: ${e?.message ?? String(e)}` };
  }

  // Treat anything that isn't an absolute path as the database name
  const database = u.pathname.replace(/^\//, '');

  const extraQuery: Record<string, string> = {};
  const knownKeys = new Set([
    'sslmode', 'ssl', 'connect_timeout', 'statement_timeout', 'application_name',
  ]);
  for (const [k, v] of u.searchParams.entries()) {
    if (!knownKeys.has(k)) extraQuery[k] = v;
  }

  const sslmode = u.searchParams.get('sslmode') ?? undefined;
  const connectTimeoutRaw = u.searchParams.get('connect_timeout') ?? undefined;
  const statementTimeoutRaw = u.searchParams.get('statement_timeout') ?? undefined;
  const applicationName = u.searchParams.get('application_name') ?? undefined;

  return {
    user: decode(u.username),
    password: decode(u.password),
    host: u.hostname || 'localhost',
    port: u.port ? parseInt(u.port, 10) : DEFAULT_PORT,
    database,
    sslmode: parseSslmode(sslmode),
    connectTimeoutMillis: connectTimeoutRaw
      ? parseInt0(connectTimeoutRaw)! * 1000
      : undefined,
    statementTimeout: parseInt0(statementTimeoutRaw),
    applicationName,
    extraQuery,
  };
}

export function formatPostgresUrl(cfg: ConnectionConfig, opts?: { includePassword?: boolean }): string {
  const includePassword = opts?.includePassword !== false;
  const userInfo = cfg.user
    ? `${encode(cfg.user)}${includePassword && cfg.password ? `:${encode(cfg.password)}` : ''}@`
    : '';
  const port = cfg.port || DEFAULT_PORT;
  let url = `postgresql://${userInfo}${cfg.host}:${port}/${cfg.database}`;

  const params: string[] = [];
  if (cfg.ssl === true) params.push('ssl=true');
  else if (cfg.ssl === 'require') params.push('sslmode=require');
  else if (cfg.ssl === 'prefer') params.push('sslmode=prefer');
  if (cfg.connectionTimeoutMillis) {
    params.push(`connect_timeout=${Math.round(cfg.connectionTimeoutMillis / 1000)}`);
  }
  if (cfg.statementTimeout) {
    params.push(`statement_timeout=${cfg.statementTimeout}`);
  }
  if (params.length) url += `?${params.join('&')}`;
  return url;
}

export function urlToConfig(
  url: string,
  base: Partial<ConnectionConfig> = {}
): { config: ConnectionConfig; warnings: string[] } | { error: string } {
  const parsed = parsePostgresUrl(url);
  if ('error' in parsed) return { error: parsed.error };
  const warnings: string[] = [];
  if (parsed.extraQuery && Object.keys(parsed.extraQuery).length) {
    warnings.push(`Ignored unknown URL params: ${Object.keys(parsed.extraQuery).join(', ')}`);
  }
  const ssl: ConnectionConfig['ssl'] =
    parsed.sslmode === 'require' || parsed.sslmode === 'verify-ca' || parsed.sslmode === 'verify-full'
      ? 'require'
      : parsed.sslmode === 'prefer' || parsed.sslmode === 'allow'
        ? true
        : false;
  const config: ConnectionConfig = {
    ...base,
    id: base.id ?? `conn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: base.name ?? '',
    host: parsed.host,
    port: parsed.port,
    database: parsed.database,
    user: parsed.user,
    password: parsed.password,
    ssl,
    env: base.env ?? 'local',
    envLabel: base.envLabel,
    color: base.color,
    connectionTimeoutMillis: parsed.connectTimeoutMillis ?? 5000,
    statementTimeout: parsed.statementTimeout ?? 30000,
  };
  return { config, warnings };
}

export function configToUrl(cfg: ConnectionConfig, includePassword = false): string {
  return formatPostgresUrl(cfg, { includePassword });
}
