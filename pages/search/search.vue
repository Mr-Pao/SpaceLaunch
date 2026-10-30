<template>
	<view class="page" :style="{ paddingTop: statusBarH + 'px' }">
		<!-- 搜索行：返回 + 输入框。自动聚焦，进页就能打字 -->
		<view class="search-bar">
			<view class="back" @click="goBack">
				<text class="back-arrow">‹</text>
			</view>
			<view class="input-wrap">
				<text class="input-icon">🔍</text>
				<input
					class="input"
					v-model="keyword"
					focus
					confirm-type="search"
					placeholder="搜任务 / 火箭 / 宇航员 / 工位 / 机构"
					placeholder-class="input-ph"
				/>
				<text class="clear" v-if="keyword" @click="keyword = ''">✕</text>
			</view>
		</view>

		<!-- 结果分组 -->
		<view class="groups" v-if="keyword.trim()">
			<view class="group" v-for="g in groups" :key="g.title">
				<view class="group-head">
					<text class="group-title">{{ g.title }}</text>
					<text class="group-count">{{ g.total != null ? g.total : g.items.length }}</text>
				</view>
				<view
					class="row"
					hover-class="row-hover"
					v-for="r in g.items"
					:key="g.title + r.id"
					@click="go(r)"
				>
					<image class="row-avatar" v-if="r.img" :src="r.img" mode="aspectFill"></image>
					<view class="row-main">
						<text class="row-title">{{ r.title }}</text>
						<text class="row-sub" v-if="r.sub">{{ r.sub }}</text>
					</view>
					<text class="row-badge" :class="{ 'row-badge-on': r.badgeOn }" v-if="r.badge">{{ r.badge }}</text>
					<text class="row-arrow">›</text>
				</view>
			</view>

			<!-- 宇航员 / 工位是首次输入才拉的，还没到位时不说「没有找到」 -->
			<view class="extra-hint" v-if="extrasLoading && groups.length">
				<text class="extra-hint-text">正在加载宇航员 / 工位…</text>
			</view>

			<view class="empty" v-if="!groups.length && !searching && !extrasLoading">
				<text class="empty-icon">🔍</text>
				<text class="empty-text">没有找到「{{ keyword.trim() }}」相关内容</text>
			</view>
		</view>

		<!-- 未输入时的提示 -->
		<view class="tips" v-else>
			<text class="tips-title">可以搜这些</text>
			<text class="tips-item">· 任务名（如「星链」「嫦娥」）</text>
			<text class="tips-item">· 火箭型号（如「猎鹰 9」「长征」）</text>
			<text class="tips-item">· 宇航员（如「杨利伟」「Wang」）</text>
			<text class="tips-item">· 发射工位（如「文昌」「SpaceX」）</text>
			<text class="tips-item">· 机构（如「NASA」「中国航天」）</text>
		</view>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import {
	formatShort,
	astroName,
	nationZh,
	agencyLabel,
	padShort,
	placeZh
} from '@/utils/format.js'
import { launchMatch, rocketMatch, astronautMatch, padMatch } from '@/utils/search-match.js'
import navMixin from '@/utils/nav-mixin.js'

/**
 * 全局搜索：一个输入框对六份数据一把梭。
 *
 * 数据全部是 CI 预生成的静态 JSON，搜索单纯是内存过滤，
 * 不发任何搜索请求。前四份（发射 / 火箭 / 机构）进页就拉，
 * 宇航员与工位合计约 190KB，改成「第一次输入关键词时」再懒加载，
 * 不进搜索页首屏。
 * 归档分片不参与搜索：7000+ 条逐片拉太贵，且 previous 快照已覆盖最近 100 条；
 * 搜历史任务走「已发射」列表触底翻找。卫星也不在这里搜 —— 全库 20109 条分 26 片，
 * 本页只拿得到第 0 片，搜出来的结果不准，卫星搜索在太空资产页内。
 *
 * 匹配逻辑在 utils/search-match.js（纯函数）：中文关键词靠 *Zh 字段与
 * ROCKET_ZH / CHINA_ASTRO_ZH / PLACE_ZH 查表命中，verify-pure 有断言，
 * 别在这里重新内联一份。
 */

// 模块级缓存：本会话内前四个数据集只拉一次
let cache = null

const GROUP_LIMIT = 8

export default {
	mixins: [navMixin],

	data() {
		return {
			keyword: '',
			searching: false,
			// 宇航员 / 工位两套数据还在路上：空态与「搜索中」都要等它
			extrasLoading: false,
			// 每组 { title, icon, items: [{ id, title, sub, type, img, badge }], total }
			groups: []
		}
	},

	watch: {
		// 输入防抖：中文输入法打字快，400ms 内只搜最后一次
		keyword() {
			if (this._debounceTimer) clearTimeout(this._debounceTimer)
			// 第一次输入才去拉宇航员 / 工位（约 190KB），不在进页时拉
			this.ensureExtras()
			this._debounceTimer = setTimeout(() => this.runSearch(), 400)
		}
	},

	// 页面销毁后防抖回调会落在死实例上，虽然无实害但不干净
	onUnload() {
		if (this._debounceTimer) {
			clearTimeout(this._debounceTimer)
			this._debounceTimer = null
		}
	},

	methods: {
		goBack() {
			const pages = getCurrentPages()
			if (pages.length > 1) uni.navigateBack()
			else uni.switchTab({ url: '/pages/index/index' })
		},

		async ensureData() {
			if (cache) return cache
			this.searching = true
			try {
				const safe = (p) => p.catch(() => null)
				const [up, prev, launchers, agencies] = await Promise.all([
					safe(spaceData.load('upcoming')),
					safe(spaceData.load('previous')),
					safe(spaceData.load('launchers')),
					safe(spaceData.load('agencies'))
				])
				cache = {
					upcoming: (up && up.list) || [],
					previous: (prev && prev.list) || [],
					launchers: (launchers && launchers.list) || [],
					agencies: (agencies && agencies.list) || []
				}
			} finally {
				this.searching = false
			}
			return cache
		},

		/**
		 * 宇航员 / 工位：首次输入关键词时懒加载，本页只拉一次。
		 *
		 * 862 人 + 251 个工位不放 data()（每次变化都要走 setData），
		 * 挂实例属性 this._astronauts / this._pads，只有结果数组进响应式。
		 *
		 * 宇航员优先用 CI 新产出的轻量搜索集 astronautsSearch（约 40~60KB），
		 * 它还没上线时 load 会直接 reject（FILES 里没注册就是「未知数据集」，
		 * 注册了但文件没传就是 404），此时退回全量 astronauts（719KB）。
		 * 降级必须用 catch 兜住，否则整个搜索页跟着挂。
		 */
		async ensureExtras() {
			if (this._extrasTask) return this._extrasTask
			this.extrasLoading = true
			const safe = (p) => p.catch(() => null)
			this._extrasTask = (async () => {
				let astro = await safe(spaceData.load('astronautsSearch'))
				if (!(astro && astro.list && astro.list.length)) {
					astro = await safe(spaceData.load('astronauts'))
				}
				const pads = await safe(spaceData.load('pads'))
				this._astronauts = (astro && astro.list) || []
				this._pads = (pads && pads.list) || []
			})()

			await this._extrasTask
			this.extrasLoading = false
			// 数据到位时用户多半已经打完了字：补跑一次，把两组补进结果里
			if (this.keyword.trim()) this.runSearch()
		},

		async runSearch() {
			const kw = this.keyword.trim().toLowerCase()
			if (!kw) {
				this.groups = []
				return
			}

			const d = await this.ensureData()

		// ---- 发射任务（即将 + 已发）----
		// 匹配面见 search-match.js：name / nameZh / launchTitle（中文型号兜底）各自独立判断
		const launchHit = (x) => launchMatch(x, kw)

		// 机构搜索：name / abbrev / nameZh 任一命中关键词即收录
		const hit = (field, k) => (field || '').toLowerCase().indexOf(k) !== -1

			const launchRow = (x) => ({
				id: x.id,
				type: 'launch',
				title: (x.mission && (x.mission.nameZh || x.mission.name)) || x.name,
				sub: formatShort(x.net)
			})

			const groups = []
			const up = d.upcoming.filter(launchHit).slice(0, GROUP_LIMIT)
			if (up.length) groups.push({ title: '即将发射', items: up.map(launchRow) })
			const prev = d.previous.filter(launchHit).slice(0, GROUP_LIMIT)
			if (prev.length) groups.push({ title: '已发射', items: prev.map(launchRow) })

			// ---- 火箭型号 ----
			// rocketMatch 内含 ROCKET_ZH 查表，「长征」「朱雀」这类中文名可命中
			const rk = d.launchers
				.filter((x) => rocketMatch(x, kw))
				.slice(0, GROUP_LIMIT)
				.map((x) => ({
					id: x.id,
					type: 'rocket',
					title: x.full_name || x.name,
					sub: x.manufacturer || ''
				}))
			if (rk.length) groups.push({ title: '火箭型号', items: rk })

			// ---- 宇航员 ----
			// 数据还没到位时整组不出（不留空分组），extrasLoading 会挡住空态
			const astroRow = (x) => ({
				id: x.id,
				type: 'astronaut',
				title: x.nameZh || astroName(x) || x.name || '',
				sub: [
					nationZh(x.nation) || x.nationZh || x.nation || '',
					agencyLabel(x.agencyName || x.agency) || ''
				]
					.filter(Boolean)
					.join(' · '),
				img: x.img || '',
				badge: x.inSpace ? '在轨' : '',
				badgeOn: !!x.inSpace
			})
			const ao = (this._astronauts || []).filter((x) => astronautMatch(x, kw))
			if (ao.length) {
				groups.push({
					title: '宇航员',
					total: ao.length,
					items: ao.slice(0, GROUP_LIMIT).map(astroRow)
				})
			}

			// ---- 发射工位 ----
			// pads 无中文字段，中文命中靠 placeZh / agencyLabel 两张本地表
			const padRow = (x) => {
				const ag = x.agencies && x.agencies[0]
				return {
					id: x.id,
					type: 'pad',
					title: padShort(x.name) || x.name || '',
					sub: [
						placeZh(x.location && x.location.name) || x.countryZh || '',
						agencyLabel(ag && ag.name) || ''
					]
						.filter(Boolean)
						.join(' · '),
					badge: x.total_launch_count ? '共 ' + x.total_launch_count + ' 次' : '',
					badgeOn: false
				}
			}
			const pd = (this._pads || []).filter((x) => padMatch(x, kw))
			if (pd.length) {
				groups.push({
					title: '发射工位',
					total: pd.length,
					items: pd.slice(0, GROUP_LIMIT).map(padRow)
				})
			}

			// ---- 机构 ----
			const ag = d.agencies
				.filter((x) => hit(x.name, kw) || hit(x.abbrev, kw) || hit(x.nameZh, kw))
				.slice(0, GROUP_LIMIT)
				.map((x) => ({
					id: x.id,
					type: 'agency',
					title: x.name,
					sub: x.abbrev || x.type || ''
				}))
			if (ag.length) groups.push({ title: '机构', items: ag })

			this.groups = groups
		},

		go(r) {
			if (r.type === 'launch') {
				uni.navigateTo({ url: '/pages/launch/launchInfo?id=' + r.id })
			} else if (r.type === 'rocket') {
				uni.navigateTo({ url: '/pages/rocket/rocket?id=' + r.id })
			} else if (r.type === 'agency') {
				uni.navigateTo({ url: '/pages/agencies/agencies?id=' + r.id })
			} else if (r.type === 'astronaut') {
				uni.navigateTo({ url: '/pages/astronaut/astronaut?id=' + r.id })
			} else if (r.type === 'pad') {
				uni.navigateTo({ url: '/pages/pad/pad?id=' + r.id })
			}
		}
	}
}
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background: #0a0e17;
	box-sizing: border-box;
	padding-bottom: 60rpx;
}

.search-bar {
	display: flex;
	align-items: center;
	padding: 12rpx 24rpx 20rpx;
}

.back {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 64rpx;
	height: 64rpx;
	margin-right: 8rpx;
}

.back-arrow {
	color: #ffffff;
	font-size: 46rpx;
	line-height: 1;
	margin-top: -6rpx;
}

.input-wrap {
	flex: 1;
	display: flex;
	align-items: center;
	padding: 0 20rpx;
	height: 72rpx;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.08);
	border-radius: 36rpx;
}

.input-icon {
	font-size: 26rpx;
	margin-right: 12rpx;
	opacity: 0.6;
}

.input {
	flex: 1;
	min-width: 0;
	color: #ffffff;
	font-size: 28rpx;
}

.input-ph {
	color: #4a5568;
}

.clear {
	color: #6b7891;
	font-size: 26rpx;
	padding: 10rpx 0 10rpx 16rpx;
}

/* 分组结果 */
.groups {
	padding: 10rpx 24rpx 0;
}

.group {
	margin-bottom: 30rpx;
}

.group-head {
	display: flex;
	align-items: baseline;
	padding: 8rpx 8rpx 12rpx;
}

.group-title {
	color: #8a97a8;
	font-size: 26rpx;
}

.group-count {
	margin-left: 12rpx;
	color: #4a5568;
	font-size: 22rpx;
}

.row {
	display: flex;
	align-items: center;
	padding: 22rpx 20rpx;
	margin-bottom: 12rpx;
	background: #141a26;
	border-radius: 16rpx;
}

.row-hover {
	background: #1a2231;
}

.row-main {
	flex: 1;
	min-width: 0;
}

/* 宇航员头像：只在 r.img 存在时渲染，任务/火箭/机构行不受影响 */
.row-avatar {
	flex-shrink: 0;
	width: 68rpx;
	height: 68rpx;
	margin-right: 18rpx;
	border-radius: 50%;
	background: #1a2231;
}

/* 右侧小徽标：在轨（绿）/ 累计发射次数（灰） */
.row-badge {
	flex-shrink: 0;
	margin-left: 12rpx;
	padding: 2rpx 10rpx;
	border: 1rpx solid rgba(255, 255, 255, 0.12);
	border-radius: 8rpx;
	color: #6b7891;
	font-size: 20rpx;
	line-height: 1.6;
}

.row-badge-on {
	color: #4ade80;
	border-color: rgba(74, 222, 128, 0.35);
}

.row-title {
	display: block;
	color: #ffffff;
	font-size: 28rpx;
	line-height: 1.4;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.row-sub {
	display: block;
	margin-top: 4rpx;
	color: #6b7891;
	font-size: 23rpx;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.row-arrow {
	color: #4a5568;
	font-size: 32rpx;
	margin-left: 16rpx;
}

/* 空态与提示 */
.extra-hint {
	display: flex;
	justify-content: center;
	padding: 4rpx 0 30rpx;
}

.extra-hint-text {
	color: #4a5568;
	font-size: 23rpx;
}

.empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 140rpx 40rpx;
}

.empty-icon {
	font-size: 72rpx;
	margin-bottom: 24rpx;
}

.empty-text {
	color: #6b7891;
	font-size: 28rpx;
	text-align: center;
}

.tips {
	display: flex;
	flex-direction: column;
	padding: 80rpx 48rpx 0;
}

.tips-title {
	color: #4a5568;
	font-size: 24rpx;
	margin-bottom: 20rpx;
	letter-spacing: 2rpx;
}

.tips-item {
	color: #6b7891;
	font-size: 27rpx;
	line-height: 2.1;
}
</style>
