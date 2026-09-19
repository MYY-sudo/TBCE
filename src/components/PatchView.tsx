import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { monaco } from '../editor/monaco';
/// A read-only unified patch in Monaco with `diff` highlighting. Local Git diffs and the patches
/// GitHub sends for a pull request's files both arrive as unified patches rather than two file
/// versions, so both are shown here instead of in a Monaco diff editor.
export interface PatchViewProps {
  heading: string;
  path: string | undefined;
  originalPath?: string | null;
  added?: number | null;
  removed?: number | null;
  patch: string;
  closeLabel: string;
  ariaLabel: string;
  onClose: () => void;
  /// Banners shown above the patch, such as a binary file or a truncated patch.
  children?: ReactNode;
}
export function PatchView({
  heading,
  path,
  originalPath,
  added,
  removed,
  patch,
  closeLabel,
  ariaLabel,
  onClose,
  children,
}: PatchViewProps) {
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
      ariaLabel,
      model,
    });
    editor.current = created;
    return () => {
      editor.current = null;
      created.dispose();
      model.dispose();
    };
  }, [ariaLabel]);
  useEffect(() => {
    editor.current?.getModel()?.setValue(patch);
  }, [patch]);
  return (
    <>
      <div className="breadcrumbs diff-heading">
        <span>{heading}</span>
        <span>/</span>
        <span>{originalPath ? `${originalPath} → ${path}` : path}</span>
        <span className="diff-spacer" />
        {(added != null || removed != null) && (
          <span className="diff-counts">
            {added != null && <span className="scm-added">+{added}</span>}
            {removed != null && <span className="scm-removed">−{removed}</span>}
          </span>
        )}
        <button
          className="icon-button"
          title={closeLabel}
          aria-label={closeLabel}
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
      {children}
      <div className="monaco-host" ref={host} />
    </>
  );
}
