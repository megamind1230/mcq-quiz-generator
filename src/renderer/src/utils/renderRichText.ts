import katex from 'katex'
import hljs from 'highlight.js'

// ponytail: raw content stored by ID, avoids data-attribute HTML escaping issues
const rawContentMap = new Map<string, string>()
let uid = 0

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderLatex(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false })
  } catch {
    return escapeHtml(tex)
  }
}

function nextId(): string {
  return `rc${uid++}`
}

function store(raw: string): string {
  const id = nextId()
  rawContentMap.set(id, raw)
  return id
}

export function getRawContent(id: string): string | undefined {
  return rawContentMap.get(id)
}

export function clearRawContentMap(): void {
  rawContentMap.clear()
}

export function renderRichText(text: string): string {
  const placeholders: string[] = []
  let s = text

  const hold = (html: string): string => {
    const idx = placeholders.length
    placeholders.push(html)
    return `\x00${idx}\x00`
  }

  // 1. Fenced code blocks (must run before inline code)
  s = s.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const trimmed = code.replace(/\n$/, '')
    const id = store(trimmed)
    let highlighted: string
    if (lang && hljs.getLanguage(lang)) {
      highlighted = hljs.highlight(trimmed, { language: lang }).value
    } else {
      highlighted = hljs.highlightAuto(trimmed).value
    }
    return hold(`<div class="rich-block"><pre class="code-block"><code class="hljs language-${lang || 'text'}">${highlighted}</code></pre><button class="copy-btn" data-copy-id="${id}">Copy</button></div>`)
  })

  // 2. Inline code
  s = s.replace(/`([^`]+)`/g, (_, code) => {
    const id = store(code)
    return hold(`<code class="inline-code" data-copy-id="${id}">${escapeHtml(code)}</code>`)
  })

  // 3. Display math $$ ... $$ and \[ ... \]
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (_, tex) => {
    const trimmed = tex.trim()
    const id = store(trimmed)
    return hold(`<div class="rich-block">${renderLatex(trimmed, true)}<button class="copy-btn" data-copy-id="${id}">Copy</button></div>`)
  })
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, (_, tex) => {
    const trimmed = tex.trim()
    const id = store(trimmed)
    return hold(`<div class="rich-block">${renderLatex(trimmed, true)}<button class="copy-btn" data-copy-id="${id}">Copy</button></div>`)
  })

  // 4. Inline math $ ... $ and \( ... \)
  s = s.replace(/\$([^\$\n]+?)\$/g, (_, tex) => {
    const trimmed = tex.trim()
    const id = store(trimmed)
    return hold(`<span class="inline-math" data-copy-id="${id}">${renderLatex(trimmed, false)}</span>`)
  })
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, (_, tex) => {
    const trimmed = tex.trim()
    const id = store(trimmed)
    return hold(`<span class="inline-math" data-copy-id="${id}">${renderLatex(trimmed, false)}</span>`)
  })

  // 5. Escape remaining HTML, restore placeholders
  s = escapeHtml(s)
  s = s.replace(/\x00(\d+)\x00/g, (_, i) => placeholders[Number(i)])

  // 6. Line breaks
  s = s.replace(/\n/g, '<br>')

  return s
}
