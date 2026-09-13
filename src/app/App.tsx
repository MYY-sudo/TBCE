import { lazy, Suspense, useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Code2,
  Files,
  FolderOpen,
  PanelLeft,
  Save,
  SquareTerminal,
  X,
  Circle,
  AlertTriangle,
} from 'lucide-react';
import { actions, useWorkspace } from '../stores/workspace';
import { actions as terminalActions, useTerminal } from '../stores/terminal';
import { useDialog } from '../stores/dialog';
import { Dialog } from '../components/Dialog';
import { Explorer } from '../explorer/Explorer';
import { fileName, isDirty } from '../types/workspace';
import { guardWindowClose } from '../services/window';
const Editor = lazy(() => import('../editor/Editor'));
const TerminalPanel = lazy(() => import('../terminal/TerminalPanel'));
export function App() {
  const state = useWorkspace();
  const terminalVisible = useTerminal((s) => s.visible);
  const terminalSession = useTerminal((s) => s.session);
  const [sidebar, setSidebar] = useState(true);
  const [width, setWidth] = useState(252);
  const [dock, setDock] = useState(248);
  const active = state.tabs.find((t) => t.id === state.activeId);
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void guardWindowClose(actions.canCloseWindow)
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((error) => useWorkspace.setState({ error: String(error) }));
    const keydown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || useDialog.getState().request) return;
      const key = e.key.toLowerCase();
      if (['s', 'w', 'o', '`'].includes(key)) e.preventDefault();
      else return;
      if (key === 's') void (e.shiftKey ? actions.saveAll() : actions.save());
      if (key === 'w' && useWorkspace.getState().activeId)
        void actions.close(useWorkspace.getState().activeId!);
      if (key === 'o') void actions.openFile();
      if (key === '`') terminalActions.toggle();
    };
    const focus = () => {
      void actions.checkExternal();
    };
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (useWorkspace.getState().tabs.some(isDirty)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('focus', focus);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener('keydown', keydown, true);
      window.removeEventListener('focus', focus);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, []);
  return (
    <div className="app-shell">
      <header className="toolbar">
        <div className="brand">
          <span className="brand-mark">
            <Code2 size={19} />
          </span>
          TBCE
          <span className="brand-divider" />
        </div>
        <span className="toolbar-context">
          {state.workspace?.name ?? 'Workspace'}
          <span className="context-slash">/</span>
          <span className="muted">Editor</span>
        </span>
        <div className="toolbar-actions">
          <button
            disabled={state.busy}
            onClick={() => void actions.openWorkspace()}
          >
            <FolderOpen size={15} />
            Open folder
          </button>
          <button
            disabled={state.busy || !active || !isDirty(active)}
            onClick={() => void actions.save()}
          >
            <Save size={14} />
            Save
          </button>
          <button
            title="Save all (Ctrl+Shift+S)"
            disabled={state.busy || !state.tabs.some(isDirty)}
            onClick={() => void actions.saveAll()}
          >
            Save all
          </button>
          <span className="toolbar-separator" />
          <button
            className="icon-button"
            title="Toggle explorer"
            aria-label="Toggle explorer"
            onClick={() => setSidebar(!sidebar)}
          >
            <PanelLeft size={17} />
          </button>
        </div>
      </header>
      <div className="workbench">
        <nav className="activity-bar" aria-label="Workspace navigation">
          <button
            className="activity-active"
            title="Explorer"
            aria-label="Explorer"
            onClick={() => setSidebar(!sidebar)}
          >
            <Files size={21} />
          </button>
          <button
            className="activity-bottom"
            title="Toggle terminal (Ctrl+`)"
            aria-label="Toggle terminal"
            aria-pressed={terminalVisible}
            disabled={!state.workspace}
            onClick={terminalActions.toggle}
          >
            <SquareTerminal size={18} />
          </button>
        </nav>
        {sidebar && (
          <>
            <div style={{ width, flexShrink: 0 }}>
              <Explorer />
            </div>
            <div
              role="separator"
              aria-label="Resize explorer"
              aria-orientation="vertical"
              aria-valuenow={width}
              tabIndex={0}
              className="resize-handle"
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft')
                  setWidth((w) => Math.max(180, w - 16));
                if (e.key === 'ArrowRight')
                  setWidth((w) => Math.min(480, w + 16));
              }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  setWidth(Math.max(180, Math.min(480, e.clientX - 48)));
              }}
            />
          </>
        )}
        <main className="editor-area">
          <div className="tabs" role="tablist" aria-label="Open files">
            {state.tabs.map((tab) => (
              <div
                className={`tab ${state.activeId === tab.id ? 'active' : ''}`}
                key={tab.id}
              >
                <button
                  role="tab"
                  aria-selected={state.activeId === tab.id}
                  title={tab.path}
                  disabled={state.busy}
                  onClick={() => actions.activate(tab.id)}
                >
                  <Code2 size={14} />
                  <span>{fileName(tab.path)}</span>
                  {isDirty(tab) && (
                    <Circle
                      size={7}
                      fill="currentColor"
                      aria-label="Unsaved changes"
                    />
                  )}
                </button>
                <button
                  className="tab-close"
                  aria-label={`Close ${fileName(tab.path)}`}
                  disabled={state.busy}
                  onClick={() => void actions.close(tab.id)}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            {!state.tabs.length && <span className="empty-tab">Welcome</span>}
            <span className="tab-trailing">
              {state.tabs.length ? `${state.tabs.length} open` : 'TBCE'}
            </span>
          </div>
          {state.error && (
            <div className="error-banner" role="alert">
              <AlertTriangle size={15} />
              <span>{state.error}</span>
              <button aria-label="Dismiss error" onClick={actions.dismissError}>
                <X size={15} />
              </button>
            </div>
          )}
          {active?.external && (
            <div className="conflict-banner" role="status">
              <AlertTriangle size={15} />
              <span>
                {active.external === 'missing'
                  ? 'This file was removed or renamed outside TBCE. Your buffer is retained.'
                  : 'This file changed on disk. Your unsaved edits are retained.'}
              </span>
              {active.external === 'changed' && (
                <button
                  disabled={state.busy}
                  onClick={() => void actions.reload()}
                >
                  Reload
                </button>
              )}
            </div>
          )}
          {active ? (
            <>
              <div className="breadcrumbs">
                <span>{state.workspace?.name}</span>
                <span>/</span>
                <span>{active.path}</span>
              </div>
              <Suspense
                fallback={<div className="loading">Loading editor…</div>}
              >
                <Editor />
              </Suspense>
            </>
          ) : (
            <div className="welcome">
              <div className="welcome-inner">
                <span className="eyebrow">
                  <span className="live-dot" /> YOUR NEXT BUILD STARTS HERE
                </span>
                <div className="welcome-logo">
                  TBCE<span>.</span>
                </div>
                <h1>A place for your project.</h1>
                <p className="welcome-description">
                  Open your code. Find your flow.
                  <br />
                  Everything starts with a workspace.
                </p>
                <button
                  className="primary open-workspace"
                  disabled={state.busy}
                  onClick={() => void actions.openWorkspace()}
                >
                  <FolderOpen size={17} />
                  Open a folder
                  <ArrowUpRight size={16} />
                </button>
                <div className="welcome-rule" />
                <div className="shortcuts">
                  <div>
                    <span>Save file</span>
                    <kbd>Ctrl S</kbd>
                  </div>
                  <div>
                    <span>Open file</span>
                    <kbd>Ctrl O</kbd>
                  </div>
                  <div>
                    <span>Close tab</span>
                    <kbd>Ctrl W</kbd>
                  </div>
                  <div>
                    <span>Toggle terminal</span>
                    <kbd>Ctrl `</kbd>
                  </div>
                </div>
                <div className="welcome-note">
                  <span className="small-square" />
                  LOCAL FILES. YOUR WORKSPACE.
                </div>
              </div>
              <span className="welcome-version">
                TOOLS, BRANCHES, CODE, EVERYTHING<span>FOUNDATION / 0.1</span>
              </span>
            </div>
          )}
          {(terminalVisible || terminalSession) && (
            <div
              className="terminal-dock"
              hidden={!terminalVisible}
              style={{ height: dock }}
            >
              <div
                role="separator"
                aria-label="Resize terminal"
                aria-orientation="horizontal"
                aria-valuenow={dock}
                tabIndex={0}
                className="dock-handle"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp')
                    setDock((h) => Math.min(620, h + 16));
                  if (e.key === 'ArrowDown')
                    setDock((h) => Math.max(120, h - 16));
                }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId))
                    setDock(
                      Math.max(
                        120,
                        Math.min(620, window.innerHeight - e.clientY - 25),
                      ),
                    );
                }}
              />
              <Suspense
                fallback={<div className="loading">Loading terminal…</div>}
              >
                <TerminalPanel />
              </Suspense>
            </div>
          )}
        </main>
      </div>
      <footer className="status-bar">
        <span className="status-leading">
          <Check size={12} />
          {state.busy ? 'Working…' : state.status}
        </span>
        <span className="status-spacer" />
        {active && (
          <>
            <span>
              Ln {state.cursor.line}, Col {state.cursor.column}
            </span>
            <span>UTF-8{active.bom ? ' BOM' : ''}</span>
            <span>{active.content.includes('\r\n') ? 'CRLF' : 'LF'}</span>
            <span>{fileName(active.path).split('.').pop()}</span>
          </>
        )}
        <span className="status-local">
          <span className="live-dot" />
          Local
        </span>
      </footer>
      <Dialog />
    </div>
  );
}
