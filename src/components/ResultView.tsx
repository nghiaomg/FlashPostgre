import { Box, Flex, Text, Spinner, Button, Tooltip, IconButton } from '@radix-ui/themes';
import { DownloadIcon, CopyIcon, CheckIcon } from '@radix-ui/react-icons';
import { useState } from 'react';
import type { QueryResult } from '@/types';
import { rowsToCsv, rowsToJson, downloadText } from '@/lib/exporters';

interface Props {
  result: QueryResult;
  /** Optional filename prefix (e.g. table name). If absent we use "query-result". */
  filenamePrefix?: string;
}

export function ResultView({ result, filenamePrefix }: Props) {
  const [copied, setCopied] = useState(false);

  if (!result.ok) {
    return (
      <Box p="3">
        <Box className="fp-error">{result.error}</Box>
      </Box>
    );
  }

  const { rows, fields, rowCount, elapsedMs, command } = result;
  const prefix = filenamePrefix || 'query-result';

  const copyTsv = async () => {
    const csv = rowsToCsv(rows, fields);
    try {
      await navigator.clipboard.writeText(csv);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <Box>
      <Flex
        align="center"
        gap="3"
        px="3"
        py="2"
        style={{ borderBottom: '1px solid var(--gray-a4)' }}
      >
        <Text size="1" color="gray">
          {command ? `${command.toUpperCase()} · ` : ''}
          {rowCount} row{rowCount === 1 ? '' : 's'}
        </Text>
        <Text size="1" color="gray">
          · {elapsedMs} ms
        </Text>
        {fields.length > 0 && (
          <Text size="1" color="gray">
            · {fields.length} column{fields.length === 1 ? '' : 's'}
          </Text>
        )}
        <Flex gap="1" ml="auto">
          <Tooltip content={copied ? 'Copied' : 'Copy as TSV'}>
            <IconButton size="1" variant="ghost" onClick={copyTsv}>
              {copied ? <CheckIcon /> : <CopyIcon />}
            </IconButton>
          </Tooltip>
          <Button
            size="1"
            variant="soft"
            onClick={() => downloadText(`${prefix}.csv`, rowsToCsv(rows, fields), 'text/csv;charset=utf-8')}
            disabled={rows.length === 0}
          >
            <DownloadIcon /> CSV
          </Button>
          <Button
            size="1"
            variant="soft"
            onClick={() => downloadText(`${prefix}.json`, rowsToJson(rows), 'application/json;charset=utf-8')}
            disabled={rows.length === 0}
          >
            <DownloadIcon /> JSON
          </Button>
        </Flex>
      </Flex>

      {rows.length === 0 ? (
        <Flex align="center" justify="center" p="6">
          <Text size="2" color="gray">Query returned no rows.</Text>
        </Flex>
      ) : (
        <Box style={{ overflow: 'auto', maxHeight: '100%' }}>
          <table className="fp-result-table">
            <thead>
              <tr>
                {fields.map((f) => (
                  <th key={f.name}>{f.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {fields.map((f) => (
                    <td key={f.name}>{formatCell(row[f.name])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      )}
    </Box>
  );
}

function formatCell(value: unknown): JSX.Element {
  if (value === null || value === undefined) {
    return <span className="fp-null">NULL</span>;
  }
  if (typeof value === 'object') {
    return <span>{JSON.stringify(value)}</span>;
  }
  if (typeof value === 'string' && value.length > 200) {
    return <span title={value}>{value.slice(0, 200)}…</span>;
  }
  return <span>{String(value)}</span>;
}
