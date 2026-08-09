import { chromium } from 'playwright';
import path from 'path';

const OUTPUT_DIR = '/Users/omar/Documents/GitHub/therma-site/public/carousel';

const PRESETS = [
  { key: 'antiwellnessquote', cleanTitle: 'antiwellnessquote', slideCount: 1 },
  { key: 'antiwellness3', cleanTitle: 'antiwellness3', slideCount: 10 },
  { key: 'gapquote2', cleanTitle: 'gapquote2', slideCount: 1 },
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();

await page.goto('http://localhost:3030/team/marketing/carousel');
console.log('waiting for fonts to load...');
await page.waitForTimeout(4000);

for (const preset of PRESETS) {
  console.log(`\n=== ${preset.key} ===`);

  // select preset from dropdown
  await page.locator('select').selectOption(preset.key);
  await page.waitForTimeout(1000);

  // overwrite the asset title input so filenames are clean
  const titleInput = page.locator('input[type="text"]').first();
  await titleInput.fill(preset.cleanTitle);
  await page.waitForTimeout(300);

  // collect downloads
  let count = 0;
  const handler = async (download) => {
    const fn = download.suggestedFilename();
    await download.saveAs(path.join(OUTPUT_DIR, fn));
    count++;
    process.stdout.write(`  ${fn}\n`);
  };
  page.on('download', handler);

  // click "All ratios" export button (N slides x 5 ratios files)
  const btn = page.locator('button', { hasText: 'All ratios' });
  await btn.click();

  // wait for downloads — ~400ms per file is safe
  const expectedFiles = preset.slideCount * 5;
  const waitMs = Math.max(5000, expectedFiles * 500);
  await page.waitForTimeout(waitMs);

  page.removeListener('download', handler);
  console.log(`  done: ${count}/${expectedFiles} files saved`);
}

await browser.close();
console.log('\nall exports complete.');
