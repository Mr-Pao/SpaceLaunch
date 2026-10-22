module.exports = async (ctx) => {
  try {
    const url = 'https://lldev.thespacedevs.com/2.3.0/launchers/?limit=100&format=json';

    console.log('正在获取发射器数据...');
    console.log(`请求URL: ${url}`);

    const result = await ctx.httpclient.request(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000,
      dataType: 'json'
    });

    if (result.status !== 200) {
      throw new Error(`请求失败，状态码: ${result.status}`);
    }

    const data = result.data;
    const launchers = data.results || [];
    console.log(`获取到 ${launchers.length} 条发射器记录`);

    const updateTime = new Date();
    let newRecordsCount = 0;

    for (const launcher of launchers) {
      const { result: queryResult } = await ctx.mpserverless.db.collection('Launchers').findOne({
        id: launcher.id.toString()
      });

      const launcherData = {
        ...launcher,
        updatedAt: updateTime
      };

      if (queryResult) {
        await ctx.mpserverless.db.collection('Launchers').updateOne({
          _id: queryResult._id
        }, {
          $set: launcherData
        });
      } else {
        await ctx.mpserverless.db.collection('Launchers').insertOne(launcherData);
        newRecordsCount++;
      }
    }

    const { result: countResult } = await ctx.mpserverless.db.collection('Launchers').count();

    console.log(`发射器数据同步完成，新增 ${newRecordsCount} 条记录，数据库总记录数: ${countResult}`);

    return {
      success: true,
      message: '发射器数据同步完成',
      data: {
        processedCount: launchers.length,
        newRecordsCount: newRecordsCount,
        totalRecordsInDatabase: countResult,
        lastSyncTime: updateTime
      }
    };
  } catch (error) {
    console.error('获取发射器数据失败:', error);
    return {
      success: false,
      message: '获取发射器数据失败',
      error: error.message
    };
  }
};