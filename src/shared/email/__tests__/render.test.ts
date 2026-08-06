import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  htmlToText,
  interpolate,
  renderEmail,
  safeHref,
  templateVariables,
} from '../render';
import { DEFAULT_TEMPLATES, getDefaultTemplate, sampleVars } from '../defaults';
import type { EmailTemplate } from '../types';

const base = (over: Partial<EmailTemplate> = {}): EmailTemplate => ({
  key: 'test',
  name: 'Test',
  description: '',
  subject: 'Hello {{name}}',
  preheader: 'Preview for {{name}}',
  blocks: [{ type: 'paragraph', text: 'Hi {{name}}.' }],
  ...over,
});

describe('interpolate', () => {
  it('substitutes declared variables and leaves unknown tokens intact', () => {
    expect(interpolate('Hi {{name}}, {{missing}}', { name: 'Jo' })).toBe('Hi Jo, {{missing}}');
  });

  it('tolerates whitespace inside the braces', () => {
    expect(interpolate('{{ name }}', { name: 'Jo' })).toBe('Jo');
  });
});

describe('escaping', () => {
  it('escapes HTML metacharacters in interpolated values', () => {
    const html = renderEmail({
      template: base({ blocks: [{ type: 'paragraph', text: '{{name}}' }] }),
      vars: { name: '<script>alert(1)</script>' },
    }).html;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes each metacharacter', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('rejects non-http(s) hrefs', () => {
    expect(safeHref('javascript:alert(1)')).toBe('#');
    expect(safeHref('data:text/html,<x>')).toBe('#');
    expect(safeHref('  https://example.com/x?a=1 ')).toBe('https://example.com/x?a=1');
    expect(safeHref('mailto:a@b.co')).toBe('mailto:a@b.co');
  });

  it('neutralises a hostile URL supplied through a variable', () => {
    const html = renderEmail({
      template: base({ blocks: [{ type: 'button', label: 'Go', href: '{{url}}' }] }),
      vars: { url: 'javascript:alert(1)' },
    }).html;
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="#"');
  });
});

describe('renderEmail', () => {
  it('renders subject, html, and a plain-text alternative', () => {
    const out = renderEmail({ template: base(), vars: { name: 'Jo' } });
    expect(out.subject).toBe('Hello Jo');
    expect(out.html).toContain('Hi Jo.');
    expect(out.text).toContain('Hi Jo.');
    expect(out.text).not.toContain('<');
  });

  it('hides the preheader in the body but keeps it in the markup', () => {
    const out = renderEmail({ template: base(), vars: { name: 'Jo' } });
    expect(out.html).toContain('Preview for Jo');
    expect(out.html).toContain('display:none');
  });

  it('renders every block type', () => {
    const out = renderEmail({
      template: base({
        blocks: [
          { type: 'heading', text: 'Title' },
          { type: 'paragraph', text: 'Body' },
          { type: 'button', label: 'Click', href: 'https://example.com' },
          { type: 'callout', text: 'Careful', tone: 'warn' },
          { type: 'list', items: ['one', 'two'] },
          { type: 'meta', items: [{ label: 'Role', value: 'Analyst' }] },
          { type: 'code', text: 'ABC123' },
          { type: 'divider' },
        ],
      }),
    });
    for (const needle of ['Title', 'Body', 'Click', 'Careful', 'one', 'two', 'Role', 'Analyst', 'ABC123']) {
      expect(out.html).toContain(needle);
    }
    expect(out.html).toContain('https://example.com');
  });

  it('supports bold and italic inline markup without allowing raw HTML', () => {
    const out = renderEmail({
      template: base({ blocks: [{ type: 'paragraph', text: '**bold** and _soft_ and <b>raw</b>' }] }),
    });
    expect(out.html).toContain('<strong>bold</strong>');
    expect(out.html).toContain('<em>soft</em>');
    expect(out.html).toContain('&lt;b&gt;raw&lt;/b&gt;');
  });

  it('carries a dark-mode block and a mobile breakpoint', () => {
    const out = renderEmail({ template: base() });
    expect(out.html).toContain('prefers-color-scheme: dark');
    expect(out.html).toContain('max-width:620px');
  });

  it('sizes the content table so it can shrink on a phone', () => {
    // A pixel-width table never goes below that width, so a 600px email
    // overflows every narrow client. Regression guard: the shell must cap with
    // max-width and stay fluid, with an Outlook ghost table for the one client
    // that ignores max-width.
    const out = renderEmail({ template: base() });
    expect(out.html).toContain('width:100%;max-width:600px');
    expect(out.html).not.toContain('width:600px;max-width:100%');
    expect(out.html).toContain('<!--[if mso]>');
  });

  it('applies brand overrides to the shell', () => {
    const out = renderEmail({
      template: base(),
      brand: { productName: 'Clinic Coach', accent: '#00aa55', logoText: 'CC' },
    });
    expect(out.html).toContain('Clinic Coach');
    expect(out.html).toContain('#00aa55');
    expect(out.html).toContain('>CC<');
  });

  it('exposes brand values as variables to the template', () => {
    const out = renderEmail({
      template: base({ subject: 'From {{productName}}' }),
      brand: { productName: 'Clinic Coach' },
    });
    expect(out.subject).toBe('From Clinic Coach');
  });

  it('sends raw HTML verbatim when an override is set', () => {
    const out = renderEmail({
      template: base({ htmlOverride: '<html><body><p>Raw {{name}}</p></body></html>' }),
      vars: { name: 'Jo' },
    });
    expect(out.html).toBe('<html><body><p>Raw Jo</p></body></html>');
    expect(out.text).toContain('Raw Jo');
  });

  it('stamps the current year into the footer', () => {
    const out = renderEmail({ template: base() });
    expect(out.html).toContain(String(new Date().getFullYear()));
    expect(out.html).not.toContain('{{__year__}}');
  });
});

describe('templateVariables', () => {
  it('finds every token the template references', () => {
    const vars = templateVariables(
      base({
        subject: '{{a}}',
        preheader: '{{b}}',
        blocks: [
          { type: 'button', label: '{{c}}', href: '{{d}}' },
          { type: 'list', items: ['{{e}}'] },
          { type: 'meta', items: [{ label: '{{f}}', value: '{{g}}' }] },
        ],
      }),
    );
    expect(vars.sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });
});

describe('shipped templates', () => {
  it('declares every variable it interpolates', () => {
    for (const def of DEFAULT_TEMPLATES) {
      const declared = new Set(def.variables.map((v) => v.key));
      for (const used of templateVariables(def)) {
        expect(
          declared.has(used),
          `${def.key} uses {{${used}}} without declaring it`,
        ).toBe(true);
      }
    }
  });

  it('renders each one with its sample data, leaving no unresolved tokens', () => {
    for (const def of DEFAULT_TEMPLATES) {
      const out = renderEmail({ template: def, vars: sampleVars(def.key) });
      expect(out.subject.length, `${def.key} subject`).toBeGreaterThan(0);
      expect(out.html).not.toMatch(/\{\{[a-zA-Z0-9_.]+\}\}/);
      expect(out.text.length).toBeGreaterThan(20);
    }
  });

  it('points every required link variable at a real URL', () => {
    for (const def of DEFAULT_TEMPLATES) {
      for (const v of def.variables.filter((x) => x.required)) {
        expect(v.sample, `${def.key}.${v.key}`).toMatch(/^https?:\/\//);
      }
    }
  });

  it('gives the invite and reset templates a working call to action', () => {
    for (const key of ['admin_invite', 'password_reset']) {
      const def = getDefaultTemplate(key)!;
      const button = def.blocks.find((b) => b.type === 'button');
      expect(button, `${key} has no button`).toBeTruthy();
      const out = renderEmail({ template: def, vars: sampleVars(key) });
      expect(out.html).not.toContain('href="#"');
    }
  });

  it('uses unique keys', () => {
    const keys = DEFAULT_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('htmlToText', () => {
  it('strips tags, styles, and entities', () => {
    expect(htmlToText('<style>p{color:red}</style><p>Hi&nbsp;&amp;&nbsp;bye</p>')).toBe('Hi & bye');
  });

  it('turns block boundaries into newlines', () => {
    expect(htmlToText('<p>one</p><p>two</p>')).toBe('one\ntwo');
  });
});
