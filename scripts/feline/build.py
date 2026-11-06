#!/usr/bin/env python3
"""
Feline asset extraction, step 2 of 3 (`npm run feline:build`).

Reads `knowledge/feline/manifest.json` (which source pages each document
keeps) and the per-page extraction from step 1 (`.cache/feline/pages/`), and
writes one reviewed-Markdown snapshot per document to `.cache/feline/build/`
(gitignored — the text is (c) Royal Canin and the repository is public):

  * every kept page opens with `<!-- page N -->` (the chunker splits there, so
    a passage's citation can name its page);
  * prose is the text layer verbatim, reflowed (line wraps joined, nothing
    reworded); big type becomes `## ` headings, small caps labels `### `;
  * TABLES become one labelled statement per row — or, for a comparison table
    whose columns are products, ONE STATEMENT PER PRODUCT — so a value can
    never be read against the wrong column: every value carries its column
    header(s) and its row label, taken from the text layer by position;
  * charts keep only printed words (rotated axis labels are dropped by step 1);
  * canine-only passages of mixed documents are dropped block by block
    (a block that names dogs and never cats), and recorded.

Then the BLOCKING fidelity check: every number, percentage, unit value and
(R)/TM product name in the Markdown must occur in that page's text layer
(normalised for whitespace, hyphenation and footnote markers). Findings are
written to the manifest as `reviewNotes` (status "open"); a document with an
open note cannot be approved (`validateFelineManifest`). Low-confidence table
alignments are added the same way. The manifest's `contentHash` /
`sourceHash` pins are updated.

The source-derived JSON is untrusted data: it is parsed, never executed. Run
with `python3 -I`. No model output enters the text.

Usage:
  python3 -I scripts/feline/build.py [--pages .cache/feline/pages]
      [--out .cache/feline/build] [--manifest knowledge/feline/manifest.json]
      [--only slug,slug] [--box-share <url>]   (or env FELINE_BOX_SHARE)

`--box-share` is the Box shared-folder URL; each document's `meta.sourceUrl`
becomes `<url>/file/<sourceId>`. It is written to the snapshot meta (the
private table) ONLY — never pass it into anything that is committed.
"""
import argparse
import hashlib
import json
import os
import re
import statistics
import sys

BULLETS = '■•●▪◼◾▸►✓✔–-'
UNIT_WORDS = {
    'g', 'mg', 'kg', 'lb', 'lbs', 'oz', 'iu', 'kcal', 'cal', 'cup', 'cups', 'can', 'cans', 'ml', 'l', 'mcg',
    'µg', 'ug', 'ppm', 'per', 'treat', 'treats', 'mj', 'day', 'days', 'min', 'max', 'x', 'pouch', 'pouches',
    'tray', 'trays', 'bag', 'bags', 'scoop', 'scoops', 'tbsp', 'tsp', 'g/day', 'kcal/day', 'wk', 'weeks', 'mo',
    'months', 'yr', 'yrs', 'years', 'h', 'hr', 'hrs', 'dm', 'as', 'fed', 'me', 'nfe', 'mmol', 'mol', 'meq',
}
CANINE = re.compile(r'\b(dog|dogs|dog\'s|canine|canines|puppy|puppies)\b', re.I)
FELINE = re.compile(r'\b(cat|cats|cat\'s|feline|felines|kitten|kittens)\b', re.I)


def sha256(b):
    return hashlib.sha256(b).hexdigest()


# ── Cells and numbers ────────────────────────────────────────────────────────

def is_numeric_cell(text):
    t = text.strip()
    if t.startswith('/'):  # "/1000 kcal" is a column header, not a value
        return False
    if not t or len(t) > 28 or not re.search(r'\d', t):
        return False if t not in ('-', '—', '–') else True
    for tok in re.split(r'[\s/(),]+', t):
        tok = tok.strip('.:;%*†‡~<>≤≥+±').lower()
        if not tok or re.fullmatch(r'[\d.,\-–—/]+', tok):
            continue
        if tok in UNIT_WORDS or re.fullmatch(r'\d+(st|nd|rd|th)', tok):
            continue
        return False
    return True


def segments(words, gap=7.0):
    """Words → same-line segments (a phrase or a cell). A word joins the
    segment whose last word it continues on the same baseline band, so
    neighbouring columns at different heights never interleave."""
    segs = []
    for w in sorted(words, key=lambda w: (w[0], w[1])):
        h = w[3] - w[1]
        best = None
        for sg in segs:
            last = sg[-1]
            ov = min(w[3], last[3]) - max(w[1], last[1])
            dx = w[0] - last[2]
            if ov > 0.6 * min(h, last[3] - last[1]) and -1.5 <= dx <= gap:
                if best is None or dx < best[0]:
                    best = (dx, sg)
        if best:
            best[1].append(w)
        else:
            segs.append([w])
    out = []
    for sg in segs:
        out.append({
            'x0': min(w[0] for w in sg), 't': min(w[1] for w in sg),
            'x1': max(w[2] for w in sg), 'b': max(w[3] for w in sg),
            'text': ' '.join(w[4] for w in sg),
            'w': sg,
        })
    out.sort(key=lambda s: (round(s['t']), s['x0']))
    return out


def split_at_columns(seg, cols):
    """A header segment that is really several column headers set close
    together ("/1000 kcal Dry Matter (%) /1000 kcal …") → one per column:
    split at a word gap wider than a space where the words either side sit
    nearest different value columns."""
    ws = seg.get('w') or []
    if len(ws) < 2 or not cols:
        return [seg]
    near = lambda w: min(range(len(cols)), key=lambda i: abs(cols[i] - (w[0] + w[2]) / 2))
    parts = [[ws[0]]]
    for a, b in zip(ws, ws[1:]):
        if b[0] - a[2] > 4.0 and near(a) != near(b):
            parts.append([b])
        else:
            parts[-1].append(b)
    if len(parts) == 1:
        return [seg]
    return [{'x0': min(w[0] for w in p), 't': min(w[1] for w in p), 'x1': max(w[2] for w in p),
             'b': max(w[3] for w in p), 'text': ' '.join(w[4] for w in p), 'w': p} for p in parts]


def cluster(values, tol):
    """1-D clustering: sorted values → groups within `tol` of the running mean."""
    groups = []
    for v in sorted(values):
        if groups and abs(v - statistics.mean(groups[-1])) <= tol:
            groups[-1].append(v)
        else:
            groups.append([v])
    return [statistics.mean(g) for g in groups]


# ── Tables ───────────────────────────────────────────────────────────────────

def parse_table(words, notes, page_no):
    """Words of a table region → rows of labelled values (see module doc)."""
    segs = segments(words)
    if not segs:
        return None
    num = [s for s in segs if is_numeric_cell(s['text'])]
    if len(num) < 3:
        return None
    hs = statistics.median([s['b'] - s['t'] for s in num])
    # Rows: numeric segments clustered by vertical centre.
    centres = cluster([(s['t'] + s['b']) / 2 for s in num], 0.45 * hs)
    rows = [{'y': c, 'cells': []} for c in centres]
    for s in num:
        cy = (s['t'] + s['b']) / 2
        min(rows, key=lambda r: abs(r['y'] - cy))['cells'].append(s)
    rows = [r for r in rows if r['cells']]
    first_top = min(min(c['t'] for c in r['cells']) for r in rows)
    last_bottom = max(max(c['b'] for c in r['cells']) for r in rows)
    # Value columns: numeric segment centres.
    cols = cluster([(s['x0'] + s['x1']) / 2 for s in num], 6.0)
    col_lo = min(s['x0'] for s in num)
    # Text segments inside the data band: labels (left of the values) or
    # interleaved text columns (side-by-side tables) — split the latter off.
    text_in = [s for s in segs if s not in num and s['t'] >= first_top - 0.3 * hs and s['b'] <= last_bottom + 2 * hs]
    right_text = [s for s in text_in if s['x0'] > col_lo + 4]
    if right_text:
        split_x = min(s['x0'] for s in right_text) - 2
        if any(s['x1'] <= split_x for s in num) and any(s['x0'] >= split_x for s in num):
            left = [w for w in words if w[2] <= split_x + 1]
            right = [w for w in words if w[0] >= split_x - 1]
            if len(left) < len(words) and len(right) < len(words):
                a = parse_table(left, notes, page_no)
                b = parse_table(right, notes, page_no)
                return [x for x in (a, b) if x] or None
        notes.append(f'table:p{page_no}:text-inside-value-columns')
    labels = [s for s in text_in if s['x1'] <= col_lo + 4]
    for s in labels:
        cy = (s['t'] + s['b']) / 2
        r = min(rows, key=lambda r: abs(r['y'] - cy))
        if abs(r['y'] - cy) <= 1.2 * hs:
            r.setdefault('label', []).append(s)
        else:
            r2 = {'y': cy, 'cells': [], 'label': [s], 'sectionRow': True}
            rows.append(r2)
    rows.sort(key=lambda r: r['y'])
    # Header: segments above the first data row.
    head = [x for s in segs if s['b'] <= first_top + 0.2 * hs and s not in num for x in split_at_columns(s, cols)]
    # A full row of column headers (≥ 3 cells across most of the table) is
    # never a wrapped continuation of the cells above it.
    span = (max(s['x1'] for s in segs) - min(s['x0'] for s in segs)) or 1
    lowest = max((o['t'] for o in head), default=0)
    def header_row(s):
        if abs(s['t'] - lowest) >= 1.5:
            return False
        row = [o for o in head if abs(o['t'] - s['t']) < 1.5]
        return len(row) >= 3 and (max(o['x1'] for o in row) - min(o['x0'] for o in row)) >= 0.6 * span
    tiers = []
    for s in sorted(head, key=lambda s: s['t']):
        merged = False
        for cell in ([] if header_row(s) else [c for t in tiers for c in t]):
            # A wrapped header line joins the cell above it (same column, next line).
            if abs((cell['x0'] + cell['x1']) / 2 - (s['x0'] + s['x1']) / 2) < 18 and -0.5 * (s['b'] - s['t']) <= s['t'] - cell['b'] < 0.35 * (s['b'] - s['t']) + 0.5:
                cell['text'] += ' ' + s['text']
                cell['x0'], cell['x1'] = min(cell['x0'], s['x0']), max(cell['x1'], s['x1'])
                cell['b'] = max(cell['b'], s['b'])
                merged = True
                break
        if not merged:
            c = dict(s)
            for t in tiers:
                ref = t[0]
                ov = min(c['b'], ref['b']) - max(c['t'], ref['t'])
                if ov > 0.5 * min(c['b'] - c['t'], ref['b'] - ref['t']):
                    t.append(c)
                    break
            else:
                tiers.append([c])
    cells = [c for t in tiers for c in t]
    label_header = ' '.join(c['text'] for c in sorted(cells, key=lambda c: c['t']) if c['x1'] <= col_lo + 4)
    vcells = [c for c in cells if c['x1'] > col_lo + 4]

    def parent_of(cur):
        """The header cell that spans `cur`: among the cells just above it (the
        nearest tier) that overlap it or sit within reach of its centre, the
        one whose centre is closest (a centred spanning header)."""
        ccx = (cur['x0'] + cur['x1']) / 2
        ups = [c for c in vcells if c is not cur and c['b'] <= cur['t'] + 2
               and (min(c['x1'], cur['x1']) - max(c['x0'], cur['x0']) > 0
                    or abs((c['x0'] + c['x1']) / 2 - ccx) <= (c['x1'] - c['x0']) / 2 + 28)]
        if not ups:
            return None
        low = max(c['b'] for c in ups)
        near = [c for c in ups if c['b'] >= low - 3]
        return min(near, key=lambda c: abs((c['x0'] + c['x1']) / 2 - ccx))

    paths = []
    for cx in cols:
        hits = [c for c in vcells if c['x0'] - 3 <= cx <= c['x1'] + 3]
        if not hits:
            paths.append([])
            continue
        cur = max(hits, key=lambda c: (c['b'], -abs((c['x0'] + c['x1']) / 2 - cx)))
        path = [cur['text']]
        seen = {id(cur)}
        while True:
            par = parent_of(cur)
            if not par or id(par) in seen:
                break
            path.insert(0, par['text'])
            seen.add(id(par))
            cur = par
        paths.append(path)
    vtiers = [vcells] if vcells else []
    # A header over EVERY column is the table's caption, not a column label.
    caption = ''
    full = [p for p in paths if p]
    if len(full) >= 2 and len(full) == len(paths) and all(len(p) >= 2 and p[0] == full[0][0] for p in full):
        caption = full[0][0]
        paths = [p[1:] for p in paths]
    if any(not p for p in paths) and vtiers:
        notes.append(f'table:p{page_no}:column-without-header')
    for r in rows:
        r['values'] = {}
        for s in r['cells']:
            cx = (s['x0'] + s['x1']) / 2
            k = min(range(len(cols)), key=lambda i: abs(cols[i] - cx))
            if k in r['values']:
                notes.append(f'table:p{page_no}:two-values-one-column')
                r['values'][k] += ' ' + s['text']
            else:
                r['values'][k] = s['text']
        r['labelText'] = ' '.join(s['text'] for s in sorted(r.get('label', []), key=lambda s: (round(s['t']), s['x0'])))
    used = {id(s) for r in rows for s in r.get('label', [])} | {id(s) for s in num} | {id(s) for s in head}
    stray = [s for s in segs if id(s) not in used]
    return {'cols': cols, 'paths': paths, 'rows': rows, 'labelHeader': label_header, 'caption': caption,
            'top': min(s['t'] for s in segs), 'bottom': max(s['b'] for s in segs), 'stray': stray}


def render_table(tab):
    """Labelled statements. Columns grouped by their top header; a comparison
    table (≥ 2 top headers + row labels) becomes one statement per product."""
    if isinstance(tab, list):
        return '\n\n'.join(render_table(t) for t in tab)
    paths, rows = tab['paths'], tab['rows']
    tops = []
    for p in paths:
        key = p[0] if p else ''
        if key not in tops:
            tops.append(key)
    data_rows = [r for r in rows if r['values']]
    labelled = sum(1 for r in data_rows if r['labelText']) >= 0.6 * max(1, len(data_rows))
    out = []
    multi_level = any(len(p) >= 2 for p in paths)
    if labelled and len([t for t in tops if t]) >= 2 and multi_level:
        # Comparison table: columns are products. One statement per product.
        for top in tops:
            ks = [i for i, p in enumerate(paths) if (p[0] if p else '') == top]
            parts = []
            section = ''
            for r in rows:
                if not r['values']:
                    section = r['labelText']
                    continue
                vals = []
                for k in ks:
                    if k in r['values']:
                        leaf = ' '.join(paths[k][1:])
                        vals.append(f"{r['values'][k]}{f' [{leaf}]' if leaf else ''}")
                if vals:
                    lab = r['labelText'] or '?'
                    parts.append(f"{lab}: {', '.join(vals)}")
            if parts:
                out.append(f"- {top or 'Values'}{f' — {section}' if False else ''} — " + '; '.join(parts) + '.')
        return '\n'.join(out)
    if tab.get('caption'):
        out.append(f"{tab['caption']}:")
    for r in rows:
        if not r['values']:
            if r['labelText']:
                out.append(f"- {r['labelText']}")
            continue
        groups = []
        for k in sorted(r['values']):
            p = paths[k]
            g = ' · '.join(p[:-1]) if len(p) > 1 else ''
            leaf = p[-1] if p else ''
            if groups and groups[-1][0] == g:
                groups[-1][1].append((r['values'][k], leaf))
            else:
                groups.append((g, [(r['values'][k], leaf)]))
        bits = []
        for g, vals in groups:
            if g:
                bits.append(f"{g}: " + ', '.join(f'{v} {leaf}'.strip() for v, leaf in vals))
            else:
                bits.append('; '.join(f'{leaf}: {v}' if leaf else v for v, leaf in vals))
        lab = r['labelText']
        if not lab and any(not paths[k] for k in r['values']):
            tab.setdefault('unlabelled', True)
        seen_paths = [tuple(paths[k]) for k in sorted(r['values']) if paths[k]]
        # Same header twice in a row = two columns we could not tell apart
        # (side-by-side repeats — A, B, A, B — are fine).
        if any(a == b for a, b in zip(seen_paths, seen_paths[1:])):
            tab.setdefault('ambiguous', True)
        if lab and tab['labelHeader']:
            lab = f"{tab['labelHeader']} {lab}"
        out.append(f"- {lab + ' — ' if lab else ''}{' — '.join(bits)}")
    return '\n'.join(out)


# ── Prose ────────────────────────────────────────────────────────────────────

def is_data_line(line):
    cells = line.get('cells') or []
    if len(cells) < 2:
        return False
    n = sum(1 for c in cells if is_numeric_cell(c))
    return n >= 1 and n >= len(cells) / 3


def clean(t):
    t = t.replace('­', '').replace('‑', '-').replace('\t', ' ')
    t = re.sub(r'[-]', '', t)  # private-use icon glyphs
    return re.sub(r'\s+', ' ', t).strip()


def prose_lines_to_md(lines, body_h):
    """Reflow a column of lines into Markdown paragraphs / bullets / headings."""
    out = []
    para = None
    prev = None

    def flush():
        nonlocal para
        if para:
            out.append(para)
        para = None

    for L in lines:
        t = clean(L['text'])
        if not t:
            continue
        h = L['h']
        ratio = h / body_h if body_h else 1
        bullet = t[0] in BULLETS and (len(t) > 1 and t[1] == ' ' or t[0] in '■•●▪◼◾▸►✓✔')
        if ratio >= 1.3 and len(t) <= 90 and not bullet:
            if prev is not None and prev.get('heading') and L['bbox'][1] - prev['bbox'][3] < 0.6 * h:
                out[-1] += ' ' + t
            else:
                flush()
                out.append('## ' + t)
            prev = dict(L, heading=True)
            continue
        if 1.12 <= ratio < 1.3 and len(t) <= 60 and (t.isupper() or t.endswith(':')) and not bullet:
            flush()
            out.append('### ' + t)
            prev = dict(L, heading=True)
            continue
        if bullet:
            flush()
            para = '- ' + t[1:].strip()
            prev = dict(L, bullet=True, x=L['bbox'][0])
            continue
        if para is not None and prev is not None and not prev.get('heading'):
            gap = L['bbox'][1] - prev['bbox'][3]
            if gap < 0.55 * h and abs(L['h'] - prev['h']) < 1.5:
                joiner = '' if para.endswith('-') and re.match(r'[a-z]', t) else ' '
                para += joiner + t
                prev = dict(L, bullet=prev.get('bullet'))
                continue
        flush()
        para = t
        prev = dict(L)
    flush()
    return out


def split_columns(lines):
    """A run of lines whose cells are side-by-side prose → one column at a time."""
    xs = []
    for L in lines:
        if L.get('cellX'):
            xs += [c[0] for c in L['cellX']]
        else:
            xs.append(L['bbox'][0])
    anchors = cluster(xs, 14.0)
    cols = {i: [] for i in range(len(anchors))}
    for L in lines:
        if L.get('cells') and len(L['cells']) > 1:
            for text, (x0, x1) in zip(L['cells'], L['cellX']):
                k = min(range(len(anchors)), key=lambda i: abs(anchors[i] - x0) if x0 >= anchors[i] - 14 else 1e9)
                cols[k].append({'text': text, 'h': L['h'], 'bbox': [x0, L['bbox'][1], x1, L['bbox'][3]]})
        else:
            x0 = L['bbox'][0]
            k = min(range(len(anchors)), key=lambda i: abs(anchors[i] - x0) if x0 >= anchors[i] - 14 else 1e9)
            cols[k].append(L)
    return [cols[i] for i in sorted(cols) if cols[i]]


def page_words_in(page, box, pad=1.0):
    x0, y0, x1, y1 = box
    return [w for w in page.get('words', []) if w[0] >= x0 - pad and w[2] <= x1 + pad and w[1] >= y0 - pad and w[3] <= y1 + pad]


def find_tables(page, notes):
    """Page-level table regions: bands of rows with ≥ 2 numeric cells.

    XY-cut (step 1) splits a ruled table into one block per column, so tables
    are found here from the words: words of prose blocks (long lines) never
    take part; numeric segments are grouped into rows and rows into bands;
    a band takes the row labels to its left and the header lines above it
    (up to a section label, bigger type or a gap). Each band → parse_table.
    """
    prose = set()
    for b in page['blocks']:
        lens = [len(L['text']) for L in b['lines']]
        if lens and statistics.median(lens) > 38 and not any(is_data_line(L) for L in b['lines']):
            x0, y0, x1, y1 = b['bbox']
            for i, w in enumerate(page.get('words', [])):
                if w[0] >= x0 - 1 and w[2] <= x1 + 1 and w[1] >= y0 - 1 and w[3] <= y1 + 1:
                    prose.add(i)
    words = [w for i, w in enumerate(page.get('words', [])) if i not in prose]
    segs = segments(words)
    num = [s for s in segs if is_numeric_cell(s['text']) and re.search(r'\d', s['text'])]
    if len(num) < 4:
        return []
    h = statistics.median([s['b'] - s['t'] for s in num])
    centres = cluster([(s['t'] + s['b']) / 2 for s in num], 0.45 * h)
    rows = []
    for c in centres:
        cells = [s for s in num if abs((s['t'] + s['b']) / 2 - c) <= 0.45 * h + 0.5]
        if len(cells) >= 2:
            rows.append({'y': c, 'x0': min(s['x0'] for s in cells), 'x1': max(s['x1'] for s in cells)})
    bands = []
    for r in rows:
        if bands:
            B = bands[-1]
            ov = min(B['x1'], r['x1']) - max(B['x0'], r['x0'])
            gap = r['y'] - B['y1']
            between = [s for s in segs if B['y1'] + 0.6 * h < (s['t'] + s['b']) / 2 < r['y'] - 0.6 * h
                       and s['x1'] > B['x0'] + 2 and s['x0'] < B['x1']]
            # Same table: close rows, or a gap holding only a section label in the label column.
            if ov > 0.3 * min(B['x1'] - B['x0'], r['x1'] - r['x0']) and (gap <= 2.5 * h or (gap <= 3.8 * h and not between)):
                B['y1'] = r['y']
                B['x0'], B['x1'] = min(B['x0'], r['x0']), max(B['x1'], r['x1'])
                B['n'] += 1
                continue
        bands.append({'y0': r['y'], 'y1': r['y'], 'x0': r['x0'], 'x1': r['x1'], 'n': 1})
    out = []
    for bi, B in enumerate(bands):
        if B['n'] < 2:
            continue
        prev = [P for P in bands[:bi]]
        top, bottom = B['y0'] - 0.6 * h, B['y1'] + 0.6 * h
        # Row labels to the left (within 170 pt), inside the band.
        left = [s for s in segs if s['x1'] <= B['x0'] + 2 and s['x0'] >= B['x0'] - 170 and s['t'] >= top - 0.6 * h and s['b'] <= bottom + 1.2 * h]
        x0 = min([B['x0']] + [s['x0'] for s in left])
        # Header lines above: same-size type, overlapping the band, no gap > 2.5 h,
        # stopping at a section label ("…:") or bigger type.
        y = top
        for s in sorted([s for s in segs if s['b'] <= top + 1 and s['x1'] > x0 and s['x0'] < B['x1']], key=lambda s: -s['b']):
            cy = (s['t'] + s['b']) / 2
            data_line = sum(1 for n in num if abs((n['t'] + n['b']) / 2 - cy) < 0.5 * h and n['x1'] > x0 and n['x0'] < B['x1']) >= 2
            # …or the trailing row of the table above (a row with one value).
            tail = any(P['y0'] - 0.6 * h <= cy <= P['y1'] + 1.6 * h and min(P['x1'], B['x1']) - max(P['x0'], x0) > 0 for P in prev)
            if (y - s['b'] > 2.5 * h or (s['b'] - s['t']) > 1.35 * h or s['text'].rstrip().endswith(':')
                    or data_line or tail):
                break
            y = min(y, s['t'])
        box = [x0 - 1, y - 1, B['x1'] + 1, bottom + 0.6 * h]
        # Header words may run past the right-aligned numbers: take words by centre, with slack.
        # (By centre — the same test `in_box` uses to take lines out of the prose,
        # so a word is always either in a table or in the text, never lost.)
        tw = [w for w in words if box[0] - 12 <= (w[0] + w[2]) / 2 <= box[2] + 12 and box[1] <= (w[1] + w[3]) / 2 <= box[3]]
        box = [min([box[0]] + [w[0] for w in tw]), box[1], max([box[2]] + [w[2] for w in tw]), box[3]]
        tab = parse_table(tw, notes, page['n'])
        if tab:
            out.append((box, tab))
    return out


def in_box(L, box):
    x0, y0, x1, y1 = L['bbox']
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return box[0] <= cx <= box[2] and box[1] <= cy <= box[3]


def lines_md(lines, body_h):
    if not lines:
        return []
    multi = [L for L in lines if L.get('cells') and len(L['cells']) > 1]
    md = []
    if multi:
        for col in split_columns(lines):
            md += prose_lines_to_md(col, body_h)
    else:
        md += prose_lines_to_md(lines, body_h)
    return [m for m in md if m.strip()]


def tight_lists(md):
    """Consecutive bullet items form one list (one paragraph for the chunker)."""
    out = []
    for m in md:
        if out and m.startswith('- ') and out[-1].startswith('- ') and not out[-1].startswith('- ' * 2):
            out[-1] += '\n' + m
        else:
            out.append(m)
    return out


def pdf_page_md(page, canine_log, species_filter):
    notes = []
    body_h = page.get('bodyH') or 10.0
    tables = find_tables(page, notes)
    emitted = set()
    out = []
    for b in page['blocks']:
        text = ' '.join(L['text'] for L in b['lines'])
        if species_filter and CANINE.search(text) and not FELINE.search(text):
            canine_log.append({'page': page['n'], 'words': len(text.split()), 'start': ' '.join(text.split()[:6])})
            continue
        if re.fullmatch(r'\s*\d{1,3}\s*', text):  # a lone folio
            continue
        lines = b['lines']
        for i, (box, tab) in enumerate(tables):
            hit = [L for L in lines if in_box(L, box)]
            if not hit:
                continue
            above = [L for L in lines if not in_box(L, box) and L['bbox'][1] < box[1]]
            out += lines_md(above, body_h)
            if i not in emitted:
                emitted.add(i)
                out.append(render_table(tab))
                def flat(t):
                    return [y for x in t for y in flat(x)] if isinstance(t, list) else [t]
                for t in flat(tab):
                    if t.get('unlabelled'):
                        notes.append(f"table:p{page['n']}:value-without-header-or-label")
                    if t.get('ambiguous'):
                        notes.append(f"table:p{page['n']}:two-columns-same-header")
            lines = [L for L in lines if not in_box(L, box) and L['bbox'][1] >= box[1]]
        out += lines_md(lines, body_h)
    return tight_lists(out), notes


def pptx_page_md(page, canine_log, species_filter):
    out = []
    first = True
    for sh in page['shapes']:
        text = ' '.join(sh['paragraphs'])
        if species_filter and CANINE.search(text) and not FELINE.search(text):
            canine_log.append({'page': page['n'], 'words': len(text.split()), 'start': ' '.join(text.split()[:6])})
            continue
        paras = [clean(p) for p in sh['paragraphs'] if clean(p)]
        if not paras:
            continue
        if first:
            out.append('## ' + paras[0])
            paras = paras[1:]
            first = False
        for p in paras:
            if re.fullmatch(r'[!?]', p):
                continue
            out.append('- ' + p[1:].strip() if p[0] in '•■▪' else p)
    if page.get('notes'):
        out.append('Speaker notes: ' + clean(page['notes']))
    return tight_lists(out), []


# ── Fidelity ─────────────────────────────────────────────────────────────────

NUM_TOKEN = re.compile(r'(?<![\w.])\d+(?:[.,/]\d+)*(?:\s?%)?')
MARK_TOKEN = re.compile(r'([A-Za-z0-9][A-Za-z0-9+\-]*)\s?([®™])')


def coverage(md, layout_text, removed_words=0):
    """Share of the text layer's words (with multiplicity) found in the
    Markdown — the guard against silently dropped text (charts' rotated
    labels and canine passages removed on purpose are discounted)."""
    from collections import Counter
    tok = lambda t: [w.lower() for w in re.findall(r"[A-Za-z0-9]+", t)]
    src, out = Counter(tok(layout_text)), Counter(tok(md))
    total = sum(src.values()) - removed_words
    if total <= 20:
        return 1.0
    found = sum(min(n, out[w]) for w, n in src.items())
    return min(1.0, found / total)


def norm(s):
    s = s.replace('­', '').replace('‑', '-')
    return re.sub(r'\s+', '', s)


def fidelity(md, layout_text):
    """Values / ®™ names in `md` that are not in the page's text layer."""
    hay = norm(layout_text)
    # Hyphenation: the layer may wrap "multi-\nfunction"; also accept it without the hyphen break.
    hay_nohyph = norm(re.sub(r'-\s*\n\s*', '', layout_text))
    bad = []
    body = re.sub(r'^#+ ', '', md, flags=re.M)
    for m in NUM_TOKEN.finditer(body):
        tok = m.group(0)
        n = norm(tok)
        if n in hay or n in hay_nohyph:
            continue
        # Superscript footnote digits are rendered "[n]" by step 1.
        if n.replace(',', '') in hay:
            continue
        bad.append(tok)
    for m in MARK_TOKEN.finditer(body):
        tok = m.group(1) + m.group(2)
        if norm(tok) in hay or (m.group(2) in hay and m.group(1) in hay):
            continue
        bad.append(tok)
    seen = []
    for b in bad:
        if b not in seen:
            seen.append(b)
    return seen


# ── Main ─────────────────────────────────────────────────────────────────────

def write_catalogue(pages_dir, manifest, path):
    """Every delivered source file: metadata only (the repo is public) and
    what became of it — the documents it feeds, or why it was excluded."""
    files = []
    for name in sorted(os.listdir(pages_dir)):
        if not name.endswith('.json'):
            continue
        with open(os.path.join(pages_dir, name), encoding='utf-8') as fh:
            src = json.load(fh)
        sid = src['sourceId']
        docs = [d['slug'] for d in manifest['documents'] if d['sourceId'] == sid]
        excl = [e['reason'] for e in manifest['excluded'] if e['sourceId'] == sid]
        files.append({
            'sourceId': sid, 'fileName': src['name'], 'folder': src['folder'], 'kind': src['kind'],
            'pages': len(src['pages']), 'words': sum(len(p['layoutText'].split()) for p in src['pages']),
            'sha256': src['sha256'], 'bytes': src['size'],
            'decision': {'documents': docs} if docs else {'excluded': excl[0] if excl else 'not reviewed'},
        })
    files.sort(key=lambda f: (f['folder'], f['fileName']))
    cat = {'source': 'Royal Canin Canada Veterinary Division — Educational Assets_Confident Conversations (Box shared folder, delivered 2026-11-02)',
           'count': len(files), 'files': files}
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(json.dumps(cat, indent=2, ensure_ascii=False) + '\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pages', default='.cache/feline/pages')
    ap.add_argument('--out', default='.cache/feline/build')
    ap.add_argument('--manifest', default='knowledge/feline/manifest.json')
    ap.add_argument('--only', default='')
    ap.add_argument('--box-share', default=os.environ.get('FELINE_BOX_SHARE', ''))
    a = ap.parse_args()
    only = {s for s in a.only.split(',') if s}
    with open(a.manifest, encoding='utf-8') as fh:
        manifest = json.load(fh)
    os.makedirs(a.out, exist_ok=True)
    cache = {}
    report = []
    for d in manifest['documents']:
        if only and d['slug'] not in only:
            continue
        sid = d['sourceId']
        if sid not in cache:
            with open(os.path.join(a.pages, f'{sid}.json'), encoding='utf-8') as fh:
                cache[sid] = json.load(fh)
        src = cache[sid]
        pages = {p['n']: p for p in src['pages']}
        canine = []
        md = []
        review = []
        table_notes = []
        species_filter = d.get('speciesFilter', True)
        for n in d['pages']:
            p = pages[n]
            if src['kind'] == 'pptx':
                parts, notes = pptx_page_md(p, canine, species_filter)
            else:
                parts, notes = pdf_page_md(p, canine, species_filter)
            if not parts:
                continue
            text = '\n\n'.join(parts)
            for tok in fidelity(text, p['layoutText']):
                review.append({'page': n, 'token': tok})
            removed = sum(c['words'] for c in canine if c['page'] == n) + p.get('rotatedWords', 0)
            cov = coverage(text, p['layoutText'], removed)
            if cov < 0.9:
                table_notes.append({'page': n, 'token': f'coverage:{cov:.2f}'})
            for nt in sorted(set(notes)):
                table_notes.append({'page': n, 'token': nt})
            md.append(f'<!-- page {n} -->\n\n{text}')
        if d.get('referencesPages'):
            for n in d['referencesPages']:
                p = pages[n]
                parts, _ = pdf_page_md(p, [], False)
                body = '\n\n'.join(x for x in parts if not x.startswith('## '))
                md.append(f'<!-- page {n} -->\n\n## References\n\n{body}')
        content = '\n\n'.join(md).strip() + '\n'
        # Keep reviewer sign-offs: a note already signed off for the same page + token stays signed off.
        prior = {(r['page'], r['token']): r for r in d.get('reviewNotes', [])}
        notes_out = []
        for r in review + table_notes:
            old = prior.get((r['page'], r['token']))
            notes_out.append(old if old and old.get('status') == 'signed-off' else {**r, 'status': 'open'})
        # A reviewer's own findings (`manual: true`) always survive a rebuild.
        notes_out += [r for r in d.get('reviewNotes', []) if r.get('manual')]
        d['reviewNotes'] = notes_out
        # The manifest is public: page + size only. The passage openings stay in the private meta.
        d['canineBlocksRemoved'] = [{'page': c['page'], 'words': c['words']} for c in canine]
        d['contentHash'] = sha256(content.encode('utf-8'))
        d['sourceHash'] = src['sha256']
        if d['approved'] and any(r['status'] != 'signed-off' for r in notes_out):
            d['approved'] = False
            d['reason'] = d['reason'].split(' [held:')[0] + ' [held: open fidelity review notes]'
        meta = {
            'title': d['title'], 'assetType': d['assetType'], 'edition': d['edition'], 'region': d['region'],
            'audience': d['audience'], 'boxFileId': sid, 'sourceName': src['name'], 'folder': src['folder'],
            'sha256': src['sha256'], 'pages': d['pages'], 'pagesExcluded': d['pagesExcluded'],
            'transcribedPages': d.get('transcribedPages', []), 'transcribed': bool(d.get('transcribedPages')),
            'canineBlocksRemoved': canine, 'permission': manifest['permission']['reference'],
        }
        if a.box_share:
            meta['sourceUrl'] = f"{a.box_share.rstrip('/')}/file/{sid}"
        row = {'corpus': 'feline', 'slug': d['slug'], 'content': content, 'content_hash': d['contentHash'],
               'source_hash': src['sha256'], 'meta': meta}
        with open(os.path.join(a.out, f"{d['slug']}.json"), 'w', encoding='utf-8') as fh:
            json.dump(row, fh, ensure_ascii=False)
        with open(os.path.join(a.out, f"{d['slug']}.md"), 'w', encoding='utf-8') as fh:
            fh.write(content)
        report.append((d['slug'], len(content.split()), len(review), len(table_notes), len(canine)))
    with open(a.manifest, 'w', encoding='utf-8') as fh:
        fh.write(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    if not only:
        write_catalogue(a.pages, manifest, os.path.join(os.path.dirname(a.manifest), 'catalogue.json'))
    print(f"{'slug':48} words  fidelity  table  canine-blocks")
    for r in report:
        print(f'{r[0]:48} {r[1]:>5}  {r[2]:>8}  {r[3]:>5}  {r[4]:>5}')
    print(f'{len(report)} document(s); manifest pins updated', file=sys.stderr)


if __name__ == '__main__':
    main()
