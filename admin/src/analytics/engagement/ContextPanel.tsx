/**
 * Devices & context — what the trainee app reports when it opens (`app_open`
 * meta): device, operating system, installed app vs browser, language and
 * theme, each as a share bar of distinct people (their latest report in the
 * window). Each value keeps its own hue in every window (`contextParts`).
 */
import type { EngagementReport } from '../../../../src/shared/analytics/contract';
import { Eyebrow } from '../../primitives';
import { COLOR } from '../../lib/tokens';
import { DEVICE_LABELS, INSTALL_LABELS, LOCALE_LABELS, OS_LABELS, THEME_LABELS } from '../../lib/labels';
import { AutoGrid, Panel, ShareBar } from '../ui';
import { contextParts } from '../lib/engagementInsights';

const DIMENSIONS: Array<{
  key: keyof EngagementReport['context'];
  title: string;
  labels: Record<string, string>;
  order: string[];
}> = [
  { key: 'device', title: 'Device', labels: DEVICE_LABELS, order: ['mobile', 'tablet', 'desktop'] },
  { key: 'os', title: 'Operating system', labels: OS_LABELS, order: ['ios', 'android', 'windows', 'macos'] },
  { key: 'installed', title: 'How they open it', labels: INSTALL_LABELS, order: ['installed', 'browser'] },
  { key: 'locale', title: 'Language', labels: LOCALE_LABELS, order: ['en', 'fr'] },
  { key: 'theme', title: 'Theme', labels: THEME_LABELS, order: ['light', 'dark', 'system'] },
];

export function ContextPanel({ context }: { context: EngagementReport['context'] }) {
  const dims = DIMENSIONS.map((d) => ({ ...d, parts: contextParts(context?.[d.key], d.labels, d.order) }));
  const any = dims.some((d) => d.parts.length > 0);
  return (
    <Panel
      title="Devices & context"
      subtitle="What people use the app on — each person counted once, by what their device last reported"
    >
      {!any ? (
        <div
          style={{
            padding: '22px 16px',
            borderRadius: 14,
            border: '0.5px dashed rgba(60,20,15,0.14)',
            textAlign: 'center',
            fontSize: 12.5,
            color: COLOR.inkMute,
          }}
        >
          <div style={{ fontWeight: 700, color: COLOR.inkSoft, fontSize: 13.5 }}>No device details yet</div>
          Device details are collected from the next trainee-app release onward.
        </div>
      ) : (
        <AutoGrid min={196} gap={22}>
          {dims.map((d) => (
            <div key={d.key} style={{ minWidth: 0 }}>
              <Eyebrow style={{ marginBottom: 8 }}>{d.title}</Eyebrow>
              {d.parts.length === 0 ? (
                <div style={{ fontSize: 12, color: COLOR.inkMute }}>Not reported yet</div>
              ) : (
                <ShareBar parts={d.parts} height={10} />
              )}
            </div>
          ))}
        </AutoGrid>
      )}
    </Panel>
  );
}
