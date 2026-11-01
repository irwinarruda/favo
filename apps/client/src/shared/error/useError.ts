import { ToastKind } from '@/shared/app/services/ToastService';
import { useApp } from '@/shared/stores/app';

export function useError() {
  const showToast = useApp((state) => state.showToast);

  function handle<Args extends unknown[]>(action: (...args: Args) => Promise<void>) {
    return async (...args: Args) => {
      try {
        await action(...args);
      } catch (error) {
        showToast(error instanceof Error ? error.message : String(error), ToastKind.error);
      }
    };
  }

  return { handle };
}
