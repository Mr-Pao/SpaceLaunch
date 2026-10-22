const https = require('https');

const ENDPOINTS = {
  upcoming: 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?mode=detailed&limit=50&format=json',
  previous: 'https://ll.thespacedevs.com/2.3.0/launches/previous/?mode=detailed&limit=20&format=json',
  events: 'https://ll.thespacedevs.com/2.3.0/events/upcoming/?limit=50&format=json',
  agencies: 'https://ll.thespacedevs.com/2.3.0/agencies/?limit=100&format=json',
  launchers_cfg: 'https://ll.thespacedevs.com/2.3.0/config/launcher/?limit=100&format=json',
  launchers_old: 'https://ll.thespacedevs.com/2.3.0/launchers/?limit=20&format=json',
  throttle: 'https://ll.thespacedevs.com/2.3.0/api-throttle/',
};

function fetchUrl(url) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = https.get(url, { timeout: 20000, headers: { 'User-Agent': 'SpaceLaunch/1.0' } }, (res) => {
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

(async () => {
  for (const [name, url] of Object.entries(ENDPOINTS)) {
    const r = await fetchUrl(url);
    let extra = '';
    if (r.status === 200 && r.body) {
      try {
        const j = JSON.parse(r.body);
        if (Array.isArray(j.results)) extra = `results=${j.results.length} count=${j.count}`;
        else if (j.throttle) extra = `throttle=${JSON.stringify(j)}`;
      } catch (e) { extra = 'JSON解析失败'; }
    } else if (r.err) extra = r.err;
    console.log(`${name.padEnd(14)} status=${String(r.status).padEnd(8)} ${String(r.bytes).padStart(9)}B ${String(r.ms).padStart(6)}ms  ${extra}`);
  }
})();
