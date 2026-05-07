/**
 * PBT breed catalog.
 *
 * Curated internal list of common dog breeds — not exhaustive, but covers
 * the breeds that overwhelmingly show up in companion-animal practice. Kept
 * offline (no API) so the analyzer + scenario builder work without network.
 *
 * Each entry has:
 *   - `name`     canonical display label (used everywhere)
 *   - `aliases`  alternate spellings / common abbreviations to make search
 *                forgiving ("GSD" → German Shepherd, "lab" → Labrador, etc.)
 *   - `group`    AKC-style group, used for grouped suggestion display
 *   - `sizeKg`   typical adult weight range, [low, high] kg — feeds the
 *                analyzer's plausibility check + default weight pre-fill
 *
 * Free-text "Other" remains supported for unlisted breeds.
 */

export interface BreedEntry {
  /** Canonical display label. */
  name: string;
  /** Alternate spellings + common abbreviations, lowercase. */
  aliases: readonly string[];
  /** AKC-ish group, used for grouped autocomplete. */
  group:
    | 'Sporting'
    | 'Hound'
    | 'Working'
    | 'Terrier'
    | 'Toy'
    | 'Non-sporting'
    | 'Herding'
    | 'Mixed';
  /** Typical adult weight range in kilograms. */
  sizeKg: readonly [number, number];
}

export const BREED_CATALOG: readonly BreedEntry[] = [
  // ─── Sporting ───
  { name: 'Labrador Retriever', aliases: ['lab', 'labrador', 'yellow lab', 'black lab', 'chocolate lab'], group: 'Sporting', sizeKg: [25, 36] },
  { name: 'Golden Retriever', aliases: ['golden', 'goldie'], group: 'Sporting', sizeKg: [25, 34] },
  { name: 'Cocker Spaniel', aliases: ['cocker', 'american cocker', 'english cocker'], group: 'Sporting', sizeKg: [9, 14] },
  { name: 'English Springer Spaniel', aliases: ['springer', 'springer spaniel'], group: 'Sporting', sizeKg: [18, 23] },
  { name: 'Brittany', aliases: ['brittany spaniel'], group: 'Sporting', sizeKg: [13, 18] },
  { name: 'Vizsla', aliases: ['hungarian vizsla'], group: 'Sporting', sizeKg: [20, 27] },
  { name: 'Weimaraner', aliases: ['weim'], group: 'Sporting', sizeKg: [25, 40] },
  { name: 'German Shorthaired Pointer', aliases: ['gsp', 'pointer', 'german pointer'], group: 'Sporting', sizeKg: [20, 32] },
  { name: 'Irish Setter', aliases: ['irish setter', 'red setter'], group: 'Sporting', sizeKg: [24, 32] },

  // ─── Hound ───
  { name: 'Beagle', aliases: [], group: 'Hound', sizeKg: [9, 14] },
  { name: 'Dachshund', aliases: ['doxie', 'wiener dog', 'sausage dog'], group: 'Hound', sizeKg: [4, 14] },
  { name: 'Basset Hound', aliases: ['basset'], group: 'Hound', sizeKg: [20, 29] },
  { name: 'Bloodhound', aliases: [], group: 'Hound', sizeKg: [36, 50] },
  { name: 'Greyhound', aliases: [], group: 'Hound', sizeKg: [27, 32] },
  { name: 'Whippet', aliases: [], group: 'Hound', sizeKg: [11, 19] },
  { name: 'Rhodesian Ridgeback', aliases: ['ridgeback'], group: 'Hound', sizeKg: [29, 41] },

  // ─── Working ───
  { name: 'Bernese Mountain Dog', aliases: ['berner', 'bernese', 'bmd'], group: 'Working', sizeKg: [36, 52] },
  { name: 'Boxer', aliases: [], group: 'Working', sizeKg: [25, 32] },
  { name: 'Doberman Pinscher', aliases: ['dobie', 'dobermann', 'doberman'], group: 'Working', sizeKg: [27, 45] },
  { name: 'Great Dane', aliases: ['dane'], group: 'Working', sizeKg: [45, 90] },
  { name: 'Mastiff', aliases: ['english mastiff'], group: 'Working', sizeKg: [54, 100] },
  { name: 'Rottweiler', aliases: ['rottie', 'rott'], group: 'Working', sizeKg: [35, 60] },
  { name: 'Saint Bernard', aliases: ['st bernard', 'st. bernard'], group: 'Working', sizeKg: [54, 82] },
  { name: 'Siberian Husky', aliases: ['husky'], group: 'Working', sizeKg: [16, 27] },
  { name: 'Alaskan Malamute', aliases: ['malamute', 'mal'], group: 'Working', sizeKg: [34, 45] },
  { name: 'Cane Corso', aliases: ['corso'], group: 'Working', sizeKg: [40, 50] },

  // ─── Terrier ───
  { name: 'Bull Terrier', aliases: [], group: 'Terrier', sizeKg: [22, 32] },
  { name: 'Jack Russell Terrier', aliases: ['jrt', 'jack russell'], group: 'Terrier', sizeKg: [6, 8] },
  { name: 'Miniature Schnauzer', aliases: ['mini schnauzer', 'mini schnauz', 'schnauzer'], group: 'Terrier', sizeKg: [5, 9] },
  { name: 'Standard Schnauzer', aliases: ['std schnauzer'], group: 'Terrier', sizeKg: [14, 23] },
  { name: 'Scottish Terrier', aliases: ['scottie'], group: 'Terrier', sizeKg: [8, 10] },
  { name: 'West Highland White Terrier', aliases: ['westie'], group: 'Terrier', sizeKg: [6, 10] },
  { name: 'Yorkshire Terrier', aliases: ['yorkie'], group: 'Terrier', sizeKg: [2, 3.5] },
  { name: 'Staffordshire Bull Terrier', aliases: ['staffy', 'staff'], group: 'Terrier', sizeKg: [11, 17] },
  { name: 'American Pit Bull Terrier', aliases: ['pit bull', 'pitbull', 'pit'], group: 'Terrier', sizeKg: [16, 27] },
  { name: 'Airedale Terrier', aliases: ['airedale'], group: 'Terrier', sizeKg: [21, 30] },

  // ─── Toy ───
  { name: 'Cavalier King Charles Spaniel', aliases: ['cavalier', 'ckcs', 'king charles'], group: 'Toy', sizeKg: [5, 8] },
  { name: 'Chihuahua', aliases: ['chi', 'chihua'], group: 'Toy', sizeKg: [1.5, 3] },
  { name: 'Maltese', aliases: [], group: 'Toy', sizeKg: [2, 4] },
  { name: 'Papillon', aliases: ['pap'], group: 'Toy', sizeKg: [3, 5] },
  { name: 'Pekingese', aliases: ['peke'], group: 'Toy', sizeKg: [3, 6] },
  { name: 'Pomeranian', aliases: ['pom'], group: 'Toy', sizeKg: [2, 3.5] },
  { name: 'Pug', aliases: [], group: 'Toy', sizeKg: [6, 8] },
  { name: 'Shih Tzu', aliases: ['shihtzu'], group: 'Toy', sizeKg: [4, 7] },
  { name: 'Toy Poodle', aliases: [], group: 'Toy', sizeKg: [2, 4] },
  { name: 'Italian Greyhound', aliases: ['iggy'], group: 'Toy', sizeKg: [3, 5] },

  // ─── Non-sporting ───
  { name: 'Bichon Frise', aliases: ['bichon'], group: 'Non-sporting', sizeKg: [5, 8] },
  { name: 'Boston Terrier', aliases: ['boston'], group: 'Non-sporting', sizeKg: [4.5, 11] },
  { name: 'Bulldog', aliases: ['english bulldog', 'british bulldog'], group: 'Non-sporting', sizeKg: [18, 25] },
  { name: 'French Bulldog', aliases: ['frenchie', 'french bully'], group: 'Non-sporting', sizeKg: [8, 13] },
  { name: 'Chow Chow', aliases: ['chow'], group: 'Non-sporting', sizeKg: [20, 32] },
  { name: 'Dalmatian', aliases: ['dalmation'], group: 'Non-sporting', sizeKg: [20, 32] },
  { name: 'Standard Poodle', aliases: ['poodle', 'std poodle'], group: 'Non-sporting', sizeKg: [20, 32] },
  { name: 'Miniature Poodle', aliases: ['mini poodle'], group: 'Non-sporting', sizeKg: [5, 9] },
  { name: 'Shiba Inu', aliases: ['shiba'], group: 'Non-sporting', sizeKg: [8, 11] },

  // ─── Herding ───
  { name: 'Australian Shepherd', aliases: ['aussie', 'aus shepherd'], group: 'Herding', sizeKg: [16, 32] },
  { name: 'Australian Cattle Dog', aliases: ['heeler', 'blue heeler', 'red heeler', 'acd'], group: 'Herding', sizeKg: [15, 22] },
  { name: 'Border Collie', aliases: ['bc'], group: 'Herding', sizeKg: [14, 20] },
  { name: 'Collie', aliases: ['rough collie', 'lassie'], group: 'Herding', sizeKg: [22, 34] },
  { name: 'German Shepherd', aliases: ['gsd', 'german shepard', 'alsatian'], group: 'Herding', sizeKg: [22, 40] },
  { name: 'Pembroke Welsh Corgi', aliases: ['corgi', 'pembroke', 'pembroke corgi'], group: 'Herding', sizeKg: [10, 14] },
  { name: 'Cardigan Welsh Corgi', aliases: ['cardigan corgi', 'cardi'], group: 'Herding', sizeKg: [11, 17] },
  { name: 'Shetland Sheepdog', aliases: ['sheltie'], group: 'Herding', sizeKg: [6, 12] },
  { name: 'Belgian Malinois', aliases: ['mal', 'malinois'], group: 'Herding', sizeKg: [25, 30] },
  { name: 'Old English Sheepdog', aliases: ['oes', 'sheepdog'], group: 'Herding', sizeKg: [27, 45] },

  // ─── Mixed / catch-alls ───
  { name: 'Mixed breed', aliases: ['mix', 'mutt', 'mongrel', 'crossbreed'], group: 'Mixed', sizeKg: [5, 35] },
  { name: 'Goldendoodle', aliases: ['groodle', 'golden doodle'], group: 'Mixed', sizeKg: [13, 32] },
  { name: 'Labradoodle', aliases: ['lab doodle'], group: 'Mixed', sizeKg: [13, 30] },
  { name: 'Cockapoo', aliases: ['cocker poo'], group: 'Mixed', sizeKg: [5, 11] },
  { name: 'Cavapoo', aliases: ['cavoodle'], group: 'Mixed', sizeKg: [4, 11] },
  { name: 'Puggle', aliases: [], group: 'Mixed', sizeKg: [7, 13] },
  { name: 'Maltipoo', aliases: ['malti poo'], group: 'Mixed', sizeKg: [2, 6] },
  { name: 'Yorkipoo', aliases: ['yorki poo'], group: 'Mixed', sizeKg: [2, 6] },
];

/** All canonical breed names — replaces the old hardcoded BREEDS list. */
export const BREED_NAMES: readonly string[] = BREED_CATALOG.map((b) => b.name);

/** Quick-pick chips shown on first focus / empty input. */
export const POPULAR_BREEDS: readonly string[] = [
  'Labrador Retriever',
  'Golden Retriever',
  'French Bulldog',
  'German Shepherd',
  'Dachshund',
  'Beagle',
  'Mixed breed',
];

/**
 * Fuzzy search — match canonical name OR any alias. Substring match is
 * sufficient for ~75 entries; ordering rules:
 *   1. exact name match
 *   2. canonical name starts with query
 *   3. alias starts with query
 *   4. canonical name contains query
 *   5. alias contains query
 *
 * Returns at most `limit` results.
 */
export function searchBreeds(query: string, limit = 8): BreedEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored: Array<{ entry: BreedEntry; score: number }> = [];
  for (const entry of BREED_CATALOG) {
    const name = entry.name.toLowerCase();
    let score = -1;
    if (name === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else {
      for (const alias of entry.aliases) {
        if (alias === q) {
          score = 0;
          break;
        }
        if (alias.startsWith(q)) {
          score = Math.min(score === -1 ? 2 : score, 2);
        }
      }
      if (score === -1) {
        if (name.includes(q)) score = 3;
        else if (entry.aliases.some((a) => a.includes(q))) score = 4;
      }
    }
    if (score >= 0) scored.push({ entry, score });
  }
  scored.sort((a, b) => a.score - b.score || a.entry.name.localeCompare(b.entry.name));
  return scored.slice(0, limit).map((s) => s.entry);
}

/** Resolve a free-text input to a canonical breed entry, if one matches. */
export function resolveBreed(text: string): BreedEntry | null {
  const q = text.trim().toLowerCase();
  if (!q) return null;
  for (const entry of BREED_CATALOG) {
    if (entry.name.toLowerCase() === q) return entry;
    if (entry.aliases.some((a) => a === q)) return entry;
  }
  return null;
}

/** Plausibility check — a 200kg "labrador" is almost certainly an input error. */
export function isWeightPlausibleFor(breedName: string, weightKg: number): boolean {
  const entry = resolveBreed(breedName);
  if (!entry) return true; // unknown breed, can't check
  const [low, high] = entry.sizeKg;
  // Allow 30% margin either side — life-stage variance, leaner/heavier individuals
  return weightKg >= low * 0.7 && weightKg <= high * 1.3;
}
