import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { FecalScanScreen } from '../FecalScanScreen';
import { ThemeProvider } from '../../app/providers/ThemeProvider';
import { LanguageProvider } from '../../app/providers/LanguageProvider';
import { FECAL_CHARTS } from '../../data/knowledge/fecalCharts';
import { COLORS } from '../../design-system/tokens';
import type { UseFecalScan } from '../../features/fecal-scan/useFecalScan';
import type {
  FecalScanResult,
  FecalScanRetrieval,
} from '../../shared/ai/fecalScan';

const setSpecies = vi.fn();
const setBreedSize = vi.fn();
const analyzeFile = vi.fn();
const reset = vi.fn();

let scan: UseFecalScan;

vi.mock('../../features/fecal-scan/useFecalScan', () => ({
  useFecalScan: () => scan,
}));

vi.mock('../../app/providers/NavigationProvider', () => ({
  useNavigation: () => ({ go: vi.fn(), back: vi.fn(), replace: vi.fn(), current: 'fecalScan', history: [] }),
}));

const RESULT: FecalScanResult = {
  isStool: true,
  species: 'dog',
  score: 3.5,
  band: 'tooSoft',
  confidence: 0.82,
  rationale: 'The stool holds a distinct shape but shows no cracks.',
  observations: {
    form: 'distinct shape',
    moisture: 'moist',
    surface: 'smooth, no cracks',
    residue: 'would leave residue',
    homogeneity: 'homogeneous',
  },
  alternates: [{ score: 3, confidence: 0.28 }],
  notVisible: ['odour', 'blood or mucus'],
  caution: 'Involve the veterinarian if this persists beyond 48 hours.',
};

const CITATION = 'Royal Canin — Fecal Scoring System for Dogs, VGI/064/0324';

const RETRIEVAL: FecalScanRetrieval = {
  source: 'rag',
  query: 'moist stool no cracks distinct shape',
  docSlugs: ['fecal:dog'],
  referenceScores: [3, 3.5, 4],
    exactReference: null,
    mostSimilarReference: null,
  chunks: [
    {
      citation: CITATION,
      similarity: 0.84,
      excerpt:
        'Score 3.5 (Fecal Scoring System for Dogs): MOIST STOOL WITH NO CRACKS. The stool has a distinct shape.',
      scores: [3.5],
    },
  ],
};

function baseScan(over: Partial<UseFecalScan> = {}): UseFecalScan {
  return {
    status: 'idle',
    result: null,
    retrieval: null,
    previewUrl: null,
    error: null,
    species: 'dog',
    setSpecies,
    breedSize: 'small-medium',
    setBreedSize,
    analyzeFile,
    reset,
    ...over,
  };
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider initialTheme="light">
      <LanguageProvider initialLocale="en">{children}</LanguageProvider>
    </ThemeProvider>
  );
}

const renderScreen = () => render(<FecalScanScreen />, { wrapper: Wrapper });

beforeEach(() => {
  setSpecies.mockReset();
  setBreedSize.mockReset();
  analyzeFile.mockReset();
  reset.mockReset();
  scan = baseScan();
});

describe('FecalScanScreen', () => {
  it('renders the header, the not-a-diagnosis chip and the chart picker', () => {
    renderScreen();
    expect(screen.getByText('fecal scan')).toBeInTheDocument();
    expect(screen.getByText(/not a diagnosis/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Adult dog' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Puppy (8 wk+)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Cat' })).toBeInTheDocument();
  });

  it('offers the upload path with no forced-camera attribute', () => {
    const { container } = renderScreen();
    expect(
      screen.getByRole('button', { name: 'Upload photo' }),
    ).toBeInTheDocument();
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    expect(input.hasAttribute('capture')).toBe(false);
  });

  it('reveals the breed-size picker only for the puppy chart', async () => {
    renderScreen();
    expect(screen.queryByRole('tab', { name: 'Large / giant' })).toBeNull();

    scan = baseScan({ species: 'puppy' });
    renderScreen();
    expect(screen.getAllByRole('tab', { name: 'Large / giant' }).length).toBeGreaterThan(0);
  });

  it('switches the chart through the hook', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('tab', { name: 'Cat' }));
    expect(setSpecies).toHaveBeenCalledWith('cat');
  });

  it('shows the score, band and the matching chart reference image', () => {
    scan = baseScan({
      status: 'done',
      result: RESULT,
      retrieval: RETRIEVAL,
      previewUrl: 'blob:photo',
    });
    const { container } = renderScreen();

    expect(screen.getByText('3.5')).toBeInTheDocument();
    expect(screen.getByText('Too soft')).toBeInTheDocument();
    expect(screen.getByText('82% confident')).toBeInTheDocument();
    // The card is titled by its eyebrow; the old duplicate label under it is gone.
    expect(screen.getByText('Fecal score')).toBeInTheDocument();
    expect(
      container.querySelector('img[src="/fecal-scan/dog/3.5.jpg"]'),
    ).not.toBeNull();
    expect(container.querySelector('img[src="blob:photo"]')).not.toBeNull();
    // Chart wording is shown verbatim next to the reference photo.
    expect(screen.getByText('MOIST STOOL WITH NO CRACKS')).toBeInTheDocument();
    expect(screen.getByText(RESULT.rationale)).toBeInTheDocument();
    expect(screen.getByText(RESULT.caution)).toBeInTheDocument();
  });

  it('shows the grounding panel with its source, citation and similarity', () => {
    scan = baseScan({ status: 'done', result: RESULT, retrieval: RETRIEVAL });
    renderScreen();

    expect(screen.getByText('pgvector · knowledge_chunks')).toBeInTheDocument();
    expect(screen.getByText(CITATION)).toBeInTheDocument();
    expect(screen.getByText('0.84')).toBeInTheDocument();
    expect(screen.getByText(RETRIEVAL.query)).toBeInTheDocument();
    // The visual half of the grounding: how many chart photos were compared.
    expect(screen.getByText('Compared against 3 chart photos')).toBeInTheDocument();
  });

  it('hides the reference-photo count when the scorer compared none', () => {
    scan = baseScan({
      status: 'done',
      result: RESULT,
      retrieval: { ...RETRIEVAL, referenceScores: [] },
    });
    renderScreen();
    expect(screen.queryByText(/Compared against/)).toBeNull();
  });

  it('labels a bundled fallback honestly', () => {
    scan = baseScan({
      status: 'done',
      result: RESULT,
      retrieval: { ...RETRIEVAL, source: 'bundled', chunks: [{ ...RETRIEVAL.chunks[0], similarity: null }] },
    });
    renderScreen();
    expect(screen.getByText('bundled chart')).toBeInTheDocument();
    expect(screen.queryByText('0.84')).toBeNull();
  });

  it('always shows the disclaimer', () => {
    renderScreen();
    expect(screen.getByText(/never a diagnosis/i)).toBeInTheDocument();
  });

  it('keeps confidence positive and the numeral neutral, whatever the band', () => {
    scan = baseScan({ status: 'done', result: RESULT, retrieval: RETRIEVAL });
    renderScreen();

    // Confidence measures certainty, not health: always the good token.
    const confidence = screen.getByText('82% confident');
    expect(confidence).toHaveStyle({ color: COLORS.score.good });
    // Only the band pill carries the band colour; the numeral stays neutral.
    expect(screen.getByText('3.5')).toHaveStyle({ color: 'var(--pbt-text)' });
  });

  it('offers a gentle retry when the photo is not a stool', () => {
    scan = baseScan({
      status: 'done',
      result: { ...RESULT, isStool: false },
      retrieval: RETRIEVAL,
    });
    renderScreen();
    expect(screen.getByText(/doesn't look like a stool sample/i)).toBeInTheDocument();
    expect(screen.getByText('No score')).toBeInTheDocument();
    // No score is claimed for a photo the model rejected.
    expect(screen.queryByText('3.5')).toBeNull();
  });

  it('surfaces an error with a retry affordance', () => {
    scan = baseScan({ status: 'error', error: 'Could not score the photo.' });
    renderScreen();
    expect(screen.getByText('Could not score the photo.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('lists every score of the selected chart in the full-chart sheet', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('button', { name: 'View full chart' }));

    const sheet = screen.getByRole('region', { name: 'Reference chart' });
    for (const entry of FECAL_CHARTS.dog.entries) {
      expect(
        within(sheet).getByAltText(
          `Royal Canin reference photo for score ${entry.score}`,
        ),
      ).toBeInTheDocument();
      expect(within(sheet).getByText(entry.label)).toBeInTheDocument();
    }
    expect(
      sheet.querySelectorAll('img[src^="/fecal-scan/dog/"]').length,
    ).toBe(8);
  });
});
