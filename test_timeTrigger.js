const https = require('https');

// 模拟 timeTrigger 的核心逻辑测试
const testTimeTriggerLogic = async () => {
  console.log('=== TimeTrigger 逻辑测试 ===\n');

  // 1. 测试 getLaunches API
  console.log('Step 1: 测试 getLaunches API...');
  try {
    const launches = await fetchLaunches();
    console.log(`? 获取到 ${launches.length} 条发射数据`);
    
    if (launches.length > 0) {
      console.log(`   示例数据: ${launches[0].name}`);
    }
  } catch (error) {
    console.log(`? 获取数据失败: ${error.message}`);
    return;
  }

  // 2. 测试数据处理逻辑
  console.log('\nStep 2: 测试数据处理逻辑...');
  try {
    const filteredData = filterLaunchData([...Array(20).keys()].map(i => ({ id: i, name: `Launch ${i}` })));
    console.log(`? 数据过滤完成，共 ${filteredData.length} 条`);
  } catch (error) {
    console.log(`? 数据处理失败: ${error.message}`);
  }

  // 3. 测试保存逻辑（模拟）
  console.log('\nStep 3: 测试保存逻辑...');
  try {
    const saveResult = await simulateSaveToStorage([{ id: 'test', name: 'Test Launch' }]);
    console.log(`? ${saveResult.message}`);
  } catch (error) {
    console.log(`? 保存失败: ${error.message}`);
  }

  console.log('\n=== TimeTrigger 逻辑测试完成 ===');
};

// 模拟获取发射数据
const fetchLaunches = async () => {
  const url = 'https://lldev.thespacedevs.com/2.3.0/launches/?limit=5&format=json';
  
  return new Promise((resolve, reject) => {
    const req = https.request(new URL(url), { rejectUnauthorized: false }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const result = JSON.parse(data);
        resolve(result.results || []);
      });
    });
    req.on('error', reject);
    req.end();
  });
};

// 模拟数据过滤
const filterLaunchData = (launches) => {
  return launches.filter(l => l.id !== 'launch_sync_state' && l.id !== 'launch_statistics');
};

// 模拟保存到存储
const simulateSaveToStorage = async (data) => {
  return {
    success: true,
    message: `模拟保存成功，共 ${data.length} 条数据`,
    data: {
      fileName: `launches_${new Date().toISOString().split('T')[0]}.json`,
      recordCount: data.length
    }
  };
};

// 执行测试
testTimeTriggerLogic().catch(console.error);