module.exports = async (ctx) => {
  try {
    const page = ctx.args.page || 1;
    const size = ctx.args.size || 10;
    const skip = (page - 1) * size;

    const { result: queryResult } = await ctx.mpserverless.db.collection('Events')
      .find()
      .orderBy('date', 'desc')
      .skip(skip)
      .limit(size);

    const { result: countResult } = await ctx.mpserverless.db.collection('Events').count();

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
    console.error('查询事件数据失败:', error);
    return {
      success: false,
      message: '查询事件数据失败',
      error: error.message
    };
  }
};