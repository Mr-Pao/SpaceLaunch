<template>
	<view class="page">
		<nav-bar :solid="true" title="发射视频" placeholder />

		<view class="loading" v-if="loading">
			<text class="hint-text">加载中...</text>
		</view>

		<block v-else>
			<!-- 顶部统计：可播放数 / 总视频数，让用户知道有多少能直接看 -->
			<view class="stat" v-if="all.length">
				<text class="stat-text">共 {{ all.length }} 段视频 · 其中 {{ playableCount }} 段可小程序内播放</text>
			</view>

			<view class="grid" v-if="shown.length">
				<view class="col" v-for="(col, ci) in cols" :key="ci">
					<view
						class="vcard"
						v-for="(v, i) in col"
						:key="ci + '-' + i"
						@click="openVideo(v)"
					>
						<view class="vcover">
							<image class="vcover-img" :src="v.thumb" mode="aspectFill" lazy-load></image>
							<view class="vplay"></view>
							<text class="vtag" v-if="v.official">官方</text>
							<!-- 可播放徽标：能直接看的打勾，只能复制链接的标「链接」-->
							<text class="vbadge" :class="v.playable ? 'ok' : 'link'" v-if="v.playable">可播</text>
							<text class="vbadge link" v-else>链接</text>
						</view>
						<text class="vtitle">{{ v.title }}</text>
						<text class="vmeta" v-if="v.publisher">@{{ v.publisher }}</text>
						<text class="vmeta dim" v-if="v.net">{{ fmtDate(v.net) }}</text>
					</view>
				</view>
			</view>

			<view class="empty-box" v-else>
				<text class="empty-icon">🎬</text>
				<text class="empty-text">还没有视频</text>
				<text class="empty-sub">后台正在逐条抓取并转存，过段时间再来看看</text>
			</view>

			<view class="tail" v-if="shown.length < all.length">
				<text class="tail-text">下滑加载更多</text>
			</view>
		</block>

		<!-- 内联播放遮罩 -->
		<view class="player-mask" v-if="playing" @click="closePlayer">
			<video
				v-if="playing && playing.cosUrl"
				class="player"
				:src="playing.cosUrl"
				controls
				autoplay
				:show-center-play-btn="true"
				object-fit="contain"
				@click.stop
			></video>
			<view class="player-bar" @click.stop>
				<text class="player-title">{{ playing.title }}</text>
				<text class="player-close" @click="closePlayer">✕</text>
			</view>
		</view>
	</view>
</template>

<script>
	import spaceData from '@/utils/data.js'

	// 每次从全部列表里露出多少段
	const PAGE = 60

	export default {
		data() {
			return {
				loading: true,
				// 全部可展示视频（已扁平化、带发射上下文）
				all: [],
				// 当前已渲染的数量（上拉加载）
				shownCount: PAGE,
				playing: null
			}
		},

		computed: {
			shown() {
				return this.all.slice(0, this.shownCount)
			},

			// 两列均分
			cols() {
				const left = []
				const right = []
				this.shown.forEach((v, i) => {
					if (i % 2 === 0) left.push(v)
					else right.push(v)
				})
				return [left, right]
			},

			playableCount() {
				return this.all.filter((v) => v.playable).length
			}
		},

		async onLoad() {
			await this.load()
			this.loading = false
		},

		onReachBottom() {
			if (this.shownCount < this.all.length) {
				this.shownCount = Math.min(this.shownCount + PAGE, this.all.length)
			}
		},

		methods: {
			async load() {
				try {
					const d = await spaceData.load('videos').catch(() => null)
					const list = (d && d.list) || []
					// 扁平化：发射 → 它的每条视频，带上发射名/时间做上下文
					const flat = []
					for (const row of list) {
						const vids = row.vids || []
						for (const v of vids) {
							if (!v || !v.url) continue
							flat.push({
								url: v.url,
								title: v.title || row.name || '发射视频',
								publisher: v.publisher || '',
								official: v.tid === 1 || v.kind === 'Official Webcast',
								cover: v.cover || '',
								thumb: v.cover || '',
								net: row.net || '',
								mins: v.mins || 0,
								cosUrl: v.cosUrl || '',
								playable: Boolean(v.cosUrl),
								sourceType: v.sourceType || ''
							})
						}
					}
					this.all = flat
				} catch (e) {
					console.warn('[video-gallery] 加载失败', e)
					this.all = []
				}
			},

			fmtDate(net) {
				const t = new Date(net)
				if (isNaN(t.getTime())) return ''
				const y = t.getFullYear()
				const m = String(t.getMonth() + 1).padStart(2, '0')
				const d = String(t.getDate()).padStart(2, '0')
				return `${y}-${m}-${d}`
			},

			openVideo(v) {
				if (v && v.playable && v.cosUrl) {
					this.playing = v
					return
				}
				uni.setClipboardData({
					data: v.url,
					success: () => {
						uni.showToast({ title: '链接已复制，可到浏览器打开', icon: 'none' })
					}
				})
			},

			closePlayer() {
				this.playing = null
			}
		}
	}
</script>

<style lang="scss" scoped>
@import '../../styles/list.scss';

.page {
	min-height: 100vh;
	background: #0a0e17;
}

.loading {
	min-height: 60vh;
	display: flex;
	align-items: center;
	justify-content: center;
}

.hint-text {
	color: #6b7891;
	font-size: 26rpx;
}

/* 顶部一行统计 */
.stat {
	padding: 20rpx 24rpx 4rpx;
}

.stat-text {
	color: #8b95a8;
	font-size: 22rpx;
}

/* 两列瀑布流 */
.grid {
	display: flex;
	align-items: flex-start;
	padding: 8rpx 8rpx 0;
}

.col {
	flex: 1;
	min-width: 0;
	padding: 0 4rpx;
}

.vcard {
	margin-bottom: 12rpx;
	border-radius: 10rpx;
	overflow: hidden;
	background: #131a26;
}

.vcover {
	position: relative;
	width: 100%;
	height: 220rpx;
}

.vcover-img {
	display: block;
	width: 100%;
	height: 100%;
	background: #0d1420;
}

.vplay {
	position: absolute;
	left: 50%;
	top: 50%;
	width: 64rpx;
	height: 64rpx;
	margin: -32rpx 0 0 -32rpx;
	border-radius: 50%;
	background: rgba(0, 0, 0, 0.45);
}

.vplay::after {
	content: '';
	position: absolute;
	left: 24rpx;
	top: 20rpx;
	width: 0;
	height: 0;
	border-left: 20rpx solid rgba(255, 255, 255, 0.95);
	border-top: 12rpx solid transparent;
	border-bottom: 12rpx solid transparent;
}

.vtag {
	position: absolute;
	left: 10rpx;
	top: 10rpx;
	padding: 2rpx 10rpx;
	border-radius: 4rpx;
	background: rgba(0, 0, 0, 0.55);
	color: #ffffff;
	font-size: 18rpx;
	line-height: 26rpx;
}

.vbadge {
	position: absolute;
	right: 10rpx;
	top: 10rpx;
	padding: 2rpx 10rpx;
	border-radius: 4rpx;
	font-size: 18rpx;
	line-height: 26rpx;
}

.vbadge.ok {
	background: rgba(56, 189, 248, 0.92);
	color: #04121f;
	font-weight: 600;
}

.vbadge.link {
	background: rgba(0, 0, 0, 0.55);
	color: #cfe6ff;
}

.vtitle {
	display: block;
	padding: 12rpx 12rpx 0;
	color: #e2e8f0;
	font-size: 23rpx;
	line-height: 32rpx;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.vmeta {
	display: block;
	padding: 4rpx 12rpx 12rpx;
	color: #7d8ba0;
	font-size: 20rpx;
	line-height: 28rpx;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.vmeta.dim {
	color: #4d5a6e;
}

/* 空态 */
.empty-box {
	width: 100%;
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 120rpx 0;
}

.empty-icon {
	font-size: 60rpx;
	margin-bottom: 16rpx;
}

.empty-text {
	color: #8b95a8;
	font-size: 26rpx;
}

.empty-sub {
	margin-top: 10rpx;
	color: #4d5a6e;
	font-size: 22rpx;
	text-align: center;
	line-height: 1.6;
}

.tail {
	display: flex;
	justify-content: center;
	padding: 20rpx 0 40rpx;
}

.tail-text {
	color: #4d5a6e;
	font-size: 22rpx;
}

/* 内联播放遮罩 */
.player-mask {
	position: fixed;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	z-index: 50;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	background: rgba(4, 6, 10, 0.94);
}

.player {
	width: 100%;
	height: 78vh;
	background: #000;
}

.player-bar {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 24rpx 28rpx calc(24rpx + env(safe-area-inset-bottom));
	box-sizing: border-box;
	background: linear-gradient(to top, rgba(4, 6, 10, 0.9) 0%, rgba(4, 6, 10, 0) 100%);
}

.player-title {
	flex: 1;
	min-width: 0;
	padding-right: 24rpx;
	color: #e2e8f0;
	font-size: 24rpx;
	line-height: 34rpx;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.player-close {
	flex-shrink: 0;
	width: 56rpx;
	height: 56rpx;
	line-height: 56rpx;
	text-align: center;
	border-radius: 50%;
	background: rgba(255, 255, 255, 0.12);
	color: #ffffff;
	font-size: 30rpx;
}
</style>
