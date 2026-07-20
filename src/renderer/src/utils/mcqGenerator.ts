import type { McqDocument, McqQuestion } from '../types'

const MODEL_FALLBACK = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-flash-latest',
  'gemini-1.5-flash'
]

// ── Token estimate (rough) ────────────────────────────────────
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function buildPrompt(content: string, questionCount: number): string {
  return `You are an educator creating multiple-choice questions from study material.
Given the deck content below, create ${questionCount} questions.

Format each question EXACTLY like this:

## Question N
{question text}

A. {option A}
B. {option B}
C. {option C}
D. {option D}

**Answer:** A
**Explanation:** {why this is correct}

---

Rules:
- Each question must have exactly 4 options (A, B, C, D)
- Make sure exactly one answer is correct
- Distractors should be plausible but clearly wrong
- Use --- on its own line as a separator between questions
- Do NOT use any markdown code fences
- Cover EVERY section of the content -- do not skip any part
- Generate exactly ${questionCount} questions

Deck content:
---
${content}
---`
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
}

interface GeminiModel {
  name: string
  supportedGenerationMethods?: string[]
}

/**
 * Generate MCQ questions from text content using Gemini API.
 * Returns an McqDocument ready to save.
 */
export async function generateMcqs(
  content: string,
  questionCount: number,
  apiKey: string,
  sourceFileName: string,
  onProgress?: (msg: string) => void
): Promise<McqDocument> {
  const tokens = estimateTokens(content)
  onProgress?.(`Estimating tokens... ~${tokens.toLocaleString()}`)
  if (tokens > 900000) {
    throw new Error('Content too large for Gemini API (>900K tokens)')
  }

  // Truncate if over 700K tokens
  const maxChars = 700000 * 4
  const truncated = content.length > maxChars ? content.slice(0, maxChars) : content

  const prompt = buildPrompt(truncated, questionCount)
  onProgress?.('Prompt built, trying models...')

  // ── Try model fallback chain ─────────────────────────────────
  let lastError: string = ''

  for (const model of MODEL_FALLBACK) {
    onProgress?.(`Trying ${model}...`)
    try {
      const result = await callGemini(model, prompt, apiKey)
      onProgress?.(`Got response from ${model}, parsing...`)
      return buildDocument(result, sourceFileName, questionCount)
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err)
      onProgress?.(`${model} failed (${lastError}), trying next...`)
      // If 404, try next model. Other errors = bail.
      if (!lastError.includes('404')) throw err
    }
  }

  // ── Fallback: discover available models ───────────────────────
  onProgress?.('Discovering available models...')
  try {
    const model = await discoverModel(apiKey)
    if (model) {
      onProgress?.(`Found ${model}, generating...`)
      const result = await callGemini(model, prompt, apiKey)
      onProgress?.(`Got response, parsing...`)
      return buildDocument(result, sourceFileName, questionCount)
    }
  } catch {
    // ignore discovery errors
  }

  throw new Error(`All Gemini models failed. Last error: ${lastError}`)
}

async function callGemini(model: string, prompt: string, apiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7 }
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!resp.ok) {
    throw new Error(`Gemini ${model} returned ${resp.status}`)
  }

  const data: GeminiResponse = await resp.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Empty response from Gemini')

  return text
}

async function discoverModel(apiKey: string): Promise<string | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  const resp = await fetch(url)
  if (!resp.ok) return null

  const data = await resp.json()
  const models: GeminiModel[] = data.models || []

  const flash = models
    .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
    .filter(m => m.name.includes('flash'))
    .sort((a, b) => b.name.localeCompare(a.name))

  return flash[0]?.name || null
}

function buildDocument(rawText: string, sourceFileName: string, questionCount: number): McqDocument {
  // Strip markdown code fences if Gemini wraps output
  let text = rawText
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:markdown)?\n?/, '').replace(/\n?```$/, '')
  }

  const blocks = text.split(/\n---\n/)
  const questions: McqQuestion[] = []

  for (const block of blocks) {
    const q = parseGeneratedBlock(block)
    if (q) questions.push(q)
  }

  // If parsing failed to get enough questions, be lenient
  if (questions.length === 0) {
    throw new Error('Failed to parse any questions from Gemini response')
  }

  const now = new Date()
  return {
    title: `${sourceFileName} Quiz`,
    source: sourceFileName,
    generated: now.toISOString().slice(0, 16).replace('T', ' '),
    questions: questions.slice(0, questionCount)
  }
}

function parseGeneratedBlock(block: string): McqQuestion | null {
  const lines = block.split('\n')

  // Find question heading
  let questionStart = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Question\s+\d+/i.test(lines[i])) {
      questionStart = i + 1
      break
    }
  }
  if (questionStart < 0) return null

  const questionLines: string[] = []
  const options: string[] = []
  let currentOption = -1
  let answerIdx = -1
  let explanationLines: string[] = []
  let inExplanation = false

  for (let i = questionStart; i < lines.length; i++) {
    const line = lines[i]

    const optMatch = line.match(/^([A-D])\.\s+(.*)/)
    if (optMatch) {
      currentOption++
      options.push(optMatch[2])
      continue
    }

    const ansMatch = line.match(/^\*\*Answer:\*\*\s*([A-D])/)
    if (ansMatch) {
      answerIdx = ansMatch[1].charCodeAt(0) - 65
      inExplanation = false
      continue
    }

    const explMatch = line.match(/^\*\*Explanation:\*\*\s*(.*)/)
    if (explMatch) {
      explanationLines.push(explMatch[1])
      inExplanation = true
      continue
    }

    if (inExplanation) {
      explanationLines.push(line)
    } else if (currentOption >= 0 && options.length <= currentOption) {
      options[currentOption] += '\n' + line
    } else if (questionLines.length > 0 || line.trim()) {
      questionLines.push(line)
    }
  }

  const question = questionLines.join('\n').trim()
  if (!question || options.length < 4 || answerIdx < 0) return null

  return {
    question,
    options: options.slice(0, 4).map(o => o.trim()),
    correctIndex: answerIdx,
    explanation: explanationLines.join('\n').trim() || undefined
  }
}
