/**
 * "Cats are switched off for trainees" — the Studio can publish a cat
 * scenario while the trainee app's cat switch (`scenario.cat.enabled`, Admin
 * → Flags, default OFF) hides every cat scenario. Saying so is the whole
 * point: publishing still works (the scenario goes live the day cats are
 * switched on), so this never blocks.
 *
 * `state` comes from `admin-scenario-overrides?op=capabilities` (`cats`),
 * resolved server-side, so a Scenario Author needs no `flags.read`. Unknown
 * (undefined) or 'on' renders nothing. The Flags link is offered only to an
 * admin who can change the switch (`flags.write`); anyone else is told who to
 * ask.
 */
import { InlineAlert } from '../primitives/form';
import { useCan } from '../primitives/access';
import type { CatSwitchState } from './api';

/** The switch's name on the Flags screen (its seeded description starts with it). */
export const CAT_SWITCH_LABEL = 'Cat scenarios for trainees';

export type CatNoticeContext =
  /** The gallery shows cat scenarios. */
  | { kind: 'gallery' }
  /** The gallery shows dogs, but this many cat scenarios are live. */
  | { kind: 'liveCats'; count: number }
  /** Publishing (or updating) one cat scenario. */
  | { kind: 'publish' };

export function catNoticeTitle(state: CatSwitchState, context: CatNoticeContext): string {
  const who = state === 'some' ? 'Cats are switched on for only some trainees' : 'Cats are switched off for trainees';
  const others = state === 'some' ? 'the others' : 'them';
  switch (context.kind) {
    case 'gallery':
      return `${who}, so these scenarios aren’t visible to ${others} yet.`;
    case 'liveCats':
      return `${context.count === 1 ? '1 live cat scenario isn’t' : `${context.count} live cat scenarios aren’t`} visible to ${
        state === 'some' ? 'everyone' : 'anyone'
      } yet: ${who.charAt(0).toLowerCase()}${who.slice(1)}.`;
    case 'publish':
      return `${who}, so this scenario won’t be visible to ${others} yet.`;
  }
}

export function CatSwitchNotice({
  state,
  context,
}: {
  state: CatSwitchState | undefined;
  context: CatNoticeContext;
}) {
  const can = useCan();
  if (state === undefined || state === 'on') return null;
  const canEditFlags = can('flags.write');
  return (
    <InlineAlert tone="warn" title={catNoticeTitle(state, context)}>
      {state === 'some' ? (
        <>A rule on the switch limits it to part of the team. Publishing still works: it reaches everyone once the switch is on for all.</>
      ) : (
        <>Publishing still works: it reaches trainees once the switch is on.</>
      )}{' '}
      {canEditFlags ? (
        <a
          href="#/flags"
          style={{ color: 'inherit', fontWeight: 750, textDecoration: 'underline', textUnderlineOffset: 2 }}
        >
          Turn on “{CAT_SWITCH_LABEL}” in Flags
        </a>
      ) : (
        <span>Ask an admin who manages Flags to turn it on.</span>
      )}
    </InlineAlert>
  );
}
