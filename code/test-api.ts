import 'dotenv/config'

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjNmQ3NDhkNC05NjFlLTRiZGYtYTBmMi1hMDM2NmQwMzNkYzkiLCJlbWFpbCI6ImxvZ3VuX2xlZUBtYWlsLnJ1IiwiaWF0IjoxNzc5MTkyNTA5LCJleHAiOjE3NzkxOTYxMDl9.CDObUWroLb4lBFwtA3t-zUmP255ZLZUEjFmyVoX1n_w'

async function main() {
  const response = await fetch('http://localhost:3000/discounts/offers?page=1&limit=5&sort=discountPercent_desc', {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })

  const data = await response.json()
  console.log(`Total: ${data.total}`)
  console.log(`Page: ${data.page}, Limit: ${data.limit}`)
  console.log('\n=== FIRST 5 OFFERS ===')
  data.items.forEach((item: any, i: number) => {
    console.log(`\n${i + 1}. ${item.wineName || item.wineNameRaw}`)
    console.log(`   Producer: ${item.producer}`)
    console.log(`   Price: ${item.currentPrice} ${item.currency}`)
    console.log(`   Old Price: ${item.oldPrice}`)
    console.log(`   Discount: ${item.discountPercent}%`)
    console.log(`   Country: ${item.country}`)
    console.log(`   Type: ${item.wineType}`)
    console.log(`   Confidence: ${item.confidence}`)
  })
}
main()
