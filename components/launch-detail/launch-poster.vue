<template>
	<!-- 分享海报：入口按钮 + 离屏画布。canvas 必须和绘制代码在同一个组件实例里，
	     createSelectorQuery().in(this) 才选得到它，所以整块一起搬过来 -->
	<view>
				<!-- 分享海报：canvas 离屏绘制任务卡片图，可保存到相册 / 发朋友圈 -->
				<view class="card" v-if="!reviewMode">
					<view class="card-title">分享</view>
					<view class="poster-btn" hover-class="poster-btn-hover" @click="makePoster">
						<text class="poster-btn-text">🖼 生成分享海报</text>
					</view>
				</view>
				<!-- 离屏画布：绘制 600x960 逻辑像素的竖版卡片，导出后保存到相册 -->
				<canvas type="2d" id="poster" class="poster-canvas"></canvas>
	</view>
</template>

<script>
import { formatDateTime, launchTitle, rocketName as rocketNameOf } from '@/utils/format.js'

export default {
	name: 'launch-poster',

	props: {
		detail: { type: Object, default: null },
		reviewMode: { type: Boolean, default: false }
	},

	computed: {
		// 「长征四号乙 | 未知载荷」：型号和任务名都走中文，翻不出来才回退原串
		displayName() {
			return launchTitle(this.detail)
		},
	},

	methods: {
		// ==================== 分享海报 ====================

		/** 入口：生成海报并保存到相册（canvas 2d 离屏绘制） */
		async makePoster() {
			const d = this.detail
			if (!d) return
			// #ifdef MP-WEIXIN
			try {
				uni.showLoading({ title: '生成中…', mask: true })
				const imgPath = await this._posterImage(d.image)
				const { canvas, ctx, W, H } = await this._posterCanvas()
				await this._drawPoster(canvas, ctx, W, H, imgPath)
				// 给绘制留一帧落盘的时间
				await new Promise((r) => setTimeout(r, 120))
				const res = await new Promise((resolve, reject) =>
					wx.canvasToTempFilePath({ canvas, success: resolve, fail: reject })
				)
				uni.hideLoading()
				this._shareOrSave(res.tempFilePath)
			} catch (e) {
				uni.hideLoading()
				const msg = (e && e.errMsg) || ''
				if (msg.indexOf('auth') !== -1 || msg.indexOf('denied') !== -1) {
					this._albumAuthModal()
				} else {
					console.warn('[launchInfo] 海报生成失败', e)
					uni.showToast({ title: '生成失败，请重试', icon: 'none' })
				}
			}
			// #endif
		},

		/** 任务图下载成本地路径；失败或没有图就返回 null（海报退化为纯背景） */
		_posterImage(url) {
			if (!url) return Promise.resolve(null)
			return new Promise((resolve) => {
				uni.downloadFile({
					url,
					success: (res) => resolve(res.statusCode === 200 ? res.tempFilePath : null),
					fail: () => resolve(null)
				})
			})
		},

		/** 拿 canvas 2d 节点，按 dpr 放大物理像素保证清晰度 */
		_posterCanvas() {
			return new Promise((resolve, reject) => {
				uni
					.createSelectorQuery()
					.in(this)
					.select('#poster')
					.fields({ node: true, size: true })
					.exec((res) => {
						const node = res && res[0] && res[0].node
						if (!node) return reject(new Error('canvas node not found'))
						const W = 600
						const H = 960
						const dpr = (uni.getSystemInfoSync().pixelRatio) || 2
						node.width = W * dpr
						node.height = H * dpr
						const ctx = node.getContext('2d')
						ctx.scale(dpr, dpr)
						resolve({ canvas: node, ctx, W, H })
					})
			})
		},

		/**
		 * 卡片内容（600x960 竖版）：
		 * 顶部任务图（cover 裁剪 + 底部渐隐）→ 标题（≤2 行）→ 状态/时间 →
		 * 火箭/机构/工位三行（长文本自动缩字号，尽量不截断）→ 分隔线 →
		 * 左下品牌文案 + 右下小程序码（static/qrcode.jpg，缺失则只画文字）。
		 */
		_drawPoster(canvas, ctx, W, H, imgPath) {
			const d = this.detail || {}
			return new Promise((resolve) => {
				const IMG_H = 320
				const PAD = 44

				// 背景
				const bg = ctx.createLinearGradient(0, 0, 0, H)
				bg.addColorStop(0, '#101a2e')
				bg.addColorStop(1, '#0a0e17')
				ctx.fillStyle = bg
				ctx.fillRect(0, 0, W, H)

				const paint = (qrImg) => {
					// 图底渐隐到背景色，图文衔接不生硬
					const fade = ctx.createLinearGradient(0, IMG_H - 90, 0, IMG_H)
					fade.addColorStop(0, 'rgba(10,14,23,0)')
					fade.addColorStop(1, '#0a0e17')
					ctx.fillStyle = fade
					ctx.fillRect(0, IMG_H - 90, W, 90)

					// ---- 标题：最多两行 ----
					let y = IMG_H + 76
					ctx.fillStyle = '#ffffff'
					ctx.font = 'bold 40px sans-serif'
					y = this._wrapText(ctx, this.displayName || '太空发射任务', PAD, W - PAD * 2, 54, 2, y)

					// ---- 状态（带圆点）+ 时间（独立一行，不再挤在一起）----
					const zh = (d.status && d.status.nameZh) || (d.status && d.status.abbrev) || ''
					y += 34
					if (zh) {
						ctx.fillStyle = '#38bdf8'
						ctx.beginPath()
						ctx.arc(PAD + 6, y - 9, 6, 0, Math.PI * 2)
						ctx.fill()
						ctx.font = 'bold 28px sans-serif'
						ctx.fillText(zh, PAD + 24, y)
					}
					y += 42
					ctx.fillStyle = '#8a97a8'
					ctx.font = '27px sans-serif'
					ctx.fillText(formatDateTime(d.net) || '', PAD, y)

					// ---- 火箭 / 机构 / 工位：固定锚点排布，长文本逐级缩字号 ----
					const rows = [
						['火箭', rocketNameOf(d) || (d.rocket && d.rocket.configuration && d.rocket.configuration.name) || ''],
						['机构', (d.launch_service_provider && d.launch_service_provider.name) || ''],
						['工位', (d.pad && d.pad.name ? d.pad.name + ' · ' : '') + ((d.pad && d.pad.location && d.pad.location.name) || '')]
					]
					const rowY = [640, 688, 736]
					const valX = PAD + 84
					for (let i = 0; i < rows.length; i++) {
						const label = rows[i][0]
						const value = rows[i][1]
						if (!value) continue
						ctx.font = '24px sans-serif'
						ctx.fillStyle = '#4a5568'
						ctx.fillText(label, PAD, rowY[i])
						// 值从 27px 起，放不下逐级降到 22px，仍放不下才截断
						const maxW = W - PAD - valX
						let size = 27
						ctx.font = size + 'px sans-serif'
						while (size > 22 && ctx.measureText(value).width > maxW) {
							size -= 1
							ctx.font = size + 'px sans-serif'
						}
						ctx.fillStyle = '#e2e8f0'
						ctx.fillText(this._ellipsis(ctx, value, maxW), valX, rowY[i])
					}

					// ---- 分隔线 ----
					ctx.strokeStyle = 'rgba(255,255,255,0.08)'
					ctx.beginPath()
					ctx.moveTo(PAD, 784)
					ctx.lineTo(W - PAD, 784)
					ctx.stroke()

					// ---- 右下：小程序码（白底圆角衬托）----
					if (qrImg) {
						const S = 132
						const qx = W - PAD - S
						const qy = H - PAD - S
						ctx.fillStyle = '#ffffff'
						this._roundRect(ctx, qx - 10, qy - 10, S + 20, S + 20, 14)
						ctx.fill()
						ctx.drawImage(qrImg, qx, qy, S, S)
					}

					// ---- 左下：品牌文案（右边界让开二维码）----
					const brandW = qrImg ? W - PAD - 152 - 40 - PAD : W - PAD * 2
					ctx.fillStyle = '#8a97a8'
					ctx.font = 'bold 32px sans-serif'
					ctx.fillText('太空发射任务', PAD, 830)
					ctx.fillStyle = '#4a5568'
					ctx.font = '24px sans-serif'
					ctx.fillText(this._ellipsis(ctx, '看发射 · 查火箭 · 懂航天', brandW), PAD, 872)
					ctx.fillStyle = '#4a5568'
					ctx.font = '22px sans-serif'
					ctx.fillText(this._ellipsis(ctx, '扫码打开小程序', brandW), PAD, 908)
					resolve()
				}

				/**
				 * 小程序码来源：项目根目录「小程序码.jpg」（公众平台下载的固定码）。
				 * 无服务端调不了 getUnlimited（要 access_token），生成不了带 scene
				 * 的任务直达码，固定码只能指向首页——可接受。文件缺失时静默跳过。
				 */
				const loadQr = () => {
					const qr = canvas.createImage()
					qr.onload = () => paint(qr)
					qr.onerror = () => paint(null)
					qr.src = '/static/qrcode.jpg'
				}

				if (imgPath) {
					// cover 裁剪画顶部图
					const img = canvas.createImage()
					img.onload = () => {
						const scale = Math.max(W / img.width, IMG_H / img.height)
						const dw = img.width * scale
						const dh = img.height * scale
						ctx.drawImage(img, (W - dw) / 2, (IMG_H - dh) / 2, dw, dh)
						loadQr()
					}
					img.onerror = loadQr
					img.src = imgPath
				} else {
					loadQr()
				}
			})
		},

		/** 圆角矩形路径（海报白底衬托用） */
		_roundRect(ctx, x, y, w, h, r) {
			ctx.beginPath()
			ctx.moveTo(x + r, y)
			ctx.arcTo(x + w, y, x + w, y + h, r)
			ctx.arcTo(x + w, y + h, x, y + h, r)
			ctx.arcTo(x, y + h, x, y, r)
			ctx.arcTo(x, y, x + w, y, r)
			ctx.closePath()
		},

		/** 多行文本绘制，返回结束 y */
		_wrapText(ctx, text, x, maxWidth, lineHeight, maxLines, y) {
			const lines = []
			let line = ''
			for (const ch of String(text)) {
				if (ctx.measureText(line + ch).width > maxWidth) {
					lines.push(line)
					line = ch
					if (lines.length >= maxLines - 1) break
				} else {
					line += ch
				}
			}
			if (line) lines.push(line)
			for (const l of lines.slice(0, maxLines)) {
				ctx.fillText(l, x, y)
				y += lineHeight
			}
			return y
		},

		_ellipsis(ctx, text, maxWidth) {
			const t = String(text)
			if (ctx.measureText(t).width <= maxWidth) return t
			let s = t
			while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1)
			return s + '…'
		},

		/**
		 * 海报生成后的出口：优先拉起原生「图片分享菜单」——
		 * 里面有「发送给朋友」（把海报图直接发到聊天）和「保存图片」，
		 * 转发 / 存相册一步到位，正好补上未认证小程序发不了卡片的空。
		 * 基础库不支持 showShareImageMenu 时退回只存相册。
		 */
		_shareOrSave(filePath) {
			const ok = typeof wx !== 'undefined' && typeof wx.showShareImageMenu === 'function'
			if (ok) {
				wx.showShareImageMenu({
					path: filePath,
					fail: (e) => {
						const msg = (e && e.errMsg) || ''
						// 用户主动关菜单不算失败
						if (msg.indexOf('cancel') !== -1) return
						if (msg.indexOf('auth') !== -1 || msg.indexOf('denied') !== -1) {
							this._albumAuthModal()
						} else {
							this._saveToAlbum(filePath).catch(() => {})
						}
					}
				})
			} else {
				this._saveToAlbum(filePath).catch(() => this._albumAuthModal())
			}
		},

		/** 相册权限被拒时的引导弹窗 */
		_albumAuthModal() {
			uni.showModal({
				title: '需要相册权限',
				content: '保存海报需要相册权限，请在设置中开启',
				confirmText: '去设置',
				success: (r) => {
					if (r.confirm) uni.openSetting()
				}
			})
		},

		_saveToAlbum(filePath) {
			return new Promise((resolve, reject) => {
				uni.saveImageToPhotosAlbum({
					filePath,
					success: () => {
						uni.showToast({ title: '已保存到相册', icon: 'success' })
						resolve()
					},
					fail: reject
				})
			})
		},
	}
}
</script>

<style lang="scss" scoped>
/* 海报入口卡片用的还是正文那套 .card，scoped 样式得在本文件再写一份 */
/* 卡片 */
.card {
	margin-top: 28rpx;
	padding: 28rpx 30rpx;
	background: #141a26;
	border-radius: 20rpx;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
}

.card-title {
	color: #38bdf8;
	font-size: 30rpx;
	font-weight: 600;
	margin-bottom: 20rpx;
}

.poster-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 20rpx 0;
	background: rgba(56, 189, 248, 0.12);
	border: 1rpx solid rgba(56, 189, 248, 0.4);
	border-radius: 14rpx;
}

.poster-btn-hover {
	background: rgba(56, 189, 248, 0.24);
}

.poster-btn-text {
	color: #38bdf8;
	font-size: 28rpx;
}

/* 离屏画布：不参与布局也不可见，但 canvas 2d 照常绘制 */
.poster-canvas {
	position: fixed;
	left: -9999px;
	top: 0;
	width: 600px;
	height: 960px;
}
</style>
