import { createHash } from 'node:crypto'
import bcrypt from 'bcryptjs'

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

const BCRYPT_ROUNDS = 12

export async function hashPassword(password: string): Promise<string> {
  // 呼叫端必須先驗證過型別。走到這裡還不是字串就是程式錯誤，明說比讓
  // bcrypt 丟出 "Illegal arguments" 好追。
  if (typeof password !== 'string') {
    throw new TypeError(`hashPassword: password must be a string, got ${typeof password}`)
  }
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
  // password 來自 request body，型別註記只是編譯期斷言，擋不住執行期的
  // undefined 或非字串。不是字串就不可能相符，直接回 false —— 別讓它掉進
  // bcrypt.compare（拋 "Illegal arguments"）或 sha256（在 update() 炸開）。
  if (typeof password !== 'string') return false
  // storedHash 不是字串代表 DB 的資料壞了，不能靜默當成「密碼錯誤」，
  // 否則那個帳號會永遠登不進去，而且從回應完全看不出原因。
  if (typeof storedHash !== 'string') {
    throw new TypeError(`verifyPassword: storedHash must be a string, got ${typeof storedHash}`)
  }
  if (isBcryptHash(storedHash)) return bcrypt.compare(password, storedHash)
  return sha256(password) === storedHash
}

/** True when the stored hash is legacy SHA-256 and should be rehashed with bcrypt. */
export function needsRehash(storedHash: string): boolean {
  return !isBcryptHash(storedHash)
}
