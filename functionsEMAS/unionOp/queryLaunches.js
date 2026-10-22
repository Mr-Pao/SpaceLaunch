module.exports = async (ctx) => {
  try {
    const page = ctx.args.page || 1;
    const size = ctx.args.size || 5;
    const skip = (page - 1) * size;

    const filter = {
      _id: { $nin: ['launch_sync_state', 'launch_statistics'] }
    };

    const { result: queryResult } = await ctx.mpserverless.db.collection('Launches')
      .find(filter)
      .orderBy('net', 'desc')
      .skip(skip)
      .limit(size);

    const { result: countResult } = await ctx.mpserverless.db.collection('Launches').count(filter);

    return {
      success: true,
      data: {
        list: queryResult,
        total: countResult,
        page,
        size
      }
    };
  } catch (error) {
    console.error('查询数据失败:', error);
    return {
      success: false,
      message: '查询数据失败',
      error: error.message
    };
  }
};