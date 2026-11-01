import { useEffect, useState } from 'react';
import { useApp } from '@/shared/stores/app';
import { Hex } from '@/shared/theme/glyphs';

const FrameMs = 260;

export function Spinner(props: { label?: string }) {
  const colors = useApp((state) => state.colors);
  const [isFilled, setIsFilled] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setIsFilled((current) => !current), FrameMs);
    return () => clearInterval(timer);
  }, []);

  return (
    <text fg={colors.accent}>
      {isFilled ? Hex.filled : Hex.hollow}
      {props.label ? <span fg={colors.muted}> {props.label}</span> : ''}
    </text>
  );
}
