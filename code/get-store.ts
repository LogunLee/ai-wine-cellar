import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  const store = await prisma.store.findFirst({ where: { code: 'coolclever' } })
  console.log(JSON.stringify(store, null, 2))
  await prisma.$disconnect()
}
main()
