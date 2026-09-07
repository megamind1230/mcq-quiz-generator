import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

// ── App-embedded key (obfuscation, not unbreakable security) ────
// A fixed key baked into every copy of the app. The goal is to deter
// casual reading/sharing, not to defend against a motivated attacker
// who could extract this key from the app itself.
const KEY = createHash('sha256').update('mcq-quiz-generator-encrypted-output-key-2026').digest()

const ALGO = 'aes-256-gcm'
const HEADER = 'encrypted-mcq-v1'

export function isEncrypted(payload: string): boolean {
  return payload.startsWith(HEADER + '|')
}

export function encryptMcq(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, KEY, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  const parts = [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')]
  return `${HEADER}|${parts.join(':')}`
}

export function decryptMcq(payload: string): string | null {
  if (!isEncrypted(payload)) return payload
  const body = payload.slice(HEADER.length + 1)
  const [ivB64, tagB64, dataB64] = body.split(':')
  if (!ivB64 || !tagB64 || !dataB64) return null
  try {
    const decipher = createDecipheriv(ALGO, KEY, Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final()
    ])
    return decrypted.toString('utf-8')
  } catch {
    return null
  }
}
