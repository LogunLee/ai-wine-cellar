import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as jwt from 'jsonwebtoken'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  // Get first user
  const user = await prisma.user.findFirst({ where: { deletedAt: null } })
  if (!user) {
    console.log('No users found')
    await prisma.$disconnect()
    return
  }

  // Create a JWT token
  const payload = { sub: user.id, email: user.email }
  const token = jwt.sign(payload, process.env.JWT_SECRET || 'dev-secret-change-in-production', { expiresIn: '1h' })

  console.log('Token:', token)
  console.log('User ID:', user.id)
  console.log('Email:', user.email)

  await prisma.$disconnect()
}
main()
