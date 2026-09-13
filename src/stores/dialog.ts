import { create } from 'zustand';
export interface DialogRequest {
  title: string;
  message: string;
  input?: string;
  actions: { label: string; value: string; danger?: boolean }[];
}
interface DialogState {
  request: DialogRequest | null;
  resolve: ((value: string | null) => void) | null;
}
export const useDialog = create<DialogState>(() => ({
  request: null,
  resolve: null,
}));
export function ask(request: DialogRequest): Promise<string | null> {
  return new Promise((resolve) => useDialog.setState({ request, resolve }));
}
export function answer(value: string | null) {
  const resolve = useDialog.getState().resolve;
  useDialog.setState({ request: null, resolve: null });
  resolve?.(value);
}
