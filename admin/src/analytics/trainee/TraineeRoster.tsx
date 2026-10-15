/**
 * Trainees roster — everyone on the team, how they are practising, and who
 * needs a nudge. Status, streaks and momentum are lifetime facts (from all
 * sessions); the session count, average score and skills follow the range.
 */
import { useMemo, useState } from "react";
import type { AnalyticsTabProps } from "../AnalyticsDestination";
import { ContextBar, ScreenShell } from "../../primitives/Shell";
import {
  Avatar,
  EmptyState,
  LoadingShimmer,
  ScoreBadge,
  Sparkline,
} from "../../primitives";
import { Glass } from "../../primitives/Glass";
import { QueryBoundary } from "../../primitives/QueryBoundary";
import { useAccess } from "../../primitives/access";
import { COLOR } from "../../lib/tokens";
import {
  useEngagement,
  useSessionSummaries,
  useTraineeDirectory,
} from "../data";
import {
  AutoGrid,
  ChipFilter,
  DeltaChip,
  FreshnessNote,
  GhostButton,
  StatTile,
} from "../ui";
import { compareWords, pctDelta, rangeWords, windows } from "../lib/period";
import {
  STATUS_HELP,
  STATUS_LABELS,
  rollupTrainees,
  statusCounts,
  type TraineeRow,
} from "../lib/trainees";
import {
  MOMENTUM_THRESHOLD,
  defaultDir,
  inSegment,
  matchesQuery,
  rosterCsv,
  rosterSummary,
  sortRoster,
  type RosterSegment,
  type RosterSortKey,
  type SortDir,
} from "../lib/traineeRoster";
import { dayLabel, clockTime, relativeDay } from "../lib/traineeProfile";
import { downloadCsv, toCsv } from "../lib/csv";
import {
  DisabledTag,
  NewTag,
  RoleTag,
  STATUS_DOT,
  SkillMiniBars,
  SortHeader,
  TraineeStatusPill,
  Muted,
  asDriver,
  tdStyle,
} from "./parts";

const PAGE = 100;

const SEGMENTS: Array<{ key: RosterSegment; label: string; help?: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: STATUS_LABELS.active, help: STATUS_HELP.active },
  { key: "at_risk", label: STATUS_LABELS.at_risk, help: STATUS_HELP.at_risk },
  { key: "dormant", label: STATUS_LABELS.dormant, help: STATUS_HELP.dormant },
  {
    key: "not_started",
    label: STATUS_LABELS.not_started,
    help: STATUS_HELP.not_started,
  },
  { key: "new", label: "New", help: "Joined in the last 14 days" },
];

export function TraineeRoster({
  range,
  onRange,
  query,
  onQuery,
  onOpen,
  onNav,
}: AnalyticsTabProps) {
  const { can } = useAccess();
  const directory = useTraineeDirectory();
  const sessions = useSessionSummaries("all");
  const engagement = useEngagement(range, can("analytics.read"));

  const [segment, setSegment] = useState<RosterSegment>("all");
  const [sort, setSort] = useState<{ key: RosterSortKey; dir: SortDir }>({
    key: "lastActive",
    dir: "desc",
  });
  const [limit, setLimit] = useState(PAGE);

  // One clock per data load, so every figure on the screen agrees.
  const now = useMemo(
    () => Date.now(),
    [sessions.updatedAt, directory.updatedAt, range],
  ); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(
    () =>
      rollupTrainees(directory.data.rows, sessions.data.rows, {
        windowStart: windows(range, now).current.start,
        now,
        engagement: engagement.data?.per_user ?? null,
      }),
    [directory.data.rows, sessions.data.rows, engagement.data, range, now],
  );
  const counts = useMemo(() => statusCounts(rows), [rows]);
  const summary = useMemo(
    () => rosterSummary(rows, sessions.data.rows, range, now),
    [rows, sessions.data.rows, range, now],
  );

  const searched = useMemo(
    () => rows.filter((r) => matchesQuery(r, query)),
    [rows, query],
  );
  const visible = useMemo(
    () =>
      sortRoster(
        searched.filter((r) => inSegment(r, segment)),
        sort.key,
        sort.dir,
      ),
    [searched, segment, sort],
  );
  const segCounts = useMemo(() => statusCounts(searched), [searched]);

  const onSort = (key: RosterSortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: defaultDir(key) },
    );

  const exportCsv = () => {
    const csv = rosterCsv(visible, range);
    downloadCsv(
      `trainees-${range}-${new Date(now).toISOString().slice(0, 10)}.csv`,
      toCsv(csv.header, csv.rows),
    );
  };

  const loading = directory.loading || sessions.loading;
  const compare = range === "all" ? undefined : compareWords(range);

  return (
    <>
      <ContextBar
        title="Trainees"
        subtitle="How each person is practising — and who needs a nudge"
        range={range}
        onRange={onRange}
        query={query}
        onQuery={onQuery}
        actions={
          <GhostButton
            onClick={exportCsv}
            disabled={loading || visible.length === 0}
            title="Download the rows below as a spreadsheet"
          >
            <span aria-hidden="true">↓</span> Export CSV
          </GhostButton>
        }
      />
      <ScreenShell>
        <QueryBoundary
          queries={[directory, sessions]}
          title="Couldn’t load the trainees"
          showLoading={false}
        >
          {loading ? (
            <RosterSkeleton />
          ) : rows.length === 0 ? (
            <Glass padding={8} radius={20}>
              <EmptyState
                title="No trainees yet"
                subtitle="People appear here as soon as they create an account in the trainee app."
                action={
                  can("team.read") ? (
                    <GhostButton onClick={() => onNav("people", "invites")}>
                      Invite people
                    </GhostButton>
                  ) : undefined
                }
              />
            </Glass>
          ) : (
            <>
              <AutoGrid min={210}>
                <StatTile
                  label="Practising now"
                  value={summary.practising}
                  unit={`of ${rows.length}`}
                  delta={
                    range === "all"
                      ? undefined
                      : pctDelta(summary.practising, summary.practisingPrev)
                  }
                  compareLabel={compare}
                  hint={`Trainees with at least one session in the ${rangeWords(range)}`}
                />
                <StatTile
                  label="At risk"
                  value={summary.atRisk}
                  unit={summary.atRisk === 1 ? "person" : "people"}
                  hint={
                    `Last practised 8–21 days ago — a nudge still works.` +
                    (summary.atRiskPrev != null
                      ? ` ${summary.atRiskPrev} at the start of this window.`
                      : "") +
                    " Select to see who."
                  }
                  onClick={() => setSegment("at_risk")}
                />
                <StatTile
                  label="Improving"
                  value={summary.improving}
                  unit={summary.improving === 1 ? "person" : "people"}
                  hint={
                    `${summary.slipping === 0 ? "Nobody" : summary.slipping} slipping. ` +
                    `Their last 5 scores vs the 5 before, ${MOMENTUM_THRESHOLD}+ points up or down.`
                  }
                />
                <StatTile
                  label="Sessions per active trainee"
                  value={
                    summary.perActive == null
                      ? "—"
                      : summary.perActive.toFixed(1)
                  }
                  delta={
                    range === "all"
                      ? undefined
                      : summary.perActive == null
                        ? null
                        : pctDelta(summary.perActive, summary.perActivePrev)
                  }
                  compareLabel={compare}
                  hint={`Average for people who practised in the ${rangeWords(range)}`}
                />
              </AutoGrid>

              <Glass padding={0} radius={20} style={{ minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    padding: "16px 18px 14px",
                  }}
                >
                  <ChipFilter
                    label="Filter trainees by status"
                    value={segment}
                    onChange={(k) => {
                      setSegment(k);
                      setLimit(PAGE);
                    }}
                    options={SEGMENTS.map((s) => ({
                      key: s.key,
                      label: s.label,
                      count: segCounts[s.key],
                      tone: s.key === "all" ? undefined : STATUS_DOT[s.key],
                    }))}
                  />
                  <span
                    style={{
                      display: "inline-flex",
                      gap: 12,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <Muted>
                      {visible.length === rows.length
                        ? `${rows.length} trainees`
                        : `${visible.length} of ${rows.length} trainees`}
                    </Muted>
                    <FreshnessNote
                      updatedAt={sessions.updatedAt}
                      refreshing={sessions.refreshing}
                      onRefresh={sessions.refetch}
                    />
                  </span>
                </div>

                {visible.length === 0 ? (
                  <EmptyState
                    title={
                      query.trim()
                        ? `No trainees match “${query.trim()}”`
                        : `No ${SEGMENTS.find((s) => s.key === segment)?.label.toLowerCase()} trainees`
                    }
                    subtitle={
                      segment !== "all" && !query.trim()
                        ? SEGMENTS.find((s) => s.key === segment)?.help
                        : "Try a different name, email or role — or clear the filter."
                    }
                    action={
                      <GhostButton
                        onClick={() => {
                          setSegment("all");
                          onQuery("");
                        }}
                      >
                        Clear filter
                      </GhostButton>
                    }
                  />
                ) : (
                  <RosterTable
                    rows={visible.slice(0, limit)}
                    sort={sort}
                    onSort={onSort}
                    onOpen={(id) => onOpen("trainees", id)}
                    now={now}
                    range={range}
                  />
                )}
                {visible.length > limit && (
                  <div
                    style={{
                      padding: "12px 18px 16px",
                      display: "flex",
                      justifyContent: "center",
                    }}
                  >
                    <GhostButton onClick={() => setLimit((l) => l + PAGE)}>
                      Show more · {visible.length - limit} not shown
                    </GhostButton>
                  </div>
                )}
              </Glass>
              <div
                style={{
                  fontSize: 11,
                  color: COLOR.inkMute,
                  lineHeight: 1.55,
                  padding: "0 4px",
                }}
              >
                Status, streaks and score momentum use every session a trainee
                has ever done; sessions, average score and skills cover the{" "}
                {rangeWords(range)}. Averages count scored sessions only —
                sessions left early or where scoring failed are excluded.{" "}
                {counts.new > 0 && `${counts.new} joined in the last 14 days.`}
              </div>
            </>
          )}
        </QueryBoundary>
      </ScreenShell>
    </>
  );
}

function RosterTable({
  rows,
  sort,
  onSort,
  onOpen,
  now,
  range,
}: {
  rows: TraineeRow[];
  sort: { key: RosterSortKey; dir: SortDir };
  onSort: (k: RosterSortKey) => void;
  onOpen: (id: string) => void;
  now: number;
  range: AnalyticsTabProps["range"];
}) {
  const h = { active: sort.key, dir: sort.dir, onSort };
  return (
    <div className="pbt-rq" style={{ borderTop: `1px solid ${COLOR.border}` }}>
      <div className="pbt-rq-scroll" style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            minWidth: 960,
            borderCollapse: "separate",
            borderSpacing: 0,
          }}
        >
          <caption
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              overflow: "hidden",
              clip: "rect(0 0 0 0)",
            }}
          >
            Trainees — select a name to open their profile
          </caption>
          <thead>
            <tr>
              <SortHeader
                label="Trainee"
                sortKey="name"
                {...h}
                style={{ paddingLeft: 18 }}
                className="pbt-roster-sticky"
              />
              <SortHeader
                label="Status"
                sortKey="status"
                {...h}
                title="Sorted by who needs a nudge first"
              />
              <SortHeader
                label={`Sessions · ${range === "all" ? "all time" : range}`}
                sortKey="sessions"
                {...h}
                title="Sessions in the selected range; the line is the last 8 weeks"
              />
              <SortHeader
                label="Avg score"
                sortKey="avgScore"
                {...h}
                title="Average of scored sessions in the range; the chip is their last 5 scores vs the 5 before"
              />
              <SortHeader
                label="Skills"
                sortKey="skills"
                {...h}
                title="Sorted by their weakest skill"
              />
              <SortHeader
                label="Streak"
                sortKey="streak"
                {...h}
                title="Consecutive days with a session"
              />
              <SortHeader
                label="Last active"
                sortKey="lastActive"
                {...h}
                style={{ paddingRight: 18 }}
              />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.user_id}
                className="pbt-roster-row"
                onClick={() => onOpen(r.user_id)}
                style={{ opacity: r.disabled ? 0.55 : 1 }}
              >
                <td
                  className="pbt-roster-sticky"
                  style={{
                    ...tdStyle,
                    paddingLeft: 18,
                    minWidth: 240,
                    maxWidth: 300,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 11,
                      minWidth: 0,
                    }}
                  >
                    <Avatar
                      name={r.name}
                      driver={asDriver(r.driver)}
                      size={34}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          type="button"
                          className="pbt-name-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpen(r.user_id);
                          }}
                          style={{ fontSize: 13.5 }}
                        >
                          {r.name}
                        </button>
                        {r.isNew && <NewTag />}
                        {r.disabled && <DisabledTag />}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginTop: 2,
                          minWidth: 0,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11.5,
                            color: COLOR.inkMute,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: 170,
                          }}
                        >
                          {r.email ?? "—"}
                        </span>
                        <RoleTag role={r.admin_role} />
                      </div>
                    </div>
                  </div>
                </td>
                <td style={tdStyle}>
                  <TraineeStatusPill status={r.status} />
                </td>
                <td style={tdStyle}>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 12 }}
                  >
                    <span
                      style={{
                        minWidth: 22,
                        fontSize: 14,
                        fontWeight: 750,
                        color: r.sessions ? COLOR.ink : COLOR.inkMute,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {r.sessions}
                    </span>
                    {r.sessionsAll > 0 ? (
                      <span
                        style={{ width: 64, display: "inline-block" }}
                        title={`Sessions per week, last 8 weeks: ${r.weekly.join(", ")}`}
                      >
                        <Sparkline
                          data={r.weekly}
                          width={64}
                          height={20}
                          color="oklch(0.62 0.12 250)"
                        />
                      </span>
                    ) : (
                      <span style={{ width: 64 }} />
                    )}
                  </div>
                </td>
                <td style={tdStyle}>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <ScoreBadge
                      score={r.avgScore == null ? null : Math.round(r.avgScore)}
                    />
                    <DeltaChip
                      delta={
                        r.momentum == null || r.avgScore == null
                          ? null
                          : { kind: "points", value: r.momentum }
                      }
                      size="xs"
                      compareLabel="— last 5 scores vs the 5 before"
                    />
                  </div>
                </td>
                <td style={tdStyle}>
                  <SkillMiniBars skills={r.skills} weakest={r.weakest} />
                </td>
                <td style={tdStyle}>
                  {r.streak > 0 ? (
                    <span style={{ fontWeight: 750, color: COLOR.ink }}>
                      {r.streak} day{r.streak === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <span style={{ color: COLOR.inkMute }}>—</span>
                  )}
                  {r.bestStreak > 0 && (
                    <div
                      style={{
                        fontSize: 11,
                        color: COLOR.inkMute,
                        marginTop: 1,
                      }}
                    >
                      best {r.bestStreak}
                    </div>
                  )}
                </td>
                <td
                  style={{ ...tdStyle, paddingRight: 18, whiteSpace: "nowrap" }}
                  title={
                    r.lastActiveAt
                      ? `${dayLabel(r.lastActiveAt, now)}, ${clockTime(r.lastActiveAt)}`
                      : "No activity recorded"
                  }
                >
                  <span
                    style={{
                      color: r.lastActiveAt ? COLOR.inkSoft : COLOR.inkMute,
                      fontWeight: 600,
                    }}
                  >
                    {relativeDay(r.lastActiveAt, now)}
                  </span>
                  {r.lastSessionAt != null &&
                    r.lastActiveAt !== r.lastSessionAt && (
                      <div
                        style={{
                          fontSize: 11,
                          color: COLOR.inkMute,
                          marginTop: 1,
                        }}
                      >
                        practised{" "}
                        {relativeDay(r.lastSessionAt, now).toLowerCase()}
                      </div>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RosterSkeleton() {
  return (
    <>
      <AutoGrid min={210}>
        {[0, 1, 2, 3].map((i) => (
          <LoadingShimmer key={i} height={128} />
        ))}
      </AutoGrid>
      <LoadingShimmer height={56} />
      <LoadingShimmer height={460} />
    </>
  );
}
