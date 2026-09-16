import { useState } from 'react';
import { git } from '../services/git';
import { useWorkspace } from '../stores/workspace';
import type { ServiceError } from '../types/workspace';

/// Development-only proof that every Git command reaches the backend through the typed adapter
/// and the window capability. It is never part of the shipped interface: App.tsx renders it only
/// under import.meta.env.DEV, which the production build folds away along with this module.
const HARNESS_MARKER = 'tbce-git-harness-dev-only';

type Call = { label: string; run: (id: string) => Promise<unknown> };

const calls: Call[] = [
  { label: 'detect', run: (id) => git.detect(id) },
  { label: 'status', run: (id) => git.status(id) },
  { label: 'branches', run: (id) => git.branches(id) },
  { label: 'history', run: (id) => git.history(id, 0, 20) },
  { label: 'diffSummary (worktree)', run: (id) => git.diffSummary(id, false) },
  { label: 'diffSummary (index)', run: (id) => git.diffSummary(id, true) },
  { label: 'stageAll', run: (id) => git.stageAll(id) },
];

export default function GitHarness() {
  const workspace = useWorkspace((s) => s.workspace);
  const [result, setResult] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const perform = async (
    label: string,
    run: (id: string) => Promise<unknown>,
  ) => {
    if (!workspace || busy) return;
    setBusy(true);
    setError(null);
    try {
      const value = await run(workspace.id);
      setResult(`${label}\n${JSON.stringify(value, null, 2)}`);
    } catch (thrown) {
      const failure = thrown as ServiceError;
      setResult('');
      setError(
        `${failure?.code ?? 'ERROR'}: ${failure?.message ?? String(thrown)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  if (!workspace) return null;
  return (
    <section className="git-harness" data-marker={HARNESS_MARKER}>
      <h2>Git harness (development only)</h2>
      <div className="git-harness-actions">
        {calls.map((call) => (
          <button
            key={call.label}
            disabled={busy}
            onClick={() => void perform(call.label, call.run)}
          >
            {call.label}
          </button>
        ))}
      </div>
      <div className="git-harness-actions">
        <input
          value={text}
          placeholder="branch name, path or message"
          aria-label="Git harness argument"
          onChange={(event) => setText(event.target.value)}
        />
        <button
          disabled={busy}
          onClick={() =>
            void perform('createBranch', (id) => git.createBranch(id, text))
          }
        >
          createBranch
        </button>
        <button
          disabled={busy}
          onClick={() =>
            void perform('checkoutBranch', (id) => git.checkoutBranch(id, text))
          }
        >
          checkoutBranch
        </button>
        <button
          disabled={busy}
          onClick={() =>
            void perform('deleteBranch', (id) => git.deleteBranch(id, text))
          }
        >
          deleteBranch
        </button>
        <button
          disabled={busy}
          onClick={() => void perform('stage', (id) => git.stage(id, [text]))}
        >
          stage
        </button>
        <button
          disabled={busy}
          onClick={() =>
            void perform('unstage', (id) => git.unstage(id, [text]))
          }
        >
          unstage
        </button>
        <button
          disabled={busy}
          onClick={() =>
            void perform('diff', (id) => git.diff(id, text, false))
          }
        >
          diff
        </button>
        <button
          disabled={busy}
          onClick={() => void perform('commit', (id) => git.commit(id, text))}
        >
          commit
        </button>
        <button
          disabled={busy}
          onClick={() =>
            void perform('init', (id) => git.init(id, text || null))
          }
        >
          init
        </button>
        <button
          disabled={busy}
          onClick={() =>
            void perform('clone', (id) => git.clone(id, text, 'tbce-clone'))
          }
        >
          clone
        </button>
        <button
          disabled={busy}
          onClick={() => void perform('fetch', (id) => git.fetch(id))}
        >
          fetch
        </button>
        <button
          disabled={busy}
          onClick={() => void perform('pull', (id) => git.pull(id))}
        >
          pull
        </button>
        <button
          disabled={busy}
          onClick={() => void perform('push', (id) => git.push(id))}
        >
          push
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {result && <pre>{result}</pre>}
    </section>
  );
}
