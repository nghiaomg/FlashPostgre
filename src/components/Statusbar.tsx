import { Flex, Text, Box } from '@radix-ui/themes';
import { DotFilledIcon, StackIcon, GlobeIcon, BookmarkIcon } from '@radix-ui/react-icons';
import type { ConnectionConfig } from '@/types';

interface Props {
  activeConnection: ConnectionConfig | null;
  tabCount: number;
  snippetCount?: number;
}

const ENV_COLOR: Record<string, string> = {
  prod: 'var(--red-9)',
  staging: 'var(--amber-9)',
  dev: 'var(--green-9)',
  local: 'var(--gray-9)',
  custom: 'var(--indigo-9)',
};

export function Statusbar({ activeConnection, tabCount, snippetCount = 0 }: Props) {
  return (
    <Flex className="fp-statusbar" align="center" gap="3">
      {activeConnection ? (
        <Flex align="center" gap="1">
          <Box
            style={{
              width: 8,
              height: 8,
              borderRadius: 8,
              background: activeConnection.color || ENV_COLOR[activeConnection.env] || 'var(--gray-9)',
            }}
          />
          <DotFilledIcon width={8} height={8} color="var(--green-9)" />
          <Text size="1">
            {activeConnection.name}{' '}
            <Text color="gray">({activeConnection.envLabel ?? activeConnection.env})</Text>
          </Text>
        </Flex>
      ) : (
        <Flex align="center" gap="1">
          <DotFilledIcon width={8} height={8} color="var(--gray-8)" />
          <Text size="1" color="gray">
            Disconnected
          </Text>
        </Flex>
      )}
      <Flex align="center" gap="1">
        <GlobeIcon /> <Text size="1" color="gray">PostgreSQL</Text>
      </Flex>
      <Flex align="center" gap="1">
        <StackIcon /> <Text size="1" color="gray">{tabCount} tab{tabCount === 1 ? '' : 's'}</Text>
      </Flex>
      <Flex align="center" gap="1">
        <BookmarkIcon /> <Text size="1" color="gray">{snippetCount} snippet{snippetCount === 1 ? '' : 's'}</Text>
      </Flex>
    </Flex>
  );
}
