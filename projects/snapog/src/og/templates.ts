// SnapOG — OG image element templates
// Returns plain objects compatible with workers-og / satori

import type { OGParams } from '../types';

type StyleObject = Record<string, string | number | undefined>;

type VNode = {
  type: string;
  props: {
    style?: StyleObject;
    children?: unknown;
    [key: string]: unknown;
  };
};

// Accent bar — left edge visual anchor
function AccentBar(color: string): VNode {
  return {
    type: 'div',
    props: {
      style: {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '6px',
        height: '100%',
        backgroundColor: color,
      },
      children: null,
    },
  };
}

/**
 * Title + description as ONE typographic unit, top-aligned, with all the slack
 * pushed BELOW them via an explicit spacer.
 *
 * `flex: 1` used to sit on the *title* div with the description as its sibling.
 * Flexbox gave every spare pixel to the title and shoved the description down
 * against the footer — on a 1200x630 card with a short title that is a ~300px
 * void with one orphaned grey line under it. The description read as unrelated
 * boilerplate, not as the title's subtitle.
 *
 * Removing `flex: 1` from the title exposed a SECOND, latent bug that the grown
 * height had been masking: `lineHeight` was written as the string `'1.2'`, and
 * satori parses that as **1.2 pixels**, not as a 1.2x multiplier. The title's
 * line box collapsed to ~1px, its glyphs overflowed, and the description
 * rendered on top of them. Every `lineHeight` in this file is now a bare number
 * (satori's multiplier form) — see the `quotaExceededElement` styles, which had
 * always used numbers and had always laid out correctly.
 *
 * Layout is therefore: text divs stay DIRECT children of the card's root column
 * and a zero-content `flex: 1` spacer absorbs the leftover height, so the
 * title/description pair stays welded to the top and the footer stays pinned to
 * the bottom. `flexShrink: 0` keeps a long title wrapping rather than being
 * squeezed by the spacer.
 */
function TitleBlock(
  title: string,
  description: string | undefined,
  titleStyle: StyleObject,
  descriptionStyle: StyleObject
): VNode[] {
  return [
    {
      type: 'div',
      props: {
        style: { display: 'flex', flexShrink: 0, ...titleStyle },
        children: title,
      },
    },
    ...(description
      ? [
          {
            type: 'div',
            props: {
              style: { display: 'flex', flexShrink: 0, ...descriptionStyle },
              children: description,
            },
          },
        ]
      : []),
    // Spacer: eats the remaining height so the footer stays pinned to the bottom
    // and the title/description pair stays welded to the top.
    {
      type: 'div',
      props: {
        style: { display: 'flex', flex: '1' },
        children: null,
      },
    },
  ];
}

// Header row: domain on left, tag pill on right
function Header(domain: string | undefined, tag: string | undefined, accent: string, surface: string, primary: string): VNode {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '48px',
        width: '100%',
      },
      children: [
        domain
          ? {
              type: 'div',
              props: {
                style: {
                  fontSize: '18px',
                  color: accent,
                  fontFamily: '"Noto Sans", sans-serif',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                },
                children: domain,
              },
            }
          : { type: 'div', props: { style: { width: '1px' }, children: null } },
        tag
          ? {
              type: 'div',
              props: {
                style: {
                  fontSize: '13px',
                  color: primary,
                  backgroundColor: surface,
                  padding: '6px 16px',
                  borderRadius: '100px',
                  fontFamily: '"Noto Sans", sans-serif',
                  letterSpacing: '0.04em',
                },
                children: tag,
              },
            }
          : { type: 'div', props: { style: { width: '1px' }, children: null } },
      ],
    },
  };
}

/**
 * Footer row: the author line, and nothing else.
 *
 * There used to be a 'snapog.dev' mark on the right for free-tier renders.
 * Removed under CEO ruling §2 condition 5 — the output of this file ends up in
 * a stranger's `<meta og:image>` and gets shown to THEIR audience. Putting our
 * name on someone else's marketing asset to sell them the removal is a
 * dealbreaker, not an upsell, and during the probe there is nothing to sell.
 */
function Footer(author: string | undefined, secondary: string): VNode {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: '48px',
        width: '100%',
      },
      children: [
        author
          ? {
              type: 'div',
              props: {
                style: {
                  fontSize: '18px',
                  color: secondary,
                  fontFamily: '"Noto Sans", sans-serif',
                },
                children: `— ${author}`,
              },
            }
          : { type: 'div', props: { style: { width: '1px' }, children: null } },
      ],
    },
  };
}

// Default template — general purpose
function defaultTemplate(params: OGParams): VNode {
  const { title, description, domain, author, tag, theme = 'dark' } = params;
  const isDark = theme === 'dark';

  const bg = isDark ? '#0A0A0A' : '#FAFAFA';
  const primary = isDark ? '#F5F5F5' : '#0A0A0A';
  const secondary = isDark ? '#737373' : '#737373';
  const accent = '#F59E0B';
  const surface = isDark ? '#1A1A1A' : '#E8E8E8';

  const fontSize = title.length > 60 ? '42px' : title.length > 40 ? '52px' : '62px';

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: bg,
        padding: '64px 72px 64px 84px',
        position: 'relative',
        fontFamily: '"Noto Sans", sans-serif',
      },
      children: [
        AccentBar(accent),
        Header(domain, tag, accent, surface, primary),
        ...TitleBlock(
          title,
          description,
          {
            fontSize,
            fontWeight: '700',
            color: primary,
            lineHeight: 1.2,
            letterSpacing: '-0.02em',
          },
          {
            fontSize: '22px',
            color: secondary,
            marginTop: '24px',
            lineHeight: 1.5,
            maxWidth: '900px',
          }
        ),
        Footer(author, secondary),
      ],
    },
  };
}

// Blog template — date-focused, editorial feel
function blogTemplate(params: OGParams): VNode {
  const { title, description, domain, author, tag, theme = 'dark' } = params;
  const isDark = theme === 'dark';

  const bg = isDark ? '#0D0D0D' : '#FFFFFF';
  const primary = isDark ? '#FAFAFA' : '#111111';
  const secondary = isDark ? '#6B7280' : '#6B7280';
  const accent = '#F59E0B';
  const surface = isDark ? '#1F1F1F' : '#F3F4F6';

  const fontSize = title.length > 55 ? '44px' : title.length > 35 ? '54px' : '64px';

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: bg,
        padding: '72px 80px',
        position: 'relative',
        fontFamily: '"Noto Serif", serif',
      },
      children: [
        // Top band
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: '0',
              left: '0',
              right: '0',
              height: '4px',
              backgroundColor: accent,
            },
            children: null,
          },
        },
        // Site label + tag
        Header(domain, tag, accent, surface, primary),
        ...TitleBlock(
          title,
          description,
          {
            fontSize,
            fontWeight: '700',
            color: primary,
            lineHeight: 1.2,
            letterSpacing: '-0.01em',
          },
          {
            fontSize: '21px',
            color: secondary,
            marginTop: '28px',
            lineHeight: 1.6,
            fontStyle: 'italic',
          }
        ),
        Footer(author, secondary),
      ],
    },
  };
}

// Article template — minimal, high-contrast, magazine aesthetic
function articleTemplate(params: OGParams): VNode {
  const { title, description, domain, author, tag, theme = 'dark' } = params;
  const isDark = theme === 'dark';

  const bg = isDark ? '#111111' : '#F8F8F8';
  const primary = isDark ? '#FFFFFF' : '#111111';
  const secondary = isDark ? '#9CA3AF' : '#4B5563';
  const accent = '#F59E0B';
  const _surface = isDark ? '#222222' : '#E5E7EB';
  void _surface;
  const divider = isDark ? '#2A2A2A' : '#D1D5DB';

  const fontSize = title.length > 60 ? '40px' : title.length > 40 ? '50px' : '60px';

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: bg,
        padding: '60px 72px',
        position: 'relative',
        fontFamily: '"Noto Sans", sans-serif',
      },
      children: [
        // Category row
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '32px',
            },
            children: [
              tag
                ? {
                    type: 'div',
                    props: {
                      style: {
                        fontSize: '12px',
                        fontWeight: '700',
                        color: accent,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        fontFamily: '"Noto Sans", sans-serif',
                      },
                      children: tag,
                    },
                  }
                : { type: 'div', props: { style: { width: '1px' }, children: null } },
              domain
                ? {
                    type: 'div',
                    props: {
                      style: {
                        fontSize: '12px',
                        color: secondary,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        fontFamily: '"Noto Sans", sans-serif',
                      },
                      children: `• ${domain}`,
                    },
                  }
                : { type: 'div', props: { style: { width: '1px' }, children: null } },
            ],
          },
        },
        // Divider
        {
          type: 'div',
          props: {
            style: {
              width: '48px',
              height: '3px',
              backgroundColor: accent,
              marginBottom: '32px',
            },
            children: null,
          },
        },
        ...TitleBlock(
          title,
          description,
          {
            fontSize,
            fontWeight: '800',
            color: primary,
            lineHeight: 1.15,
            letterSpacing: '-0.025em',
          },
          {
            fontSize: '20px',
            color: secondary,
            marginTop: '20px',
            lineHeight: 1.5,
            maxWidth: '850px',
          }
        ),
        // Footer divider + meta
        {
          type: 'div',
          props: {
            style: {
              width: '100%',
              height: '1px',
              backgroundColor: divider,
              marginTop: '36px',
            },
            children: null,
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '16px',
              fontFamily: '"Noto Sans", sans-serif',
            },
            children: [
              author
                ? {
                    type: 'div',
                    props: {
                      style: { fontSize: '16px', color: secondary },
                      children: author,
                    },
                  }
                : { type: 'div', props: { style: { width: '1px' }, children: null } },
            ],
          },
        },
      ],
    },
  };
}

/**
 * Shown when a key is over its monthly render quota.
 *
 * Takes NO parameters on purpose — it must be a single cacheable image, or it
 * becomes an unmetered render endpoint.
 *
 * It carries NO branding. It used to sign off 'snapog.dev', which meant our name
 * appeared on a stranger's social card at the exact moment we had failed them.
 * Removed with the tier watermark under ruling §2 condition 5 — the reasoning is
 * even stronger here than on a successful render.
 *
 * With the free limit at 10,000 renders/month this should be effectively
 * unreachable during the probe. It stays because condition 2 requires that
 * running out degrades to a valid PNG rather than breaking a live site, and the
 * cheapest way to keep that promise true is to keep the code that keeps it.
 */
export function quotaExceededElement(): VNode {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '1200px',
        height: '630px',
        backgroundColor: '#0A0A0A',
        fontFamily: '"Noto Sans", sans-serif',
        padding: '80px',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              fontSize: '15px',
              color: '#F59E0B',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              marginBottom: '28px',
            },
            children: 'Monthly image limit reached',
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              fontSize: '54px',
              fontWeight: '700',
              color: '#F5F5F5',
              letterSpacing: '-0.03em',
              textAlign: 'center',
              lineHeight: 1.15,
              marginBottom: '24px',
            },
            children: 'This preview image is paused',
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              fontSize: '22px',
              color: '#A3A3A3',
              textAlign: 'center',
              lineHeight: 1.5,
            },
            children: 'The site owner has used their monthly quota. Images resume on the 1st.',
          },
        },
      ],
    },
  };
}

export function buildElement(params: OGParams): VNode {
  switch (params.template) {
    case 'blog':
      return blogTemplate(params);
    case 'article':
      return articleTemplate(params);
    default:
      return defaultTemplate(params);
  }
}
