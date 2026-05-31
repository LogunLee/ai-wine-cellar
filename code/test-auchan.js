const https = require('https');

const options = {
  hostname: 'www.auchan.ru',
  path: '/api/v1/products?category=alkogol/vino&page=1&size=20',
  method: 'GET',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'application/json',
  },
};

const req = https.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers:`, res.headers);
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log(`Body (${data.length} chars):`);
    console.log(data.substring(0, 1000));
  });
});

req.on('error', (e) => {
  console.error(`Error: ${e.message}`);
});

req.end();
