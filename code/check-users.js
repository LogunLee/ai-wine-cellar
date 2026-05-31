const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const { Pool } = require('pg')
const bcrypt = require('bcrypt')

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ai_wine_cellar' })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })

  const users = await prisma.user.findMany({
    include: { credential: true },
  })
  console.log('Users:')
  users.forEach(u => {
    console.log(`  ${u.email} | displayName: ${u.displayName} | hasCredential: ${!!u.credential}`)
  })

  const user = users.find(u => u.email === 'test@test.com')
  if (user && user.credential) {
    const testPassword = 'test123'
    const isValid = await bcrypt.compare(testPassword, user.credential.passwordHash)
    console.log(`\nPassword 'test123' valid: ${isValid}`)
    
    if (!isValid) {
      const newHash = await bcrypt.hash('test123', 12)
      await prisma.userCredential.update({
        where: { userId: user.id },
        data: { passwordHash: newHash },
      })
      console.log('Updated password to test123')
    }
  }

  await prisma.$disconnect()
  await pool.end()
}

main().catch(console.error)
