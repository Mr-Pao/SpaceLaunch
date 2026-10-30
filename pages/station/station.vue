<template>
	<view class="page">
		<nav-bar :solid="navSolid" :title="navSolid ? stationName(station.name) : ''" />

		<view class="loading" v-if="loading">
			<text class="hint-text">加载中...</text>
		</view>
		<view class="empty" v-else-if="!station.id">
			<text class="empty-text">未找到该空间站</text>
		</view>

		<block v-else>
			<view class="hero">
				<image v-if="station.img" class="hero-img" :src="station.img" mode="aspectFill" />
				<view v-else class="hero-img hero-ph"><text>🛰️</text></view>
				<view class="hero-mask"></view>
				<view class="hero-bar">
					<view class="h-main">
						<text class="h-name">{{ stationName(station.name) }}</text>
						<text class="h-en" v-if="station.name && stationName(station.name) !== station.name">{{ station.name }}</text>
					</view>
					<text class="badge" :class="station.status === 'Active' ? 'on' : 'dim'">{{ statusZh(station.status) }}</text>
				</view>
			</view>

			<view class="kpi">
				<view class="kpi-cell" v-if="station.onboardCrew">
					<text class="kpi-num">{{ station.onboardCrew }}</text>
					<text class="kpi-label">在轨人数</text>
				</view>
				<view class="kpi-cell" v-if="station.docked">
					<text class="kpi-num">{{ station.docked }}</text>
					<text class="kpi-label">对接飞船</text>
				</view>
				<view class="kpi-cell" v-if="station.volume">
					<text class="kpi-num">{{ station.volume }}</text>
					<text class="kpi-label">加压体积 m³</text>
				</view>
				<view class="kpi-cell" v-if="station.mass">
					<text class="kpi-num">{{ station.mass }}</text>
					<text class="kpi-label">质量 t</text>
				</view>
			</view>

			<view class="card" v-if="descText">
				<view class="card-title">简介</view>
				<text class="desc" :class="{ open: descOpen }">{{ descText }}</text>
				<text class="desc-toggle" v-if="descOver" @click="descOpen = !descOpen">
					{{ descOpen ? '收起' : '展开全文' }}
				</text>
			</view>

			<view class="card" v-if="station.crew.length">
				<view class="card-title">当前乘组（{{ station.crew.length }} 人）</view>
				<view class="crew" v-for="(m, i) in station.crew" :key="m.id || i" @click="goAstro(m)">
					<image v-if="m.img" class="avatar" :src="m.img" mode="aspectFill" />
					<view v-else class="avatar avatar-ph"><text>🧑‍🚀</text></view>
					<view class="crew-info">
						<text class="crew-name">{{ m.name }}</text>
						<text class="crew-sub">{{ m.role }}<text v-if="m.agency"> · {{ m.agency }}</text></text>
					</view>
					<text class="arrow">›</text>
				</view>
			</view>

			<view class="card" v-if="station.expeditions.length">
				<view class="card-title">远征队</view>
				<view class="exp" v-for="e in station.expeditions" :key="e.id" @click="goExp(e)">
					<view class="exp-info">
						<text class="exp-name">{{ expeditionName(e.name) }}</text>
						<text class="exp-sub">{{ expRange(e) }}</text>
					</view>
					<text class="arrow">›</text>
				</view>
			</view>

			<view class="card" v-if="dockings.length">
				<view class="card-title">对接记录（近 {{ dockings.length }} 次）</view>
				<view class="dock" v-for="(d, i) in dockings" :key="d.id || i">
					<view class="dock-dot" :class="{ gone: d.departure }"></view>
					<view class="dock-info">
						<text class="dock-name">{{ d.vehicle }}<text v-if="d.serial"> ({{ d.serial }})</text></text>
						<text class="dock-sub">{{ d.config }}<text v-if="d.agency"> · {{ d.agency }}</text></text>
					</view>
					<view class="dock-when">
						<text class="dock-date">{{ dayOf(d.docking) }}</text>
						<text class="dock-state" :class="d.departure ? 'gone' : 'on'">{{ d.departure ? '已撤离' : '在轨' }}</text>
					</view>
				</view>
			</view>

			<view class="card" v-if="station.owners.length">
				<view class="card-title">运营方</view>
				<view class="owners">
					<view class="owner" v-for="(o, i) in station.owners" :key="i">
						<image v-if="o.logo" class="owner-logo" :src="o.logo" mode="aspectFit" />
						<text class="owner-name">{{ o.name }}</text>
					</view>
				</view>
			</view>

			<view class="footer-hint"><text>数据来源 The Space Devs</text></view>
		</block>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import navMixin from '@/utils/nav-mixin.js'
import {
	stationName as stationNameOf,
	expeditionName as expeditionNameOf,
	stationStatusZh as stationStatusZhOf,
	dayOf as dayOfOf,
	descText as descTextOf,
	descNeedFold as descNeedFoldOf
} from '@/utils/format.js'

// 导航栏变实色的滚动阈值（约定1：模板只能见实例成员；这里只是 JS 常量，安全）
const NAV_SOLID_SCROLL = 160

export default {
	mixins: [navMixin],

	data() {
		return {
			loading: true,
			navSolid: false,
			descOpen: false,
			// 默认给齐子数组，后端缺字段时 .length 不会 TypeError
			station: { crew: [], expeditions: [], owners: [] },
			dockings: []
		}
	},

	computed: {
		descText() {
			return descTextOf(this.station.descZh, this.station.desc)
		},
		descOver() {
			return descNeedFoldOf(this.descText)
		}
	},

	onPageScroll(e) {
		const solid = e.scrollTop > NAV_SOLID_SCROLL
		if (solid !== this.navSolid) this.navSolid = solid
	},

	async onLoad(query) {
		const id = (query && query.id) || ''
		// 空间站本体是主线；对接记录只是附加叙事，dockings 还没同步上 COS
		// （404）时不能拖累整个空间站页，分开抓取各自兜底。
		let stations = null
		let docks = null
		try {
			stations = await spaceData.load('spacestations')
		} catch (e) {
			console.warn('[station] 空间站数据缺失', e)
		}
		try {
			docks = await spaceData.load('dockings')
		} catch (e) {
			console.warn('[station] 对接记录缺失（该模块暂不显示）', e)
		}
		const list = (stations && stations.list) || []
		const found = list.find((s) => String(s.id) === String(id)) || {}
		// 后端缺子数组时不能整块覆盖掉默认结构，否则模板 station.crew.length 直接 TypeError
		this.station = Object.assign({ crew: [], expeditions: [], owners: [] }, found)
		const ds = (docks && docks.list) || []
		this.dockings = ds
			.filter((d) => String(d.stationId) === String(id))
			.sort((a, b) => String(b.docking).localeCompare(String(a.docking)))
			.slice(0, 30)
		this.loading = false
	},

	// 标题：空间站中文名 + 当前乘组人数（人数为 0 时只说名字，别写成「0 人在轨」）
	onShareAppMessage() {
		const st = this.station || {}
		return {
			title: this.stationShareTitle(),
			path: '/pages/station/station?id=' + (st.id || ''),
			...(st.img ? { imageUrl: st.img } : {})
		}
	},

	onShareTimeline() {
		const st = this.station || {}
		return {
			title: this.stationShareTitle(),
			query: 'id=' + (st.id || ''),
			...(st.img ? { imageUrl: st.img } : {})
		}
	},

	methods: {
		stationName(name) {
			return stationNameOf(name)
		},

		stationShareTitle() {
			const st = this.station || {}
			const name = stationNameOf(st.name) || st.name || '空间站'
			const n = (st.crew || []).length
			return n ? name + ' · 在轨 ' + n + ' 人' : name
		},

		expeditionName(name) {
			return expeditionNameOf(name)
		},

		statusZh(s) {
			return stationStatusZhOf(s)
		},
		expRange(e) {
			const s = this.dayOf(e.start)
			const end = e.end ? this.dayOf(e.end) : '至今'
			return s + ' — ' + end
		},
		dayOf(v) {
			return dayOfOf(v)
		},
		goAstro(m) {
			if (m && m.id != null) uni.navigateTo({ url: '/pages/astronaut/astronaut?id=' + m.id })
		},
		goExp(e) {
			if (e && e.id != null) uni.navigateTo({ url: '/pages/expedition/expedition?id=' + e.id })
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

.hero {
	position: relative;
	height: 320rpx;
	overflow: hidden;
}

.hero-img {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
}

.hero-ph {
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 120rpx;
	background: #141a26;
}

.hero-mask {
	position: absolute;
	inset: 0;
	background: linear-gradient(to top, #0a0e17 0%, rgba(10, 14, 23, 0.2) 60%, transparent 100%);
}

.hero-bar {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 24rpx;
	display: flex;
	align-items: center;
	padding: 0 32rpx;
}

/* 主名 + 英文原名竖排，右侧留给状态标签 */
.h-main {
	flex: 1;
	min-width: 0;
}

.h-en {
	display: block;
	margin-top: 4rpx;
	color: rgba(255, 255, 255, 0.62);
	font-size: 20rpx;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.h-name {
	color: #fff;
	font-size: 38rpx;
	font-weight: 700;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.badge {
	margin-left: 14rpx;
	padding: 4rpx 14rpx;
	border-radius: 6rpx;
	font-size: 20rpx;
	flex-shrink: 0;
}

.badge.on {
	background: rgba(56, 189, 248, 0.18);
	color: #38bdf8;
}

.badge.dim {
	background: rgba(255, 255, 255, 0.06);
	color: #55617a;
}

.kpi {
	display: flex;
	margin: 24rpx 32rpx 0;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	border-radius: 20rpx;
	padding: 22rpx 0;
}

.kpi-cell {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
}

.kpi-num {
	color: #38bdf8;
	font-size: 30rpx;
	font-weight: 600;
}

.kpi-label {
	margin-top: 6rpx;
	color: #6b7891;
	font-size: 19rpx;
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

.desc {
	color: #c6cfdd;
	font-size: 26rpx;
	line-height: 1.7;
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 4;
	overflow: hidden;
}

.desc.open {
	display: block;
	-webkit-line-clamp: unset;
}

.desc-toggle {
	display: block;
	margin-top: 12rpx;
	color: #38bdf8;
	font-size: 24rpx;
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

.arrow {
	color: #3d4a5c;
	font-size: 32rpx;
	flex-shrink: 0;
	margin-left: 12rpx;
}

.exp {
	display: flex;
	align-items: center;
	padding: 14rpx 0;
	border-bottom: 1rpx solid rgba(255, 255, 255, 0.04);
}

.exp:last-child {
	border-bottom: none;
}

.exp-info {
	flex: 1;
	min-width: 0;
}

.exp-name {
	display: block;
	color: #e2e8f0;
	font-size: 27rpx;
}

.exp-sub {
	display: block;
	margin-top: 4rpx;
	color: #6b7891;
	font-size: 21rpx;
}

.dock {
	display: flex;
	align-items: center;
	padding: 14rpx 0;
	border-bottom: 1rpx solid rgba(255, 255, 255, 0.04);
}

.dock:last-child {
	border-bottom: none;
}

.dock-dot {
	width: 12rpx;
	height: 12rpx;
	flex-shrink: 0;
	border-radius: 50%;
	background: #38bdf8;
	box-shadow: 0 0 0 4rpx rgba(56, 189, 248, 0.14);
}

.dock-dot.gone {
	background: #55617a;
	box-shadow: none;
}

.dock-info {
	flex: 1;
	min-width: 0;
	margin-left: 18rpx;
}

.dock-name {
	display: block;
	color: #e2e8f0;
	font-size: 26rpx;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.dock-sub {
	display: block;
	margin-top: 4rpx;
	color: #6b7891;
	font-size: 20rpx;
}

.dock-when {
	flex-shrink: 0;
	margin-left: 14rpx;
	text-align: right;
}

.dock-date {
	display: block;
	color: #94a3b8;
	font-size: 22rpx;
}

.dock-state {
	display: block;
	margin-top: 4rpx;
	font-size: 20rpx;
}

.dock-state.on {
	color: #38bdf8;
}

.dock-state.gone {
	color: #55617a;
}

.owners {
	display: flex;
	flex-wrap: wrap;
	gap: 16rpx;
}

.owner {
	display: flex;
	align-items: center;
	padding: 8rpx 14rpx;
	background: rgba(255, 255, 255, 0.04);
	border-radius: 10rpx;
}

.owner-logo {
	width: 36rpx;
	height: 36rpx;
	border-radius: 6rpx;
	margin-right: 10rpx;
}

.owner-name {
	color: #c6cfdd;
	font-size: 22rpx;
}

.footer-hint {
	margin-top: 48rpx;
	text-align: center;
	color: #3d4a5c;
	font-size: 20rpx;
}
</style>
