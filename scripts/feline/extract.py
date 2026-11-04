#!/usr/bin/env python3
"""
Feline asset extraction, step 1 of 3 (`npm run feline:extract`).

Reads the Royal Canin feline source files (PDF / PPTX, as delivered — never
committed) and writes one JSON per file under `.cache/feline/pages/` with,
per page:

  * `layoutText` — the page's text layer exactly as `pdftotext -layout`
    prints it (the fidelity checker's ground truth);
  * `blocks`     — the text in reading order: a recursive XY-cut over the
    poppler word boxes (`pdftotext -bbox`), so a two-column layout reads
    column by column and a grid of short cells comes out as a TABLE (rows of
    cells) instead of interleaved prose.

PPTX: one "page" per slide — the slide's text frames top-to-bottom, left-to-
right, plus the speaker notes; `layoutText` is all of it.

The source files are untrusted data: they are only ever parsed (poppler,
python-pptx). Run with `python3 -I`. Nothing here is a model; nothing here
rewords text. Step 2 (`build.ts`) assembles the reviewed Markdown, step 3
(`fidelity.ts`) checks it against `layoutText`.

Usage:
  python3 -I scripts/feline/extract.py --src <dir of <boxFileId>.bin> \
      --inventory <inventory.jsonl> [--out .cache/feline/pages] [--only id,id]
"""
import argparse
import hashlib
import html
import json
import os
import re
import statistics
import subprocess
import sys

VGUTTER = 7.5      # min empty vertical band (pt) that separates columns
CELL_GAP = 7.0     # gap (pt) between words that starts a new table cell


def run(cmd):
    return subprocess.run(cmd, check=True, capture_output=True).stdout.decode('utf-8', 'replace')


# ── PDF ──────────────────────────────────────────────────────────────────────

WORD_RE = re.compile(
    r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
PAGE_RE = re.compile(r'<page width="([\d.]+)" height="([\d.]+)">(.*?)</page>', re.S)


def pdf_pages(path):
    """Word boxes per page, from poppler (the same engine as the text layer)."""
    xml = run(['pdftotext', '-bbox', path, '-'])
    pages = []
    for m in PAGE_RE.finditer(xml):
        words = []
        for w in WORD_RE.finditer(m.group(3)):
            x0, y0, x1, y1 = (float(w.group(i)) for i in range(1, 5))
            text = html.unescape(w.group(5))
            if not text.strip():
                continue
            words.append({'x0': x0, 'top': y0, 'x1': x1, 'bottom': y1, 'text': text})
        pages.append({'width': float(m.group(1)), 'height': float(m.group(2)), 'words': words})
    return pages


def layout_text(path, n):
    return run(['pdftotext', '-layout', '-f', str(n), '-l', str(n), path, '-'])


def rotated_boxes(path):
    """Per page, the boxes of characters that are NOT upright (pdfplumber's
    text matrix) — vertical axis labels, rotated column headers. Poppler's
    word boxes carry no direction, so a word is "rotated" when most of the
    characters inside its box are."""
    import pdfplumber  # local: only the PDF path needs it
    out = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            out.append([(c['x0'], c['top'], c['x1'], c['bottom'])
                        for c in page.chars if not c.get('upright', True) and c['text'].strip()])
    return out


def is_rotated(w, boxes):
    if not boxes:
        return False
    cx = [((b[0] + b[2]) / 2, (b[1] + b[3]) / 2) for b in boxes]
    inside = sum(1 for x, y in cx if w['x0'] - 0.5 <= x <= w['x1'] + 0.5 and w['top'] - 0.5 <= y <= w['bottom'] + 0.5)
    return inside >= max(1, len(w['text'].strip()) // 2)


def group_lines(words):
    """Words → lines (shared baseline band), each sorted left to right."""
    lines = []
    for w in sorted(words, key=lambda w: (w['bottom'], w['x0'])):
        h = w['bottom'] - w['top']
        for L in lines:
            overlap = min(w['bottom'], L['bottom']) - max(w['top'], L['top'])
            if overlap > 0.45 * min(h, L['bottom'] - L['top']):
                L['words'].append(w)
                L['top'] = min(L['top'], w['top'])
                L['bottom'] = max(L['bottom'], w['bottom'])
                break
        else:
            lines.append({'words': [w], 'top': w['top'], 'bottom': w['bottom']})
    for L in lines:
        L['words'].sort(key=lambda w: w['x0'])
    lines.sort(key=lambda L: (L['top'], L['words'][0]['x0']))
    return lines


def cells_of(words, gap=CELL_GAP):
    cells = [[words[0]]]
    for w in words[1:]:
        if w['x0'] - cells[-1][-1]['x1'] > gap:
            cells.append([w])
        else:
            cells[-1].append(w)
    return cells


def gaps(intervals, minw):
    iv = sorted(intervals)
    out, end = [], iv[0][1]
    for a, b in iv[1:]:
        if a - end > minw:
            out.append((end, a))
        end = max(end, b)
    return out


def line_text(words, body_h):
    """Join a line's words; small raised words are superscripts, small low
    words subscripts. A superscript run of digits is a footnote marker and
    stays attached as [n]; ®, ™ and symbols attach with no space."""
    out = ''
    base = max(w['bottom'] for w in words)
    for i, w in enumerate(words):
        h = w['bottom'] - w['top']
        t = w['text']
        small = h < 0.78 * body_h
        raised = small and w['bottom'] < base - 0.18 * body_h
        lowered = small and not raised and w['top'] > (base - body_h) + 0.25 * body_h
        if i == 0:
            out = t
            continue
        prev = words[i - 1]
        touching = w['x0'] - prev['x1'] < 1.2
        if raised and re.fullmatch(r'[\d,\-–]+', t):
            out += f'[{t}]'
        elif (raised or lowered or touching) and (t in ('®', '™', '*', '†', '‡', '§') or lowered):
            out += t
        elif touching and raised:
            out += t
        else:
            out += ' ' + t
    return out


def short_cell_share(words):
    lines = group_lines(words)
    multi, lens = 0, []
    for L in lines:
        cs = cells_of(L['words'])
        if len(cs) >= 2:
            multi += 1
        lens += [len(' '.join(w['text'] for w in c)) for c in cs]
    return lines, multi, lens


def looks_tabular(words):
    """A grid of short cells: most lines split into ≥ 2 cells and the typical
    cell is a few characters (numbers, units, short labels)."""
    lines, multi, lens = short_cell_share(words)
    if len(lines) < 2 or not lens:
        return False
    return multi >= 0.6 * len(lines) and statistics.median(lens) <= 16


def xy_cut(words, body_h, out):
    if not words:
        return
    vg = gaps([(w['x0'], w['x1']) for w in words], VGUTTER)
    if vg:
        # Cut every gutter; if EVERY piece is short-celled, the region is a table.
        xs = [(a + b) / 2 for a, b in vg]
        pieces, lo = [], -1e9
        for x in xs + [1e9]:
            pieces.append([w for w in words if w['x0'] >= lo and w['x1'] <= x])
            lo = x
        prose = [p for p in pieces if p and statistics.median(
            [len(' '.join(w['text'] for w in L['words'])) for L in group_lines(p)]) > 22]
        if not prose and looks_tabular(words) and len(pieces) >= 2:
            out.append(('table', words))
            return
        g = max(vg, key=lambda g: g[1] - g[0])
        x = (g[0] + g[1]) / 2
        xy_cut([w for w in words if w['x1'] <= x], body_h, out)
        xy_cut([w for w in words if w['x0'] >= x], body_h, out)
        return
    hg = gaps([(w['top'], w['bottom']) for w in words], 0.85 * body_h)
    if hg:
        y = (hg[0][0] + hg[0][1]) / 2
        xy_cut([w for w in words if w['bottom'] <= y], body_h, out)
        xy_cut([w for w in words if w['top'] >= y], body_h, out)
        return
    out.append(('text', words))


def block_json(kind, words, body_h):
    lines = group_lines(words)
    jl = []
    for L in lines:
        h = statistics.median([w['bottom'] - w['top'] for w in L['words']])
        item = {
            'text': line_text(L['words'], max(h, 0.1)),
            'bbox': [round(L['words'][0]['x0'], 1), round(L['top'], 1),
                     round(max(w['x1'] for w in L['words']), 1), round(L['bottom'], 1)],
            'h': round(h, 2),
        }
        cs = cells_of(L['words'])
        if len(cs) > 1:
            # Wide gaps inside a line: the builder decides whether a run of
            # such lines is a table (build.ts → tables.ts).
            item['cells'] = [line_text(c, max(h, 0.1)) for c in cs]
            item['cellX'] = [[round(c[0]['x0'], 1), round(max(w['x1'] for w in c), 1)] for c in cs]
        jl.append(item)
    return {
        'kind': kind,
        'bbox': [round(min(w['x0'] for w in words), 1), round(min(w['top'] for w in words), 1),
                 round(max(w['x1'] for w in words), 1), round(max(w['bottom'] for w in words), 1)],
        'lines': jl,
    }


def extract_pdf(path):
    pages = []
    rot = rotated_boxes(path)
    for i, p in enumerate(pdf_pages(path), start=1):
        boxes = rot[i - 1] if i - 1 < len(rot) else []
        words = [w for w in p['words'] if not is_rotated(w, boxes)]
        rotated = len(p['words']) - len(words)
        body_h = statistics.median([w['bottom'] - w['top'] for w in words]) if words else 10.0
        blocks = []
        xy_cut(words, body_h, blocks)
        pages.append({
            'n': i,
            'width': p['width'],
            'height': p['height'],
            'bodyH': round(body_h, 2),
            'rotatedWords': rotated,
            'layoutText': layout_text(path, i),
            'blocks': [block_json(k, ws, body_h) for k, ws in blocks],
        })
    return pages


# ── PPTX ─────────────────────────────────────────────────────────────────────

def extract_pptx(path):
    from pptx import Presentation  # imported here: only needed for decks
    from pptx.util import Emu

    prs = Presentation(path)
    pages = []

    def shape_texts(shapes, acc):
        for sh in shapes:
            if sh.shape_type == 6 and hasattr(sh, 'shapes'):  # group
                shape_texts(sh.shapes, acc)
                continue
            paras = []
            if getattr(sh, 'has_text_frame', False) and sh.has_text_frame:
                for para in sh.text_frame.paragraphs:
                    t = ''.join(r.text for r in para.runs).strip()
                    if t:
                        paras.append(t)
            if getattr(sh, 'has_table', False) and sh.has_table:
                for row in sh.table.rows:
                    cells = [c.text.strip() for c in row.cells]
                    if any(cells):
                        paras.append(' | '.join(cells))
            if paras:
                top = int(sh.top or 0)
                left = int(sh.left or 0)
                acc.append({'top': top, 'left': left, 'paragraphs': paras, 'name': sh.name})
        return acc

    for i, slide in enumerate(prs.slides, start=1):
        shapes = shape_texts(slide.shapes, [])
        # Reading order: rows of shapes (top within ~0.3 in), then left to right.
        shapes.sort(key=lambda s: (round(s['top'] / Emu(274320)), s['left']))
        notes = ''
        if slide.has_notes_slide:
            notes = slide.notes_slide.notes_text_frame.text.strip() if slide.notes_slide.notes_text_frame else ''
        layout = '\n'.join(p for s in shapes for p in s['paragraphs'])
        if notes:
            layout += '\n' + notes
        pages.append({
            'n': i,
            'shapes': [{'paragraphs': s['paragraphs'], 'name': s['name']} for s in shapes],
            'notes': notes,
            'layoutText': layout,
        })
    return pages


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--inventory', required=True)
    ap.add_argument('--out', default='.cache/feline/pages')
    ap.add_argument('--only', default='')
    a = ap.parse_args()
    only = {s for s in a.only.split(',') if s}
    os.makedirs(a.out, exist_ok=True)
    with open(a.inventory, encoding='utf-8') as fh:
        inventory = [json.loads(l) for l in fh if l.strip()]
    for item in inventory:
        sid = str(item['id'])
        if only and sid not in only:
            continue
        path = os.path.join(a.src, f'{sid}.bin')
        with open(path, 'rb') as fh:
            raw = fh.read()
        sha = hashlib.sha256(raw).hexdigest()
        kind = 'pptx' if item['name'].lower().endswith('.pptx') else 'pdf'
        pages = extract_pptx(path) if kind == 'pptx' else extract_pdf(path)
        doc = {'sourceId': sid, 'name': item['name'], 'folder': item.get('folder', ''),
               'kind': kind, 'sha256': sha, 'size': len(raw), 'pages': pages}
        with open(os.path.join(a.out, f'{sid}.json'), 'w', encoding='utf-8') as fh:
            json.dump(doc, fh, ensure_ascii=False)
        print(f'{sid}  {kind}  {len(pages):>3} page(s)  {item["name"]}', file=sys.stderr)


if __name__ == '__main__':
    main()
