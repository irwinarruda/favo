import type { ReactNode } from 'react';
import { useApp } from '@/shared/stores/app';

type DialogProps = { title: string; width?: number; children: ReactNode };

const DefaultWidth = 56;

export function Dialog({ title, width = DefaultWidth, children }: DialogProps) {
  const colors = useApp((state) => state.colors);
  return (
    <box position="absolute" left={0} top={0} width="100%" height="100%" alignItems="center" justifyContent="center">
      <box
        width={width}
        flexDirection="column"
        paddingX={2}
        paddingY={1}
        border
        borderStyle="rounded"
        borderColor={colors.accent}
        backgroundColor={colors.panel}
        title={` ${title} `}
      >
        {children}
      </box>
    </box>
  );
}
