import { useEffect, useRef } from 'react';
import { actions } from '../stores/terminal';
import { createTerminal } from './xterm';
export default function TerminalView() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const { term, fit } = createTerminal();
    term.open(host.current!);
    const detach = actions.attach((data) => term.write(data));
    const input = term.onData(actions.send);
    const resized = term.onResize(({ cols, rows }) =>
      actions.resize(cols, rows),
    );
    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(host.current!);
    term.focus();
    void actions.start();
    return () => {
      observer.disconnect();
      resized.dispose();
      input.dispose();
      detach();
      term.dispose();
    };
  }, []);
  return <div className="terminal-host" ref={host} />;
}
