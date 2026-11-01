import type { ValueOf } from '@favo/domain/shared/value-of';
import type { ServiceCreator } from '@/shared/stores/app';

export const ToastKind = {
  success: 'success',
  error: 'error',
} as const;
export type ToastKind = ValueOf<typeof ToastKind>;

export type Toast = { id: number; message: string; kind: ToastKind };

export type ToastService = {
  toast?: Toast;
  showToast(message: string, kind?: ToastKind): void;
  clearToast(id: number): void;
};

export const createToastService: ServiceCreator<ToastService> = (set, get) => ({
  toast: undefined,
  showToast(message, kind = ToastKind.success) {
    const { toast } = get();
    set({ toast: { id: (toast?.id ?? 0) + 1, message, kind } });
  },
  clearToast(id) {
    const { toast } = get();
    if (toast?.id === id) set({ toast: undefined });
  },
});
