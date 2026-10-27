<template>
	<view class="page">
		<star-field />
		<view class="nav-row" :class="{ solid: navSolid }" :style="{ paddingTop: statusBarH + 'px' }">
			<!-- 连点 5 次呼出展示开关（静默切换）：入口隐藏，普通用户与审核不可见 -->
			<text class="nav-title" @click="onTitleTap">火箭资料库</text>
		</view>

		<!-- 榜单头部：一句话说清「这是什么榜」，顺手给三个横向对比的极值 -->
		<view class="hero">
			<view class="hero-top">
				<text class="hero-kicker">SPACEDALLY / LAUNCH INDEX</text>
				<text class="hero-state">在役</text>
			</view>

			<view class="hero-main">
				<view class="hero-left">
					<text class="hero-title">全球火箭实力榜</text>
					<text class="hero-sub">基于运力、可靠性、发射活跃度</text>
				</view>
				<view class="hero-count">
					<text class="hero-num">{{ pool.length }}</text>
					<text class="hero-unit">型号火箭</text>
				</view>
			</view>

			<view class="hero-cells">
				<view class="hcell">
					<text class="hcell-k">最近近地运力</text>
					<text class="hcell-v">{{ topLeo.name }}</text>
					<text class="hcell-n">{{ topLeo.text }}</text>
				</view>
				<view class="hcell">
					<text class="hcell-k">发射最活跃</text>
					<text class="hcell-v">{{ topLaunch.name }}</text>
					<text class="hcell-n">{{ topLaunch.text }}</text>
				</view>
				<view class="hcell">
					<text class="hcell-k">可复用型号</text>
					<text class="hcell-v">{{ reusableCount }}</text>
					<text class="hcell-n">型</text>
				</view>
			</view>
		</view>

		<!-- 搜索 -->
		<view class="search">
			<text class="search-icon">🔍</text>
			<input
				class="search-input"
				v-model="keyword"
				type="text"
				placeholder="搜索中文名、型号、制造商"
				placeholder-class="search-ph"
				confirm-type="search"
			/>
			<text class="search-clear" v-if="keyword" @click="keyword = ''">✕</text>
		</view>

		<!-- 排序方式 -->
		<text class="sort-label">排序方式</text>
		<view class="sort-tabs">
			<view
				class="sort-tab"
				v-for="s in sorts"
				:key="s.value"
				:class="{ on: sort === s.value }"
				@click="sort = s.value"
			>
				{{ s.label }}
			</view>
		</view>

		<!-- 地区筛选：横向滚动，项数会随数据变化 -->
		<scroll-view class="region-scroll" scroll-x enable-flex :show-scrollbar="false">
			<view class="region-inner">
				<view
					class="region"
					v-for="r in regions"
					:key="r.value"
					:class="{ on: region === r.value }"
					@click="region = r.value"
				>
					{{ r.label }}
				</view>
			</view>
		</scroll-view>

		<!-- 榜单口径：当前排的是什么、按什么权重、共几条 -->
		<view class="board-line">
			<view class="board-left">
				<text class="board-title">{{ currentSort.label }}</text>
				<text class="board-desc">{{ currentSort.desc }}</text>
			</view>
			<text class="board-count">{{ ranked.length }} 个结果</text>
		</view>

		<view class="loading" v-if="loading && !all.length">
			<skeleton-card v-for="i in 4" :key="i" />
		</view>

		<view class="empty" v-else-if="!all.length">
			<text class="empty-icon">🛰️</text>
			<text class="hint-text">型号库还没同步好，稍后再来看看</text>
			<view class="btn" @click="getData(true)">重新加载</view>
		</view>

		<view class="empty" v-else-if="!ranked.length">
			<text class="empty-icon">🔍</text>
			<text class="hint-text">没有符合条件的型号</text>
		</view>

		<view class="list" v-else>
			<view
				class="rank-card"
				:class="{ 'is-top': i < 3 }"
				v-for="(r, i) in visible"
				:key="r.id"
				hover-class="rank-card-hover"
				@click="goRocket(r)"
			>
				<!-- 左：型号图，排名叠在左上角 -->
				<view class="rank-media">
					<image class="rank-img" v-if="r.image" :src="r.image" mode="aspectFill" lazy-load />
					<view class="rank-img rank-ph" v-else><text class="rank-ph-icon">🚀</text></view>
					<text class="rank-no" :class="i < 3 ? 'lv' + (i + 1) : ''">#{{ i + 1 }}</text>
					<text class="rank-flag" v-if="r.reusable">可复用</text>
				</view>

				<!-- 右：名称 / 制造商 / 三项硬指标 -->
				<view class="rank-body">
					<view class="rank-head">
						<text class="rank-name">{{ r.zhName }}</text>
						<text class="rank-more">详情</text>
					</view>

					<text class="rank-maker">{{ r.manufacturer || '未知制造商' }}</text>

					<view class="rank-tags" v-if="r.family || r.variant">
						<text class="rtag" v-if="r.family">{{ r.family }}</text>
						<text class="rtag" v-if="r.variant">{{ r.variant }}</text>
					</view>

					<view class="rank-metrics">
						<view class="metric">
							<text class="m-v">{{ r.leoText }}</text>
							<text class="m-k">LEO 运力</text>
						</view>
						<view class="metric">
							<text class="m-v">{{ r.total_launch_count || 0 }}</text>
							<text class="m-k">累计发射</text>
						</view>
						<view class="metric">
							<text class="m-v">{{ r.rateText }}</text>
							<text class="m-k">成功率</text>
						</view>
					</view>
				</view>
			</view>

			<view class="foot-hint">
				<text v-if="hasMore">上拉加载更多</text>
				<text v-else>已显示全部 {{ ranked.length }} 个型号</text>
			</view>
		</view>

		<!-- 暗门（3 秒内连点标题 5 次）：填版本号模拟审核视角，两个按钮 -->
		<view class="dbg-mask" v-if="dbgShow" @click="dbgShow = false">
			<view class="dbg-panel" @click.stop>
				<input
					class="dbg-input"
					v-model="dbgInput"
					type="text"
					confirm-type="done"
				/>

				<view class="dbg-btns">
					<view class="dbg-btn" @click="applySim">模拟</view>
					<view class="dbg-btn dbg-btn-danger" @click="clearSim">清除</view>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import { rocketName } from '@/utils/format.js'
import { syncTabBar } from '@/utils/tabbar.js'
import { setOverride, getDebugInfo } from '@/utils/config.js'
import navMixin from '@/utils/nav-mixin.js'

const STEP = 14

// 可靠榜的准入门槛：只打过一两发的型号 100% 成功率没有说服力
const MIN_LAUNCH_FOR_RELIABILITY = 5

const SORTS = [
	{ value: 'overall', label: '综合榜', desc: '45% 活跃度 · 35% 可靠性 · 20% LEO 运力' },
	{ value: 'capacity', label: '运力榜', desc: '按 LEO 运力从高到低' },
	{ value: 'launches', label: '发射榜', desc: '按累计发射次数从高到低' },
	{ value: 'reliability', label: '可靠榜', desc: '成功率优先，至少 ' + MIN_LAUNCH_FOR_RELIABILITY + ' 次发射才参与排名' }
]

const REGIONS = [
	{ value: 'all', label: '全球' },
	{ value: 'cn', label: '中国' },
	{ value: 'us', label: '美国' },
	{ value: 'ru', label: '俄罗斯' },
	{ value: 'eu', label: '欧洲' },
	{ value: 'asia', label: '亚洲其他' },
	{ value: 'other', label: '其他' }
]

/**
 * 地区判定。
 *
 * LL2 的型号库**没有国家字段**，manufacturer 只是一串公司名，
 * 而且很多中国商业航天公司名字里并没有 China（LandSpace、Galactic Energy…），
 * 所以只能靠关键词白名单，漏掉的落到「其他」而不是硬猜。
 */
const REGION_RULES = [
	{
		value: 'cn',
		re: /china|chinese|landspace|galactic energy|i-?space|cas space|expace|orienspace|space pioneer|deep blue|china rocket|one space|kuaizhou|zhuque|ceres|hyperbola|gravity|tianlong|jielong|kinetica|pallas|lijian|kaituo|rocket co\./i
	},
	{ value: 'us', re: /spacex|united launch|orbital sciences|orbital atk|firefly|astra|blue origin|stoke|rocket lab|northrop|masten|relativity/i },
	{ value: 'ru', re: /khrunichev|progress rocket|energia|roskosmos|makeyev|yuzhnoye|yuzhmash/i },
	{ value: 'eu', re: /ariane|esa|hyimpulse|hyprspace|maiaspace|payload aerospace|avio|ohb|isaraerospace|orbex|skyrora|augsburg/i },
	{ value: 'asia', re: /indian space|isro|mitsubishi|japan aerospace|jaxa|korean|innospace|space one|interstellar|tispace|kari|galaxy space|land space/i }
]

function regionOf(x) {
	const maker = x.manufacturer || ''
	for (const r of REGION_RULES) {
		if (r.re.test(maker)) return r.value
	}
	return 'other'
}

export default {
	mixins: [navMixin],

	data() {
		return {
			all: [],
			loading: true,
			keyword: '',
			sort: 'overall',
			region: 'all',
			listNum: STEP,
			navSolid: false,
			sorts: SORTS,
			regions: REGIONS,
			// 暗门计数：3 秒内连点 5 次「火箭资料库」标题呼出审核视角调试面板
			taps: 0,
			tapTimer: null,
			// 调试面板状态
			dbgShow: false,
			dbgInput: ''
		}
	},

	computed: {
		/**
		 * 榜单的候选池：只排现役型号，按地区收窄，再按型号名去重。
		 *
		 * 型号库里同一型火箭会有多个构型记录（Starship / Starship V2…），
		 * 不去重的话榜单上会出现两条同名条目，看起来像 bug。
		 * 同名只保留综合分最高的那条，其余构型在详情页的「同系列构型」里能看到。
		 */
		pool() {
			const seen = new Map()
			for (const x of this.all) {
				if (!x.active) continue
				if (this.region !== 'all' && x.region !== this.region) continue

				const k = x.name || x.zhName
				const cur = seen.get(k)
				if (!cur || x.score > cur.score) seen.set(k, x)
			}
			return [...seen.values()]
		},

		currentSort() {
			return SORTS.find((s) => s.value === this.sort) || SORTS[0]
		},

		/** 归一化的分母，整个榜单共用一套，换筛选时名次才有可比性 */
		maxes() {
			let maxLaunch = 1
			let maxLeo = 1
			for (const x of this.all) {
				if (!x.active) continue
				maxLaunch = Math.max(maxLaunch, x.total_launch_count || 0)
				maxLeo = Math.max(maxLeo, x.leo_capacity || 0)
			}
			return { maxLaunch, maxLeo }
		},

		ranked() {
			const q = this.keyword.trim().toLowerCase()
			let list = this.pool

			if (q) {
				list = list.filter((x) => {
					const hay = [x.zhName, x.name, x.full_name, x.manufacturer, x.family, x.variant]
						.filter(Boolean)
						.join(' ')
						.toLowerCase()
					return hay.indexOf(q) !== -1
				})
			}

			const arr = list.slice()

			if (this.sort === 'capacity') {
				arr.sort((a, b) => (b.leo_capacity || 0) - (a.leo_capacity || 0))
			} else if (this.sort === 'launches') {
				arr.sort((a, b) => (b.total_launch_count || 0) - (a.total_launch_count || 0))
			} else if (this.sort === 'reliability') {
				arr.sort((a, b) => {
					const qa = (a.total_launch_count || 0) >= MIN_LAUNCH_FOR_RELIABILITY
					const qb = (b.total_launch_count || 0) >= MIN_LAUNCH_FOR_RELIABILITY
					if (qa !== qb) return qa ? -1 : 1
					if (qa && qb) {
						const d = (b.rate || 0) - (a.rate || 0)
						if (d) return d
					}
					// 成功率相同（或都不够门槛）时，发射多的更靠前
					return (b.total_launch_count || 0) - (a.total_launch_count || 0)
				})
			} else {
				arr.sort((a, b) => b.score - a.score || (b.total_launch_count || 0) - (a.total_launch_count || 0))
			}

			return arr
		},

		visible() {
			return this.ranked.slice(0, this.listNum)
		},

		hasMore() {
			return this.listNum < this.ranked.length
		},

		// ---- 头部三格：运力之最 / 最活跃 / 可复用数量 ----
		topLeo() {
			let best = null
			for (const x of this.pool) {
				if (!(x.leo_capacity > 0)) continue
				if (!best || x.leo_capacity > best.leo_capacity) best = x
			}
			if (!best) return { name: '—', text: '暂无数据' }
			return { name: best.zhName, text: leoText(best.leo_capacity) }
		},

		topLaunch() {
			let best = null
			for (const x of this.pool) {
				if (!(x.total_launch_count > 0)) continue
				if (!best || x.total_launch_count > best.total_launch_count) best = x
			}
			if (!best) return { name: '—', text: '暂无数据' }
			return { name: best.zhName, text: best.total_launch_count + ' 次发射' }
		},

		reusableCount() {
			return this.pool.filter((x) => x.reusable).length
		}
	},

	onLoad() {
		this.getData()
	},

	onShow() {
		syncTabBar(3)
	},

	// 滚过榜单头以后给顶栏加毛玻璃，标题不悬空在内容上
	onPageScroll(e) {
		const solid = (e && e.scrollTop ? e.scrollTop : 0) > 120
		if (solid !== this.navSolid) this.navSolid = solid
	},

	onPullDownRefresh() {
		this.listNum = STEP
		this.getData(true).then(() => uni.stopPullDownRefresh())
	},

	onReachBottom() {
		if (!this.hasMore) return
		this.listNum += STEP
	},

	onUnload() {
		if (this.tapTimer) clearTimeout(this.tapTimer)
	},

	methods: {
		onTitleTap() {
			this.taps++
			if (this.tapTimer) clearTimeout(this.tapTimer)
			this.tapTimer = setTimeout(() => (this.taps = 0), 3000)

			if (this.taps >= 5) {
				this.taps = 0
				this.openDebug()
			}
		},

		/**
		 * 暗门：只做一件事 —— 填版本号，本机按该版本号判定。
		 *
		 * 判定依据就是「当前版本号在不在远程白名单里」，所以只要能让本机
		 * 假装成某个版本号，看到的就正好是审核员跑那一版时的界面。
		 * 开发版/体验版本来永远完整态，靠这个假版本号才能看到工具态。
		 */
		openDebug() {
			const info = getDebugInfo()
			this.dbgInput = (info && info.override && info.override.version) || ''
			this.dbgShow = true
		},

		applySim() {
			const v = (this.dbgInput || '').trim()
			if (!v) {
				uni.showToast({ title: '请填版本号，如 3.1.0', icon: 'none' })
				return
			}
			setOverride(v)
			this.resetAndGo('/pages/rockets/rockets')
		},

		// 清除本机覆盖，回到环境默认（开发版完整态 / 正式版跟随 COS）
		clearSim() {
			setOverride(null)
			this.resetAndGo('/pages/index/index')
		},

		// reLaunch 失败时页面栈不会清空，旧实例会卡在旧状态，必须提示
		resetAndGo(url) {
			this.dbgShow = false
			uni.reLaunch({
				url,
				fail: () => uni.showToast({ title: '切换失败，请重试', icon: 'none' })
			})
		},

		async getData(force) {
			this.loading = true
			try {
				const d = await spaceData.load('launchers', { force: !!force })
				const list = (d && d.list) || []

				// 归一化用的分母先算出来，综合分的三项才好加权到同一量纲
				let maxLaunch = 1
				let maxLeo = 1
				for (const x of list) {
					if (!x.active) continue
					maxLaunch = Math.max(maxLaunch, x.total_launch_count || 0)
					maxLeo = Math.max(maxLeo, x.leo_capacity || 0)
				}

				this.all = list.map((x) => {
					const zh = rocketName(x)
					const ok = x.successful_launches || 0
					const bad = x.failed_launches || 0
					const tried = ok + bad
					// 没打过 / 只有成功记录但总数为 0 的，不给成功率，避免 100% 假象
					const rate = tried > 0 ? ok / tried : 0

					const act = (x.total_launch_count || 0) / maxLaunch
					const cap = (x.leo_capacity || 0) / maxLeo
					const score = 0.45 * act + 0.35 * rate + 0.2 * cap

					const fams = x.families || []
					return {
						...x,
						zhName: zh,
						region: regionOf(x),
						rate,
						rateText: tried > 0 ? (rate * 100).toFixed(1) + '%' : '—',
						leoText: x.leo_capacity > 0 ? leoText(x.leo_capacity) : '—',
						// families[0] 是家族（Falcon / Long March），第二层才是具体系列
						family: fams[0] || '',
						variant: x.variant || '',
						score
					}
				})
			} catch (e) {
				console.warn('[rockets] 获取型号库失败', e)
			} finally {
				this.loading = false
			}
		},

		goRocket(r) {
			uni.navigateTo({
				url: '/pages/rocket/rocket?id=' + r.id + '&name=' + encodeURIComponent(r.zhName || r.name)
			})
		}
	},

	watch: {
		keyword() {
			this.listNum = STEP
		},
		sort() {
			this.listNum = STEP
		},
		region() {
			this.listNum = STEP
		}
	}
}

/** 运力文案：吨位级的用「吨」，小型的直接用 kg，都比一串数字好扫 */
function leoText(kg) {
	const v = Number(kg)
	if (!isFinite(v) || v <= 0) return '—'
	if (v >= 1000) {
		const t = Math.round((v / 1000) * 10) / 10
		return (t % 1 === 0 ? t.toFixed(0) : t) + ' 吨'
	}
	return v + ' kg'
}
</script>

<style lang="scss" scoped>
@import '../../styles/list.scss';

.page {
	position: relative;
	min-height: 100vh;
	padding: 0 24rpx 200rpx;
	box-sizing: border-box;
	/* 顶部两团冷/暖光晕压在星空之上：暖色呼应榜单主色，冷色补纵深，
	   比纯黑底更有「站在观测台往下看」的空间感 */
	background: radial-gradient(120% 55% at 50% -8%, rgba(255, 106, 61, 0.16) 0%, rgba(255, 106, 61, 0) 62%),
		radial-gradient(90% 45% at 100% 6%, rgba(64, 132, 255, 0.12) 0%, rgba(64, 132, 255, 0) 58%);
}

/* 顶栏只在滚过榜单头之后才有底：一开始标题直接压在光晕上，更沉浸 */
.nav-row {
	transition: background 0.24s ease;
}

.nav-row.solid {
	background: rgba(10, 14, 23, 0.82);
	-webkit-backdrop-filter: blur(24rpx) saturate(140%);
	backdrop-filter: blur(24rpx) saturate(140%);
}

/* ==================== 榜单头部 ==================== */
.hero {
	position: relative;
	margin-top: 6rpx;
	padding: 28rpx 26rpx 0;
	background: linear-gradient(158deg, rgba(30, 39, 58, 0.96) 0%, rgba(18, 24, 36, 0.94) 58%, rgba(15, 20, 31, 0.96) 100%);
	border: 1rpx solid rgba(255, 255, 255, 0.08);
	border-radius: 26rpx;
	overflow: hidden;
	box-shadow: 0 24rpx 60rpx rgba(0, 0, 0, 0.42), inset 0 1rpx 0 rgba(255, 255, 255, 0.06);
}

/* 卡面顶部的暖色辉光：把「榜」的重量感做出来，而不是一张平卡 */
.hero::before {
	content: '';
	position: absolute;
	left: -18%;
	top: -58%;
	width: 136%;
	height: 130%;
	background: radial-gradient(50% 50% at 50% 50%, rgba(255, 106, 61, 0.24) 0%, rgba(255, 106, 61, 0) 68%);
	pointer-events: none;
}

/* 底部极细的主色线，收住整张卡 */
.hero::after {
	content: '';
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	height: 2rpx;
	background: linear-gradient(90deg, rgba(255, 106, 61, 0) 0%, rgba(255, 106, 61, 0.55) 50%, rgba(255, 106, 61, 0) 100%);
}

.hero-top {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.hero-kicker {
	color: #5d6a7e;
	font-size: 19rpx;
	letter-spacing: 1rpx;
}

.hero-state {
	position: relative;
	padding: 3rpx 12rpx;
	border: 1rpx solid rgba(255, 77, 79, 0.55);
	border-radius: 6rpx;
	color: #ff6b6d;
	font-size: 19rpx;
	line-height: 1.5;
	background: rgba(255, 77, 79, 0.08);
	box-shadow: 0 0 16rpx rgba(255, 77, 79, 0.18);
}

.hero-main {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	margin-top: 16rpx;
}

.hero-left {
	flex: 1;
	min-width: 0;
}

.hero-title {
	display: block;
	color: #ffffff;
	font-size: 48rpx;
	font-weight: 700;
	letter-spacing: 2rpx;
	line-height: 1.22;
	text-shadow: 0 6rpx 28rpx rgba(255, 106, 61, 0.34);
}

.hero-sub {
	display: block;
	margin-top: 8rpx;
	color: #6b7891;
	font-size: 22rpx;
}

.hero-count {
	flex-shrink: 0;
	margin-left: 20rpx;
	text-align: right;
}

.hero-num {
	display: block;
	color: #ff8a5c;
	font-size: 66rpx;
	font-weight: 700;
	line-height: 1;
	text-shadow: 0 0 30rpx rgba(255, 106, 61, 0.55);
}

.hero-unit {
	display: block;
	margin-top: 6rpx;
	color: #6b7891;
	font-size: 20rpx;
}

/* 三格极值：连成一条，用竖线分隔，不各占一张卡 */
.hero-cells {
	position: relative;
	display: flex;
	margin-top: 24rpx;
	border-top: 1rpx solid rgba(255, 255, 255, 0.07);
}

.hcell {
	flex: 1;
	min-width: 0;
	padding: 18rpx 0 22rpx;
	border-right: 1rpx solid rgba(255, 255, 255, 0.07);
}

.hcell:last-child {
	border-right: none;
}

.hcell-k {
	display: block;
	color: #5d6a7e;
	font-size: 19rpx;
}

.hcell-v {
	display: block;
	margin-top: 8rpx;
	color: #f0f5fc;
	font-size: 24rpx;
	font-weight: 600;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.hcell-n {
	display: block;
	margin-top: 4rpx;
	color: #8a97a8;
	font-size: 20rpx;
}

/* ==================== 搜索 ==================== */
.search {
	display: flex;
	align-items: center;
	height: 78rpx;
	margin: 18rpx 0;
	padding: 0 24rpx;
	background: rgba(19, 25, 38, 0.92);
	border: 1rpx solid rgba(255, 255, 255, 0.07);
	border-radius: 14rpx;
	box-shadow: inset 0 2rpx 10rpx rgba(0, 0, 0, 0.28);
}

.search-icon {
	margin-right: 12rpx;
	font-size: 24rpx;
	opacity: 0.55;
}

.search-input {
	flex: 1;
	height: 78rpx;
	color: #e2e8f0;
	font-size: 26rpx;
}

.search-ph {
	color: #4a5568;
}

.search-clear {
	padding: 0 8rpx;
	color: #4a5568;
	font-size: 26rpx;
}

/* ==================== 排序 / 地区 ==================== */
.sort-label {
	display: block;
	margin-bottom: 12rpx;
	color: #6b7891;
	font-size: 21rpx;
}

.sort-tabs {
	display: flex;
	margin-bottom: 16rpx;
}

.sort-tab {
	flex: 1;
	height: 68rpx;
	line-height: 68rpx;
	margin-right: 12rpx;
	text-align: center;
	background: #131926;
	border: 1rpx solid rgba(255, 255, 255, 0.06);
	border-radius: 8rpx;
	color: #8a97a8;
	font-size: 25rpx;
}

.sort-tab:last-child {
	margin-right: 0;
}

.sort-tab.on {
	background: linear-gradient(135deg, #ff8a5c 0%, #ff5a2b 100%);
	border-color: rgba(255, 138, 92, 0.9);
	color: #14181f;
	font-weight: 600;
	box-shadow: 0 8rpx 24rpx rgba(255, 106, 61, 0.3);
}

/* 横滑区必须有确定高度，否则 scroll-view 会塌陷 */
.region-scroll {
	width: 100%;
	height: 64rpx;
	white-space: nowrap;
}

.region-inner {
	display: flex;
	align-items: center;
}

.region {
	flex-shrink: 0;
	margin-right: 12rpx;
	padding: 8rpx 22rpx;
	background: #131926;
	border: 1rpx solid rgba(255, 255, 255, 0.06);
	border-radius: 8rpx;
	color: #8a97a8;
	font-size: 23rpx;
}

.region.on {
	background: #eef3fa;
	border-color: #eef3fa;
	color: #14181f;
	font-weight: 600;
	box-shadow: 0 6rpx 18rpx rgba(210, 226, 246, 0.18);
}

/* 榜单口径行 */
.board-line {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	padding: 10rpx 0 16rpx;
}

.board-left {
	flex: 1;
	min-width: 0;
	display: flex;
	align-items: baseline;
	flex-wrap: wrap;
}

.board-title {
	margin-right: 12rpx;
	color: #ffffff;
	font-size: 26rpx;
	font-weight: 600;
}

.board-desc {
	color: #6b7891;
	font-size: 20rpx;
}

.board-count {
	flex-shrink: 0;
	margin-left: 12rpx;
	color: #ff6a3d;
	font-size: 22rpx;
}

/* ==================== 排行卡片 ==================== */
.rank-card {
	position: relative;
	display: flex;
	margin-bottom: 16rpx;
	padding: 16rpx;
	background: linear-gradient(150deg, rgba(25, 32, 47, 0.96) 0%, rgba(16, 21, 32, 0.96) 100%);
	border: 1rpx solid rgba(255, 255, 255, 0.06);
	border-radius: 20rpx;
	overflow: hidden;
	box-shadow: 0 10rpx 30rpx rgba(0, 0, 0, 0.22);
}

/* 前三名：描边转暖，左侧加一条渐隐的主色竖线 */
.rank-card.is-top {
	border-color: rgba(255, 106, 61, 0.22);
}

.rank-card.is-top::before {
	content: '';
	position: absolute;
	left: 0;
	top: 22rpx;
	bottom: 22rpx;
	width: 3rpx;
	background: linear-gradient(180deg, rgba(255, 138, 92, 0.95) 0%, rgba(255, 106, 61, 0) 100%);
}

.rank-card-hover {
	background: linear-gradient(150deg, rgba(32, 40, 58, 0.98) 0%, rgba(22, 28, 41, 0.98) 100%);
}

.rank-media {
	position: relative;
	width: 228rpx;
	height: 216rpx;
	flex-shrink: 0;
	margin-right: 18rpx;
	border-radius: 12rpx;
	overflow: hidden;
	background: #0f1520;
}

.rank-img {
	width: 100%;
	height: 100%;
}

/* 图片底部压暗，让角标在亮图上也能读清 */
.rank-media::after {
	content: '';
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	height: 64rpx;
	background: linear-gradient(to top, rgba(6, 10, 18, 0.82) 0%, rgba(6, 10, 18, 0) 100%);
	pointer-events: none;
}

.rank-ph {
	display: flex;
	align-items: center;
	justify-content: center;
}

.rank-ph-icon {
	font-size: 56rpx;
	opacity: 0.4;
}

/* 排名贴图左上角；前三名给金 / 银 / 铜，其余保持低调 */
.rank-no {
	position: absolute;
	left: 0;
	top: 0;
	z-index: 2;
	padding: 4rpx 14rpx;
	background: rgba(6, 10, 18, 0.76);
	border-bottom-right-radius: 12rpx;
	color: #8a97a8;
	font-size: 21rpx;
	font-weight: 700;
	letter-spacing: 1rpx;
}

.rank-no.lv1 {
	background: linear-gradient(135deg, #ffa268 0%, #ff5a2b 100%);
	color: #14181f;
	box-shadow: 0 4rpx 18rpx rgba(255, 106, 61, 0.42);
}

.rank-no.lv2 {
	background: linear-gradient(135deg, #eef3fa 0%, #b6c4d8 100%);
	color: #14181f;
}

.rank-no.lv3 {
	background: linear-gradient(135deg, #eab68c 0%, #c4834f 100%);
	color: #14181f;
}

/* 可复用角标贴图底 */
.rank-flag {
	position: absolute;
	left: 0;
	bottom: 0;
	z-index: 2;
	padding: 3rpx 12rpx;
	background: rgba(6, 10, 18, 0.7);
	border-top-right-radius: 8rpx;
	color: #9fd0ff;
	font-size: 18rpx;
	letter-spacing: 0.5rpx;
}

.rank-body {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
}

.rank-head {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
}

.rank-name {
	flex: 1;
	min-width: 0;
	color: #ffffff;
	font-size: 30rpx;
	font-weight: 600;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.rank-more {
	flex-shrink: 0;
	margin-left: 10rpx;
	padding: 2rpx 14rpx;
	border: 1rpx solid rgba(255, 106, 61, 0.32);
	border-radius: 999rpx;
	color: #ff8a5c;
	font-size: 19rpx;
	line-height: 1.6;
}

.rank-maker {
	display: block;
	margin-top: 6rpx;
	color: #6b7891;
	font-size: 21rpx;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.rank-tags {
	display: flex;
	flex-wrap: wrap;
	margin-top: 8rpx;
}

.rtag {
	margin: 0 8rpx 4rpx 0;
	padding: 2rpx 12rpx;
	background: rgba(255, 255, 255, 0.055);
	border: 1rpx solid rgba(255, 255, 255, 0.06);
	border-radius: 4rpx;
	color: #97a4b6;
	font-size: 18rpx;
}

/* 三项指标平铺在卡片底部，数值大、标签小 */
.rank-metrics {
	display: flex;
	margin-top: auto;
	padding-top: 12rpx;
}

.metric {
	flex: 1;
	min-width: 0;
}

.m-v {
	display: block;
	color: #f0f5fc;
	font-size: 26rpx;
	font-weight: 600;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.m-k {
	display: block;
	margin-top: 2rpx;
	color: #5d6a7e;
	font-size: 18rpx;
}

.foot-hint {
	padding: 24rpx 0 40rpx;
	text-align: center;
	color: #3d4a5c;
	font-size: 22rpx;
}

/* ==================== 暗门：审核视角调试面板 ==================== */
.dbg-mask {
	position: fixed;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	z-index: 999;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 0 40rpx;
	background: rgba(4, 8, 16, 0.74);
}

.dbg-panel {
	width: 100%;
	max-width: 600rpx;
	padding: 34rpx 32rpx 28rpx;
	box-sizing: border-box;
	background: #131c2c;
	border: 1rpx solid rgba(120, 160, 220, 0.18);
	border-radius: 24rpx;
	box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.5);
}

.dbg-input {
	height: 78rpx;
	padding: 0 22rpx;
	box-sizing: border-box;
	color: #ffffff;
	font-size: 28rpx;
	background: rgba(255, 255, 255, 0.05);
	border: 1rpx solid rgba(120, 160, 220, 0.22);
	border-radius: 14rpx;
}

.dbg-btns {
	display: flex;
	margin-top: 20rpx;
}

.dbg-btn {
	flex: 1;
	height: 78rpx;
	line-height: 78rpx;
	margin-right: 16rpx;
	text-align: center;
	color: #38bdf8;
	font-size: 27rpx;
	background: rgba(56, 189, 248, 0.14);
	border-radius: 14rpx;
}

.dbg-btn:last-child {
	margin-right: 0;
}

.dbg-btn-danger {
	color: #f87171;
	background: rgba(248, 113, 113, 0.12);
}
</style>
