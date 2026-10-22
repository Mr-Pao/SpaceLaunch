module.exports = async (ctx) => {
  try {
    const url = 'https://lldev.thespacedevs.com/2.3.0/agencies/?limit=100&format=json';

    console.log('正在获取机构数据...');
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
    const agencies = data.results || [];
    console.log(`获取到 ${agencies.length} 条机构记录`);

    const updateTime = new Date();
    let newRecordsCount = 0;

    for (const agency of agencies) {
      const { result: queryResult } = await ctx.mpserverless.db.collection('Agencies').findOne({
        id: agency.id.toString()
      });

      const agencyData = {
        ...agency,
        updatedAt: updateTime
      };

      if (queryResult) {
        await ctx.mpserverless.db.collection('Agencies').updateOne({
          _id: queryResult._id
        }, {
          $set: agencyData
        });
      } else {
        await ctx.mpserverless.db.collection('Agencies').insertOne(agencyData);
        newRecordsCount++;
      }
    }

    const { result: countResult } = await ctx.mpserverless.db.collection('Agencies').count();

    console.log(`机构数据同步完成，新增 ${newRecordsCount} 条记录，数据库总记录数: ${countResult}`);

    return {
      success: true,
      message: '机构数据同步完成',
      data: {
        processedCount: agencies.length,
        newRecordsCount: newRecordsCount,
        totalRecordsInDatabase: countResult,
        lastSyncTime: updateTime
      }
    };
  } catch (error) {
    console.error('获取机构数据失败:', error);
    return {
      success: false,
      message: '获取机构数据失败',
      error: error.message
    };
  }
};