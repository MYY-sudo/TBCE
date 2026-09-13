import { useEffect, useState } from 'react';
import { stackActions, useStacks } from '../stores/stack';
import { useWorkspace } from '../stores/workspace';
import { useProject } from '../stores/project';
import { NewProjectDialog, SaveStackDialog } from './StackDialogs';
import type { Stack } from '../types/stack';

export function StacksPanel() {
  const { stacks, warnings, busy, error } = useStacks();
  const workspace = useWorkspace((s) => s.workspace);
  const workspaceBusy = useWorkspace((s) => s.busy);
  const projectBusy = useProject((s) => s.busy);
  const [dialog, setDialog] = useState<{
    kind: 'save' | 'edit' | 'create';
    stack?: Stack;
  } | null>(null);
  useEffect(() => {
    void stackActions.load();
  }, []);
  const disabled = busy || workspaceBusy || projectBusy;
  return (
    <aside className="explorer stacks-panel">
      <div className="panel-heading">
        <span>STACKS</span>
        <span className="panel-tag">PERSONAL</span>
      </div>
      <div className="stacks-content">
        <p className="muted">
          Save a project's files and defaults to use again.
        </p>
        <button
          disabled={disabled || !workspace}
          onClick={() => {
            stackActions.dismissError();
            setDialog({ kind: 'save' });
          }}
        >
          Save current project as stack
        </button>
        <button
          disabled={disabled}
          onClick={() => setDialog({ kind: 'create' })}
        >
          New project
        </button>
        <button disabled={disabled} onClick={() => void stackActions.load()}>
          Refresh library
        </button>
        {busy && !dialog && <p role="status">Loading stacks…</p>}
        {!busy && !error && stacks.length === 0 && (
          <div className="stack-empty">
            <h3>No saved stacks yet</h3>
            <p>
              Open a project, select its starter files, and save your first
              stack.
            </p>
          </div>
        )}
        {error && !dialog && (
          <p role="alert" className="stack-error">
            {error}
          </p>
        )}
        {warnings.map((w) => (
          <p className="stack-error" key={w}>
            {w}
          </p>
        ))}
        {stacks.map((stack) => (
          <article className="stack-card" key={stack.id}>
            <h3>{stack.name}</h3>
            <p>{stack.description || 'Project snapshot'}</p>
            <p className="muted">
              {[...stack.languages, ...stack.frameworks].join(' · ')}
            </p>
            <p className="muted">
              {stack.entries.filter((e) => !e.directory).length} files
            </p>
            <div className="stack-card-actions">
              <button
                disabled={disabled}
                onClick={() => setDialog({ kind: 'create', stack })}
              >
                Use stack
              </button>
              <button
                disabled={disabled}
                onClick={() => {
                  stackActions.dismissError();
                  setDialog({ kind: 'edit', stack });
                }}
              >
                Edit details
              </button>
              <button
                disabled={disabled || !workspace}
                onClick={() => {
                  stackActions.dismissError();
                  setDialog({ kind: 'save', stack });
                }}
              >
                Replace from current project
              </button>
              <button
                disabled={disabled}
                onClick={() => void stackActions.delete(stack.id)}
              >
                Delete stack
              </button>
            </div>
          </article>
        ))}
      </div>
      {dialog?.kind === 'create' && (
        <NewProjectDialog
          initialStackId={dialog.stack?.id}
          onClose={() => setDialog(null)}
        />
      )}
      {(dialog?.kind === 'save' || dialog?.kind === 'edit') && (
        <SaveStackDialog
          stack={dialog.stack}
          editing={dialog.kind === 'edit'}
          onClose={() => setDialog(null)}
        />
      )}
    </aside>
  );
}
