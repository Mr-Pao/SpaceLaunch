<template>
	<view class="page">
		<nav-bar :solid="navSolid" :title="navSolid ? exp.name : ''" />

		<view class="loading" v-if="loading">
			<text class="hint-text">加载中...</text>
		</view>
		<view class="empty" v-else-if="!exp.id">
			<text class="empty-text">未找到该远征队</text>
		</view>

		<block v-else>
			<!-- padding-top 动态让出状态栏+胶囊（fixed 导航不占位），写死会顶进胶囊区域 -->
			<view class="head" :style="{ paddingTop: statusBarH + 52 + 'px' }">
				<text class="name">{{ expeditionName(exp.name) }}</text>
				<text class="name-en" v-if="exp.name && expeditionName(exp.name) !== exp.name">{{ exp.name }}</text>
				<view class="sub">
					<text class="range">{{ rangeText }}</text>
					<text class="state" :class="exp.end ? 'gone' : 'on'">{{ exp.end ? '已结束' : '进行中' }}</text>
				</view>
				<view class="station" v-if="exp.stationId" @click="goStation">
					<text class="station-label">空间站</text>
					<text class="station-name">{{ exp.stationName || '未知' }}</text>
					<text class="arrow">›</text>
				</view>
			</view>

			<view class="card" v-if="exp.patches.length">
				<view class="card-title">任务徽章</view>
				<view class="patches">
					<image
						v-for="(p, i) in exp.patches"
						:key="i"
						class="patch"
						:src="p"
						mode="aspectFit"
						@click="preview(p)"
					/>
				</view>
			</view>

			<view class="card">
				<view class="card-title">乘组（{{ exp.crew.length }} 人）</view>
				<view class="crew" v-for="(m, i) in exp.crew" :key="m.id || i" @click="goAstro(m)">
					<image v-if="m.img" class="avatar" :src="m.img" mode="aspectFill" />
					<view v-else class="avatar avatar-ph"><text>🧑‍🚀</text></view>
					<view class="crew-info">
						<text class="crew-name">{{ m.name }}</text>
						<text class="crew-sub">{{ m.role }}<text v-if="m.agency"> · {{ m.agency }}</text></text>
					</view>
					<text class="arrow">›</text>
				</view>
			</view>

			<view class="footer-hint"><text>数据来源 The Space Devs</text></view>
		</block>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import navMixin from '@/utils/nav-mixin.js'
import { expeditionName as expeditionNameOf } from '@/utils/format.js'

export default {
	mixins: [navMixin],

	data() {
		return {
			loading: true,
			navSolid: false,
			exp: {}
		}
	},

	computed: {
		rangeText() {
			const s = this.dayOf(this.exp.start)
			const end = this.exp.end ? this.dayOf(this.exp.end) : '至今'
			return s + ' — ' + end
		}
	},

	onPageScroll(e) {
		const solid = e.scrollTop > 120
		if (solid !== this.navSolid) this.navSolid = solid
	},

	async onLoad(query) {
		const id = (query && query.id) || ''
		try {
			const d = await spaceData.load('expeditions')
			const list = (d && d.list) || []
			this.exp = list.find((x) => String(x.id) === String(id)) || {}
		} catch (e) {
			console.warn('[expedition] 加载失败', e)
		}
		this.loading = false
	},

	methods: {
		expeditionName(name) {
			return expeditionNameOf(name)
		},

		dayOf(v) {
			const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v || ''))
			return m ? m[1] : ''
		},
		preview(url) {
			if (url) uni.previewImage({ urls: [url], current: url })
		},
		goStation() {
			if (this.exp.stationId != null)
				uni.navigateTo({ url: '/pages/station/station?id=' + this.exp.stationId })
		},
		goAstro(m) {
			if (m && m.id != null) uni.navigateTo({ url: '/pages/astronaut/astronaut?id=' + m.id })
		}
	}
}
</script>

<style scoped>
.page {
	min-height: 100vh;
	background: #0a0e17;
	padding-bottom: 80rpx;
	box-sizing: border-box;
}

.loading,
.empty {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 200rpx 40rpx;
}

.hint-text,
.empty-text {
	color: #6b7891;
	font-size: 26rpx;
}

.head {
	padding: 0 32rpx 8rpx;
}

.name {
	display: block;
	color: #e2e8f0;
	font-size: 36rpx;
	font-weight: 700;
	line-height: 1.3;
}

/* 英文原名：Expedition 70 这类编号在原文里更严谨 */
.name-en {
	display: block;
	margin-top: 8rpx;
	color: #6b7891;
	font-size: 22rpx;
	letter-spacing: 0.5rpx;
}

.sub {
	display: flex;
	align-items: center;
	margin-top: 12rpx;
}

.range {
	color: #c6cfdd;
	font-size: 24rpx;
}

.state {
	margin-left: 16rpx;
	padding: 3rpx 12rpx;
	border-radius: 6rpx;
	font-size: 19rpx;
}

.state.on {
	background: rgba(56, 189, 248, 0.16);
	color: #38bdf8;
}

.state.gone {
	background: rgba(255, 255, 255, 0.05);
	color: #55617a;
}

.station {
	display: flex;
	align-items: center;
	margin-top: 18rpx;
	padding: 16rpx 20rpx;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	border-radius: 14rpx;
}

.station-label {
	color: #6b7891;
	font-size: 22rpx;
}

.station-name {
	flex: 1;
	margin-left: 12rpx;
	color: #38bdf8;
	font-size: 26rpx;
}

.arrow {
	color: #3d4a5c;
	font-size: 30rpx;
}

.card {
	margin: 24rpx 32rpx 0;
	padding: 26rpx 28rpx;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	border-radius: 20rpx;
}

.card-title {
	color: #94a3b8;
	font-size: 24rpx;
	margin-bottom: 14rpx;
}

.patches {
	display: flex;
	flex-wrap: wrap;
	gap: 20rpx;
}

.patch {
	width: 140rpx;
	height: 140rpx;
	border-radius: 12rpx;
	background: #0a0e17;
}

.crew {
	display: flex;
	align-items: center;
	padding: 14rpx 0;
	border-bottom: 1rpx solid rgba(255, 255, 255, 0.04);
}

.crew:last-child {
	border-bottom: none;
}

.avatar {
	width: 80rpx;
	height: 80rpx;
	flex-shrink: 0;
	border-radius: 50%;
	background: #0a0e17;
}

.avatar-ph {
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 36rpx;
}

.crew-info {
	flex: 1;
	min-width: 0;
	margin-left: 20rpx;
}

.crew-name {
	display: block;
	color: #e2e8f0;
	font-size: 27rpx;
}

.crew-sub {
	display: block;
	margin-top: 4rpx;
	color: #6b7891;
	font-size: 21rpx;
}

.footer-hint {
	margin-top: 48rpx;
	text-align: center;
	color: #3d4a5c;
	font-size: 20rpx;
}
</style>
