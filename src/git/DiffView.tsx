import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { actions, useGit } from '../stores/git';
import { monaco } from '../editor/monaco';
/// The backend answers with a unified patch rather than two file versions, so this is a read-only
/// patch view instead of a Monaco diff editor. It keeps Git's own rename, binary and truncation
/// reporting intact, and needs nothing from the backend that the milestone did not already deliver.
export default function DiffView() {
  const selected = useGit((s) => s.selected);
  const diff = useGit((s) => s.diff);
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  useEffect(() => {
    const model = monaco.editor.createModel('', 'diff');
    const created = monaco.editor.create(host.current!, {
      theme: 'tbce',
      automaticLayout: true,
      fontFamily: "'Cascadia Code', Consolas, monospace",
      fontSize: 13,
      lineHeight: 21,
      readOnly: true,
      minimap: { enabled: false },
      padding: { top: 14 },
      scrollBeyondLastLine: false,
      renderLineHighlight: 'none',
      lineNumbers: 'off',
      ariaLabel: 'Diff preview',
      model,
    });
    editor.current = created;
    return () => {
      editor.current = null;
      created.dispose();
      model.dispose();
    };
  }, []);
  useEffect(() => {
    editor.current?.getModel()?.setValue(diff?.patch ?? '');
  }, [diff]);
  return (
    <>
      <div className="breadcrumbs diff-heading">
        <span>{selected?.staged ? 'Staged changes' : 'Local changes'}</span>
        <span>/</span>
        <span>
          {diff?.originalPath
            ? `${diff.originalPath} → ${diff.path}`
            : (diff?.path ?? selected?.path)}
        </span>
        <span className="diff-spacer" />
        {diff && !diff.binary && (
          <span className="diff-counts">
            {diff.added !== null && (
              <span className="scm-added">+{diff.added}</span>
            )}
            {diff.removed !== null && (
              <span className="scm-removed">−{diff.removed}</span>
            )}
          </span>
        )}
        <button
          className="icon-button"
          title="Close diff"
          aria-label="Close diff"
          onClick={actions.closeDiff}
        >
          <X size={14} />
        </button>
      </div>
      {diff?.binary && (
        <div className="conflict-banner" role="status">
          <span>
            This is a binary file. Git reports that it changed, but there is no
            text to show.
          </span>
        </div>
      )}
      {diff?.truncated && (
        <div className="conflict-banner" role="status">
          <span>
            This patch is longer than TBCE will display. The part shown below is
            incomplete.
          </span>
        </div>
      )}
      <div className="monaco-host" ref={host} />
    </>
  );
}
