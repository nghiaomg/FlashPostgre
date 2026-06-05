import { Button, Flex, Text } from '@radix-ui/themes';
import { PlusIcon } from '@radix-ui/react-icons';
import type { ConnectionConfig } from '@/types';

interface Props {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}

export function EmptyState({ title, description, actionLabel, onAction }: Props) {
  return (
    <Flex className="fp-empty" direction="column" align="center" justify="center" height="100%">
      <h3>{title}</h3>
      <p>{description}</p>
      <Button mt="3" onClick={onAction} variant="solid">
        <PlusIcon /> {actionLabel}
      </Button>
    </Flex>
  );
}
