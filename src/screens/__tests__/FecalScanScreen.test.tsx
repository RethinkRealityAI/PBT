import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { FecalScanScreen } from '../FecalScanScreen';
import { ThemeProvider } from '../../app/providers/ThemeProvider';
import { LanguageProvider } from '../../app/providers/LanguageProvider';
import { FECAL_CHARTS } from '../../data/knowledge/fecalCharts';
import { COLORS } from '../../design-system/tokens';
import type { UseFecalScan } from '../../features/fecal-scan/useFecalScan';
import { FECAL_NEUTRAL_PALETTE } from '../../features/fecal-scan/fecalUi';
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
  scope: { tool: 'fecal-scan', species: 'dog' },
  // Normally the whole chart for the species.
  referenceScores: [1, 2, 2.5, 3, 3.5, 4, 4.5, 5],
    exactReference: null,
    mostSimilarReference: null,
  chunks: [
    {
      citation: CITATION,
      similarity: 0.84,
      docTitle: 'Fecal scoring — adult dog',
      excerpt:
        'Score 3.5 (Fecal Scoring System for Dogs): MOIST STOOL WITH NO CRACKS. The stool has a distinct shape.',
      scores: [3.5],
      kind: 'chart',
    },
    // The chart scores retrieval did not return — seen by the scorer, no similarity.
    {
      citation: CITATION,
      similarity: null,
      docTitle: 'Fecal scoring — adult dog',
      excerpt: 'Score 1 (Fecal Scoring System for Dogs): VERY HARD AND DRY.',
      scores: [1],
      kind: 'chart',
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

  it('offers the library path with no forced-camera attribute', () => {
    const { container } = renderScreen();
    // jsdom has no camera API, so the library is the primary action.
    expect(screen.getByRole('button', { name: 'Choose a photo' })).toBeInTheDocument();
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    expect(input.hasAttribute('capture')).toBe(false);
  });

  it('opens a library pick in the capture modal for review — nothing is scanned yet', () => {
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    const { container } = renderScreen();
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'stool.jpg', { type: 'image/jpeg' })] },
    });
    expect(screen.getByRole('dialog', { name: 'Check the photo' })).toBeInTheDocument();
    expect(screen.getByText('Adult dog chart')).toBeInTheDocument();
    expect(analyzeFile).not.toHaveBeenCalled();
  });

  it('never shows scan progress or errors on the page itself', () => {
    scan = baseScan({ status: 'analyzing' });
    const { unmount } = renderScreen();
    expect(screen.queryByText('Observing the sample')).toBeNull();
    unmount();
    scan = baseScan({ status: 'error', error: 'Could not score the photo.' });
    renderScreen();
    expect(screen.queryByRole('alert')).toBeNull();
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

  it('shows the score, band, its meaning and the matching chart reference image', () => {
    scan = baseScan({
      status: 'done',
      result: RESULT,
      retrieval: RETRIEVAL,
      previewUrl: 'blob:photo',
    });
    const { container } = renderScreen();

    expect(screen.getByTestId('fecal-score')).toHaveTextContent('3.5');
    expect(screen.getByRole('img', { name: 'Fecal score 3.5 out of 5' })).toBeInTheDocument();
    expect(screen.getByText('Too soft')).toBeInTheDocument();
    expect(screen.getByText("Softer than the chart's ideal range")).toBeInTheDocument();
    expect(screen.getByText('Fecal score')).toBeInTheDocument();
    expect(
      container.querySelector('img[src="/fecal-scan/dog/3.5.jpg"]'),
    ).not.toBeNull();
    expect(container.querySelector('img[src="blob:photo"]')).not.toBeNull();
    // Chart wording is shown verbatim next to the reference photo.
    expect(screen.getByText('MOIST STOOL WITH NO CRACKS')).toBeInTheDocument();
    expect(screen.getByText(RESULT.rationale)).toBeInTheDocument();
    expect(screen.getByText(RESULT.caution)).toBeInTheDocument();
    // What a photo can't show — one chip per item.
    expect(screen.getByText('odour')).toBeInTheDocument();
    expect(screen.getByText('blood or mucus')).toBeInTheDocument();
  });

  it('shows confidence as a coarse AI estimate, never a precise percentage', () => {
    scan = baseScan({ status: 'done', result: RESULT, retrieval: RETRIEVAL });
    const { container } = renderScreen();

    expect(screen.getByText('High confidence')).toBeInTheDocument();
    expect(screen.getByText('AI estimate')).toBeInTheDocument();
    expect(screen.queryByText(/confident/)).toBeNull();
    // No percentage anywhere on the result (0.82 must not become "82%").
    const card = screen.getByRole('region', { name: 'Fecal score' });
    expect(card.textContent).not.toMatch(/\d\s?%/);
    expect(container.textContent).not.toContain('82');

    scan = baseScan({
      status: 'done',
      result: { ...RESULT, confidence: 0.55 },
      retrieval: RETRIEVAL,
    });
    renderScreen();
    expect(screen.getByText('Moderate confidence')).toBeInTheDocument();
  });

  it('keeps the numeral neutral and the band colour to a small dot', () => {
    scan = baseScan({ status: 'done', result: RESULT, retrieval: RETRIEVAL });
    renderScreen();

    expect(screen.getByTestId('fecal-score')).toHaveStyle({ color: 'var(--pbt-text)' });
    // The band chip's text is neutral; only the dot carries the band colour.
    const chip = screen.getByText('Too soft');
    expect(chip).toHaveStyle({ color: 'var(--pbt-text)' });
    const dot = chip.querySelector('span[aria-hidden]') as HTMLElement;
    expect(dot).toHaveStyle({ background: COLORS.score.poor });
  });

  it('scopes a neutral text palette over the whole screen', () => {
    const { container } = renderScreen();
    const wrapper = container.querySelector('[data-fecal-palette]') as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.style.display).toBe('contents');
    expect(wrapper.style.getPropertyValue('--pbt-text')).toBe(
      FECAL_NEUTRAL_PALETTE.light['--pbt-text'],
    );
  });

  it('offers Scan another after a result, which resets the scan', async () => {
    const user = userEvent.setup();
    scan = baseScan({ status: 'done', result: RESULT, retrieval: RETRIEVAL });
    renderScreen();
    await user.click(screen.getByRole('button', { name: 'Scan another' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('announces the result to assistive tech', () => {
    scan = baseScan({ status: 'done', result: RESULT, retrieval: RETRIEVAL });
    renderScreen();
    expect(
      screen.getByText('Fecal score 3.5 out of 5: Too soft.'),
    ).toBeInTheDocument();
  });

  it('explains where the score came from in plain language', () => {
    scan = baseScan({ status: 'done', result: RESULT, retrieval: RETRIEVAL });
    renderScreen();

    expect(screen.getByText('Where this score came from')).toBeInTheDocument();
    expect(screen.getByText(CITATION)).toBeInTheDocument();
    expect(screen.getByText('Compared against 8 chart photos')).toBeInTheDocument();
    // Source + relevance in words, not a raw cosine.
    expect(screen.getByText('Royal Canin chart')).toBeInTheDocument();
    expect(screen.getByText('Strong match')).toBeInTheDocument();
    // The machinery stays behind the disclosure until asked for.
    expect(screen.queryByText('0.84')).toBeNull();
    expect(screen.queryByText(RETRIEVAL.query)).toBeNull();
    expect(screen.queryByText(/pgvector/)).toBeNull();
    expect(screen.queryByText('fecal:dog')).toBeNull();
  });

  it('shows the rest of the chart as also considered, never as a 0% match', () => {
    scan = baseScan({ status: 'done', result: RESULT, retrieval: RETRIEVAL });
    renderScreen();
    expect(screen.getByText('Rest of the chart')).toBeInTheDocument();
    expect(screen.getByText('Also considered')).toBeInTheDocument();
    // Only the retrieved passage claims a match strength.
    expect(screen.getAllByText(/match$/)).toHaveLength(1);
    expect(screen.queryByText(/0\s?%/)).toBeNull();
  });

  it('labels a clinic supplement and names its document', () => {
    scan = baseScan({
      status: 'done',
      result: RESULT,
      retrieval: {
        ...RETRIEVAL,
        chunks: [
          RETRIEVAL.chunks[0],
          {
            citation: null,
            similarity: 0.62,
            docTitle: 'Diet transition protocol',
            excerpt: 'During a diet change a score of 3.5 is expected.',
            scores: [3.5],
            kind: 'supplement',
          },
          {
            citation: null,
            similarity: 0.4,
            docTitle: null,
            excerpt: 'A passage from an older deployment.',
            scores: [],
          },
        ],
      },
    });
    renderScreen();

    expect(screen.getByText('Clinic supplement')).toBeInTheDocument();
    expect(screen.getByText('Diet transition protocol')).toBeInTheDocument();
    expect(screen.getByText('Good match')).toBeInTheDocument();
    // A chunk without `kind` gets the neutral label.
    expect(screen.getByText('Passage')).toBeInTheDocument();
    expect(screen.getByText('Partial match')).toBeInTheDocument();
    // The chart's own doc title repeats the citation — not shown twice.
    expect(screen.queryByText('Fecal scoring — adult dog')).toBeNull();
  });

  it('keeps the technical trail in a keyboard-accessible disclosure', async () => {
    const user = userEvent.setup();
    scan = baseScan({ status: 'done', result: RESULT, retrieval: RETRIEVAL });
    renderScreen();

    const toggle = screen.getByRole('button', { name: 'Technical details' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    toggle.focus();
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    expect(screen.getByText('Vector search · pgvector · knowledge_chunks')).toBeInTheDocument();
    expect(screen.getByText(RETRIEVAL.query)).toBeInTheDocument();
    // The scope is the hard wall: it says a cat passage could not have been used.
    expect(screen.getByText('Fecal scan · Adult dog')).toBeInTheDocument();
    expect(screen.getByText('fecal:dog')).toBeInTheDocument();
    expect(screen.getByText('0.84')).toBeInTheDocument();
    // The precise model confidence lives here, not on the result.
    expect(screen.getByText('0.82')).toBeInTheDocument();
  });

  it('names the search scope from the catalogs, not hardcoded English', async () => {
    const user = userEvent.setup();
    scan = baseScan({ status: 'done', result: RESULT, retrieval: RETRIEVAL });
    render(
      <ThemeProvider initialTheme="light">
        <LanguageProvider initialLocale="fr">
          <FecalScanScreen />
        </LanguageProvider>
      </ThemeProvider>,
    );
    await user.click(await screen.findByRole('button', { name: 'Détails techniques' }));
    expect(screen.getByText('Analyse fécale · Chien adulte')).toBeInTheDocument();
    expect(screen.queryByText(/Fecal Scan|Adult dog/)).toBeNull();
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

  it('labels a bundled fallback honestly', async () => {
    const user = userEvent.setup();
    scan = baseScan({
      status: 'done',
      result: RESULT,
      retrieval: { ...RETRIEVAL, source: 'bundled', chunks: [{ ...RETRIEVAL.chunks[0], similarity: null }] },
    });
    renderScreen();
    // No similarity → no match strength claimed; a lone chart chunk is just the chart.
    expect(screen.queryByText(/match$/)).toBeNull();
    expect(screen.queryByText('Rest of the chart')).toBeNull();
    expect(screen.getByText('Royal Canin chart')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Technical details' }));
    expect(
      screen.getByText('Bundled chart text (the search returned no passages)'),
    ).toBeInTheDocument();
    expect(screen.queryByText('0.84')).toBeNull();
  });

  it('always shows the disclaimer', () => {
    renderScreen();
    expect(screen.getByText(/never a diagnosis/i)).toBeInTheDocument();
  });

  it('offers a gentle retry when the photo is not a stool', () => {
    scan = baseScan({
      status: 'done',
      result: { ...RESULT, isStool: false },
      retrieval: RETRIEVAL,
    });
    renderScreen();
    // Shown on the card and announced once through the live region.
    expect(screen.getAllByText(/doesn't look like a stool sample/i)).toHaveLength(2);
    expect(screen.getByText('No score')).toBeInTheDocument();
    // No score is claimed for a photo the model rejected.
    expect(screen.queryByTestId('fecal-score')).toBeNull();
    expect(screen.getByRole('button', { name: 'Try another photo' })).toBeInTheDocument();
    // No score → no "where this score came from" trail.
    expect(screen.queryByText('Strong match')).toBeNull();
    expect(screen.getByText(/After a scan, the chart passages/)).toBeInTheDocument();
  });

  it('Scan another goes straight back to the camera when there is one', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      writable: true,
      value: { getUserMedia: vi.fn(() => new Promise(() => {})) },
    });
    try {
      scan = baseScan({ status: 'done', result: RESULT, retrieval: RETRIEVAL });
      renderScreen();
      await user.click(screen.getByRole('button', { name: 'Scan another' }));
      expect(screen.getByRole('dialog', { name: 'Take the photo' })).toBeInTheDocument();
      // The result stays behind the modal until a new scan actually starts.
      expect(reset).not.toHaveBeenCalled();
    } finally {
      // @ts-expect-error — remove the shim so other tests see a camera-less env
      delete navigator.mediaDevices;
    }
  });

  it('lists every score of the selected chart in the full-chart sheet', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('button', { name: 'View full chart' }));

    const sheet = screen.getByRole('region', { name: 'Reference chart' });
    // Bands are neutral chips with a dot — never a solid or tinted band fill.
    expect(within(sheet).getAllByText('Optimal').length).toBeGreaterThan(0);
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
