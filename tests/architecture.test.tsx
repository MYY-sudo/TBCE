import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import {
  ArchitectureDialog,
  ArchitecturesPanel,
} from '../src/architecture/ArchitecturesPanel';
import { ArchitectureSelect } from '../src/architecture/ArchitectureControls';
import { architectures } from '../src/services/architecture';
import {
  architectureActions,
  useArchitectures,
} from '../src/stores/architecture';
import { NewProjectDialog } from '../src/templates/StackDialogs';
import { useStacks } from '../src/stores/stack';
import { templates } from '../src/services/templates';
import { useWorkspace } from '../src/stores/workspace';
import type { Architecture } from '../src/types/architecture';

vi.mock('../src/services/architecture', () => ({
  architectures: {
    list: vi.fn(),
    get: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
    preview: vi.fn(),
  },
}));
vi.mock('../src/services/templates', () => ({
  templates: { list: vi.fn(), create: vi.fn() },
}));
const architecture: Architecture = {
  schemaVersion: 1,
  id: 'architecture-1',
  name: 'My layers',
  description: 'A structure',
  boundaries: 'Domain is independent.',
  directories: ['src/domain'],
  files: [{ path: 'src/domain/README.md', content: '# Domain\n' }],
};
beforeEach(() => {
  vi.resetAllMocks();
  useArchitectures.setState(useArchitectures.getInitialState(), true);
  useStacks.setState(useStacks.getInitialState(), true);
  useWorkspace.setState(useWorkspace.getInitialState(), true);
  vi.mocked(architectures.list).mockResolvedValue({
    architectures: [],
    warnings: [],
  });
  vi.mocked(architectures.preview).mockResolvedValue({
    entries: [],
    conflicts: [],
  });
  vi.mocked(templates.list).mockResolvedValue({ stacks: [], warnings: [] });
  vi.mocked(templates.create).mockResolvedValue(null);
});
test('empty personal catalog offers an editor with folders and starter text', async () => {
  vi.mocked(architectures.save).mockResolvedValue(architecture);
  render(<ArchitecturesPanel />);
  await screen.findByText('No saved architectures yet');
  fireEvent.click(screen.getByRole('button', { name: 'New architecture' }));
  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: 'My layers' },
  });
  fireEvent.change(screen.getByLabelText('Recommended boundaries'), {
    target: { value: 'Domain is independent.' },
  });
  fireEvent.change(
    screen.getByLabelText('Folders (one relative path per line)'),
    { target: { value: 'src/domain\nempty' } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add starter file' }));
  fireEvent.change(screen.getByLabelText('File path 1'), {
    target: { value: 'src/domain/README.md' },
  });
  fireEvent.change(screen.getByLabelText('File content 1'), {
    target: { value: '# Türkçe\n' },
  });
  expect(screen.getByLabelText('Folder structure')).toHaveTextContent(
    'domain/',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save architecture' }));
  await waitFor(() =>
    expect(architectures.save).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        directories: ['src/domain', 'empty'],
        files: [{ path: 'src/domain/README.md', content: '# Türkçe\n' }],
      }),
    ),
  );
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(
    screen.getByRole('heading', { name: 'My layers' }),
  ).toBeInTheDocument();
});
test('failed editing retains inputs, retry preserves ID and dirty cancel requires a choice', async () => {
  const close = vi.fn();
  vi.mocked(architectures.save)
    .mockRejectedValueOnce({ message: 'Conflicting paths: src' })
    .mockResolvedValue(architecture);
  render(<ArchitectureDialog architecture={architecture} onClose={close} />);
  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: 'Edited name' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save architecture' }));
  await screen.findByText('Conflicting paths: src');
  expect(screen.getByLabelText('Name')).toHaveValue('Edited name');
  fireEvent.click(screen.getByRole('button', { name: 'Save architecture' }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(architectures.save).toHaveBeenLastCalledWith(
    architecture.id,
    expect.objectContaining({ name: 'Edited name' }),
  );
});
test('catalog warnings are shown and cancelled deletion keeps the architecture', async () => {
  vi.mocked(architectures.list).mockResolvedValue({
    architectures: [architecture],
    warnings: ['Skipped damaged definition'],
  });
  vi.mocked(architectures.delete)
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true);
  render(<ArchitecturesPanel />);
  await screen.findByText('Skipped damaged definition');
  fireEvent.click(screen.getByRole('button', { name: 'Delete architecture' }));
  await waitFor(() => expect(architectures.delete).toHaveBeenCalledTimes(1));
  expect(useArchitectures.getState().architectures).toHaveLength(1);
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Delete architecture' }),
    ).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Delete architecture' }));
  await waitFor(() =>
    expect(useArchitectures.getState().architectures).toHaveLength(0),
  );
});
test('legacy values survive metadata selection without generating anything', async () => {
  const change = vi.fn();
  render(
    <ArchitectureSelect value="legacy-clean" onChange={change} metadata />,
  );
  await screen.findByText(/It is retained as metadata/);
  expect(screen.getByLabelText('Architecture')).toHaveValue('legacy-clean');
  expect(change).not.toHaveBeenCalled();
  expect(architectures.preview).not.toHaveBeenCalled();
});
test('creation uses a stack architecture default and blocks conflicting structures', async () => {
  vi.mocked(architectures.list).mockResolvedValue({
    architectures: [architecture],
    warnings: [],
  });
  vi.mocked(templates.list).mockResolvedValue({
    stacks: [
      {
        schemaVersion: 1,
        id: 'stack-1',
        snapshot: 's',
        name: 'App stack',
        description: '',
        languages: [],
        frameworks: [],
        entries: [],
        defaults: { name: '', architecture: architecture.id, commands: {} },
      },
    ],
    warnings: [],
  });
  vi.mocked(architectures.preview).mockImplementation(async (_stack, id) => ({
    entries: [{ path: 'src/domain/README.md', directory: false }],
    conflicts: id ? ['src/domain/README.md'] : [],
  }));
  render(<NewProjectDialog onClose={vi.fn()} />);
  await screen.findByRole('option', { name: 'App stack' });
  fireEvent.change(screen.getByLabelText('Stack'), {
    target: { value: 'stack-1' },
  });
  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: 'Example' },
  });
  await screen.findByText(/Resolve these path conflicts/);
  expect(screen.getByLabelText('Architecture')).toHaveValue(architecture.id);
  expect(
    screen.getByRole('button', { name: 'Choose location' }),
  ).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Architecture'), {
    target: { value: '' },
  });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Choose location' }),
    ).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Choose location' }));
  await waitFor(() =>
    expect(templates.create).toHaveBeenCalledWith(
      null,
      'stack-1',
      expect.objectContaining({ name: 'Example', architecture: null }),
      null,
    ),
  );
});
test('successful preview passes selected architecture to creation and picker cancellation retains dialog', async () => {
  vi.mocked(architectures.list).mockResolvedValue({
    architectures: [architecture],
    warnings: [],
  });
  const close = vi.fn();
  render(<NewProjectDialog onClose={close} />);
  await screen.findByRole('option', { name: 'My layers' });
  fireEvent.change(screen.getByLabelText('Architecture'), {
    target: { value: architecture.id },
  });
  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: 'Example' },
  });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Choose location' }),
    ).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Choose location' }));
  await waitFor(() =>
    expect(templates.create).toHaveBeenCalledWith(
      null,
      null,
      expect.objectContaining({ architecture: architecture.id }),
      architecture.id,
    ),
  );
  expect(close).not.toHaveBeenCalled();
});
test('stale preview cannot enable creation and preview failures stay visible', async () => {
  vi.mocked(architectures.list).mockResolvedValue({
    architectures: [architecture],
    warnings: [],
  });
  let resolveOld!: (value: { entries: []; conflicts: [] }) => void;
  vi.mocked(architectures.preview)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockRejectedValueOnce({ message: 'Snapshot is missing' });
  render(<NewProjectDialog onClose={vi.fn()} />);
  await waitFor(() => expect(architectures.preview).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByLabelText('Architecture'), {
    target: { value: architecture.id },
  });
  await screen.findByText('Snapshot is missing');
  await act(async () => resolveOld({ entries: [], conflicts: [] }));
  expect(
    screen.getByRole('button', { name: 'Choose location' }),
  ).toBeDisabled();
  expect(screen.getByText('Snapshot is missing')).toBeInTheDocument();
});
test('catalog operations serialize while a save is in flight', async () => {
  let resolve!: (value: Architecture) => void;
  vi.mocked(architectures.save).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const saved = architectureActions.save(null, architecture);
  expect(await architectureActions.delete(architecture.id)).toBe(false);
  expect(architectures.delete).not.toHaveBeenCalled();
  resolve(architecture);
  expect(await saved).toBe(true);
});
