const https = require('https');

module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    return "v1.2"
  }

  const triggerName = ctx.triggerName || 'unknown';
  console.log(`触发器 ${triggerName} 被触发`);

  try {
    // 串行执行，减少超时风险
    const results = [];
    
    console.log('Step 1: 同步 Launches...');
    results.push(await syncData(ctx, 'Launches', 'https://lldev.thespacedevs.com/2.3.0/launches/?limit=20&format=json'));

    console.log('Step 2: 同步 Launchers...');
    results.push(await syncData(ctx, 'Launchers', 'https://lldev.thespacedevs.com/2.3.0/launchers/?limit=20&format=json'));

    console.log('Step 3: 同步 Agencies...');
    results.push(await syncData(ctx, 'Agencies', 'https://lldev.thespacedevs.com/2.3.0/agencies/?limit=20&format=json'));

    console.log('Step 4: 同步 Events...');
    results.push(await syncData(ctx, 'Events', 'https://lldev.thespacedevs.com/2.3.0/events/?limit=20&format=json'));

    const totalNew = results.reduce((sum, r) => sum + (r.newRecordsCount || 0), 0);
    const totalProcessed = results.reduce((sum, r) => sum + (r.processedCount || 0), 0);

    console.log(`定时任务完成，共处理 ${totalProcessed} 条记录，新增 ${totalNew} 条`);

    return {
      success: true,
      message: '定时任务执行完成',
      results
    };
  } catch (error) {
    console.error('定时任务执行失败:', error);
    return {
      success: false,
      message: error.message
    };
  }
};

// 通用同步函数
const syncData = async (ctx, collectionName, apiUrl) => {
  try {
    console.log(`开始同步 ${collectionName}...`);
    
    const data = await fetchFromApi(apiUrl);
    const items = data.results || [];
    
    if (items.length === 0) {
      return { success: true, message: `${collectionName} 没有新数据`, processedCount: 0, newRecordsCount: 0 };
    }

    const updateTime = new Date();
    let newRecordsCount = 0;

    // 逐条处理，确保稳定
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      const { result: existing } = await ctx.mpserverless.db.collection(collectionName).findOne({
        id: item.id.toString()
      });

      const itemData = {
        ...item,
        updatedAt: updateTime
      };

      if (existing) {
        await ctx.mpserverless.db.collection(collectionName).updateOne({
          _id: existing._id
        }, {
          $set: itemData
        });
      } else {
        await ctx.mpserverless.db.collection(collectionName).insertOne(itemData);
        newRecordsCount++;
      }
    }

    console.log(`${collectionName} 同步完成，新增 ${newRecordsCount} 条`);

    return {
      success: true,
      message: `${collectionName} 同步完成`,
      processedCount: items.length,
      newRecordsCount: newRecordsCount
    };
  } catch (error) {
    console.error(`${collectionName} 同步失败:`, error);
    return {
      success: false,
      message: `${collectionName} 同步失败: ${error.message}`
    };
  }
};

// 从API获取数据
const fetchFromApi = async (url) => {
  return new Promise((resolve, reject) => {
    const options = {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
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