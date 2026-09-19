import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PullFileView from '../src/github/PullFileView';
import DiffView from '../src/git/DiffView';
import { useGitHub } from '../src/stores/github';
import { useGit } from '../src/stores/git';
import type { GitHubPullFile } from '../src/types/github';
// Monaco needs a real browser, so the editor is replaced by one that records what it was given.
const shown = vi.hoisted(() => ({
  value: '',
  options: {} as Record<string, unknown>,
}));
vi.mock('../src/editor/monaco', () => ({
  monaco: {
    editor: {
      createModel: (value: string, language: string) => {
        shown.value = value;
        return {
          language,
          setValue: (next: string) => (shown.value = next),
          dispose: () => {},
        };
      },
      create: (_host: HTMLElement, options: Record<string, unknown>) => {
        shown.options = options;
        return {
          getModel: () => options.model,
          dispose: () => {},
        };
      },
    },
  },
}));
vi.mock('../src/services/git', () => ({ git: {} }));
vi.mock('../src/services/github', () => ({ github: {} }));
const file: GitHubPullFile = {
  path: 'src/login.ts',
  previousPath: 'src/signin.ts',
  status: 'renamed',
  additions: 2,
  deletions: 1,
  patch: '@@ -1 +1 @@\n-giriş\n+oturum',
};
beforeEach(() => {
  useGitHub.setState(useGitHub.getInitialState(), true);
  useGit.setState(useGit.getInitialState(), true);
  shown.value = '';
  shown.options = {};
});

test('a pull request patch is shown read-only as GitHub sent it', () => {
  useGitHub.setState({ pullFile: { number: 12, file } });

  render(<PullFileView />);

  expect(screen.getByText('Pull request #12')).toBeInTheDocument();
  expect(screen.getByText('src/signin.ts → src/login.ts')).toBeInTheDocument();
  expect(screen.getByText('+2')).toBeInTheDocument();
  expect(screen.getByText('−1')).toBeInTheDocument();
  expect(shown.value).toBe(file.patch);
  expect(shown.options).toMatchObject({
    readOnly: true,
    ariaLabel: 'Pull request patch',
  });
  expect(screen.queryByRole('status')).toBeNull();
});

test('a file GitHub sent no patch for says so', () => {
  useGitHub.setState({
    pullFile: { number: 12, file: { ...file, patch: null } },
  });

  render(<PullFileView />);

  expect(screen.getByRole('status')).toHaveTextContent(
    'GitHub sent no patch for this file',
  );
  expect(shown.value).toBe('');
});

test('closing the patch forgets it', () => {
  useGitHub.setState({ pullFile: { number: 12, file } });
  render(<PullFileView />);

  fireEvent.click(screen.getByRole('button', { name: 'Close patch' }));

  expect(useGitHub.getState().pullFile).toBeNull();
});

test('the local diff keeps its own labels and banners on the shared view', () => {
  useGit.setState({
    selected: { path: 'logo.png', staged: true },
    diff: {
      path: 'logo.png',
      originalPath: null,
      staged: true,
      patch: '',
      binary: true,
      truncated: false,
      added: null,
      removed: null,
    },
  });

  render(<DiffView />);

  expect(screen.getByText('Staged changes')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('binary file');
  expect(shown.options).toMatchObject({ ariaLabel: 'Diff preview' });
  fireEvent.click(screen.getByRole('button', { name: 'Close diff' }));
  expect(useGit.getState().selected).toBeNull();
});
