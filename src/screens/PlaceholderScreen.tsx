import { Glass } from '../design-system/Glass';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';

export interface PlaceholderScreenProps {
  title: string;
  body: string;
  withTabBar?: boolean;
  showBack?: boolean;
}

/**
 * Temporary placeholder used while a screen's full implementation is in flight.
 * The chrome (TopBar, glass canvas, theme) is real so the user sees a
 * coherent app even before each screen is finished.
 */
export function PlaceholderScreen({
  title,
  body,
  withTabBar = false,
  showBack = false,
}: PlaceholderScreenProps) {
  return (
    <>
      <TopBar title={title} showBack={showBack} />
      <Page withTabBar={withTabBar}>
        <Glass radius={22} padding={22}>
          <div
            style={{
              fontFamily: 'var(--pbt-font-mono)',
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--pbt-text-muted)',
              marginBottom: 8,
            }}
          >
            Coming next
          </div>
          <h2
            style={{
              margin: '0 0 8px',
              fontSize: 22,
              fontWeight: 400,
              letterSpacing: '-0.02em',
              color: 'var(--pbt-text)',
            }}
          >
            {title}
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.5,
              color: 'var(--pbt-text-muted)',
            }}
          >
            {body}
          </p>
        </Glass>
      </Page>
    </>
  );
}
