import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { TerminalEvent, TerminalSession } from '../types/terminal';
function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri())
    return Promise.reject({
      code: 'DESKTOP_REQUIRED',
      message:
        'Open the TBCE desktop app to use the terminal. Use npm run tauri dev during development.',
    });
  return invoke<T>(command, args);
}
export const terminal = {
  start: (workspaceId: string) =>
    call<TerminalSession>('start_terminal', { workspaceId }),
  restart: (workspaceId: string, id: string) =>
    call<TerminalSession>('restart_terminal', { workspaceId, id }),
  write: (id: string, data: string) =>
    call<void>('write_terminal', { id, data }),
  resize: (id: string, cols: number, rows: number) =>
    call<void>('resize_terminal', { id, cols, rows }),
  stop: (id: string) => call<void>('stop_terminal', { id }),
  listen: (handler: (event: TerminalEvent) => void): Promise<() => void> =>
    isTauri()
      ? listen<TerminalEvent>('terminal:event', (event) =>
          handler(event.payload),
        )
      : Promise.resolve(() => {}),
};
