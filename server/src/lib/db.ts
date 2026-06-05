// server/src/lib/db.ts
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'

function parseDbUrl(raw: string) {
  const u = new URL(raw)
  return {
    host: u.hostname,
    port: Number(u.port) || 3306,
    user: u.username,
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1),
  }
}

function createPrisma() {
  // PrismaMariaDb is a factory — pass connection config (not a pre-built pool)
  // allowPublicKeyRetrieval: MySQL 8+ uses caching_sha2_password which requires RSA key exchange
  const adapter = new PrismaMariaDb({
    ...parseDbUrl(process.env.DATABASE_URL!),
    allowPublicKeyRetrieval: true,
  })
  return new PrismaClient({ adapter })
}

const globalForPrisma = global as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma ?? createPrisma()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
