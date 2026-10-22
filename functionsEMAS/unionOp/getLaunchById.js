module.exports = async (ctx) => {
  try {
    const launchId = ctx.args.launchId;
    
    if (!launchId) {
      return {
        success: false,
        message: '缺少launchId参数'
      };
    }

    const { result: launch } = await ctx.mpserverless.db.collection('Launches').findOne({
      id: launchId.toString()
    });

    if (!launch) {
      return {
        success: false,
        message: '未找到对应的发射记录'
      };
    }

    return {
      success: true,
      data: launch
    };
  } catch (error) {
    console.error('获取发射详情失败:', error);
    return {
      success: false,
      message: '获取发射详情失败',
      error: error.message
    };
  }
};