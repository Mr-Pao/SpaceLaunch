const https = require('https');

// 模拟 EMAS 云函数的 httpclient.request
const httpRequest = (url, options) => {
  return new Promise((resolve, reject) => {
    const httpsOptions = {
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 30000,
      rejectUnauthorized: false
    };

    const req = https.request(new URL(url), httpsOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          data: options.dataType === 'json' ? JSON.parse(data) : data
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
};

// 测试所有 API 端点
const testApis = async () => {
  const apis = [
    { name: 'Launches', url: 'https://lldev.thespacedevs.com/2.3.0/launches/?limit=5&format=json' },
    { name: 'Launchers', url: 'https://lldev.thespacedevs.com/2.3.0/launchers/?limit=5&format=json' },
    { name: 'Agencies', url: 'https://lldev.thespacedevs.com/2.3.0/agencies/?limit=5&format=json' },
    { name: 'Events', url: 'https://lldev.thespacedevs.com/2.3.0/events/?limit=5&format=json' }
  ];

  console.log('=== EMAS 云函数 API 连接测试 ===\n');

  for (const api of apis) {
    console.log(`测试 ${api.name} API...`);
    console.log(`URL: ${api.url}`);
    
    try {
      const result = await httpRequest(api.url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
        dataType: 'json'
      });

      if (result.status === 200) {
        const count = result.data.results?.length || 0;
        console.log(`? 成功! 获取到 ${count} 条记录`);
        if (count > 0) {
          console.log(`   第一条数据: ${result.data.results[0].name || result.data.results[0].title}`);
        }
      } else {
        console.log(`? 失败! 状态码: ${result.status}`);
      }
    } catch (error) {
      console.log(`? 错误: ${error.message}`);
    }
    console.log('');
  }

  console.log('=== 测试完成 ===');
};

// 执行测试
testApis().catch(console.error);