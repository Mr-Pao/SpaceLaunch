// 发射详情页「分享 / 收藏 / 提醒」三按钮的真机预览：
// 样式来自编译后的 launch-detail.wxss，新增的铃铛样式按源码补在这里
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(import.meta.dirname, '..')
const V = 'data-v-c197e325'

const rpx2px = (css) => css.replace(/(-?[\d.]+)rpx/g, (_, n) => parseFloat(n) / 2 + 'px')
const wxss = rpx2px(
	fs.readFileSync(
		path.join(ROOT, 'unpackage/dist/dev/mp-weixin/components/launch-detail/launch-detail.wxss'),
		'utf8'
	)
)

const acts = (onFav, onRemind) => `
  <view class="when ${V}" style="margin:0 0 14px">
    <view class="when-top ${V}" style="margin-bottom:14px">
      <text class="when-title ${V}" style="color:#e2e8f0;font-size:15px;font-weight:600">发射时刻</text>
      <view class="meta-acts ${V}">
        <view class="share-btn ${V}">
          <text class="share-icon ${V}">⤴</text>
          <text class="share-text ${V}">分享</text>
        </view>
        <view class="fav ${V} ${onFav ? 'on' : ''}">
          <text class="fav-icon ${V}">${onFav ? '★' : '☆'}</text>
          <text class="fav-text ${V}">${onFav ? '已收藏' : '收藏'}</text>
        </view>
        <view class="remind ${V} ${onRemind ? 'on' : ''}">
          <view class="remind-bell ${V}"></view>
          <text class="remind-text ${V}">${onRemind ? '已提醒' : '提醒'}</text>
        </view>
      </view>
    </view>
    <text class="when-clock ${V}" style="color:#fff;font-size:20px;font-weight:600">20:41:00</text>
  </view>`

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  view, text { display: block; }
  body { margin: 0; width: 375px; background: #0a0e17; padding: 14px; }
  .note { color: #ffd166; font: 600 11px/1.5 -apple-system, sans-serif; margin-bottom: 10px; }
  .label { color: #6b7891; font: 11px/1.4 -apple-system, sans-serif; margin: 0 0 6px 2px; }
${wxss}
  /* 本轮样式已由 HBuilderX 编译进 launch-detail.wxss（.remind-bell / padding 20rpx
     都在里面），所以这里不再手写补丁 —— 预览的每一行都来自真实产物 */
</style></head>
<body>
  <div class="note">预览：分享 / 收藏 / 提醒 三个胶囊（真实 wxss + 本轮新增铃铛样式）</div>
  <div class="label">默认态</div>
  ${acts(false, false)}
  <div class="label">已收藏 + 已提醒</div>
  ${acts(true, true)}
  <div class="label">放大 2× 看图标笔画粗细是否一致</div>
  <view class="when ${V}" style="margin:0;zoom:2">
    <view class="meta-acts ${V}" style="justify-content:flex-start">
      <view class="share-btn ${V}"><text class="share-icon ${V}">⤴</text><text class="share-text ${V}">分享</text></view>
      <view class="fav ${V}"><text class="fav-icon ${V}">☆</text><text class="fav-text ${V}">收藏</text></view>
      <view class="remind ${V}"><view class="remind-bell ${V}"></view><text class="remind-text ${V}">提醒</text></view>
    </view>
  </view>
</body></html>`

fs.writeFileSync(path.join(ROOT, 'preview-meta.html'), html, 'utf8')
console.log('已生成 preview-meta.html')
