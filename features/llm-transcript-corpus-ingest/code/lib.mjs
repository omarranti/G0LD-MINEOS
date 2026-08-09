import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// model used by the HTTP path. pick your strongest model for knowledge
// synthesis. override with KNOWLEDGE_MODEL env var to A/B against a cheaper one.
export const ANTHROPIC_MODEL = process.env.KNOWLEDGE_MODEL || "claude-opus-4-7";

// CLI path: pipes the prompt through a local `claude -p` process. useful for
// local ingestion without an API key on the env.
export function runClaude(prompt) {
  return new Promise((res, rej) => {
    const child = spawn("claude", ["-p"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", rej);
    child.on("close", (code) => {
      if (code !== 0) return rej(new Error(`claude exited with code ${code}: ${stderr.slice(0, 500)}`));
      res(stdout);
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// HTTP path: calls api.anthropic.com directly. works in serverless (Vercel).
// transcripts are large; raise max_tokens enough to hold a full summary.
/**
 * @param {string} prompt
 * @param {{ apiKey?: string, model?: string, maxTokens?: number }} [opts]
 * @returns {Promise<string>}
 */
export async function runClaudeHttp(prompt, opts = {}) {
  const { apiKey, model = ANTHROPIC_MODEL, maxTokens = 8192 } = opts;
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`anthropic ${res.status}: ${errText.slice(0, 500)}`);
  }
  const data = await res.json();
  const blocks = Array.isArray(data?.content) ? data.content : [];
  return blocks.map((b) => (typeof b?.text === "string" ? b.text : "")).join("");
}

// build the per-video prompt. `meta` is optional but recommended: title /
// channel / duration / description from the watch page so the model has
// speaker hints without having to infer them from caption fragments.
// when the transcript has [mm:ss] prefixes, the model is instructed to
// preserve them on quoted lines so the ui can deep-link to the right
// moment of the video.
export function buildPrompt({ corpus, url, transcript, channelOverride, today, root = ROOT, meta }) {
  const systemPrompt = readFileSync(join(root, "prompts", `${corpus}-system.md`), "utf8");
  const hasTimestamps = /\n?\[\d{1,2}:\d{2}(:\d{2})?\]/.test(transcript);

  const metaLines = [];
  if (meta?.title) metaLines.push(`video title: ${meta.title}`);
  if (meta?.channel) metaLines.push(`channel: ${meta.channel}`);
  if (meta?.guest) metaLines.push(`featured guest (hint): ${meta.guest}`);
  if (meta?.duration) metaLines.push(`duration: ${meta.duration}`);
  if (meta?.description) {
    const trimmed = String(meta.description).slice(0, 800).replace(/\s+/g, " ").trim();
    if (trimmed) metaLines.push(`description (truncated):\n${trimmed}`);
  }

  return [
    systemPrompt,
    "",
    "---",
    "",
    "## video metadata (use to identify speakers and infer the title)",
    "",
    metaLines.length ? metaLines.join("\n") : "(none provided; infer from transcript)",
    "",
    "---",
    "",
    "## transcript",
    "",
    transcript,
    "",
    "---",
    "",
    `the url for this video is: ${url}`,
    `today's date is: ${today}`,
    channelOverride ? `the channel for this video is: ${channelOverride}. use this exact string in the frontmatter "channel:" field.` : "",
    "",
    hasTimestamps
      ? "the transcript above is prefixed with [mm:ss] or [hh:mm:ss] timestamps. when you cite a verbatim quote in the Notable quotes section, end the attribution with the start timestamp in brackets, e.g. `> \"...\" — speaker [12:34]`. this lets the ui deep-link to the moment in the video. pick the timestamp from the closest preceding bracket in the transcript. do NOT invent timestamps."
      : "the transcript above has no timestamps; do not invent any.",
    "",
    "substitute these into the PLACEHOLDER_URL and PLACEHOLDER_DATE fields in the frontmatter. respond with ONLY the markdown summary, no commentary, no code fences.",
    "",
    "hard constraint: NO em dashes (—) anywhere in the output, including the title field, the h1, the summary line, bullets, and quotes. use colons, commas, or periods instead. the only place em dashes are allowed is inside the verbatim attribution after a quote (e.g. `> \"...\" — speaker`).",
  ].join("\n");
}

export function stripFences(s) {
  let t = s.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```\s*$/, "");
  }
  return t;
}

export function sanitizeEmDashes(md) {
  const lines = md.split("\n");
  let inFrontmatter = false;
  let frontmatterCount = 0;
  return lines.map((line) => {
    if (line.trim() === "---") {
      frontmatterCount++;
      inFrontmatter = frontmatterCount === 1;
      return line;
    }
    if (inFrontmatter && frontmatterCount === 1) {
      return line.replace(/\s*—\s*/g, ": ");
    }
    if (/^#\s+/.test(line)) {
      return line.replace(/\s*—\s*/g, ": ");
    }
    if (/^\*[^*]+\*\s*$/.test(line)) {
      return line.replace(/\s*—\s*/g, ", ");
    }
    return line;
  }).join("\n");
}

export function overrideChannel(md, value) {
  return md.replace(/^(channel:\s*).*$/m, `$1${value}`);
}

export function parseFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "untitled";
}

// pull the canonical 11-char video id out of any youtube url form so we can
// dedup the same video ingested via youtu.be vs watch?v= vs /shorts/ vs /embed/.
// returns "" if we can't find one (e.g. unrelated url, playlist-only link).
export function extractVideoId(url) {
  if (!url) return "";
  const s = String(url).trim();
  const patterns = [
    /(?:youtube\.com\/watch\?(?:[^&]+&)*v=)([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/live\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/v\/([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return "";
}

// canonical url form for storage. falls back to original string if no id.
export function canonicalYoutubeUrl(url) {
  const id = extractVideoId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : (url || "");
}

export function regenerateIndex(corpus, root = ROOT) {
  const dir = join(root, corpus);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "_index.md")
    .sort()
    .reverse();

  const rows = files.map((f) => {
    const fm = parseFrontmatter(readFileSync(join(dir, f), "utf8"));
    const ingested = fm.ingested || "?";
    const channel = fm.channel || "?";
    const title = (fm.title || f).replace(/\s*—\s*/g, ": ");
    const url = fm.url || "";
    return `| ${ingested} | ${channel} | [${title}](${f}) | ${url} |`;
  });

  const md = [
    `# ${corpus} corpus index`,
    "",
    `${files.length} videos. auto-generated by \`scripts/ingest.mjs\`. do not edit by hand.`,
    "",
    "| ingested | channel | title | url |",
    "|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");

  writeFileSync(join(dir, "_index.md"), md);
}

// post-process raw model output into a normalized markdown summary + parsed metadata.
// pure: no filesystem, no network. shared by the CLI and the HTTP route.
// `videoId` (optional) is appended to the stem so the same video re-ingested
// via a different url form (youtu.be vs watch?v=) collides on the unique slug.
export function processOutput({ raw, corpus, channel, today, videoId }) {
  let output = stripFences(raw);
  output = sanitizeEmDashes(output);
  if (channel) output = overrideChannel(output, channel);

  const parsed = parseFrontmatter(output);
  const resolvedChannel = parsed.channel || channel || "unknown";
  const title = parsed.title || "untitled";
  const idSuffix = videoId ? `-${videoId}` : "";
  const stem = (`${today}-${slugify(resolvedChannel)}-${slugify(title)}${idSuffix}`).slice(0, 120);

  // pull structured extractions out before splitting body, then drop that
  // section so we don't double-render it in the reader.
  const structured = parseStructuredExtractions(output);
  const cleanedOutput = stripStructuredExtractions(output);

  // split frontmatter from body so the DB row stores them separately.
  const fmMatch = cleanedOutput.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const frontmatterRaw = fmMatch ? fmMatch[1] : "";
  const body = fmMatch ? fmMatch[2].replace(/^\n+/, "") : cleanedOutput;

  return { output: cleanedOutput, parsed, stem, frontmatterRaw, body, corpus, structured };
}

// strips the leading/trailing brackets and quotes from a yaml-ish list like
// `[a, "b", c]` and returns "a,b,c". used to flatten frontmatter list fields
// into the comma-joined text columns we store in `knowledge_entries`.
export function flattenList(value) {
  if (!value) return "";
  const inner = String(value).replace(/^\[|\]$/g, "");
  return inner
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean)
    .join(",");
}

// pull the "## Structured extractions" yaml block out of the model output.
// returns { keyClaims, prescriptions, entities, references } as string[].
// missing blocks come back as []. tolerant of minor formatting drift; we
// look for `key:` lines and slurp the indented `- "..."` items beneath.
export function parseStructuredExtractions(markdown) {
  const empty = { keyClaims: [], prescriptions: [], entities: [], references: [] };
  if (!markdown) return empty;

  // grab everything after the "## Structured extractions" heading.
  const start = markdown.search(/^##\s+Structured extractions/im);
  if (start === -1) return empty;
  const tail = markdown.slice(start);

  // prefer a fenced yaml block if present; otherwise scan the raw tail.
  const fence = tail.match(/```ya?ml\n([\s\S]*?)```/i);
  const region = fence ? fence[1] : tail;

  const out = { ...empty };
  const blockNames = {
    key_claims: "keyClaims",
    prescriptions: "prescriptions",
    entities: "entities",
    references: "references",
  };
  const lines = region.split("\n");
  let current = null;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    const header = line.match(/^([a-z_]+):\s*$/i);
    if (header && blockNames[header[1]]) {
      current = blockNames[header[1]];
      continue;
    }
    if (current) {
      const item = line.match(/^\s*-\s+(?:"([^"]+)"|'([^']+)'|(.+))$/);
      if (item) {
        const val = (item[1] || item[2] || item[3] || "").trim();
        if (val && val !== "<empty>" && val !== "none") out[current].push(val);
      } else if (line.match(/^[a-z_]+:/i)) {
        // a sibling block we don't recognize; stop appending.
        current = null;
      }
    }
  }
  return out;
}

// rough token estimate (chars/4). good enough to decide whether to chunk;
// we don't need exactness. matches what anthropic's own docs suggest.
export function estimateTokens(text) {
  return Math.ceil((text || "").length / 4);
}

// split a timestamped transcript into chunks whose token estimate is below
// `targetTokens`. always splits on a [mm:ss] or [hh:mm:ss] boundary so
// timestamps stay aligned. if the transcript has no timestamps, falls back
// to splitting on double newlines, then sentences.
export function chunkTranscript(transcript, targetTokens = 8000) {
  if (!transcript) return [];
  if (estimateTokens(transcript) <= targetTokens) return [transcript];

  // split on timestamp markers but keep them attached to the following text.
  const tsRe = /(\[\d{1,2}:\d{2}(?::\d{2})?\][^\n]*\n?)/g;
  const parts = transcript.split(tsRe).filter(Boolean);

  // if no timestamps, fall back to paragraph split.
  const hasTimestamps = parts.some((p) => /^\[\d{1,2}:\d{2}/.test(p));
  const units = hasTimestamps
    ? parts.filter((p) => /^\[\d{1,2}:\d{2}/.test(p))
    : transcript.split(/\n\n+/);

  const chunks = [];
  let current = "";
  for (const unit of units) {
    if (estimateTokens(current) + estimateTokens(unit) > targetTokens && current) {
      chunks.push(current.trim());
      current = "";
    }
    current += (current ? "\n" : "") + unit;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// per-chunk extraction prompt. cheap, model-agnostic. returns short notes
// the reducer can fold into the final markdown.
function buildChunkPrompt({ chunk, index, total, meta }) {
  const metaLines = [];
  if (meta?.title) metaLines.push(`video: ${meta.title}`);
  if (meta?.channel) metaLines.push(`channel: ${meta.channel}`);
  return [
    `you are extracting notes from chunk ${index + 1} of ${total} of a youtube transcript.`,
    "produce a tight bulleted scratch list. no headings, no commentary. include timestamps from the transcript when you cite quotes.",
    "",
    "sections (use exactly these prefixes, drop a section if nothing applies):",
    "- insight: ...",
    "- quote: \"...\" — speaker [mm:ss]",
    "- claim: ...",
    "- prescription: ...",
    "- entity: name (role)",
    "- reference: title / url / paper",
    "",
    metaLines.length ? metaLines.join("\n") : "",
    "",
    "---",
    "",
    chunk,
  ].join("\n");
}

// reduce step: takes the per-chunk scratch notes and the original system
// prompt, produces the final structured markdown summary. small input
// (notes are short), so this finishes fast even on long videos.
function buildReducePrompt({ corpus, url, today, channelOverride, meta, scratchNotes, root = ROOT }) {
  const systemPrompt = readFileSync(join(root, "prompts", `${corpus}-system.md`), "utf8");
  const metaLines = [];
  if (meta?.title) metaLines.push(`video title: ${meta.title}`);
  if (meta?.channel) metaLines.push(`channel: ${meta.channel}`);
  if (meta?.duration) metaLines.push(`duration: ${meta.duration}`);
  if (meta?.description) {
    const trimmed = String(meta.description).slice(0, 600).replace(/\s+/g, " ").trim();
    if (trimmed) metaLines.push(`description: ${trimmed}`);
  }

  return [
    systemPrompt,
    "",
    "---",
    "",
    "## video metadata",
    "",
    metaLines.length ? metaLines.join("\n") : "(none)",
    "",
    "---",
    "",
    "## scratch notes from chunked extraction",
    "",
    "the source transcript was long, so we ran extraction on chunks first.",
    "below are the consolidated scratch notes from every chunk in order.",
    "synthesize them into the final markdown summary per the template above.",
    "preserve timestamps inside Notable quotes when they came through.",
    "",
    scratchNotes,
    "",
    "---",
    "",
    `the url for this video is: ${url}`,
    `today's date is: ${today}`,
    channelOverride ? `the channel for this video is: ${channelOverride}. use this exact string in the frontmatter "channel:" field.` : "",
    "",
    "substitute these into the PLACEHOLDER_URL and PLACEHOLDER_DATE fields. respond with ONLY the markdown, no commentary, no code fences.",
  ].join("\n");
}

// run extraction over a possibly-long transcript. if the transcript fits in
// a single call, this just delegates to the normal one-shot prompt path.
// otherwise it maps over chunks and reduces.
//
// `runner` is an async fn(prompt) -> string. callers pass either runClaude
// or runClaudeHttp so this stays usable from cli and serverless.
/**
 * @param {{
 *   corpus: string,
 *   url: string,
 *   transcript: string,
 *   channel?: string,
 *   today: string,
 *   meta?: { title?: string, channel?: string, guest?: string, duration?: string, description?: string },
 *   runner: (prompt: string) => Promise<string>,
 *   root?: string,
 *   onLog?: (msg: string) => void,
 *   chunkTargetTokens?: number,
 * }} args
 * @returns {Promise<string>}
 */
export async function extractWithMapReduce({
  corpus,
  url,
  transcript,
  channel,
  today,
  meta,
  runner,
  root = ROOT,
  onLog = () => {},
  chunkTargetTokens = 8000,
}) {
  const total = estimateTokens(transcript);
  if (total <= chunkTargetTokens * 2) {
    onLog(`one-shot path (est tokens=${total})`);
    const prompt = buildPrompt({ corpus, url, transcript, channelOverride: channel, today, meta, root });
    return runner(prompt);
  }

  const chunks = chunkTranscript(transcript, chunkTargetTokens);
  onLog(`map-reduce path: ${chunks.length} chunks (est tokens=${total})`);

  // map: run chunk extraction in parallel (capped to keep concurrency sane).
  const concurrency = 3;
  const scratch = new Array(chunks.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= chunks.length) return;
      const prompt = buildChunkPrompt({ chunk: chunks[i], index: i, total: chunks.length, meta });
      onLog(`chunk ${i + 1}/${chunks.length}: extracting`);
      scratch[i] = `## chunk ${i + 1}\n\n` + (await runner(prompt));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, worker));

  const scratchNotes = scratch.join("\n\n");
  onLog(`reduce: synthesizing final markdown from ${chunks.length} scratch sets`);
  const reducePrompt = buildReducePrompt({ corpus, url, today, channelOverride: channel, meta, scratchNotes, root });
  return runner(reducePrompt);
}

// strip the "## Structured extractions" section + fenced block from the body
// so we don't render the yaml twice (the structured columns are the source
// of truth for those fields). returns the cleaned markdown.
export function stripStructuredExtractions(markdown) {
  if (!markdown) return markdown;
  return markdown.replace(/\n##\s+Structured extractions[\s\S]*$/im, "\n").trimEnd() + "\n";
}

export async function ingest({ corpus, url, transcript, channel, root = ROOT, onLog }) {
  const log = onLog || (() => {});
  if (corpus !== "growth" && corpus !== "brain") {
    throw new Error(`corpus must be "growth" or "brain", got "${corpus}"`);
  }
  const today = new Date().toISOString().slice(0, 10);
  const prompt = buildPrompt({ corpus, url, transcript, channelOverride: channel, today, root });

  log(`calling claude -p (transcript bytes=${transcript.length})`);
  const raw = await runClaude(prompt);
  const videoId = extractVideoId(url);
  const { output, parsed, stem, frontmatterRaw, body, structured } = processOutput({ raw, corpus, channel, today, videoId });

  const summaryPath = join(root, corpus, `${stem}.md`);
  const transcriptPath = join(root, "transcripts", corpus, `${stem}.txt`);

  mkdirSync(dirname(summaryPath), { recursive: true });
  mkdirSync(dirname(transcriptPath), { recursive: true });
  writeFileSync(summaryPath, output);
  writeFileSync(transcriptPath, transcript);
  log(`wrote ${summaryPath}`);

  regenerateIndex(corpus, root);
  log(`regenerated ${corpus}/_index.md`);

  return { summaryPath, transcriptPath, output, parsed, stem, frontmatterRaw, body, structured };
}

// upsert a single knowledge entry into postgres. used by the CLI so
// `node scripts/ingest.mjs ...` keeps the DB in sync without needing the
// dev server running. expects POSTGRES_URL on the env.
// idempotent on slug: re-running with the same stem replaces the row.
export async function persistEntry({ corpus, parsed, stem, frontmatterRaw, body, url, structured }) {
  const postgresUrl = process.env.POSTGRES_URL;
  if (!postgresUrl) throw new Error("POSTGRES_URL not set");
  const { default: postgres } = await import("postgres");
  const sql = postgres(postgresUrl, {
    ssl: "require",
    max: 1,
    prepare: false,
    onnotice: () => {},
  });
  const today = new Date().toISOString().slice(0, 10);
  const row = {
    slug: stem,
    corpus,
    channel: parsed.channel || "unknown",
    guest: parsed.guest || "",
    title: parsed.title || "untitled",
    url: parsed.url || url || "",
    duration: parsed.duration || "",
    ingested_date: parsed.ingested || today,
    vertical: typeof parsed.vertical === "string" ? parsed.vertical : "",
    subvertical: typeof parsed.subvertical === "string" ? parsed.subvertical : "",
    secondary_verticals: flattenList(parsed.secondary_verticals),
    business_area: flattenList(parsed.business_area),
    stage: flattenList(parsed.stage),
    surface: flattenList(parsed.surface),
    tags: flattenList(parsed.tags),
    body,
    frontmatter_raw: frontmatterRaw,
    key_claims: JSON.stringify(structured?.keyClaims || []),
    prescriptions: JSON.stringify(structured?.prescriptions || []),
    entities: JSON.stringify(structured?.entities || []),
    references: JSON.stringify(structured?.references || []),
  };
  try {
    const [entry] = await sql`
      INSERT INTO knowledge_entries ${sql(row)}
      ON CONFLICT (slug) DO UPDATE SET
        channel = EXCLUDED.channel,
        guest = EXCLUDED.guest,
        title = EXCLUDED.title,
        url = EXCLUDED.url,
        duration = EXCLUDED.duration,
        ingested_date = EXCLUDED.ingested_date,
        vertical = EXCLUDED.vertical,
        subvertical = EXCLUDED.subvertical,
        secondary_verticals = EXCLUDED.secondary_verticals,
        business_area = EXCLUDED.business_area,
        stage = EXCLUDED.stage,
        surface = EXCLUDED.surface,
        tags = EXCLUDED.tags,
        body = EXCLUDED.body,
        frontmatter_raw = EXCLUDED.frontmatter_raw,
        key_claims = EXCLUDED.key_claims,
        prescriptions = EXCLUDED.prescriptions,
        entities = EXCLUDED.entities,
        references = EXCLUDED.references
      RETURNING id, slug
    `;
    return entry;
  } finally {
    await sql.end({ timeout: 1 });
  }
}
