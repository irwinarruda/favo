import { useEffect } from 'react';
import { ToastKind } from '@/shared/app/services/ToastService';
import { useApp } from '@/shared/stores/app';
import { Hex } from '@/shared/theme/glyphs';

const ToastDurationMs = 4000;

export function ToastLine() {
  const colors = useApp((state) => state.colors);
  const toast = useApp((state) => state.toast);
  const clearToast = useApp((state) => state.clearToast);
  const isError = toast?.kind === ToastKind.error;

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => clearToast(toast.id), ToastDurationMs);
    return () => clearTimeout(timer);
  }, [toast?.id]);

  return (
    <box height={1} paddingX={2} flexShrink={0}>
      {!!toast && (
        <text fg={isError ? colors.danger : colors.success} wrapMode="none" truncate>
          {Hex.filled} {toast.message}
        </text>
      )}
    </box>
  );
}
