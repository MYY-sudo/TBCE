import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
export async function guardWindowClose(canClose: () => Promise<boolean>) {
  if (!isTauri()) return () => {};
  return getCurrentWindow().onCloseRequested(async (event) => {
    event.preventDefault();
    if (await canClose()) await getCurrentWindow().destroy();
  });
}
