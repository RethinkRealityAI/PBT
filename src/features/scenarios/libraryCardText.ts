/**
 * What a Training library card says — the text rules, pure, so the trainee
 * library and the admin Scenario Studio's card preview read ONE definition.
 *
 *   title     = the card title the admin wrote, else the objection's name
 *   objection = the objection's name, shown above the title ONLY when a
 *               custom title hides which objection this is
 *   pet       = "<breed> · <life stage>"
 *
 * The persona line ("<persona> owner") and the difficulty word come from the
 * i18n catalogue / data overlays at the call site — they are localised data,
 * not rules.
 */

export interface LibraryCardTitles {
  title: string;
  /** Null when the title already IS the objection. */
  objection: string | null;
}

export function libraryCardTitles(
  cardTitleOverride: string | null | undefined,
  objectionTitle: string,
): LibraryCardTitles {
  const title = cardTitleOverride?.trim() || objectionTitle;
  return { title, objection: title !== objectionTitle ? objectionTitle : null };
}

/** "Labrador Retriever · Adult (3-7)" — the pet line under the title. */
export function libraryCardPetLine(breed: string, lifeStage: string): string {
  return `${breed} · ${lifeStage}`;
}
