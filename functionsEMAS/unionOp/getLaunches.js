module.exports = async (ctx) => {
  try {
    const url = 'https://lldev.thespacedevs.com/2.3.0/launches/?limit=10&format=json';
    console.log(`获取发射数据: ${url}`);

    const result = await ctx.httpclient.request(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
      dataType: 'json'
    });

    if (result.status !== 200) {
      return { success: false, message: `请求失败，状态码: ${result.status}` };
    }

    const data = result.data;
    const launches = data.results || [];
    
    if (launches.length === 0) {
      return { success: true, message: '没有新数据', processedCount: 0, newRecordsCount: 0 };
    }

    const updateTime = new Date();
    let newRecordsCount = 0;

    const launchIds = launches.map(l => l.id.toString());
    const { result: existingLaunches } = await ctx.mpserverless.db.collection('Launches').find({
      id: { $in: launchIds }
    });

    const existingIdMap = new Map();
    existingLaunches.forEach(l => existingIdMap.set(l.id, l._id));

    const insertTasks = [];
    const updateTasks = [];

    for (const launch of launches) {
      const launchData = { ...launch, updatedAt: updateTime };
      const existingId = existingIdMap.get(launch.id.toString());

      if (existingId) {
        updateTasks.push(ctx.mpserverless.db.collection('Launches').updateOne(
          { _id: existingId },
          { $set: launchData }
        ));
      } else {
        insertTasks.push(ctx.mpserverless.db.collection('Launches').insertOne(launchData));
        newRecordsCount++;
      }
    }

    if (updateTasks.length > 0) {
      await Promise.all(updateTasks);
    }
    if (insertTasks.length > 0) {
      await Promise.all(insertTasks);
    }

    const { result: countResult } = await ctx.mpserverless.db.collection('Launches').count();

    console.log(`同步完成，处理 ${launches.length} 条，新增 ${newRecordsCount} 条，总数 ${countResult}`);

    return {
      success: true,
      message: '数据同步完成',
      data: {
        processedCount: launches.length,
        newRecordsCount: newRecordsCount,
        totalRecords: countResult
      }
    };
  } catch (error) {
    console.error('获取太空发射数据失败:', error);
    return {
      success: false,
      message: error.message
    };
  }
};