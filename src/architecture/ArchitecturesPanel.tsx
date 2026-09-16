import { useEffect, useState } from 'react';
import { architectureActions, useArchitectures } from '../stores/architecture';
import type { Architecture, ArchitectureFields } from '../types/architecture';
import { StackModal } from '../templates/StackDialogs';
import { StructureTree } from './ArchitectureControls';

export function ArchitectureDialog({
  architecture,
  onClose,
}: {
  architecture?: Architecture;
  onClose: () => void;
}) {
  const { busy, error } = useArchitectures();
  const [fields, setFields] = useState<ArchitectureFields>(
    architecture ?? {
      name: '',
      description: '',
      boundaries: '',
      directories: [],
      files: [],
    },
  );
  const [directories, setDirectories] = useState(fields.directories.join('\n'));
  const paths = directories
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const close = () => {
    if (dirty) setConfirmClose(true);
    else onClose();
  };
  return (
    <StackModal
      title={architecture ? 'Edit architecture' : 'New architecture'}
      busy={busy}
      onClose={close}
    >
      <form
        onChange={() => setDirty(true)}
        onSubmit={(e) => {
          e.preventDefault();
          void architectureActions
            .save(architecture?.id ?? null, { ...fields, directories: paths })
            .then((ok) => {
              if (ok) onClose();
            });
        }}
      >
        <label className="field">
          <span>Name</span>
          <input
            autoFocus
            required
            disabled={busy}
            value={fields.name}
            onChange={(e) => setFields({ ...fields, name: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea
            disabled={busy}
            value={fields.description}
            onChange={(e) =>
              setFields({ ...fields, description: e.target.value })
            }
          />
        </label>
        <label className="field">
          <span>Recommended boundaries</span>
          <textarea
            disabled={busy}
            value={fields.boundaries}
            onChange={(e) =>
              setFields({ ...fields, boundaries: e.target.value })
            }
            placeholder="Describe responsibilities and dependencies between layers."
          />
        </label>
        <label className="field">
          <span>Folders (one relative path per line)</span>
          <textarea
            className="architecture-code"
            disabled={busy}
            value={directories}
            onChange={(e) => setDirectories(e.target.value)}
            placeholder={'src/domain\nsrc/application'}
          />
        </label>
        <span className="field-legend">STARTER FILES</span>
        {fields.files.map((file, index) => (
          <fieldset className="starter-file" key={index} disabled={busy}>
            <label className="field">
              <span>File path {index + 1}</span>
              <input
                required
                value={file.path}
                placeholder="src/domain/README.md"
                onChange={(e) =>
                  setFields({
                    ...fields,
                    files: fields.files.map((f, i) =>
                      i === index ? { ...f, path: e.target.value } : f,
                    ),
                  })
                }
              />
            </label>
            <label className="field">
              <span>File content {index + 1}</span>
              <textarea
                className="architecture-code"
                spellCheck={false}
                value={file.content}
                onChange={(e) =>
                  setFields({
                    ...fields,
                    files: fields.files.map((f, i) =>
                      i === index ? { ...f, content: e.target.value } : f,
                    ),
                  })
                }
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setDirty(true);
                setFields({
                  ...fields,
                  files: fields.files.filter((_, i) => i !== index),
                });
              }}
            >
              Remove file {index + 1}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setDirty(true);
            setFields({
              ...fields,
              files: [...fields.files, { path: '', content: '' }],
            });
          }}
        >
          Add starter file
        </button>
        <p className="field-note">
          Files are copied as UTF-8 text. Use / between folders. Git and TBCE
          metadata paths are reserved.
        </p>
        <StructureTree
          entries={[
            ...paths.map((path) => ({ path, directory: true })),
            ...fields.files
              .filter((f) => f.path)
              .map((f) => ({ path: f.path, directory: false })),
          ]}
        />
        {error && (
          <p className="stack-error" role="alert">
            {error}
          </p>
        )}
        {confirmClose && (
          <div role="alert">
            <p>Discard your unsaved architecture changes?</p>
            <button type="button" disabled={busy} onClick={onClose}>
              Discard changes
            </button>
            <button type="button" onClick={() => setConfirmClose(false)}>
              Keep editing
            </button>
          </div>
        )}
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={busy || !fields.name.trim()}>
            Save architecture
          </button>
        </div>
      </form>
    </StackModal>
  );
}

export function ArchitecturesPanel() {
  const { architectures, warnings, busy, error } = useArchitectures();
  const [editing, setEditing] = useState<Architecture | 'new' | null>(null);
  useEffect(() => {
    void architectureActions.load();
  }, []);
  return (
    <aside className="explorer stacks-panel">
      <div className="panel-heading">
        <span>ARCHITECTURES</span>
        <span className="panel-tag">PERSONAL</span>
      </div>
      <div className="stacks-content">
        <p className="muted">
          Define reusable folders, starter files and layer boundaries for new
          projects.
        </p>
        <button
          disabled={busy}
          onClick={() => {
            architectureActions.dismissError();
            setEditing('new');
          }}
        >
          New architecture
        </button>
        <button disabled={busy} onClick={() => void architectureActions.load()}>
          Refresh library
        </button>
        {busy && !editing && <p role="status">Loading architectures…</p>}
        {!busy && !error && !architectures.length && (
          <div className="stack-empty">
            <h3>No saved architectures yet</h3>
            <p>Create your first structure to use when starting a project.</p>
          </div>
        )}
        {error && !editing && (
          <p role="alert" className="stack-error">
            {error}
          </p>
        )}
        {warnings.map((w) => (
          <p className="stack-error" key={w}>
            {w}
          </p>
        ))}
        {architectures.map((a) => (
          <article className="stack-card" key={a.id}>
            <h3>{a.name}</h3>
            <p>{a.description}</p>
            <p className="architecture-boundaries">{a.boundaries}</p>
            <details>
              <summary>Folder structure · {a.files.length} files</summary>
              <StructureTree
                entries={[
                  ...a.directories.map((path) => ({ path, directory: true })),
                  ...a.files.map((f) => ({ path: f.path, directory: false })),
                ]}
              />
            </details>
            <div className="stack-card-actions">
              <button
                disabled={busy}
                onClick={() => {
                  architectureActions.dismissError();
                  setEditing(a);
                }}
              >
                Edit architecture
              </button>
              <button
                disabled={busy}
                onClick={() => void architectureActions.delete(a.id)}
              >
                Delete architecture
              </button>
            </div>
          </article>
        ))}
      </div>
      {editing && (
        <ArchitectureDialog
          architecture={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </aside>
  );
}
