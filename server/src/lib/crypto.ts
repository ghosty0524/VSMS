import { createHash } from 'node:crypto'
import bcrypt from 'bcryptjs'

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

const BCRYPT_ROUNDS = 12

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

function isBcryptHash(hash: string): boolean {
  return hash.startsWith('$2')
}

/**
 * Verifies a password against a stored hash. Supports legacy unsalted SHA-256
 * hashes (pre-migration accounts) alongside bcrypt.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (isBcryptHash(storedHash)) return bcrypt.compare(password, storedHash)
  return sha256(password) === storedHash
}

/** True when the stored hash is legacy SHA-256 and should be rehashed with bcrypt. */
export function needsRehash(storedHash: string): boolean {
  return !isBcryptHash(storedHash)
}
