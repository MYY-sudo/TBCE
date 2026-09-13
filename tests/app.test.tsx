import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { App } from '../src/app/App';
import { useWorkspace } from '../src/stores/workspace';
import { useProject } from '../src/stores/project';
vi.mock('../src/editor/Editor', () => ({
  default: () => <div>Editor surface</div>,
}));
beforeEach(() => {
  localStorage.clear();
  useWorkspace.setState(useWorkspace.getInitialState());
  useProject.setState({ ...useProject.getInitialState(), recent: [] });
});
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
test('recent projects are listed and can be removed', () => {
  useProject.setState({
    recent: [
      {
        path: 'C:/code/app',
        name: 'App',
        isProject: true,
        stack: null,
        lastOpened: 1,
      },
    ],
  });
  render(<App />);
  expect(screen.getByTitle('C:/code/app')).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Remove App from recent projects' }),
  );
  expect(useProject.getState().recent).toHaveLength(0);
  expect(screen.queryByTitle('C:/code/app')).not.toBeInTheDocument();
});
test('creating a project asks for a name before touching the filesystem', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'New project' }));
  const name = await screen.findByLabelText('Name');
  fireEvent.change(name, { target: { value: 'My app' } });
  fireEvent.click(screen.getByRole('button', { name: 'Choose location' }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('desktop app'),
  );
});
