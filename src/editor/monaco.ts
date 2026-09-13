import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new JsonWorker();
    if (['css', 'scss', 'less'].includes(label)) return new CssWorker();
    if (['html', 'handlebars', 'razor'].includes(label))
      return new HtmlWorker();
    if (['typescript', 'javascript'].includes(label)) return new TsWorker();
    return new EditorWorker();
  },
};
monaco.editor.defineTheme('tbce', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#191c21',
    'editorLineNumber.foreground': '#555c68',
    'editor.lineHighlightBackground': '#20242b',
    'editor.selectionBackground': '#3d5269',
    'editorCursor.foreground': '#a9c79b',
  },
});
export function languageFor(path: string) {
  const name = path.split('/').pop() ?? '';
  if (name === 'Dockerfile') return 'dockerfile';
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  const languages: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    json: 'json',
    css: 'css',
    scss: 'scss',
    html: 'html',
    md: 'markdown',
    rs: 'rust',
    py: 'python',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'ini',
    sh: 'shell',
    ps1: 'powershell',
    sql: 'sql',
    xml: 'xml',
    svg: 'xml',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    cs: 'csharp',
    go: 'go',
    java: 'java',
  };
  return languages[extension] ?? 'plaintext';
}
export { monaco };
