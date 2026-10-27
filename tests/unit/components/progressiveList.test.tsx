// @vitest-environment jsdom
/**
 * ProgressiveList mounts the first page only and appends the rest as the sentinel
 * approaches the viewport. jsdom reports zeroed geometry, so the sentinel always
 * reads as "in view" here — that makes this a test of the growth loop terminating
 * and of the reset behaviour, not of real scroll physics.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ProgressiveList } from '../../../src/components/ProgressiveList';

const items = Array.from({ length: 20 }, (_, i) => ({ id: `idea-${i}` }));

const renderRows = (list = items, initialCount = 5) => (
  <ProgressiveList
    items={list}
    initialCount={initialCount}
    pageSize={5}
    renderItem={(item) => (
      <div key={item.id} data-testid="row">
        {item.id}
      </div>
    )}
  />
);

describe('ProgressiveList', () => {
  it('mounts one page first, then renders the rest without getting stuck', async () => {
    render(renderRows());

    // The first paint is bounded: the whole list is not mounted at once.
    expect(screen.getAllByTestId('row')).toHaveLength(5);

    await waitFor(() => expect(screen.getAllByTestId('row')).toHaveLength(20), { timeout: 3000 });
  });

  it('keeps the rendered order and renders every item exactly once', async () => {
    render(renderRows());

    await waitFor(() => expect(screen.getAllByTestId('row')).toHaveLength(20), { timeout: 3000 });
    expect(screen.getAllByTestId('row').map((row) => row.textContent)).toEqual(
      items.map((item) => item.id)
    );
  });

  it('starts again at the first page when the list itself changes', async () => {
    const { rerender } = render(renderRows());
    await waitFor(() => expect(screen.getAllByTestId('row')).toHaveLength(20), { timeout: 3000 });

    // A different set of ids means a different list (new day, other feed, changed filters).
    rerender(renderRows(items.slice(0, 8)));

    expect(screen.getAllByTestId('row')).toHaveLength(5);
  });

  it('renders nothing extra when the list fits in one page', () => {
    render(renderRows(items.slice(0, 3), 5));

    expect(screen.getAllByTestId('row')).toHaveLength(3);
    expect(screen.queryByTestId('list-sentinel')).toBeNull();
  });
});
