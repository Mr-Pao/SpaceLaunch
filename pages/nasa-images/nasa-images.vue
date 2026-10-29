<template>
	<view class="page">
		<nav-bar :solid="true" title="NASA 影像" placeholder />

		<view class="loading" v-if="loading">
			<text class="hint-text">加载中...</text>
		</view>

		<block v-else>
			<!-- 快速筛选：全部 + 各主题，点哪个看哪个 -->
			<view class="tabs-label">快速筛选</view>
			<scroll-view class="tabs" scroll-x :show-scrollbar="false">
				<view
					class="tab"
					v-for="t in tabs"
					:key="t.key"
					:class="{ active: active === t.key }"
					@click="active = t.key"
				>{{ t.name }}<text v-if="t.count > 0" class="tab-count">{{ t.count }}</text></view>
			</scroll-view>

			<view class="stat" v-if="shown.length">
				<text class="stat-text">共 {{ filtered.length }} 张 · 来自 NASA Image Library</text>
			</view>

			<view class="grid" v-if="shown.length">
				<view class="col" v-for="(col, ci) in cols" :key="ci">
					<view
						class="card"
						v-for="(it, i) in col"
						:key="ci + '-' + i"
						@click="openImage(it)"
					>
						<image class="thumb" :src="it.thumb" mode="aspectFill" lazy-load></image>
						<view class="cap">
							<text class="cap-title">{{ it.title }}</text>
							<text class="cap-theme" v-if="it.themeName">{{ it.themeName }}</text>
						</view>
					</view>
				</view>
			</view>

			<view class="empty-box" v-else>
				<text class="empty-icon">🛰️</text>
				<text class="empty-text">NASA 影像还在路上</text>
				<text class="empty-sub">后台正在按主题抓取并转存，过段时间再来看看</text>
			</view>

			<view class="tail" v-if="shown.length < filtered.length">
				<text class="tail-text">下滑加载更多</text>
			</view>
		</block>
	</view>
</template>

<script>
	import spaceData from '@/utils/data.js'

	// 一次露出多少张
	const PAGE = 40

	export default {
		data() {
			return {
				loading: true,
				// 全部图片（已扁平化，带主题）
				all: [],
			// 主题 tab：全部 + 各主题
			tabs: [{ key: 'all', name: '全部', count: 0 }],
				active: 'all',
				shownCount: PAGE
			}
		},

		computed: {
			// 当前主题下的图片
			filtered() {
				if (this.active === 'all') return this.all
				return this.all.filter((x) => x.theme === this.active)
			},

			shown() {
				return this.filtered.slice(0, this.shownCount)
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
			}
		},

		async onLoad() {
			await this.load()
			this.loading = false
		},

		// 切换主题时把已露出数量重置，否则新主题只显示前 40 张里的几条
		watch: {
			active() {
				this.shownCount = PAGE
			}
		},

		onReachBottom() {
			if (this.shownCount < this.filtered.length) {
				this.shownCount = Math.min(this.shownCount + PAGE, this.filtered.length)
			}
		},

		methods: {
			async load() {
				try {
					let d = await spaceData.load('nasaImages').catch(() => null)
					// 老缓存没有 themes（早期 data.js 白名单漏了这个字段），强制回源补齐
					if (d && !(d.themes && d.themes.length)) {
						d = await spaceData.load('nasaImages', { force: true }).catch(() => d)
					}
					const list = (d && d.list) || []
					this.all = list.map((x) => ({
						id: x.id,
						theme: x.theme || '',
						themeName: x.themeName || '',
						title: x.title || '',
						desc: x.desc || '',
						date: x.date || '',
						center: x.center || '',
						thumb: x.thumb || '',
						full: x.full || x.thumb || ''
					}))

				// 主题 tab 由后端 themes 提供（已是过滤掉空主题后的顺序）
				const themes = (d && d.themes) || []
				const total = this.all.length
				this.tabs = [{ key: 'all', name: '全部', count: total }].concat(
					themes.map((t) => ({ key: t.key, name: t.name, count: t.count || 0 }))
				)
				} catch (e) {
					console.warn('[nasa-images] 加载失败', e)
					this.all = []
				}
			},

			openImage(it) {
				if (!it || !it.full) return
				uni.previewImage({
					urls: this.filtered.map((x) => x.full),
					current: it.full
				})
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

/* 快速筛选标签 */
.tabs-label {
	padding: 20rpx 24rpx 4rpx;
	color: #6b7891;
	font-size: 22rpx;
	letter-spacing: 1rpx;
}

/* 主题切换行 */
.tabs {
	white-space: nowrap;
	padding: 6rpx 12rpx 12rpx;
}

.tab {
	display: inline-block;
	margin: 0 6rpx;
	padding: 8rpx 24rpx;
	border-radius: 999rpx;
	background: #131a26;
	color: #8b95a8;
	font-size: 24rpx;
	line-height: 40rpx;
}

.tab.active {
	background: #38bdf8;
	color: #04121f;
	font-weight: 600;
}

/* 主题数量徽标 */
.tab-count {
	margin-left: 8rpx;
	padding: 0 10rpx;
	border-radius: 999rpx;
	background: rgba(255, 255, 255, 0.12);
	color: #8b95a8;
	font-size: 18rpx;
	line-height: 28rpx;
	vertical-align: middle;
}

.tab.active .tab-count {
	background: rgba(4, 18, 31, 0.18);
	color: #04121f;
}

/* 顶部统计 */
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

.card {
	margin-bottom: 12rpx;
	border-radius: 10rpx;
	overflow: hidden;
	background: #131a26;
}

.card:active {
	opacity: 0.92;
}

.thumb {
	display: block;
	width: 100%;
	height: 240rpx;
	background: #0d1420;
}

.cap {
	padding: 12rpx 14rpx 14rpx;
}

.cap-title {
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	overflow: hidden;
	color: #e2e8f0;
	font-size: 23rpx;
	line-height: 32rpx;
}

.cap-theme {
	display: inline-block;
	margin-top: 8rpx;
	padding: 2rpx 10rpx;
	border-radius: 4rpx;
	background: rgba(56, 189, 248, 0.16);
	color: #7dd3fc;
	font-size: 18rpx;
	line-height: 26rpx;
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
</style>
