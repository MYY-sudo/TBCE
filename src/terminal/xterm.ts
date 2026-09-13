import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
export function createTerminal() {
  const term = new Terminal({
    fontFamily: "'Cascadia Code', Consolas, monospace",
    fontSize: 13,
    lineHeight: 1.25,
    cursorBlink: true,
    scrollback: 5000,
    theme: {
      background: '#16191e',
      foreground: '#cfd4dc',
      cursor: '#adc99b',
      selectionBackground: '#3d5269',
    },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  return { term, fit };
}
