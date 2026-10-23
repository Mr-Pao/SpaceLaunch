<template>
	<view class="page">
		<view class="header">
			<text class="title">运载火箭</text>
			<text class="subtitle">{{ rockets.length }} 个型号 · 按发射次数排序</text>
		</view>

		<view class="loading" v-if="loading && !rockets.length">
			<text class="hint-text">加载中...</text>
		</view>

		<view class="empty" v-else-if="!rockets.length">
			<text class="empty-icon">🛰️</text>
			<text class="hint-text">暂无火箭数据</text>
			<view class="btn" @click="getData(true)">重新加载</view>
		</view>

		<view class="list" v-else>
			<view class="card" v-for="r in rockets" :key="r.id" hover-class="card-hover" @click="goRocket(r)">
				<image v-if="r.image" class="thumb" :src="r.image" mode="aspectFill" lazy-load></image>
				<view v-else class="thumb thumb-empty">
					<text class="thumb-icon">🚀</text>
				</view>

				<view class="info">
					<text class="name">{{ r.name }}</text>

					<view class="meta">
						<text class="count">{{ r.count }} 次</text>
						<text class="dot">·</text>
						<text class="rate">成功率 {{ r.rate }}</text>
					</view>

					<view class="foot">
						<text class="last">{{ r.lastText }}</text>
						<text class="arrow">›</text>
					</view>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import { relativeTime, formatShort } from '@/utils/format.js'
import { syncTabBar } from '@/utils/tabbar.js'

const OK = ['Success', 'Deployed']
const BAD = ['Failure', 'Partial']

export default {
	data() {
		return {
			loading: true,
			rockets: []
		}
	},

	onLoad() {
		this.getData()
	},

	onShow() {
		syncTabBar(0)
	},

	onPullDownRefresh() {
		this.getData(true).then(() => uni.stopPullDownRefresh())
	},

	methods: {
		async getData(force) {
			this.loading = true
			try {
				// 一个型号的发射分散在即将发射和历史里，两边都要扫
				const [up, prev] = await Promise.all([
					spaceData.load('upcoming', { force: !!force }),
					spaceData.load('previous', { force: !!force })
				])

				const all = [...((prev && prev.list) || []), ...((up && up.list) || [])]
				const map = new Map()

				for (const x of all) {
					const c = x.rocket && x.rocket.configuration
					if (!c || !c.id) continue

					let row = map.get(c.id)
					if (!row) {
						row = {
							id: c.id,
							name: c.full_name || c.name || '未命名型号',
							count: 0,
							ok: 0,
							bad: 0,
							lastNet: '',
							image: ''
						}
						map.set(c.id, row)
					}

					row.count++
					const s = x.status && x.status.abbrev
					if (OK.indexOf(s) !== -1) row.ok++
					else if (BAD.indexOf(s) !== -1) row.bad++

					// ISO 时间字符串直接比大小就是比时间
					if (x.net && x.net > row.lastNet) {
						row.lastNet = x.net
						if (x.image) row.image = x.image
					}
				}

				this.rockets = [...map.values()]
					.sort((a, b) => b.count - a.count)
					.map((r) => {
						const decided = r.ok + r.bad
						return {
							...r,
							rate: decided ? Math.round((r.ok / decided) * 100) + '%' : '—',
							lastText: r.lastNet
								? relativeTime(r.lastNet) + '（' + formatShort(r.lastNet) + '）'
								: '暂无记录'
						}
					})
			} catch (e) {
				console.warn('[rockets] 聚合失败', e)
			} finally {
				this.loading = false
			}
		},

		goRocket(r) {
			uni.navigateTo({
				url: '/pages/rocket/rocket?id=' + r.id + '&name=' + encodeURIComponent(r.name)
			})
		}
	}
}
</script>

<style lang="scss" scoped>
@import '../../styles/list.scss';

.page {
	min-height: 100vh;
	padding: 0 24rpx 200rpx;
	background: #0a0e17;
	box-sizing: border-box;
}

.header {
	padding: 40rpx 8rpx 26rpx;
}

.title {
	display: block;
	color: #ffffff;
	font-size: 44rpx;
	font-weight: 600;
	letter-spacing: 2rpx;
}

.subtitle {
	display: block;
	margin-top: 10rpx;
	color: #6b7891;
	font-size: 24rpx;
}

.card {
	display: flex;
	width: 100%;
	margin-bottom: 20rpx;
	padding: 20rpx;
	box-sizing: border-box;
	background: #141a26;
	border-radius: 20rpx;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
}

.card-hover {
	background: #1a2231;
}

.thumb {
	width: 150rpx;
	height: 150rpx;
	flex-shrink: 0;
	border-radius: 14rpx;
	background: #0f1520;
}

.thumb-empty {
	display: flex;
	align-items: center;
	justify-content: center;
	background: linear-gradient(135deg, #16233a 0%, #0d1420 100%);
}

.thumb-icon {
	font-size: 48rpx;
	opacity: 0.35;
}

.info {
	flex: 1;
	min-width: 0;
	margin-left: 22rpx;
	display: flex;
	flex-direction: column;
}

.name {
	color: #ffffff;
	font-size: 30rpx;
	font-weight: 600;
	line-height: 1.4;
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	overflow: hidden;
}

.meta {
	display: flex;
	align-items: center;
	margin-top: 12rpx;
}

.count {
	color: #38bdf8;
	font-size: 26rpx;
}

.dot {
	margin: 0 10rpx;
	color: #3d4a5c;
	font-size: 22rpx;
}

.rate {
	color: #8a97a8;
	font-size: 24rpx;
}

.foot {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-top: auto;
}

.last {
	color: #4a5568;
	font-size: 22rpx;
}

.arrow {
	color: #3d4a5c;
	font-size: 30rpx;
	line-height: 1;
}
</style>
