import { expect, test } from 'vitest';
import { createTerminal } from '../src/terminal/xterm';
test('the terminal answers the cursor query ConPTY waits for', async () => {
  // ConPTY does not start the shell until this report arrives, so the emulator must produce it.
  const { term } = createTerminal();
  const replies: string[] = [];
  term.onData((data) => replies.push(data));
  await new Promise<void>((resolve) => term.write('\x1b[6n', resolve));
  expect(replies.join('')).toContain('\x1b[1;1R');
  term.dispose();
});
