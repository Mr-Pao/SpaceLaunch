<template>
	<view class="page">
		<nav-bar :solid="navSolid" :title="navSolid ? '航天员' : ''" />

		<view class="loading" v-if="loading">
			<text class="hint-text">加载中...</text>
		</view>

		<view class="empty" v-else-if="!a.id">
			<text class="empty-icon">🧑‍🚀</text>
			<text class="empty-text">未找到该航天员信息</text>
		</view>

		<block v-else>
			<!-- 顶部：证件照 + 名字 + 徽标。在轨的挂亮蓝「在轨」章 -->
			<view class="head">
				<image
					v-if="a.img"
					class="avatar"
					:src="a.img"
					mode="aspectFill"
					@click="preview(a.img)"
				></image>
				<view v-else class="avatar avatar-ph"><text>🧑‍🚀</text></view>

				<view class="head-body">
					<text class="name">{{ a.name }}</text>
					<view class="tags">
						<text class="tag tag-on" v-if="a.inSpace">在轨</text>
						<text class="tag" v-else-if="statusZh" :class="statusClass">{{ statusZh }}</text>
						<text class="tag" v-if="agencyLabel">{{ agencyLabel }}</text>
						<text class="tag" v-if="nation">{{ nation }}</text>
						<text class="tag" v-if="a.age && !a.dod">{{ a.age }} 岁</text>
					</view>
					<!-- 生卒行：健在只给生日，逝世给生卒（年龄 tag 让位） -->
					<text class="life" v-if="birthText">{{ birthText }}</text>
				</view>
			</view>

			<!-- 战绩：与工位 / 火箭详情页的 KPI 口径一致 -->
			<view class="kpi">
				<view class="kpi-cell" v-if="a.days">
					<text class="kpi-num">{{ a.days }}</text>
					<text class="kpi-label">累计在轨（天）</text>
				</view>
				<view class="kpi-cell">
					<text class="kpi-num">{{ a.flights || 0 }}</text>
					<text class="kpi-label">飞行次数</text>
				</view>
				<view class="kpi-cell" v-if="a.spacewalks">
					<text class="kpi-num">{{ a.spacewalks }}</text>
					<text class="kpi-label">出舱次数</text>
				</view>
				<view class="kpi-cell" v-if="a.evaHours">
					<text class="kpi-num">{{ a.evaHours }}h</text>
					<text class="kpi-label">累计出舱</text>
				</view>
			</view>

		<!-- 所属空间站 / 参与远征队：与 station / expedition 页反向索引，
		     构成「宇航员 ↔ 空间站 ↔ 远征队」闭环。在轨人员在这里能看到
		     自己当前所在站，历史航天员能看到自己执行过的远征队。 -->
		<view class="card" v-if="myStations.length">
			<view class="card-title">所属空间站</view>
			<view class="link-row" v-for="s in myStations" :key="s.id" @click="goStation(s)">
				<view class="link-main">
					<text class="link-name">{{ s.name }}</text>
					<text class="link-sub" v-if="s.status">{{ stationStatusZh(s.status) }}</text>
				</view>
				<text class="arrow">›</text>
			</view>
		</view>

		<view class="card" v-if="myExps.length">
			<view class="card-title">参与远征队</view>
			<view class="link-row" v-for="e in myExps" :key="e.id" @click="goExp(e)">
				<view class="link-main">
					<text class="link-name">{{ e.name }}</text>
					<text class="link-sub">{{ expRangeText(e) }}</text>
				</view>
				<text class="arrow">›</text>
			</view>
		</view>

		<!-- 飞行任务：slim 阶段从 flights/landings 合并裁剪而来，
		     每条都能点回对应发射的详情页（找不到归档时那边有空态兜底） -->
			<view class="card" v-if="missions.length">
				<view class="card-title">飞行任务</view>
				<view
					class="flight"
					v-for="(m, i) in missions"
					:key="m.id + '-' + i"
					@click="goLaunch(m)"
				>
					<view class="flight-main">
						<text class="flight-name">{{ m.name }}</text>
						<text class="flight-sub">{{ m.rk }}{{ m.rk && m.netText ? ' · ' : '' }}{{ m.netText }}</text>
					</view>
					<view class="flight-side">
						<text class="flight-dest" v-if="m.destZh">{{ m.destZh }}</text>
						<text class="arrow">›</text>
					</view>
				</view>
			</view>

			<!-- 出舱记录：LL2 的 spacewalks 日志（名称/时间/时长/地点） -->
			<view class="card" v-if="evas.length">
				<view class="card-title">出舱记录</view>
				<view class="eva" v-for="(e, i) in evas" :key="i">
					<view class="eva-dot"></view>
					<view class="eva-main">
						<text class="eva-name">{{ e.name || '出舱活动' }}</text>
						<text class="eva-sub">{{ e.startText }}<text v-if="e.loc"> · {{ e.loc }}</text></text>
					</view>
					<text class="eva-h" v-if="e.h">{{ e.h }} 小时</text>
				</view>
			</view>

			<!-- 简介：CI 只给在轨人员翻了中文，缺失回退英文 -->
			<view class="card" v-if="bioText">
				<view class="card-title">简介</view>
				<text class="desc" :class="{ open: descExpanded }">{{ bioText }}</text>
				<text class="desc-toggle" v-if="descOver" @click="descExpanded = !descExpanded">
					{{ descExpanded ? '收起' : '展开全文' }}
				</text>
			</view>

			<!-- 资料：生卒 / 相关链接（小程序打不开网页，点了复制链接） -->
			<view class="card" v-if="hasProfile">
				<view class="card-title">资料</view>
				<view class="row" v-if="a.dob">
					<text class="label">出生</text>
					<text class="value">{{ fmtDay(a.dob) }}</text>
				</view>
				<view class="row" v-if="a.dod">
					<text class="label">逝世</text>
					<text class="value">{{ fmtDay(a.dod) }}</text>
				</view>
				<view class="row link" v-if="a.wiki" @click="copyLink(a.wiki, '维基百科')">
					<text class="label">维基百科</text>
					<text class="value link-value">复制链接</text>
				</view>
				<view class="row link" v-if="a.twitter" @click="copyLink(a.twitter, 'Twitter')">
					<text class="label">Twitter</text>
					<text class="value link-value">复制链接</text>
				</view>
				<view class="row link" v-if="a.instagram" @click="copyLink(a.instagram, 'Instagram')">
					<text class="label">Instagram</text>
					<text class="value link-value">复制链接</text>
				</view>
			</view>

			<view class="footer-hint">
				<text>数据来源 The Space Devs</text>
			</view>
		</block>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import { agencyLabel, nationZh } from '@/utils/format.js'
import navMixin from '@/utils/nav-mixin.js'

/**
 * 宇航员详情页。
 * 入口：首页「此刻在天上」横滑卡。数据来自 CI 的 astronauts.json，
 * bio 只有人在轨才有（slim 阶段裁剪过），历史航天员靠任务列表撑内容。
 * 新增数据（2026-10-26）：飞行任务（flights/landings 合并）、
 * 出舱记录（spacewalks 日志）、生卒、维基/社交外链。
 */
export default {
	mixins: [navMixin],

	data() {
		return {
			a: {},
			loading: true,
			navSolid: false,
			descExpanded: false,
			// 反向索引用的全量列表（只本地内存过滤，不下发前端）
			allStations: [],
			allExps: []
		}
	},

	computed: {
		agencyLabel() {
			return agencyLabel(this.a && this.a.agencyName)
		},

		nation() {
			return nationZh(this.a && this.a.nation)
		},

		bioText() {
			return this.a.bioZh || this.a.bio || ''
		},

		descOver() {
			return (this.bioText || '').length > 120
		},

		// 状态中文：LL2 枚举 Active/Retired/Deceased/In space/Unknown
		statusZh() {
			const map = {
				Active: '现役',
				Retired: '退役',
				Deceased: '已故',
				'In space': '在轨',
				Unknown: '未知'
			}
			const s = (this.a && this.a.status) || ''
			return map[s] || ''
		},

		// 已故用灰章，别把「已故」染成任何亮色
		statusClass() {
			return this.a && this.a.status === 'Deceased' ? 'tag-dim' : ''
		},

		birthText() {
			const a = this.a || {}
			if (!a.dob) return ''
			return a.dod
				? fmtDayText(a.dob) + ' — ' + fmtDayText(a.dod)
				: '生于 ' + fmtDayText(a.dob)
		},

		hasProfile() {
			const a = this.a || {}
			return Boolean(a.dob || a.dod || a.wiki || a.twitter || a.instagram)
		},

		missions() {
			const list = (this.a && this.a.missions) || []
			return list.map((m) => ({
				...m,
				netText: dayOf(m.net),
				destZh: destZhOf(m.dest)
			}))
		},

		evas() {
			const list = (this.a && this.a.evas) || []
			return list.map((e) => ({ ...e, startText: dayOf(e.start) }))
		},

		// 反向索引：本宇航员出现在哪几座空间站的当前乘组里
		myStations() {
			const id = String((this.a && this.a.id) ?? '')
			if (!id || !this.allStations.length) return []
			return this.allStations.filter((s) => (s.crew || []).some((m) => String(m.id) === id))
		},

		// 反向索引：本宇航员参与过哪些远征队
		myExps() {
			const id = String((this.a && this.a.id) ?? '')
			if (!id || !this.allExps.length) return []
			return this.allExps.filter((e) => (e.crew || []).some((m) => String(m.id) === id))
		}
	},

	onPageScroll(e) {
		const solid = e.scrollTop > 180
		if (solid !== this.navSolid) this.navSolid = solid
	},

	async onLoad(query) {
		this.id = (query && query.id) || ''
		try {
			const [found, sts, exps] = await Promise.all([
				this.id ? spaceData.getById('astronauts', this.id) : Promise.resolve(null),
				spaceData.load('spacestations'),
				spaceData.load('expeditions')
			])
			if (found) this.a = found
			this.allStations = (sts && sts.list) || []
			this.allExps = (exps && exps.list) || []
		} catch (e) {
			console.warn('[astronaut] 获取失败', e)
		}
		this.loading = false
	},

	methods: {
		preview(url) {
			if (!url) return
			uni.previewImage({ urls: [url], current: url })
		},

		// 模板里用的格式化函数必须挂在实例上（options API 模板看不见 import）
		fmtDay(v) {
			return fmtDayText(v)
		},

		goLaunch(m) {
			if (!m || !m.id) return
			const net = m.net ? '&net=' + encodeURIComponent(m.net) : ''
			uni.navigateTo({ url: '/pages/launch/launchInfo?id=' + m.id + net })
		},

		// 小程序页面打不开外部网页：复制链接 + 提示，用户去浏览器粘
		copyLink(url, label) {
			if (!url) return
			uni.setClipboardData({
				data: url,
				success: () => uni.showToast({ title: label + '链接已复制', icon: 'none' })
			})
		},

		// 反向索引跳转：空间站 / 远征队 详情页
		goStation(s) {
			if (s && s.id != null) uni.navigateTo({ url: '/pages/station/station?id=' + s.id })
		},

		goExp(e) {
			if (e && e.id != null) uni.navigateTo({ url: '/pages/expedition/expedition?id=' + e.id })
		},

		stationStatusZh(s) {
			if (s === 'Active') return '在役'
			if (s === 'Retired') return '退役'
			if (s === 'Under Construction') return '建造中'
			return s || ''
		},

		expRangeText(e) {
			const s = dayOf(e.start)
			const end = e.end ? dayOf(e.end) : '至今'
			return (s ? s + ' — ' : '') + end
		}
	}
}

/** ISO 日期 → 「1978 年 2 月 27 日」；非日期串原样返回 */
function fmtDayText(v) {
	const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(v || ''))
	if (!m) return String(v || '')
	const [, y, mo, d] = m
	return y + ' 年 ' + Number(mo) + ' 月' + (d ? ' ' + Number(d) + ' 日' : '')
}

/** 完整时间戳 → 「2021-04-23」这种短日期；空/异常返回 '' */
function dayOf(v) {
	const s = String(v || '')
	const m = /^(\d{4}-\d{2}-\d{2})/.exec(s)
	return m ? m[1] : ''
}

/** 目的地英文 → 中文，映射不到就原样（slim 存的就是原文） */
function destZhOf(v) {
	const map = {
		'International Space Station': '国际空间站',
		'ISS': '国际空间站',
		'Moon': '月球',
		'Mars': '火星'
	}
	if (!v) return ''
	return map[v] || map[v.toLowerCase()] || v
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
	flex-direction: column;
	align-items: center;
	padding: 200rpx 40rpx;
}

.empty-icon {
	font-size: 72rpx;
	margin-bottom: 24rpx;
}

.hint-text,
.empty-text {
	color: #6b7891;
	font-size: 26rpx;
}

/* 头部 */
.head {
	display: flex;
	align-items: center;
	padding: 36rpx 32rpx 8rpx;
}

.avatar {
	width: 168rpx;
	height: 168rpx;
	flex-shrink: 0;
	border-radius: 20rpx;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.06);
}

.avatar-ph {
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 72rpx;
}

.head-body {
	flex: 1;
	min-width: 0;
	margin-left: 28rpx;
}

.name {
	display: block;
	color: #e2e8f0;
	font-size: 36rpx;
	font-weight: 600;
	line-height: 1.3;
}

.tags {
	display: flex;
	flex-wrap: wrap;
	margin-top: 14rpx;
}

.tag {
	padding: 4rpx 14rpx;
	margin: 0 10rpx 8rpx 0;
	border-radius: 6rpx;
	background: rgba(255, 255, 255, 0.06);
	color: #6b7891;
	font-size: 20rpx;
}

.tag-on {
	background: rgba(56, 189, 248, 0.16);
	color: #38bdf8;
}

/* 已故/未知：压暗，避免和现役的亮色混 */
.tag-dim {
	background: rgba(255, 255, 255, 0.05);
	color: #55617a;
}

.life {
	display: block;
	margin-top: 6rpx;
	color: #6b7891;
	font-size: 22rpx;
}

/* KPI */
.kpi {
	display: flex;
	margin: 28rpx 32rpx 0;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	border-radius: 20rpx;
	padding: 24rpx 0;
}

.kpi-cell {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
}

.kpi-num {
	color: #38bdf8;
	font-size: 32rpx;
	font-weight: 600;
}

.kpi-label {
	margin-top: 8rpx;
	color: #6b7891;
	font-size: 20rpx;
}

/* 卡片 */
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

/* 飞行任务行 */
.flight {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16rpx;
	padding: 16rpx 0;
	border-bottom: 1rpx solid rgba(255, 255, 255, 0.04);
}

.flight:last-child {
	border-bottom: none;
	padding-bottom: 4rpx;
}

.flight-main {
	flex: 1;
	min-width: 0;
}

.flight-name {
	display: block;
	color: #e2e8f0;
	font-size: 27rpx;
	line-height: 1.4;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.flight-sub {
	display: block;
	margin-top: 4rpx;
	color: #6b7891;
	font-size: 22rpx;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.flight-side {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	gap: 10rpx;
}

.flight-dest {
	padding: 3rpx 12rpx;
	border-radius: 6rpx;
	background: rgba(56, 189, 248, 0.1);
	color: #38bdf8;
	font-size: 20rpx;
}

.arrow {
	color: #3d4a5c;
	font-size: 30rpx;
}

/* 出舱记录行：时间线样式，与发射详情页的时间线同观感 */
.eva {
	display: flex;
	align-items: center;
	padding: 14rpx 0;
	border-bottom: 1rpx solid rgba(255, 255, 255, 0.04);
}

.eva:last-child {
	border-bottom: none;
	padding-bottom: 4rpx;
}

.eva-dot {
	width: 10rpx;
	height: 10rpx;
	flex-shrink: 0;
	border-radius: 50%;
	background: #38bdf8;
	box-shadow: 0 0 0 4rpx rgba(56, 189, 248, 0.14);
}

.eva-main {
	flex: 1;
	min-width: 0;
	margin-left: 18rpx;
}

.eva-name {
	display: block;
	color: #cbd5e0;
	font-size: 26rpx;
	line-height: 1.4;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.eva-sub {
	display: block;
	margin-top: 4rpx;
	color: #6b7891;
	font-size: 21rpx;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.eva-h {
	flex-shrink: 0;
	margin-left: 14rpx;
	color: #38bdf8;
	font-size: 23rpx;
	font-variant-numeric: tabular-nums;
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

/* 资料卡 */
.row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 12rpx 0;
}

.label {
	color: #6b7891;
	font-size: 25rpx;
}

.value {
	color: #c6cfdd;
	font-size: 25rpx;
	text-align: right;
}

.link-value {
	color: #38bdf8;
}

/* 反向索引链接行：所属空间站 / 参与远征队，与飞行任务行同观感 */
.link-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16rpx;
	padding: 16rpx 0;
	border-bottom: 1rpx solid rgba(255, 255, 255, 0.04);
}

.link-row:last-child {
	border-bottom: none;
	padding-bottom: 4rpx;
}

.link-main {
	flex: 1;
	min-width: 0;
}

.link-name {
	display: block;
	color: #e2e8f0;
	font-size: 27rpx;
	line-height: 1.4;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.link-sub {
	display: block;
	margin-top: 4rpx;
	color: #6b7891;
	font-size: 22rpx;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.footer-hint {
	margin-top: 48rpx;
	text-align: center;
	color: #3d4a5c;
	font-size: 20rpx;
}
</style>
