import { readFile } from 'fs/promises'
import { join, dirname } from 'path'

// ── Self-contained CSS for exports ─────────────────────────────
// KaTeX CSS references fonts via url(fonts/...). We inline those
// fonts as base64 data URIs so the exported HTML/PDF is fully
// self-contained (no external font files needed).

let cached: { katexCss: string; hljsCss: string } | null = null

const MIME: Record<string, string> = {
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf'
}

async function embedFonts(cssText: string, cssDir: string): Promise<string> {
  const re = /url\(fonts\/([^)]+)\)/g
  let result = cssText
  for (const match of cssText.matchAll(re)) {
    const filename = match[1]
    try {
      const buf = await readFile(join(cssDir, 'fonts', filename))
      const ext = filename.split('.').pop() || ''
      const mime = MIME[ext] || 'application/octet-stream'
      const dataUri = `data:${mime};base64,${buf.toString('base64')}`
      result = result.split(match[0]).join(`url(${dataUri})`)
    } catch { /* leave as-is if font missing */ }
  }
  return result
}

export async function getExportAssets(): Promise<{ katexCss: string; hljsCss: string }> {
  if (cached) return cached
  const katexCssPath = require.resolve('katex/dist/katex.min.css')
  const hljsCssPath = require.resolve('highlight.js/styles/github-dark.css')
  const rawKatex = await readFile(katexCssPath, 'utf-8')
  const hljsCss = await readFile(hljsCssPath, 'utf-8')
  const katexCss = await embedFonts(rawKatex, dirname(katexCssPath))
  cached = { katexCss, hljsCss }
  return cached
}
