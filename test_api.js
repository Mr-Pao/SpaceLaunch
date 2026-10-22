const https = require('https');

const url = 'https://lldev.thespacedevs.com/2.3.0/launches/upcoming/';

console.log('\u6B63\u5728\u6D4B\u8BD5 API \u8FDE\u63A5...');

const options = {
  rejectUnauthorized: false
};

https.get(url, options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      console.log('\u6210\u529F: API \u8BF7\u6C42\u6210\u529F');
      console.log('\u72B6\u6001\u7801:', res.statusCode);
      console.log('\u603B\u6761\u6570:', result.count);
      console.log('\u8FD4\u56DE\u6761\u6570:', result.results?.length || 0);
      if (result.results && result.results.length > 0) {
        console.log('\n\u7B2C\u4E00\u6761\u6570\u636E\u9884\u89C8:');
        console.log('ID:', result.results[0].id);
        console.log('\u540D\u79F0:', result.results[0].name);
        console.log('\u65F6\u95F4:', result.results[0].net);
      }
    } catch (error) {
      console.error('\u5931\u8D25: JSON \u89E3\u6790\u5931\u8D25:', error.message);
    }
  });
}).on('error', (error) => {
  console.error('\u5931\u8D25: \u8BF7\u6C42\u5931\u8D25:', error.message);
});