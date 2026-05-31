import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  await prisma.discountOffer.deleteMany({})
  await prisma.rawOffer.deleteMany({})
  await prisma.scrapeJob.deleteMany({})
  console.log('Cleared all discount data')
  await prisma.$disconnect()
}
main()
