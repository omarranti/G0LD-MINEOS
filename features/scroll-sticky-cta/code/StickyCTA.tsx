'use client';

import { useEffect } from 'react';
import { APP_STORE_URL } from '../lib/links';

type StickyCTAProps = {
  buttonLabel?: string;
  helperText?: string;
};

export default function StickyCTA({
  buttonLabel = 'Download',
  helperText = 'Available on iOS',
}: StickyCTAProps) {
  useEffect(() => {
    document.body.classList.add('has-sticky-cta');
    return () => { document.body.classList.remove('has-sticky-cta'); };
  }, []);

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 hidden border-t backdrop-blur-xl sm:block md:hidden"
      style={{
        borderColor: 'var(--theme-hairline)',
        backgroundColor: 'var(--theme-bg-glass)',
        paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
      }}
      role="region"
      aria-label="Download Therma"
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 pt-3">
        <span className="font-body text-sm" style={{ color: 'var(--theme-text-soft)' }}>{helperText}</span>
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-pill px-5 py-2.5 font-body text-sm font-semibold uppercase tracking-wider text-white transition-all hover:-translate-y-0.5 hover:shadow-button active:translate-y-0"
          style={{ backgroundColor: 'var(--color-coral)' }}
        >
          {buttonLabel}
        </a>
      </div>
    </div>
  );
}
