import React from 'react';
import type { NurtureEmail } from './email-nurture-sequence';

/**
 * Renders any NurtureEmail into the same visual shell as the welcome email
 * in lib/email-templates.tsx. Keeps colors, typography, and spacing identical
 * so the whole sequence feels like one conversation.
 */

export interface NurtureTemplateProps {
  email: NurtureEmail;
  firstName?: string;
}

const PRIMARY = '#343818';
const BG = '#F8F4ED';
const TEXT = '#1a1a1a';
const MUTED = '#5C5C5C';

export const NurtureEmailTemplate = ({ email, firstName = 'there' }: NurtureTemplateProps) => {
  const subjectTitle = `${email.subject} | Therma`;

  const renderParagraph = (text: string, i: number) => {
    const withName = text.replace('{firstName}', firstName);
    return (
      <p
        key={i}
        style={{
          fontSize: '16px',
          margin: '0 0 20px 0',
          color: TEXT,
          lineHeight: '1.7',
        }}
      >
        {withName}
      </p>
    );
  };

  return (
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
        <title>{subjectTitle}</title>
        <style>{`
          @media only screen and (max-width: 600px) {
            .email-container { padding: 24px 16px !important; }
            .email-card { padding: 24px 20px !important; }
            h1 { font-size: 24px !important; }
          }
        `}</style>
      </head>
      <body
        style={{
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          lineHeight: '1.6',
          color: TEXT,
          backgroundColor: BG,
          margin: 0,
          padding: 0,
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        {/* Preheader (hidden) */}
        <div
          style={{
            display: 'none',
            fontSize: '1px',
            color: BG,
            lineHeight: '1px',
            maxHeight: 0,
            maxWidth: 0,
            opacity: 0,
            overflow: 'hidden',
          }}
        >
          {email.preheader}
        </div>

        <div
          className="email-container"
          style={{
            maxWidth: '600px',
            margin: '0 auto',
            padding: '40px 20px',
          }}
        >
          <div
            className="email-card"
            style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              padding: '40px 32px',
              border: '1px solid #E6E1D8',
            }}
          >
            {/* Logo */}
            <div style={{ textAlign: 'center' as const, marginBottom: '24px' }}>
              <img
                src="https://www.therma.one/therma-logo-80x80.png"
                alt="Therma"
                width="60"
                height="60"
                style={{ display: 'block', margin: '0 auto', borderRadius: '12px' }}
              />
            </div>

            {/* Headline */}
            <h1
              style={{
                color: PRIMARY,
                fontSize: '28px',
                margin: '0 0 24px 0',
                fontWeight: 600,
                lineHeight: '1.3',
              }}
            >
              {email.headline}
            </h1>

            {/* Body paragraphs */}
            {email.bodyParagraphs.map(renderParagraph)}

            {/* Callout box */}
            {email.callout && (
              <div
                style={{
                  background: '#FEFBF3',
                  borderRadius: '12px',
                  padding: '24px',
                  margin: '8px 0 24px 0',
                  borderLeft: `4px solid ${PRIMARY}`,
                }}
              >
                <p
                  style={{
                    fontSize: '16px',
                    margin: '0 0 16px 0',
                    color: TEXT,
                    fontWeight: 600,
                  }}
                >
                  {email.callout.label}
                </p>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: '20px',
                    color: TEXT,
                    fontSize: '15px',
                    lineHeight: '1.8',
                    listStyle: 'none',
                  }}
                >
                  {email.callout.lines.map((line, i) => (
                    <li key={i} style={{ marginBottom: '8px' }}>
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Body paragraphs after callout (optional) */}
            {email.bodyParagraphsAfterCallout?.map(renderParagraph)}

            {/* CTA button */}
            {email.cta && (
              <div style={{ margin: '8px 0 32px 0' }}>
                <a
                  href={email.cta.href}
                  style={{
                    display: 'inline-block',
                    background: PRIMARY,
                    color: '#FFFFFF',
                    textDecoration: 'none',
                    borderRadius: '999px',
                    padding: '12px 28px',
                    fontSize: '15px',
                    fontWeight: 500,
                  }}
                >
                  {email.cta.label}
                </a>
              </div>
            )}

            {/* Sign off */}
            <p
              style={{
                fontSize: '16px',
                margin: 0,
                color: TEXT,
                whiteSpace: 'pre-line',
              }}
            >
              {email.signOff}
            </p>
          </div>

          {/* Footer */}
          <div
            style={{
              textAlign: 'center' as const,
              padding: '24px 20px',
              marginTop: '16px',
            }}
          >
            <p
              style={{
                fontSize: '13px',
                color: MUTED,
                margin: 0,
                lineHeight: '1.5',
              }}
            >
              You&apos;re receiving this because you signed up for the Therma waitlist.
            </p>
          </div>
        </div>
      </body>
    </html>
  );
};
