export interface TerminalSession {
  id: string;
  shell: string;
}
export type TerminalStatus = 'idle' | 'running' | 'exited';
export type TerminalEvent =
  | { kind: 'output'; id: string; data: string }
  | { kind: 'exit'; id: string; code: number };
