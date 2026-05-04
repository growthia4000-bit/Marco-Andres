import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LENGTH) as Buffer
}

export function encryptToken(token: string, encryptionKey: string): string {
  if (!token) return ''
  if (!encryptionKey) throw new Error('EMAIL_TOKEN_ENCRYPTION_KEY is required for encryption')

  const salt = randomBytes(16)
  const key = deriveKey(encryptionKey, salt)
  const iv = randomBytes(IV_LENGTH)

  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final(),
  ])

  const authTag = cipher.getAuthTag()

  return Buffer.concat([salt, iv, authTag, encrypted]).toString('base64')
}

export function decryptToken(encryptedData: string, encryptionKey: string): string {
  if (!encryptedData) return ''
  if (!encryptionKey) throw new Error('EMAIL_TOKEN_ENCRYPTION_KEY is required for decryption')

  const buffer = Buffer.from(encryptedData, 'base64')

  const salt = buffer.subarray(0, 16)
  const iv = buffer.subarray(16, 16 + IV_LENGTH)
  const authTag = buffer.subarray(16 + IV_LENGTH, 16 + IV_LENGTH + AUTH_TAG_LENGTH)
  const encrypted = buffer.subarray(16 + IV_LENGTH + AUTH_TAG_LENGTH)

  const key = deriveKey(encryptionKey, salt)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}

export function hasValidEncryptionKey(): boolean {
  const key = process.env.EMAIL_TOKEN_ENCRYPTION_KEY?.trim()
  return Boolean(key && key.length >= 32)
}

export function requireEncryptionKey(): void {
  if (!hasValidEncryptionKey()) {
    throw new Error(
      'EMAIL_TOKEN_ENCRYPTION_KEY must be configured with a 32+ character key to encrypt OAuth tokens'
    )
  }
}