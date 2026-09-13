import {
  AlertTriangle,
  ChevronDown,
  RotateCcw,
  Terminal as TerminalIcon,
  X,
} from 'lucide-react';
import TerminalView from './Terminal';
import { actions, useTerminal } from '../stores/terminal';
export default function TerminalPanel() {
  const state = useTerminal();
  return (
    <>
      <div className="terminal-heading">
        <TerminalIcon size={13} />
        <span>TERMINAL</span>
        <span className="panel-tag">
          {state.session?.shell.toUpperCase() ??
            (state.busy ? 'STARTING' : 'SHELL')}
        </span>
        <span className="terminal-spacer" />
        <button
          className="icon-button"
          title="Restart terminal"
          aria-label="Restart terminal"
          disabled={state.busy}
          onClick={() => void actions.restart()}
        >
          <RotateCcw size={14} />
        </button>
        <button
          className="icon-button"
          title="Hide terminal (Ctrl+`)"
          aria-label="Hide terminal"
          onClick={actions.hide}
        >
          <ChevronDown size={15} />
        </button>
        <button
          className="icon-button"
          title="Close terminal"
          aria-label="Close terminal"
          disabled={state.busy}
          onClick={() => void actions.close()}
        >
          <X size={15} />
        </button>
      </div>
      {state.error && (
        <div className="error-banner" role="alert">
          <AlertTriangle size={15} />
          <span>{state.error}</span>
          <button
            aria-label="Dismiss terminal error"
            onClick={actions.dismissError}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {state.status === 'exited' && (
        <div className="conflict-banner" role="status">
          <AlertTriangle size={15} />
          <span>
            The shell exited with code {state.exitCode}. Restart to run another.
          </span>
          <button disabled={state.busy} onClick={() => void actions.restart()}>
            Restart
          </button>
        </div>
      )}
      <TerminalView />
    </>
  );
}
