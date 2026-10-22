const https = require('https');

const TESTS = [
  ['throttle', 'https://ll.thespacedevs.com/2.3.0/api-throttle/'],
  ['upcoming_normal_50', 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=50&format=json'],
  ['upcoming_list_50', 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?mode=list&limit=50&format=json'],
  ['previous_list_30', 'https://ll.thespacedevs.com/2.3.0/launches/previous/?mode=list&limit=30&format=json'],
];

function fetchUrl(url) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = https.get(url, { timeout: 30000, headers: { 'User-Agent': 'SpaceLaunch/1.0' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({ status: res.statusCode, bytes: buf.length, ms: Date.now() - start, body: buf.toString('utf8') });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 'TIMEOUT', bytes: 0, ms: Date.now() - start }); });
    req.on('error', (e) => resolve({ status: 'ERR', bytes: 0, ms: Date.now() - start, err: e.message }));
  });
}

function inspect(obj, prefix, depth) {
  if (depth > 2 || !obj) return [];
  const out = [];
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out.push(`${prefix}${k}`);
      out.push(...inspect(v, `${prefix}${k}.`, depth + 1));
    } else if (v !== null && v !== undefined && v !== '') {
      out.push(`${prefix}${k}`);
    }
  }
  return out;
}

(async () => {
  for (const [name, url] of TESTS) {
    const r = await fetchUrl(url);
    let extra = '';
    if (r.status === 200 && r.body) {
      try {
        const j = JSON.parse(r.body);
        if (Array.isArray(j.results)) {
          extra = `results=${j.results.length} count=${j.count}`;
          if (j.results[0]) {
            const keys = inspect(j.results[0], '', 0);
            extra += `\n    第一条字段: ${keys.join(', ')}`;
            extra += `\n    单条字节: ${Buffer.byteLength(JSON.stringify(j.results[0]))}`;
          }
          if (name === 'throttle') {}
        } else {
          extra = JSON.stringify(j);
        }
      } catch (e) { extra = 'JSON解析失败: ' + e.message; }
    } else if (r.err) extra = r.err;
    console.log(`\n[${name}] status=${r.status} ${r.bytes}B ${r.ms}ms`);
    if (extra) console.log('  ' + extra);
  }
})();
