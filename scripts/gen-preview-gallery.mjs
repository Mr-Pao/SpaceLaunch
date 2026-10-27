// 图库页预览：抽 gallery.vue 的真实样式 + COS 上的真实图片
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(import.meta.dirname, '..')
const CDN = 'https://spacelaunch-1258113633.cos.ap-chengdu.myqcloud.com/space-data'

const vue = fs.readFileSync(path.join(ROOT, 'pages/gallery/gallery.vue'), 'utf8')
let css = vue.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1]
css = css.replace(/@import[^;]+;/g, '')
css = css.replace(/(-?[\d.]+)rpx/g, (_, n) => parseFloat(n) / 2 + 'px')

const g = await (await fetch(CDN + '/gallery.json?t=' + Date.now())).json()
const imgs = ((g && g.list) || []).filter((x) => x && x.thumb)
const total = (g && g.count) || imgs.length

const rows = [[], [], [], [], [], []]
imgs.slice(0, 72).forEach((x, i) => rows[i % 6].push(x))

const cell = (x, i, cls) => `
  <view class="cell ${cls}">
    <image class="cell-img" style="background-image:url('${x.thumb}');background-size:cover;background-position:center;animation-delay:${(i % 12) * 45}ms"></image>
    <view class="cell-veil"></view>
  </view>`

const band = (arr, cls, t) => `
  <view class="band">
    <view class="track ${t}">${arr.concat(arr).map((x, i) => cell(x, i, cls)).join('')}</view>
  </view>`

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
* { box-sizing: border-box; }
view, text { display: block; }
body { margin: 0; background: #05080d; display: flex; justify-content: center; padding: 20px 0; }
.phone { position: relative; width: 375px; height: 812px; overflow: hidden; border-radius: 26px;
         box-shadow: 0 30px 80px rgba(0,0,0,.7); }
.sb { position: absolute; top: 0; left: 0; right: 0; height: 44px; z-index: 30;
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 16px; color: #fff; font: 600 13px/1 -apple-system, sans-serif; }
.caps { width: 82px; height: 30px; border-radius: 15px; border: 1px solid rgba(255,255,255,.22);
        background: rgba(0,0,0,.3); }
/* 悬浮胶囊 tabBar 占位 */
.tabbar { position: absolute; left: 50%; transform: translateX(-50%); bottom: 26px; z-index: 30;
          width: 300px; height: 54px; border-radius: 27px; background: rgba(12,18,28,.82);
          border: 1px solid rgba(255,255,255,.08); display: flex; align-items: center;
          justify-content: space-around; color: #6b7891; font: 500 10px/1 -apple-system, sans-serif; }
.tabbar .on { color: #38bdf8; }
button { font: inherit; border: none; background: none; color: inherit; }
${css}
</style></head>
<body>
<div class="phone">
  <view class="page" style="height:812px;padding-bottom:100px">
    <view class="stage">
      <view class="bands">
        ${band(rows[0], 'wide', 't1')}
        ${band(rows[1], 'tall', 't2')}
        ${band(rows[2], 'wide', 't3')}
        ${band(rows[3], 'tall', 't4')}
        ${band(rows[4], 'wide', 't5')}
        ${band(rows[5], 'tall', 't6')}
      </view>
      <view class="fade top"></view>
      <view class="fade bottom"></view>
      <view class="fade left"></view>
      <view class="fade right"></view>
    </view>

    <view class="hud" style="top:56px">
      <view class="hud-row">
        <view class="hud-dot"></view>
        <text class="hud-kicker">SPACE GALLERY</text>
        <text class="hud-sep">/</text>
        <text class="hud-count">${total} 张</text>
      </view>
      <view class="hud-line"></view>
    </view>

    <text class="wall-tip">点任意一张查看发射详情</text>

    <view class="dock">
      <view class="all-btn">
        <text class="all-text">看全部</text>
        <text class="all-num">${total}</text>
        <text class="all-arrow">›</text>
      </view>
    </view>

    <view class="sb"><text>21:12</text><view class="caps"></view></view>
    <view class="tabbar">
      <text>今日</text><text>发射</text><text class="on">图库</text><text>火箭</text><text>我的</text>
    </view>
  </view>
</div>
</body></html>`

fs.writeFileSync(path.join(ROOT, 'preview-gallery.html'), html, 'utf8')
console.log('已生成 preview-gallery.html；图片', imgs.length, '张，总数', total)
