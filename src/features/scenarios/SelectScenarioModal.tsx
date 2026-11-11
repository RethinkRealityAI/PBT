/**
 * "Select scenario" — Home's way into training (2026-11-07). Two big
 * choices: the Training library (ready-made scenarios the training team
 * published) or the trainee's own builder.
 *
 * A bottom sheet on phones, a centred dialog from `sm`. The full dialog
 * contract (`useDialog`): focus moves in, Tab stays inside, Escape and the
 * scrim close it, focus returns to the button that opened it. Motion is a
 * short slide-up, opacity only under reduced motion. Themed through
 * `<Glass>` plus the same light/dark fills as the report dialog — never a
 * forced light pane under `--pbt-text`.
 *
 * The dialog only reports the choice; the caller navigates (and logs it).
 */
import { useEffect, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronRight, LibraryBig, PencilLine } from 'lucide-react';
import { Glass } from '../../design-system/Glass';
import { Icon } from '../../design-system/Icon';
import { useTheme } from '../../app/providers/ThemeProvider';
import { useT } from '../../i18n/useT';
import { useDialog } from '../../lib/useDialog';

export type SelectScenarioChoice = 'library' | 'build';

/** Themed sheet fill — see the dark-mode note in CLAUDE.md ("Modals & overlays"). */
const SHEET_FILL_DARK = 'linear-gradient(165deg, rgba(22,20,28,0.92) 0%, rgba(12,11,17,0.86) 100%)';
const SHEET_FILL_LIGHT = 'linear-gradient(165deg, rgba(255,255,255,0.86) 0%, rgba(255,255,255,0.66) 100%)';

export interface SelectScenarioModalProps {
  open: boolean;
  onClose: () => void;
  /** Ready-made scenarios available to this trainee (every animal they can see). */
  libraryCount: number;
  /** False when the builder is switched off (Admin → Flags): Library only. */
  canBuild: boolean;
  onChoose: (choice: SelectScenarioChoice) => void;
}

export function SelectScenarioModal(props: SelectScenarioModalProps) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>{props.open && <Sheet key="select-scenario" {...props} />}</AnimatePresence>,
    document.body,
  );
}

function Sheet({ onClose, libraryCount, canBuild, onChoose }: SelectScenarioModalProps) {
  const t = useT();
  const titleId = useId();
  const reduce = useReducedMotion();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const dialogRef = useDialog<HTMLDivElement>(onClose);

  // The page behind a modal must not scroll.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const countLabel =
    libraryCount === 0
      ? t('select.library.none')
      : libraryCount === 1
        ? t('select.library.countOne')
        : t('select.library.count', { count: libraryCount });

  return (
    <motion.div
      className="flex items-end justify-center sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0.01 : 0.2 }}
      onClick={onClose}
      data-testid="select-scenario-scrim"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: dark ? 'rgba(4, 4, 8, 0.55)' : 'rgba(20, 12, 14, 0.28)',
        backdropFilter: 'blur(8px) saturate(160%)',
        WebkitBackdropFilter: 'blur(8px) saturate(160%)',
      }}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full sm:max-w-[500px]"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 48 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 32 }}
        transition={{ duration: reduce ? 0.01 : 0.3, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{ outline: 'none' }}
      >
        <Glass
          radius={30}
          padding={0}
          glow="var(--pbt-driver-primary)"
          backdropSaturatePct={180}
          className="pbt-select-sheet"
          style={{ background: dark ? SHEET_FILL_DARK : SHEET_FILL_LIGHT }}
        >
          <div
            style={{
              padding: '10px 20px max(env(safe-area-inset-bottom), 22px)',
            }}
          >
            {/* Grab handle — a bottom sheet's visual cue, phones only. */}
            <div
              aria-hidden
              className="sm:hidden"
              style={{
                width: 40,
                height: 5,
                borderRadius: 9999,
                margin: '0 auto 12px',
                background: 'color-mix(in oklab, var(--pbt-text) 22%, transparent)',
              }}
            />
            <div className="flex items-start justify-between gap-3" style={{ marginTop: 8, marginBottom: 18 }}>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: 'var(--pbt-font-mono)',
                    fontSize: 10.5,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'var(--pbt-text-muted)',
                    marginBottom: 6,
                  }}
                >
                  {t('select.eyebrow')}
                </div>
                <h2
                  id={titleId}
                  style={{
                    margin: 0,
                    fontSize: 24,
                    fontWeight: 400,
                    letterSpacing: '-0.025em',
                    lineHeight: 1.15,
                    color: 'var(--pbt-text)',
                  }}
                >
                  {t('select.title')}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('select.close')}
                style={{
                  flexShrink: 0,
                  width: 40,
                  height: 40,
                  marginTop: -2,
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--pbt-text-muted)',
                  background: 'color-mix(in oklab, var(--pbt-text) 6%, transparent)',
                  border: '1px solid color-mix(in oklab, var(--pbt-text) 12%, transparent)',
                }}
              >
                <Icon.close aria-hidden />
              </button>
            </div>

            <div className="flex flex-col" style={{ gap: 12 }}>
              <ChoiceCard
                icon={<LibraryBig size={22} strokeWidth={1.9} aria-hidden />}
                title={t('select.library.title')}
                body={t('select.library.body')}
                meta={countLabel}
                onClick={() => onChoose('library')}
              />
              {canBuild && (
                <ChoiceCard
                  icon={<PencilLine size={22} strokeWidth={1.9} aria-hidden />}
                  title={t('select.build.title')}
                  body={t('select.build.body')}
                  onClick={() => onChoose('build')}
                />
              )}
            </div>
          </div>
        </Glass>
      </motion.div>
    </motion.div>
  );
}

function ChoiceCard({
  icon,
  title,
  body,
  meta,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  meta?: string;
  onClick: () => void;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.985 }}
      className="pbt-select-choice"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        width: '100%',
        minHeight: 96,
        padding: '16px 14px 16px 16px',
        textAlign: 'left',
        font: 'inherit',
        color: 'var(--pbt-text)',
        cursor: 'pointer',
        borderRadius: 22,
        background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.55)',
        border: dark
          ? '1px solid rgba(255,255,255,0.12)'
          : '1px solid color-mix(in oklab, var(--pbt-driver-primary) 14%, rgba(255,255,255,0.7))',
        boxShadow: dark
          ? 'inset 0 1px 0 rgba(255,255,255,0.06)'
          : 'inset 0 1px 0 rgba(255,255,255,0.9), 0 8px 22px -16px rgba(40,20,20,0.25)',
      }}
    >
      <span
        aria-hidden
        style={{
          flexShrink: 0,
          width: 52,
          height: 52,
          borderRadius: 16,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          background: 'linear-gradient(160deg, var(--pbt-driver-primary), var(--pbt-driver-accent))',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.35), 0 8px 18px -10px color-mix(in oklab, var(--pbt-driver-primary) 70%, transparent)',
        }}
      >
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 650, fontSize: 16.5, letterSpacing: '-0.01em', lineHeight: 1.25 }}>
          {title}
        </span>
        <span
          style={{
            display: 'block',
            marginTop: 3,
            fontSize: 13,
            lineHeight: 1.4,
            color: 'var(--pbt-text-muted)',
          }}
        >
          {body}
        </span>
        {meta && (
          <span
            style={{
              display: 'inline-block',
              marginTop: 8,
              fontFamily: 'var(--pbt-font-mono)',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--pbt-text-muted)',
            }}
          >
            {meta}
          </span>
        )}
      </span>
      <ChevronRight aria-hidden size={20} style={{ flexShrink: 0, color: 'var(--pbt-text-muted)' }} />
    </motion.button>
  );
}
