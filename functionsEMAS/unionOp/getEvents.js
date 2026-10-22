module.exports = async (ctx) => {
  try {
    const url = 'https://lldev.thespacedevs.com/2.3.0/events/?limit=100&format=json';

    console.log('正在获取事件数据...');
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
    const events = data.results || [];
    console.log(`获取到 ${events.length} 条事件记录`);

    const updateTime = new Date();
    let newRecordsCount = 0;

    for (const event of events) {
      const { result: queryResult } = await ctx.mpserverless.db.collection('Events').findOne({
        id: event.id.toString()
      });

      const eventData = {
        ...event,
        updatedAt: updateTime
      };

      if (queryResult) {
        await ctx.mpserverless.db.collection('Events').updateOne({
          _id: queryResult._id
        }, {
          $set: eventData
        });
      } else {
        await ctx.mpserverless.db.collection('Events').insertOne(eventData);
        newRecordsCount++;
      }
    }

    const { result: countResult } = await ctx.mpserverless.db.collection('Events').count();

    console.log(`事件数据同步完成，新增 ${newRecordsCount} 条记录，数据库总记录数: ${countResult}`);

    return {
      success: true,
      message: '事件数据同步完成',
      data: {
        processedCount: events.length,
        newRecordsCount: newRecordsCount,
        totalRecordsInDatabase: countResult,
        lastSyncTime: updateTime
      }
    };
  } catch (error) {
    console.error('获取事件数据失败:', error);
    return {
      success: false,
      message: '获取事件数据失败',
      error: error.message
    };
  }
};