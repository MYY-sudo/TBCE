import { useEffect, useRef } from 'react';
import { actions, useWorkspace } from '../stores/workspace';
import { monaco, languageFor } from './monaco';
export default function Editor() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const models = new Map<string, monaco.editor.ITextModel>();
    const views = new Map<string, monaco.editor.ICodeEditorViewState | null>();
    let current: string | null = null;
    let syncing = false;
    const editor = monaco.editor.create(host.current!, {
      theme: 'tbce',
      automaticLayout: true,
      fontFamily: "'Cascadia Code', Consolas, monospace",
      fontSize: 14,
      lineHeight: 23,
      tabSize: 2,
      minimap: { enabled: false },
      padding: { top: 18 },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      renderLineHighlight: 'line',
      ariaLabel: 'Code editor',
      model: null,
    });
    const sync = () => {
      const state = useWorkspace.getState();
      syncing = true;
      for (const tab of state.tabs) {
        let model = models.get(tab.id);
        if (!model) {
          model = monaco.editor.createModel(
            tab.content,
            languageFor(tab.path),
            monaco.Uri.parse(
              `inmemory://tbce/${tab.id}/${encodeURIComponent(tab.path)}`,
            ),
          );
          models.set(tab.id, model);
        }
        if (model.getValue() !== tab.content) model.setValue(tab.content);
        if (model.getLanguageId() !== languageFor(tab.path))
          monaco.editor.setModelLanguage(model, languageFor(tab.path));
      }
      if (current !== state.activeId) {
        if (current) views.set(current, editor.saveViewState());
        current = state.activeId;
        editor.setModel(current ? (models.get(current) ?? null) : null);
        if (current && views.get(current))
          editor.restoreViewState(views.get(current)!);
        if (current) editor.focus();
        const position = editor.getPosition();
        if (position)
          useWorkspace.setState({
            cursor: { line: position.lineNumber, column: position.column },
          });
      }
      for (const [id, model] of models)
        if (!state.tabs.some((t) => t.id === id)) {
          model.dispose();
          models.delete(id);
          views.delete(id);
        }
      editor.updateOptions({ readOnly: state.busy });
      syncing = false;
    };
    const change = editor.onDidChangeModelContent(() => {
      if (!syncing && current) actions.edit(current, editor.getValue());
    });
    const cursor = editor.onDidChangeCursorPosition((e) =>
      useWorkspace.setState({
        cursor: { line: e.position.lineNumber, column: e.position.column },
      }),
    );
    const unsubscribe = useWorkspace.subscribe((state, previous) => {
      if (
        state.tabs !== previous.tabs ||
        state.activeId !== previous.activeId ||
        state.busy !== previous.busy
      )
        sync();
    });
    sync();
    return () => {
      unsubscribe();
      change.dispose();
      cursor.dispose();
      editor.dispose();
      for (const model of models.values()) model.dispose();
    };
  }, []);
  return <div className="monaco-host" ref={host} />;
}
