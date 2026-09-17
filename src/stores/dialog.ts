import { create } from 'zustand';
export interface DialogRequest {
  title: string;
  message: string;
  input?: string;
  /// Names the input for assistive technology. Defaults to Name, which is what most prompts ask for.
  label?: string;
  /// Masks the input and turns off autocompletion. A secret answer is resolved to the caller and
  /// never kept here: the typed value lives in the dialog component and dies with it.
  secret?: boolean;
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
