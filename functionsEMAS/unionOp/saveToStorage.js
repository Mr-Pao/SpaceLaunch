module.exports = async (ctx) => {
  try {
    const COS = require('cos-nodejs-sdk-v5');

    const { result: app_secret } = await ctx.mpserverless.db.collection('app_secret').findOne();
    if (!app_secret) {
      return {
        success: false,
        message: '未配置云存储信息'
      };
    }

    const {
      OSS_ENDPOINT,
      OSS_BUCKET,
      OSS_SECRET_ID,
      OSS_SECRET_KEY
    } = app_secret;

    if (!(OSS_ENDPOINT && OSS_BUCKET && OSS_SECRET_ID && OSS_SECRET_KEY)) {
      return {
        success: false,
        message: '云存储配置不完整'
      };
    }

    const region = OSS_ENDPOINT.split('.')[1];
    const cos = new COS({
      SecretId: OSS_SECRET_ID,
      SecretKey: OSS_SECRET_KEY,
    });

    const launches = ctx.args.launches || [];
    if (launches.length === 0) {
      return {
        success: false,
        message: '没有要保存的数据'
      };
    }

    const currentDate = new Date().toISOString().split('T')[0];
    const fileName = `launches_${currentDate}.json`;
    const fileContent = JSON.stringify(launches, null, 2);

    const uploadResult = await new Promise((resolve, reject) => {
      cos.putObject({
        Bucket: OSS_BUCKET,
        Region: region,
        Key: fileName,
        Body: fileContent,
        ContentType: 'application/json'
      }, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });

    const fileUrl = `https://${OSS_BUCKET}.cos.${region}.myqcloud.com/${fileName}`;

    await ctx.mpserverless.db.collection('storage_records').insertOne({
      fileName,
      fileUrl,
      recordCount: launches.length,
      createdAt: new Date(),
      type: 'launch_data'
    });

    return {
      success: true,
      message: '数据保存成功',
      data: {
        fileName,
        fileUrl,
        recordCount: launches.length,
        uploadResult
      }
    };
  } catch (error) {
    console.error('保存数据到云存储失败:', error);
    return {
      success: false,
      message: '保存数据失败',
      error: error.message
    };
  }
};