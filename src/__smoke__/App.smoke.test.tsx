import { describe, it } from 'vitest';
import { render } from '@testing-library/react';
import { App } from '../app/App';

describe('App smoke', () => {
  it('mounts without throwing', () => {
    render(<App />);
  });
});
