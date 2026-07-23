'use client';

import { useEffect, useMemo, useState } from 'react';

interface ABTestHeadlineProps {
  className?: string;
}

export default function ABTestHeadline({ className }: ABTestHeadlineProps) {
  const variants = useMemo(
    () =>
      ({
        control: <>A quieter place to check in.</>,
        a: <>A quieter place to check in.</>,
        b: <>A quieter place to check in.</>,
      }) as const,
    []
  );

  const [variant, setVariant] = useState<keyof typeof variants>('control');

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const forced = params.get('ab');
      if (forced === 'control' || forced === 'a' || forced === 'b') {
        localStorage.setItem('therma_ab_headline', forced);
        setVariant(forced);
        return;
      }

      const stored = localStorage.getItem('therma_ab_headline');
      if (stored === 'control' || stored === 'a' || stored === 'b') {
        setVariant(stored);
        return;
      }

      const r = Math.random();
      const assigned: keyof typeof variants = r < 1 / 3 ? 'control' : r < 2 / 3 ? 'a' : 'b';
      localStorage.setItem('therma_ab_headline', assigned);
      setVariant(assigned);
    } catch {
      // If storage is unavailable, fall back to control.
    }
  }, [variants]);

  return (
    <h1 className={className}>
      {variants[variant]}
    </h1>
  );
}