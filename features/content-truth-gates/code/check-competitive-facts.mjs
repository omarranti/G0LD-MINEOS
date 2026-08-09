#!/usr/bin/env node
// Fails the build if stale launch-phase facts (waitlist / TBD) reappear in the
// competitive money pages. The app is live with locked pricing: free tier,
// $9.99/mo, $59.99/yr, founding annual $39.99.
import { readFileSync } from 'node:fs';

const FILES = [
  'content/competitive/alternatives-pages.ts',
  'content/competitive/best-pages.ts',
  'content/competitive/compare-pages.ts',
];

const STALE = /waitlist|TBD/i;

let failed = false;
for (const file of FILES) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (STALE.test(line)) {
      console.error(`${file}:${i + 1} stale launch-phase copy: ${line.trim()}`);
      failed = true;
    }
  });
}

if (failed) {
  console.error(
    '\ncheck-competitive-facts: found "waitlist" / "TBD" in competitive pages. ' +
      'Pricing is live (free tier, $9.99/mo or $59.99/yr, founding annual $39.99). ' +
      'Update the copy instead of reintroducing launch-phase language.'
  );
  process.exit(1);
}

console.log('check-competitive-facts: competitive pages clean.');
