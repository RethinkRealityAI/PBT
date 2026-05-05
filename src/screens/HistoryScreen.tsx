import { useState } from 'react';
import { Glass } from '../design-system/Glass';
import { Chip } from '../design-system/Chip';
import { ScoreChip } from '../design-system/ScoreChip';
import { Icon } from '../design-system/Icon';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { PUSHBACK_CATEGORIES } from '../data/scenarios';
import { readStorage, type StorageKeyDef } from '../lib/storage';
import type { SessionRecord } from '../services/types';
import { useNavigation } from '../app/providers/NavigationProvider';
import { setSelectedSessionId } from '../lib/selectedSession';

const SESSIONS_KEY: StorageKeyDef<SessionRecord[]> = {
  key: 'sessions',
  fallback: [],
  validate: (v): v is SessionRecord[] => Array.isArray(v),
};

export function HistoryScreen() {
  const { go } = useNavigation();
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
      <TopBar showBack title="History" />
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
          {`Every conversation,\ntracked and tagged.`}
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
          {sessions.length} session{sessions.length === 1 ? '' : 's'}
          {sessions.length > 0 && (
            <>
              {' · '}
              {Math.round(
                sessions.reduce(
                  (s, x) => s + (x.scoreReport?.overall ?? 0),
                  0,
                ) / Math.max(1, sessions.length),
              )}
              % avg score
            </>
          )}
        </div>

        <div className="pbt-scroll flex gap-2 overflow-x-auto pb-1 mb-4">
          <Chip
            active={filter === 'all'}
            onClick={() => setFilter('all')}
          >
            All
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
                margin: 0,
                color: 'var(--pbt-text-muted)',
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              No sessions yet. Run a scenario from Home and they'll show up
              here, tagged by pushback type.
            </p>
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
                      {new Date(s.createdAt).toLocaleString()} · {s.mode}
                      {s.transcript?.length ? ` · ${s.transcript.length} turns` : ''}
                    </div>
                  </div>
                  <ScoreChip score={s.scoreReport?.overall ?? 0} />
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
