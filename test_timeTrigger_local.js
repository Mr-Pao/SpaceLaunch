const https = require('https');

// 模拟 EMAS ctx 对象
const mockCtx = {
  args: {},
  triggerName: 'test_trigger',
  mpserverless: {
    db: {
      collection: (name) => ({
        findOne: async (query) => {
          console.log(`[模拟DB] findOne ${name}:`, JSON.stringify(query));
          return { result: null }; // 模拟没有找到记录
        },
        insertOne: async (data) => {
          console.log(`[模拟DB] insertOne ${name}:`, data.id || 'new');
          return { success: true };
        },
        updateOne: async (query, update) => {
          console.log(`[模拟DB] updateOne ${name}:`, query._id || query.id);
          return { success: true };
        },
        count: async () => {
          return { result: Math.floor(Math.random() * 100) + 50 };
        }
      })
    }
  }
};

// 从API获取数据
const fetchFromApi = async (url) => {
  return new Promise((resolve, reject) => {
    const options = {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: 20000,
      rejectUnauthorized: false
    };

    const req = https.request(new URL(url), options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON解析失败: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('请求超时'));
    });

    req.end();
  });
};

// 通用同步函数（简化版）
const syncData = async (collectionName, apiUrl) => {
  try {
    console.log(`\n=== 开始同步 ${collectionName} ===`);
    console.log(`API URL: ${apiUrl}`);
    
    const data = await fetchFromApi(apiUrl);
    const items = data.results || [];
    
    console.log(`获取到 ${items.length} 条数据`);
    
    if (items.length === 0) {
      return { success: true, message: `${collectionName} 没有新数据`, processedCount: 0, newRecordsCount: 0 };
    }

    // 只处理前3条作为测试
    const testItems = items.slice(0, 3);
    let newRecordsCount = 0;

    for (const item of testItems) {
      console.log(`处理: ${item.name || item.title || item.id}`);
      newRecordsCount++;
    }

    console.log(`${collectionName} 同步完成，测试处理 ${testItems.length} 条`);

    return {
      success: true,
      message: `${collectionName} 同步完成`,
      processedCount: testItems.length,
      newRecordsCount: newRecordsCount
    };
  } catch (error) {
    console.error(`${collectionName} 同步失败:`, error.message);
    return {
      success: false,
      message: `${collectionName} 同步失败: ${error.message}`
    };
  }
};

// 测试主函数
const testTimeTrigger = async () => {
  console.log('=== TimeTrigger 本地测试 ===\n');

  try {
    // 并行执行所有同步任务
    const results = await Promise.all([
      syncData('Launches', 'https://lldev.thespacedevs.com/2.3.0/launches/?limit=5&format=json'),
      syncData('Launchers', 'https://lldev.thespacedevs.com/2.3.0/launchers/?limit=5&format=json'),
      syncData('Agencies', 'https://lldev.thespacedevs.com/2.3.0/agencies/?limit=5&format=json'),
      syncData('Events', 'https://lldev.thespacedevs.com/2.3.0/events/?limit=5&format=json')
    ]);

    console.log('\n=== 测试结果汇总 ===');
    results.forEach(r => {
      console.log(`${r.success ? '?' : '?'} ${r.message}`);
    });

    const totalProcessed = results.reduce((sum, r) => sum + (r.processedCount || 0), 0);
    console.log(`\n总计处理 ${totalProcessed} 条数据`);

    return {
      success: results.every(r => r.success),
      message: results.every(r => r.success) ? '所有测试通过' : '部分测试失败'
    };
  } catch (error) {
    console.error('测试失败:', error.message);
    return { success: false, message: error.message };
  }
};

// 执行测试
testTimeTrigger().then(result => {
  console.log(`\n最终结果: ${result.success ? '? 成功' : '? 失败'}`);
  console.log(result.message);
}).catch(console.error);