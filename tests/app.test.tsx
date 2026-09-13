import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { App } from '../src/app/App';
import { useWorkspace } from '../src/stores/workspace';
vi.mock('../src/editor/Editor', () => ({
  default: () => <div>Editor surface</div>,
}));
beforeEach(() => useWorkspace.setState(useWorkspace.getInitialState()));
test('renders the empty workspace and disabled save actions', () => {
  render(<App />);
  expect(
    screen.getByRole('heading', { name: 'A place for your project.' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});
test('browser preview explains that native file access requires the desktop app', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Open a folder' }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('desktop app'),
  );
});
