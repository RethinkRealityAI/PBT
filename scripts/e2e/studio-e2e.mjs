#!/usr/bin/env node
/**
 * Scenario Studio end-to-end check — drives the REAL admin on a deployed
 * site (a PR deploy preview; it shares the production database) and proves:
 *
 *   1. A new CATEGORY per animal can be created, with a knowledge document
 *      uploaded straight from the category editor, and an objection inside it.
 *   2. A scenario per animal can be built through the seven Studio steps and
 *      saved as a hidden draft (never published).
 *   3. RAG reaches the uploaded document: the Knowledge-step preview and the
 *      full AI briefing contain the document's unique marker word — and NEVER
 *      the other animal's (no cross-contamination), even after the cat
 *      document is deliberately attached to the dog category.
 *   4. The Test drive text simulation runs a real conversation and scores it,
 *      and "Open in the trainee app" starts a text chat in the phone frame.
 *
 * Everything it creates is named "QA E2E …" (see fixtures.mjs) and is removed
 * afterwards by cleanup.sql. It never publishes anything.
 *
 *   PBT_E2E_BASE_URL=https://deploy-preview-25--rc-pbt.netlify.app \
 *   PBT_E2E_SUPABASE_URL=https://<ref>.supabase.co PBT_E2E_SUPABASE_KEY=sb_publishable_… \
 *   node scripts/e2e/studio-e2e.mjs <out-dir> [setup|build|probe|all]
 *
 * <out-dir> must hold account.json + password from qa-account.mjs (or set
 * PBT_E2E_EMAIL / PBT_E2E_PASSWORD). Artifacts written there: screenshots,
 * transcripts.md, briefing-<animal>.txt, report.json. Exit code 1 if any
 * check failed. Playwright: `playwright` from node_modules, else
 * PLAYWRIGHT_MODULE (path to its index.mjs); Chromium: CHROMIUM_PATH, else
 * /opt/pw-browsers/chromium when present.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ANIMALS, DOG, CAT } from './fixtures.mjs';

const OUT = process.argv[2];
const PHASE = process.argv[3] || 'all';
const BASE = (process.env.PBT_E2E_BASE_URL || '').replace(/\/$/, '');
const SB_URL = (process.env.PBT_E2E_SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = process.env.PBT_E2E_SUPABASE_KEY || '';
if (!OUT || !BASE || !SB_URL || !SB_KEY) {
  console.error('Usage: PBT_E2E_BASE_URL=… PBT_E2E_SUPABASE_URL=… PBT_E2E_SUPABASE_KEY=… node scripts/e2e/studio-e2e.mjs <out-dir> [setup|build|probe|all]');
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const account = existsSync(join(OUT, 'account.json')) ? JSON.parse(readFileSync(join(OUT, 'account.json'), 'utf8')) : {};
const EMAIL = process.env.PBT_E2E_EMAIL || account.email;
const PASSWORD = process.env.PBT_E2E_PASSWORD || (existsSync(join(OUT, 'password')) ? readFileSync(join(OUT, 'password'), 'utf8').trim() : '');
if (!EMAIL || !PASSWORD) {
  console.error('No QA account: run qa-account.mjs first, or set PBT_E2E_EMAIL / PBT_E2E_PASSWORD.');
  process.exit(2);
}

const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright').catch(async () =>
  import('/opt/node22/lib/node_modules/playwright/index.mjs'),
);
const chromium = pw.chromium ?? pw.default?.chromium;
const CHROMIUM = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

// ─── Report ────────────────────────────────────────────────────────────────
const report = { base: BASE, startedAt: new Date().toISOString(), phase: PHASE, checks: [], data: {} };
const reportPath = join(OUT, 'report.json');
if (existsSync(reportPath) && PHASE !== 'all' && PHASE !== 'setup') {
  // Later phases keep what earlier ones learned (slugs, ids).
  try {
    Object.assign(report.data, JSON.parse(readFileSync(reportPath, 'utf8')).data ?? {});
  } catch {
    /* start fresh */
  }
}
function check(name, ok, detail = '') {
  report.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  return Boolean(ok);
}
function save() {
  report.finishedAt = new Date().toISOString();
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
}
let shotN = 0;
async function shot(page, name, opts = {}) {
  shotN += 1;
  const file = `${String(shotN).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: join(OUT, file), fullPage: opts.fullPage ?? false }).catch(() => {});
  return file;
}

// ─── API (the QA account's own JWT — the same calls the admin UI makes) ────
let jwt = '';
async function signInApi() {
  const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SB_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = await res.json();
  if (!body.access_token) throw new Error(`API sign-in failed: ${res.status} ${body.msg || body.error_description || ''}`);
  jwt = body.access_token;
}
async function api(fn, { method = 'GET', body, query = '' } = {}) {
  const res = await fetch(`${BASE}/.netlify/functions/${fn}${query}`, {
    method,
    headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${fn} ${res.status}: ${json.error || JSON.stringify(json).slice(0, 200)}`);
  return json;
}
async function catalogue() {
  const res = await api('admin-objections');
  return { objections: res.objections ?? [], categories: res.categories ?? [] };
}
async function qaDocs() {
  const res = await api('admin-knowledge');
  return (res.documents ?? []).filter((d) => String(d.title || '').startsWith('QA E2E ·'));
}

// ─── Browser helpers ───────────────────────────────────────────────────────
const AI_TIMEOUT = 120_000;
async function toast(page, text, timeout = 30_000) {
  await page.locator('.pbt-toast', { hasText: text }).first().waitFor({ state: 'visible', timeout });
}
async function signIn(page) {
  await page.goto(`${BASE}/admin#/scenarios/categories`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('email@clinic.com').fill(EMAIL);
  await page.getByPlaceholder('password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('navigation', { name: 'Admin sections' }).waitFor({ timeout: 45_000 });
}
/**
 * Open an admin route with a FRESH page load. The Studio editor is not
 * hash-routed, so changing only the hash would leave it on screen.
 */
let navN = 0;
async function openRoute(page, hash) {
  navN += 1;
  await page.goto(`${BASE}/admin?e2e=${Date.now()}-${navN}#${hash}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Admin sections' }).waitFor({ timeout: 45_000 });
}
async function setPressed(locator, want) {
  const now = (await locator.getAttribute('aria-pressed')) === 'true';
  if (now !== want) await locator.click();
}
const main = (page) => page.getByRole('main', { name: 'Scenario step' });
async function continueTo(page, label) {
  await main(page).getByRole('button', { name: `Continue to ${label} →` }).click();
  await main(page).getByText(new RegExp(`Step \\d of 7`)).first().waitFor();
}

// ─── Phase 1: categories, knowledge, objections (UI) ───────────────────────
async function setupAnimal(page, a) {
  const label = a.key;
  const existing = (await catalogue()).categories.find((c) => c.name === a.category.name && !c.deletedAt);
  if (existing) {
    check(`[${label}] category already exists — reusing it`, true, existing.id);
  } else {
    await openRoute(page, '/scenarios/categories');
    await page.getByRole('button', { name: '+ New category' }).click();
    const dlg = page.getByRole('dialog', { name: 'New category' });
    await dlg.waitFor();
    await dlg.getByLabel('Name', { exact: true }).fill(a.category.name);
    await dlg.getByLabel('Description').fill(a.category.description);

    // Upload the knowledge document from inside the category editor.
    await dlg.getByRole('button', { name: 'Upload a document' }).click();
    const up = page.getByRole('dialog', { name: 'Upload a document' });
    await up.waitFor();
    await up.getByRole('button', { name: /^Paste text/ }).click();
    await up.getByLabel('Title').first().fill(a.document.title);
    await up.getByLabel('The text').fill(a.document.text);
    await shot(page, `${label}-upload-paste`);
    await up.getByRole('button', { name: 'Read it for me' }).click();
    await up.getByRole('button', { name: 'Add to library and attach' }).waitFor({ timeout: AI_TIMEOUT });
    const animals = up.getByRole('group', { name: 'Which animals it’s about' });
    const suggested = [];
    for (const chip of ['Adult dog', 'Puppy', 'Cat']) {
      if ((await animals.getByRole('button', { name: chip, exact: true }).getAttribute('aria-pressed')) === 'true') suggested.push(chip);
    }
    report.data[`${label}AiSuggestedAnimals`] = suggested;
    // Whatever the assistant read, file the document for its own animal only.
    const want = a.key === 'dog' ? { 'Adult dog': true, Puppy: true, Cat: false } : { 'Adult dog': false, Puppy: false, Cat: true };
    for (const [chip, on] of Object.entries(want)) await setPressed(animals.getByRole('button', { name: chip, exact: true }), on);
    await up.getByLabel('Title').first().fill(a.document.title);
    await shot(page, `${label}-upload-review`);
    await up.getByRole('button', { name: 'Add to library and attach' }).click();
    await up.waitFor({ state: 'hidden', timeout: AI_TIMEOUT });
    check(`[${label}] document uploaded from the category editor (assistant suggested: ${suggested.join(', ') || 'none'})`, true);

    await shot(page, `${label}-category-editor`);
    await dlg.getByRole('button', { name: 'Add category' }).click();
    await toast(page, 'add its objections next');
    check(`[${label}] category "${a.category.name}" created`, true);
  }

  const cat = (await catalogue()).categories.find((c) => c.name === a.category.name && !c.deletedAt);
  report.data[`${label}CategoryId`] = cat?.id ?? null;
  const docs = (await qaDocs()).filter((d) => d.title === a.document.title);
  const doc = docs[0];
  report.data[`${label}DocSlug`] = doc?.slug ?? null;
  check(`[${label}] the category holds its document`, Boolean(cat && doc && (cat.knowledgeSlugs ?? []).includes(doc.slug)), `${cat?.id} → ${(cat?.knowledgeSlugs ?? []).join(', ')}`);
  const species = doc?.metadata?.tags?.species ?? doc?.metadata?.species ?? doc?.tags?.species ?? null;
  report.data[`${label}DocSpecies`] = species;
  check(
    `[${label}] the document is filed for its animal only`,
    Array.isArray(species) && (a.key === 'dog' ? species.includes('dog') && !species.includes('cat') : species.length === 1 && species[0] === 'cat'),
    JSON.stringify(species),
  );
  check(`[${label}] the document is indexed (chunks > 0)`, Number(doc?.chunk_count ?? doc?.chunks ?? 0) > 0, `chunks: ${doc?.chunk_count ?? doc?.chunks}`);

  const objExisting = (await catalogue()).objections.find((o) => o.title === a.objection.name && !o.deletedAt);
  if (objExisting) {
    check(`[${label}] objection already exists — reusing it`, true, objExisting.id);
  } else {
    await openRoute(page, '/scenarios/categories');
    const card = page.getByRole('region', { name: a.category.name });
    await card.getByRole('button', { name: `Add an objection to ${a.category.name}` }).click();
    const dlg = page.getByRole('dialog', { name: 'New objection' });
    await dlg.waitFor();
    await dlg.getByLabel('Name', { exact: true }).fill(a.objection.name);
    await dlg.getByLabel('What an owner typically says', { exact: true }).fill(a.objection.example);
    const animals = dlg.getByRole('group', { name: 'Animals' });
    await setPressed(animals.getByRole('button', { name: 'Dogs', exact: true }), a.key === 'dog');
    await setPressed(animals.getByRole('button', { name: 'Cats', exact: true }), a.key === 'cat');
    await dlg.getByRole('button', { name: /^Coaching/ }).click();
    await dlg.getByLabel('What the owner is really worried about').fill(
      a.key === 'dog' ? 'Worries the chews are a gimmick that only adds calories.' : 'Worries that changing food will upset her cat, and doubts she is under-drinking.',
    );
    await shot(page, `${label}-objection-editor`);
    await dlg.getByRole('button', { name: 'Add objection' }).click();
    await toast(page, 'ready to use in scenarios');
    check(`[${label}] objection "${a.objection.name}" created (${a.key === 'dog' ? 'dogs' : 'cats'} only)`, true);
  }
  const obj = (await catalogue()).objections.find((o) => o.title === a.objection.name && !o.deletedAt);
  report.data[`${label}ObjectionId`] = obj?.id ?? null;
  check(`[${label}] objection filed under its category, for its animal`, Boolean(obj && obj.categoryId === cat?.id && obj.species?.length === 1 && obj.species[0] === a.key), `${obj?.id} in ${obj?.categoryId} for ${JSON.stringify(obj?.species)}`);

  await openRoute(page, '/scenarios/categories');
  const card = page.getByRole('region', { name: a.category.name });
  await card.scrollIntoViewIfNeeded();
  await card.screenshot({ path: join(OUT, `${String(++shotN).padStart(2, '0')}-${label}-category-card.png`) }).catch(() => {});
}

// ─── Phase 2: build, preview, brief, save, Test drive (UI) ─────────────────
async function buildAnimal(page, a) {
  const label = a.key;
  const other = a.key === 'dog' ? CAT : DOG;
  await openRoute(page, '/scenarios/studio');
  await page.getByRole('radio', { name: a.key === 'dog' ? 'Dog' : 'Cat', exact: true }).click();
  await page.getByRole('button', { name: 'Start step by step' }).click();
  await main(page).waitFor();

  // The pet
  await main(page).getByRole('group', { name: 'Species' }).getByRole('button', { name: new RegExp(`^${a.key === 'dog' ? 'Dog' : 'Cat'}`) }).click();
  await main(page).getByLabel('Breed name').fill(a.scenario.breed);
  await main(page).getByRole('group', { name: 'Life stage' }).getByRole('button', { name: /^Adult/ }).click();
  await main(page).getByLabel('Weight in kilograms').fill(a.scenario.weightKg);
  await shot(page, `${label}-step-pet`);
  await continueTo(page, 'the pushback');

  // The pushback — category first, then its objection
  const catGroup = main(page).getByRole('group', { name: 'Category' });
  await catGroup.getByRole('button', { name: new RegExp(`^${escapeRe(a.category.name)}`) }).click();
  await main(page).getByRole('group', { name: 'The kind of pushback' }).getByRole('button', { name: new RegExp(`^${escapeRe(a.objection.name)}`) }).click();
  await main(page).getByLabel('The situation').fill(
    a.key === 'dog'
      ? 'Bella is a 5-year-old Labrador with early tartar on her back teeth. The vet suggested a daily dental chew; the owner thinks chews are just treats.'
      : 'Luna is a 6-year-old indoor cat with slightly concentrated urine at her check-up. The vet suggested one wet meal a day; the owner says she drinks plenty.',
  );
  await shot(page, `${label}-step-pushback`);
  await continueTo(page, 'the owner');

  // The owner
  await main(page).getByRole('group', { name: 'ECHO driver' }).getByRole('button', { name: a.key === 'dog' ? /^Analyzer/ : /^Harmonizer/ }).click();
  await main(page).getByLabel('The first thing the owner says').fill(a.objection.example.replace(/^"|"$/g, ''));
  await continueTo(page, 'Knowledge');

  // Knowledge — the category's knowledge is the default, and the preview proves what the AI reads
  const inherit = main(page).getByRole('group', { name: 'Where should the AI look?' }).getByRole('button', { name: new RegExp(`^Use the ${escapeRe(a.category.name)} knowledge`) });
  check(`[${label}] Knowledge step defaults to "Use the ${a.category.name} knowledge"`, (await inherit.getAttribute('aria-pressed')) === 'true');
  await main(page).getByRole('button', { name: 'Preview what the AI will read' }).click();
  const passages = main(page).locator('ol li');
  await passages.first().waitFor({ timeout: AI_TIMEOUT });
  const previewText = await main(page).locator('ol').first().innerText();
  report.data[`${label}PreviewPassages`] = previewText.slice(0, 2000);
  check(`[${label}] Knowledge preview retrieves the ${a.marker} document`, previewText.includes(a.marker), firstLine(previewText));
  check(`[${label}] Knowledge preview never shows the other animal's ${other.marker} document`, !previewText.includes(other.marker));
  await shot(page, `${label}-step-knowledge-preview`, { fullPage: true });
  await continueTo(page, 'AI brief');

  // AI brief — the exact briefing the AI customer gets
  await main(page).getByRole('button', { name: 'See the full briefing' }).click();
  const briefing = page.getByTestId('briefing');
  await briefing.waitFor({ timeout: AI_TIMEOUT });
  await page.waitForFunction(() => (document.querySelector('[data-testid="briefing"]')?.textContent ?? '').length > 500, null, { timeout: AI_TIMEOUT });
  const brief = await briefing.innerText();
  writeFileSync(join(OUT, `briefing-${label}.txt`), brief);
  check(`[${label}] the AI customer's briefing contains the ${a.marker} passage`, brief.includes(a.marker));
  check(`[${label}] the briefing never contains ${other.marker}`, !brief.includes(other.marker));
  await shot(page, `${label}-step-brief`);

  // Save as a hidden draft (never published)
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await toast(page, 'Saved as a draft');
  check(`[${label}] scenario saved as a hidden draft`, true);
  await continueTo(page, 'Test drive');

  // Test drive — the admin text simulation
  const about = await main(page).getByRole('complementary', { name: 'About this test' }).innerText().catch(() => '');
  check(
    `[${label}] Test drive's "What you're testing" names the category's knowledge`,
    about.includes(`The ${a.category.name} knowledge`),
    firstLine(about.split('Knowledge')[1] ?? ''),
  );
  const closeAssistant = page.getByRole('button', { name: 'Close assistant' });
  if (await closeAssistant.isVisible().catch(() => false)) await closeAssistant.click();
  await main(page).getByRole('button', { name: 'Start the conversation' }).click();
  const log = main(page).getByRole('log', { name: 'Conversation with the owner' });
  const reply = main(page).getByLabel('Your reply');
  await waitOwnerIdle(page);
  await log.getByText('Owner').first().waitFor({ timeout: AI_TIMEOUT });
  let ended = false;
  for (const line of a.trainee) {
    if (await isEnded(page)) {
      ended = true;
      break;
    }
    await reply.fill(line);
    await main(page).getByRole('button', { name: 'Send', exact: true }).click();
    await waitOwnerIdle(page);
  }
  ended = ended || (await isEnded(page));
  if (!ended) await main(page).getByRole('button', { name: 'End & score' }).click();
  const score = main(page).getByRole('img', { name: /^Overall score/ });
  const retry = main(page).getByRole('button', { name: 'Retry scoring' });
  await Promise.race([score.waitFor({ timeout: AI_TIMEOUT }), retry.waitFor({ timeout: AI_TIMEOUT })]).catch(() => {});
  const transcript = await log.innerText().catch(() => '');
  const scoreName = (await score.getAttribute('aria-label').catch(() => null)) ?? (await score.textContent().catch(() => null));
  report.data[`${label}Score`] = scoreName;
  const ownerTurns = (transcript.match(/\bOwner\b/g) ?? []).length;
  check(`[${label}] Test drive: the AI owner answered every trainee turn`, ownerTurns >= a.trainee.length, `${ownerTurns} owner turns`);
  check(`[${label}] Test drive: the conversation was scored`, Boolean(scoreName), scoreName ?? 'no score (Retry scoring shown?)');
  report.data[`${label}OwnerCitedMarker`] = transcript.includes(a.marker) || /37%|2\.5/.test(transcript);
  const skills = await main(page).getByRole('meter').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || e.textContent || '').filter(Boolean)).catch(() => []);
  appendTranscript(a, transcript, scoreName, skills);
  await shot(page, `${label}-test-drive-scored`, { fullPage: true });

  // The real trainee UI, in the phone frame
  await main(page).getByRole('button', { name: 'Open in the trainee app' }).first().click().catch(async () => {
    await page.getByRole('button', { name: 'Open in the trainee app' }).first().click();
  });
  const frameDlg = page.getByRole('dialog', { name: 'Open in the trainee app' });
  await frameDlg.waitFor();
  await frameDlg.getByRole('button', { name: 'Start text chat' }).click({ timeout: 60_000 });
  const frame = page.frameLocator('iframe[title="Trainee app preview"]');
  let frameText = '';
  for (let i = 0; i < 40; i += 1) {
    await page.waitForTimeout(1500);
    frameText = await frame.locator('body').innerText().catch(() => '');
    if (frameText.length > 200 && /[a-z]{4}/.test(frameText) && !/Loading/.test(frameText.slice(0, 40))) break;
  }
  report.data[`${label}TraineeFrameText`] = frameText.slice(0, 1500);
  check(`[${label}] "Open in the trainee app" starts a text chat in the phone frame`, frameText.length > 100, firstLine(frameText));
  await shot(page, `${label}-trainee-app-frame`);
  await frameDlg.getByRole('button', { name: 'Close' }).first().click({ timeout: 5_000 }).catch(() => page.keyboard.press('Escape'));
}

async function waitOwnerIdle(page) {
  const typing = main(page).getByRole('status', { name: 'The owner is typing' });
  await typing.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});
  await typing.waitFor({ state: 'hidden', timeout: AI_TIMEOUT }).catch(() => {});
  await page.waitForTimeout(600);
}
async function isEnded(page) {
  const t = await main(page).getByRole('log', { name: 'Conversation with the owner' }).innerText().catch(() => '');
  return /owner ended the conversation|16-turn limit|You ended the conversation/.test(t);
}
function appendTranscript(a, transcript, scoreName, skills) {
  const file = join(OUT, 'transcripts.md');
  const head = existsSync(file) ? readFileSync(file, 'utf8') : '# QA E2E — Test drive transcripts\n';
  writeFileSync(
    file,
    `${head}\n## ${a.scenario.title} (${a.key})\n\nCategory: ${a.category.name} · Objection: ${a.objection.name}\n\n` +
      '```text\n' + transcript.trim() + '\n```\n\n' +
      `**Score:** ${scoreName ?? '—'}\n\n${skills.length ? skills.map((s) => `- ${s}`).join('\n') + '\n' : ''}`,
  );
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const firstLine = (s) => String(s || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 2).join(' · ').slice(0, 160);

// ─── Phase 3: cross-contamination probe (API + UI) ─────────────────────────
async function probe(page) {
  const { categories, objections } = await catalogue();
  const dogCat = categories.find((c) => c.name === DOG.category.name && !c.deletedAt);
  const dogObj = objections.find((o) => o.title === DOG.objection.name && !o.deletedAt);
  const catObj = objections.find((o) => o.title === CAT.objection.name && !o.deletedAt);
  const docs = await qaDocs();
  const dogDoc = docs.find((d) => d.title === DOG.document.title);
  const catDoc = docs.find((d) => d.title === CAT.document.title);
  if (!dogCat || !dogObj || !catObj || !dogDoc || !catDoc) {
    check('probe prerequisites (categories, objections, documents)', false, 'run the setup phase first');
    return;
  }
  const draft = (a, obj) => ({
    species: a.key,
    breed: a.scenario.breed,
    life_stage: a.scenario.lifeStage,
    weight_kg: Number(a.scenario.weightKg),
    pushback_id: obj.id,
    suggested_driver: a.key === 'dog' ? 'Analyzer' : 'Harmonizer',
    persona_override: 'Skeptical',
    difficulty_override: 2,
  });
  const passagesOf = (res) => (res.knowledge?.passages ?? []).map((p) => `${p.title ?? ''} ${p.snippet ?? ''}`).join('\n');

  // Deliberately attach the CAT document to the DOG category too.
  const before = dogCat.knowledgeSlugs ?? [];
  const mixed = await api('admin-objections', {
    method: 'POST',
    body: { op: 'upsert-category', baseUpdatedAt: dogCat.updatedAt ?? null, category: { ...dogCat, knowledgeSlugs: [...new Set([...before, catDoc.slug])] } },
  });
  check('probe: cat document attached to the dog category (shared container)', (mixed.category?.knowledgeSlugs ?? []).includes(catDoc.slug));
  try {
    const dogRes = await api('admin-scenario-inspect', { method: 'POST', body: { draft: draft(DOG, dogObj) } });
    const text = passagesOf(dogRes) + '\n' + (dogRes.prompt ?? '');
    report.data.probeDogFilter = dogRes.knowledge?.appliedFilter ?? null;
    check('probe: the dog scenario still reads BRIGHTBITE', text.includes(DOG.marker), JSON.stringify(dogRes.knowledge?.appliedFilter));
    check('probe: the dog scenario NEVER reads the cat-only RIVULET document, even with it attached', !text.includes(CAT.marker));

    const catRes = await api('admin-scenario-inspect', { method: 'POST', body: { draft: draft(CAT, catObj) } });
    const catText = passagesOf(catRes) + '\n' + (catRes.prompt ?? '');
    report.data.probeCatFilter = catRes.knowledge?.appliedFilter ?? null;
    check('probe: the cat scenario reads RIVULET', catText.includes(CAT.marker), JSON.stringify(catRes.knowledge?.appliedFilter));
    check('probe: the cat scenario NEVER reads the dog-only BRIGHTBITE document', !catText.includes(DOG.marker));

    // The category editor warns about the mismatched document.
    await openRoute(page, '/scenarios/categories');
    await page.getByRole('region', { name: DOG.category.name }).getByRole('button', { name: `Edit the category “${DOG.category.name}”` }).click();
    const dlg = page.getByRole('dialog', { name: 'Edit category' });
    await dlg.waitFor();
    const warn = dlg.getByText('Not every scenario here can read these');
    const shown = await warn.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
    check('probe: the category editor warns that the cat document can’t reach dog scenarios', shown);
    await shot(page, 'probe-category-warning');
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    const discard = page.getByRole('button', { name: 'Discard changes' });
    if (await discard.isVisible().catch(() => false)) await discard.click();
  } finally {
    const fresh = (await catalogue()).categories.find((c) => c.id === dogCat.id);
    await api('admin-objections', {
      method: 'POST',
      body: { op: 'upsert-category', baseUpdatedAt: fresh?.updatedAt ?? null, category: { ...fresh, knowledgeSlugs: before } },
    }).catch((e) => check('probe: restore the dog category’s documents', false, e.message));
  }
}

// ─── Run ───────────────────────────────────────────────────────────────────
await signInApi();
const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-proxy-server'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
let failedHard = false;
try {
  await signIn(page);
  check('signed in to the admin as the QA Scenario Author', true, EMAIL);
  // PBT_E2E_ONLY=dog|cat re-runs one animal (e.g. after fixing a failure).
  const only = process.env.PBT_E2E_ONLY;
  const animals = ANIMALS.filter((a) => !only || a.key === only);
  for (const a of animals) {
    if (PHASE === 'all' || PHASE === 'setup') await setupAnimal(page, a);
  }
  for (const a of animals) {
    if (PHASE === 'all' || PHASE === 'build') await buildAnimal(page, a);
  }
  if (PHASE === 'all' || PHASE === 'probe') await probe(page);
} catch (err) {
  failedHard = true;
  const file = await shot(page, 'FAILURE', { fullPage: true });
  check('run completed without an unexpected error', false, `${err.message.split('\n')[0]} (see ${file})`);
} finally {
  check('no uncaught errors in the admin page', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  save();
  await browser.close();
}
const failed = report.checks.filter((c) => !c.ok);
console.log(`\n${report.checks.length - failed.length}/${report.checks.length} checks passed${failedHard ? ' (stopped early)' : ''}. Report: ${reportPath}`);
process.exit(failed.length ? 1 : 0);
