import 'dotenv/config'

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjNmQ3NDhkNC05NjFlLTRiZGYtYTBmMi1hMDM2NmQwMzNkYzkiLCJlbWFpbCI6ImxvZ3VuX2xlZUBtYWlsLnJ1IiwiaWF0IjoxNzc5MTkyNTA5LCJleHAiOjE3NzkxOTYxMDl9.CDObUWroLb4lBFwtA3t-zUmP255ZLZUEjFmyVoX1n_w'
const storeId = '2ebe8a42-be98-4db5-8247-9054f2f4b401'

async function main() {
  console.log('Triggering scrape job...')
  const response = await fetch(`http://localhost:3000/admin/discount-stores/${storeId}/run`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  const text = await response.text()
  console.log(`Status: ${response.status}`)
  console.log(`Response: ${text}`)
}
main()
