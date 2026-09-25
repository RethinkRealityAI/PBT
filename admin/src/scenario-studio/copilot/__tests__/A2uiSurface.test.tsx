/**
 * The A2UI renderer — only the trusted catalog renders, bindings write back
 * through `onDataChange`, and actions resolve their context at click time.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { applySurfaceMessages, type A2uiComponent, type SurfaceState } from '../../../lib/a2ui';
import { A2uiSurface } from '../A2uiSurface';

function makeSurface(components: A2uiComponent[], dataModel: Record<string, unknown> = {}): SurfaceState {
  return applySurfaceMessages({}, [
    { createSurface: { surfaceId: 's1' } },
    { updateDataModel: { surfaceId: 's1', path: '/', value: dataModel } },
    { updateComponents: { surfaceId: 's1', components } },
  ]).s1;
}

function setup(surface: SurfaceState, opts: { busy?: boolean; readOnly?: boolean } = {}) {
  const onAction = vi.fn();
  const onDataChange = vi.fn();
  const utils = render(
    <A2uiSurface surface={surface} onAction={onAction} onDataChange={onDataChange} {...opts} />,
  );
  return { onAction, onDataChange, ...utils };
}

describe('A2uiSurface', () => {
  it('renders the basic layout catalog from root', () => {
    setup(
      makeSurface([
        { id: 'root', component: 'Card', child: 'col' },
        { id: 'col', component: 'Column', children: ['h', 'row', 'div', 'q'] },
        { id: 'h', component: 'Text', variant: 'h4', text: 'Heading' },
        { id: 'row', component: 'Row', children: ['a', 'b'] },
        { id: 'a', component: 'Text', text: { path: '/name' } },
        { id: 'b', component: 'Text', variant: 'caption', text: 'caption' },
        { id: 'div', component: 'Divider' },
        { id: 'q', component: 'Text', variant: 'quote', text: '“It’s too expensive.”' },
      ], { name: 'Bound name' }),
    );
    expect(screen.getByText('Heading')).toBeInTheDocument();
    expect(screen.getByText('Bound name')).toBeInTheDocument();
    expect(screen.getByRole('separator')).toBeInTheDocument();
    expect(screen.getByText('“It’s too expensive.”')).toBeInTheDocument();
  });

  it('renders nothing for an unknown component, and warns only once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const surface = makeSurface([
      { id: 'root', component: 'Column', children: ['ok', 'evil', 'evil2'] },
      { id: 'ok', component: 'Text', text: 'visible' },
      { id: 'evil', component: 'ScriptInjector', html: '<img onerror=alert(1)>' },
      { id: 'evil2', component: 'ScriptInjector' },
    ]);
    const { container } = setup(surface);
    expect(screen.getByText('visible')).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('onerror');
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('ScriptInjector'))).toHaveLength(1);
    warn.mockRestore();
  });

  it('renders nothing without a root', () => {
    const { container } = setup(makeSurface([{ id: 'x', component: 'Text', text: 'orphan' }]));
    expect(container).toBeEmptyDOMElement();
  });

  it('expands templated children with item-relative bindings', () => {
    setup(
      makeSurface(
        [
          { id: 'root', component: 'List', children: { path: '/rows', componentId: 'rowText' } },
          { id: 'rowText', component: 'Text', text: { path: 'label' } },
        ],
        { rows: [{ label: 'First' }, { label: 'Second' }] },
      ),
    );
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('a button fires its event with the context resolved at click time', () => {
    const surface = makeSurface(
      [
        { id: 'root', component: 'Button', variant: 'primary', child: 'lbl', action: { event: { name: 'confirm_action', context: { proposal: { path: '/proposal' }, fixed: 1 } } } },
        { id: 'lbl', component: 'Text', text: 'Apply' },
      ],
      { proposal: { tool: 'x', value: 'edited' } },
    );
    const { onAction } = setup(surface);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({
      name: 'confirm_action',
      surfaceId: 's1',
      sourceComponentId: 'root',
      context: { proposal: { tool: 'x', value: 'edited' }, fixed: 1 },
    });
  });

  it('busy and readOnly disable actions', () => {
    const surface = makeSurface([
      { id: 'root', component: 'Button', child: 'lbl', action: { event: { name: 'go', context: {} } } },
      { id: 'lbl', component: 'Text', text: 'Go' },
    ]);
    const busy = setup(surface, { busy: true });
    expect(screen.getByRole('button', { name: 'Go' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(busy.onAction).not.toHaveBeenCalled();
    busy.unmount();
    setup(surface, { readOnly: true });
    expect(screen.getByRole('button', { name: 'Go' })).toBeDisabled();
  });

  it('TextField writes through its binding; multiline is a textarea; readOnly locks it', () => {
    const surface = makeSurface(
      [
        { id: 'root', component: 'Column', children: ['one', 'two'] },
        { id: 'one', component: 'TextField', label: 'Title', value: { path: '/p/title' }, maxLength: 20 },
        { id: 'two', component: 'TextField', label: 'Notes', value: { path: '/p/notes' }, multiline: true },
      ],
      { p: { title: 'Hello', notes: 'Line' } },
    );
    const { onDataChange, unmount } = setup(surface);
    const title = screen.getByRole('textbox', { name: 'Title' });
    expect(title).toHaveValue('Hello');
    expect(title).toHaveAttribute('maxlength', '20');
    fireEvent.change(title, { target: { value: 'Hi' } });
    expect(onDataChange).toHaveBeenCalledWith('s1', '/p/title', 'Hi');
    expect(screen.getByRole('textbox', { name: 'Notes' }).tagName).toBe('TEXTAREA');
    unmount();
    setup(surface, { readOnly: true });
    expect(screen.getByRole('textbox', { name: 'Title' })).toBeDisabled();
  });

  it('ChoicePicker and CheckBox write their values', () => {
    const surface = makeSurface(
      [
        { id: 'root', component: 'Column', children: ['pick', 'check'] },
        { id: 'pick', component: 'ChoicePicker', label: 'Tone', value: { path: '/tone' }, options: [{ label: 'Warm', value: 'warm' }, { label: 'Cool', value: 'cool' }] },
        { id: 'check', component: 'CheckBox', label: 'Include', value: { path: '/on' } },
      ],
      { tone: 'warm', on: true },
    );
    const { onDataChange } = setup(surface);
    expect(screen.getByRole('button', { name: 'Warm' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Cool' }));
    expect(onDataChange).toHaveBeenCalledWith('s1', '/tone', 'cool');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include' }));
    expect(onDataChange).toHaveBeenCalledWith('s1', '/on', false);
  });

  it('FieldChange shows the current value struck through above the editable proposal', () => {
    const surface = makeSurface(
      [
        { id: 'root', component: 'Column', children: ['breed', 'diff', 'notes'] },
        { id: 'breed', component: 'FieldChange', label: 'Breed', before: 'Beagle', value: { path: '/proposal/fields/breed' }, kind: 'text', maxLength: 80 },
        {
          id: 'diff',
          component: 'FieldChange',
          label: 'Difficulty',
          before: '2 · Skeptical',
          value: { path: '/proposal/fields/difficulty_override' },
          kind: 'choice',
          options: [{ label: '2 · Skeptical', value: 2 }, { label: '3 · Hostile', value: 3 }],
        },
        { id: 'notes', component: 'FieldChange', label: 'Backstory', before: '—', value: { path: '/proposal/fields/context_override' }, kind: 'long' },
      ],
      { proposal: { fields: { breed: 'Labrador Retriever', difficulty_override: 3, context_override: 'Moved house.' } } },
    );
    const { onDataChange } = setup(surface);
    const breed = screen.getByRole('group', { name: 'Breed' });
    expect(breed.querySelector('s')).toHaveTextContent('Beagle');
    expect(screen.getByRole('textbox', { name: 'Breed (suggested)' })).toHaveValue('Labrador Retriever');

    // A number-valued choice is selected by its value and written back as a number.
    expect(screen.getByRole('button', { name: '3 · Hostile' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '2 · Skeptical' }));
    expect(onDataChange).toHaveBeenCalledWith('s1', '/proposal/fields/difficulty_override', 2);

    // Unset "before" reads "not set" rather than a struck dash.
    const notes = screen.getByRole('group', { name: 'Backstory' });
    expect(notes).toHaveTextContent('Now: not set');
    expect(notes.querySelector('s')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Backstory (suggested)' }).tagName).toBe('TEXTAREA');
  });

  it('DocOption toggles its binding; DriverSwatch shows a known driver only', () => {
    const surface = makeSurface(
      [
        { id: 'root', component: 'Column', children: ['doc', 'swatch', 'bad'] },
        { id: 'doc', component: 'DocOption', title: 'Weight study', meta: 'Clinical reference', value: { path: '/picked/0' } },
        { id: 'swatch', component: 'DriverSwatch', driver: { path: '/driver' } },
        { id: 'bad', component: 'DriverSwatch', driver: 'Thinker' },
      ],
      { picked: [true], driver: 'Analyzer' },
    );
    const { onDataChange } = setup(surface);
    const box = screen.getByRole('checkbox', { name: 'Weight study' });
    expect(box).toBeChecked();
    expect(screen.getByText('Clinical reference')).toBeInTheDocument();
    fireEvent.click(box);
    expect(onDataChange).toHaveBeenCalledWith('s1', '/picked/0', false);
    expect(screen.getByText('Analyzer')).toBeInTheDocument();
    expect(screen.getByText(/Wants evidence/)).toBeInTheDocument();
    expect(screen.queryByText('Thinker')).not.toBeInTheDocument();
  });
});
