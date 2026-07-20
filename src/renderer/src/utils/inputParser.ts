/**
 * Extract readable text from input files (.txt, .md, .org).
 * Strips frontmatter, headings, org metadata — returns plain content.
 */
export function extractContent(raw: string, ext: string): string {
  if (ext === '.org') return extractOrg(raw)
  if (ext === '.md') return extractMd(raw)
  return raw // .txt — plain text, no processing
}

function extractOrg(raw: string): string {
  const lines = raw.split('\n')
  const out: string[] = []
  let inBlock = false

  for (const line of lines) {
    // Track block state
    if (/^#\+BEGIN_/i.test(line)) { inBlock = true; continue }
    if (/^#\+END_/i.test(line)) { inBlock = false; continue }
    if (inBlock) continue

    // Skip org metadata lines
    if (/^#\+/.test(line)) continue
    // Strip org bold/italic markup
    const clean = line
      .replace(/\*([^*]+)\*/g, '$1')   // *bold*
      .replace(/\/([^/]+)\//g, '$1')    // /italic/
      .replace(/=([^=]+)=/g, '$1')      // =code=
    out.push(clean)
  }

  return out.join('\n').trim()
}

function extractMd(raw: string): string {
  let content = raw

  // Strip YAML frontmatter
  if (content.startsWith('---')) {
    const end = content.indexOf('---', 3)
    if (end > 0) content = content.slice(end + 3)
  }

  // Strip markdown headings to plain text
  content = content.replace(/^#{1,6}\s+/gm, '')

  // Strip bold/italic markers
  content = content
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')

  return content.trim()
}
