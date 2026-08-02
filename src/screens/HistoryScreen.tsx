import { useState } from 'react';
import { Glass } from '../design-system/Glass';
import { Chip } from '../design-system/Chip';
import { ScoreChip } from '../design-system/ScoreChip';
import { Icon } from '../design-system/Icon';
import { PillButton } from '../design-system/PillButton';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { PUSHBACK_CATEGORIES } from '../data/scenarios';
import { readStorage } from '../lib/storage';
import { SESSIONS_KEY } from '../lib/sessionsKey';
import { isScoreUnavailable } from '../services/types';
import { useNavigation } from '../app/providers/NavigationProvider';
import { setSelectedSessionId } from '../lib/selectedSession';
import { useLanguage } from '../app/providers/LanguageProvider';
import { formatDateTime, formatPercent } from '../i18n/format';

export function HistoryScreen() {
  const { go } = useNavigation();
  const { t, locale } = useLanguage();
  const [filter, setFilter] = useState<string>('all');
  const sessions = readStorage(SESSIONS_KEY);

  const openSession = (id: string) => {
    setSelectedSessionId(id);
    go('historyDetail');
  };
  const filtered =
    filter === 'all'
      ? sessions
      : sessions.filter((s) => s.pushbackId === filter);

  return (
    <>
      <TopBar showBack title={t('history.title')} />
      <Page withTabBar>
        <h1
          style={{
            fontSize: 32,
            fontWeight: 400,
            letterSpacing: '-0.025em',
            margin: '0 0 6px',
            lineHeight: 1.05,
            color: 'var(--pbt-text)',
            whiteSpace: 'pre-line',
          }}
        >
          {t('history.headline')}
        </h1>
        <div
          style={{
            fontFamily: 'var(--pbt-font-mono)',
            fontSize: 11,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: 'var(--pbt-text-muted)',
            marginBottom: 18,
          }}
        >
          {sessions.length === 1
            ? t('history.sessionCountOne')
            : t('history.sessionCount', { count: sessions.length })}
          {(() => {
            // Average only over genuinely scored sessions — a scoring
            // outage must not read as a string of zeros.
            const scored = sessions.filter((x) => !isScoreUnavailable(x.scoreReport));
            if (scored.length === 0) return null;
            const avg = Math.round(
              scored.reduce((s, x) => s + x.scoreReport.overall, 0) / scored.length,
            );
            return (
              <>
                {' · '}
                {t('history.avgScore', { pct: formatPercent(avg, locale) })}
              </>
            );
          })()}
        </div>

        <div className="pbt-scroll flex gap-2 overflow-x-auto pb-1 mb-4">
          <Chip
            active={filter === 'all'}
            onClick={() => setFilter('all')}
          >
            {t('history.filter.all')}
          </Chip>
          {PUSHBACK_CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              active={filter === c.id}
              onClick={() => setFilter(c.id)}
            >
              {c.title.split(' ').slice(0, 2).join(' ')}
            </Chip>
          ))}
        </div>

        {filtered.length === 0 ? (
          <Glass radius={22} padding={22}>
            <p
              style={{
                margin: '0 0 16px',
                color: 'var(--pbt-text-muted)',
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              {sessions.length === 0
                ? t('history.empty.none')
                : t('history.empty.filtered')}
            </p>
            {sessions.length === 0 && (
              <PillButton fullWidth icon={<Icon.flame />} onClick={() => go('home')}>
                {t('history.empty.cta')}
              </PillButton>
            )}
          </Glass>
        ) : (
          filtered.map((s) => (
            <div
              key={s.id}
              style={{ marginBottom: 8 }}
              onClick={() => openSession(s.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openSession(s.id);
                }
              }}
              className="cursor-pointer"
            >
              <Glass radius={18} padding={14}>
                <div className="flex items-center gap-3">
                  <Icon.chat />
                  <div className="flex-1 min-w-0">
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {s.scenarioSummary}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--pbt-text-muted)',
                        fontFamily: 'var(--pbt-font-mono)',
                      }}
                    >
                      {formatDateTime(s.createdAt, locale)} ·{' '}
                      {s.mode === 'voice'
                        ? t('history.mode.voice')
                        : t('history.mode.text')}
                      {s.transcript?.length
                        ? ` · ${t('history.row.turns', { count: s.transcript.length })}`
                        : ''}
                    </div>
                  </div>
                  {isScoreUnavailable(s.scoreReport) ? (
                    <span
                      aria-label={t('history.row.notScoredAria')}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px dashed color-mix(in oklab, var(--pbt-text-muted) 55%, transparent)',
                        color: 'var(--pbt-text-muted)',
                        fontFamily: 'var(--pbt-font-mono)',
                        fontSize: 14,
                        flexShrink: 0,
                      }}
                    >
                      —
                    </span>
                  ) : (
                    <ScoreChip score={s.scoreReport.overall} />
                  )}
                  <span style={{ color: 'var(--pbt-text-muted)', fontSize: 18 }}>›</span>
                </div>
              </Glass>
            </div>
          ))
        )}
      </Page>
    </>
  );
}
