<template>
	<view class="neo-sec">
		<!-- 概览：三个数字回答「这件事有多大」——不写这三个数，
		     单看下面几十条飞掠记录会完全无感 -->
		<view class="glance">
			<view class="g-cell">
				<text class="g-num">{{ totalKnownText }}</text>
				<text class="g-cap">已发现的近地天体</text>
			</view>
			<view class="g-div"></view>
			<view class="g-cell">
				<text class="g-num">{{ count }}</text>
				<text class="g-cap">未来 7 天接近次数</text>
			</view>
		</view>

		<view class="glance-note">
			<text class="gn-text">过去 7 天 {{ pastCount }} 次 · 其中 {{ hazardous }} 颗被标为「潜在危险」</text>
		</view>

		<view class="loading" v-if="loading">
			<text class="hint-text">加载中...</text>
		</view>

		<view class="empty" v-else-if="!groups.length">
			<text class="empty-text">暂无近地天体数据</text>
		</view>

		<template v-else>
			<!-- 最近的一次单独拎出来：读者最想知道的是「最近那颗离我们多远」 -->
			<view class="hero-card" v-if="closest">
				<view class="hc-top">
					<text class="hc-tag">最近的一次</text>
					<text class="hc-date">{{ closestShort }}</text>
				</view>
				<text class="hc-name">{{ closest.disp }}</text>
				<view class="hc-row">
					<text class="hc-big">{{ closest.lunar }} 地月距离</text>
					<text class="hc-sub" v-if="closest.dmax">直径约 {{ closest.dmax }} 米</text>
				</view>
				<text class="hc-hint">月球与地球的距离算作 1，这颗相当于在 {{ closest.lunar }} 倍月距处掠过</text>
			</view>

			<!-- 按天分组：这是「未来一周的日程」，不是无穷列表 -->
			<view class="day" v-for="g in groups" :key="g.key">
				<view class="day-head">
					<text class="day-date">{{ g.label }}</text>
					<text class="day-count">{{ g.items.length }} 颗</text>
				</view>

				<view
					class="nrow"
					v-for="x in g.items"
					:key="x.id + x.at"
					hover-class="nrow-hover"
					@click="toggle(x)"
				>
					<view class="nr-main">
						<view class="nr-line1">
							<text class="nr-name">{{ x.disp }}</text>
							<text class="nr-haz" v-if="x.haz">潜在危险</text>
						</view>
						<view class="nr-meta">
							<text class="nr-time">{{ x.atShort }}</text>
							<text class="nr-sep">·</text>
							<text class="nr-dim" v-if="x.dmax">直径 {{ x.dmin }}–{{ x.dmax }} 米</text>
							<text class="nr-sep" v-if="x.dmax">·</text>
							<text class="nr-vel" v-if="x.vkms">{{ x.vkms }} km/s</text>
						</view>

						<!-- 展开：绝对值放这里，默认只给「地月距离」这个最直观的尺度 -->
						<view class="nr-more" v-if="expanded === x.id">
							<text class="nm-line">距离 {{ x.wkm }} 万公里（地球到月球约 38.4 万公里）</text>
							<text class="nm-line" v-if="x.mag">绝对星等 {{ x.mag }}，数值越小代表天体本身越亮</text>
							<text class="nm-line" v-if="x.haz">
								「潜在危险」指的是尺寸够大、轨道够近，需要长期监测，不等于会撞上地球
							</text>
							<text class="nm-link" @click.stop="copyJpl(x)">复制 JPL 轨道数据链接</text>
						</view>
					</view>

					<view class="nr-dist">
						<text class="nr-lunar" :class="{ near: x.lunar !== null && x.lunar < 20 }">{{ x.lunar }}</text>
						<text class="nr-unit">地月距离</text>
					</view>
				</view>
			</view>

			<view class="neo-note">数据来源：NASA NeoWs（近地天体观测）· 一天更新一次</view>
		</template>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'

/**
 * 「太空环境」的近地天体半边（NASA NeoWs）。
 *
 * 设计取舍：
 *   1. 主尺度用「地月距离」而不是公里 —— 38 万公里这个量级普通人抓不住，
 *      而「几倍月距」一眼就能比。绝对值收进展开里。
 *   2. 「潜在危险」（is_potentially_hazardous_asteroid）只在展开里解释，
 *      不做红色警示条：实测一周 20% 的天体都命中这个标记，
 *      真进了撞击概率清单（sentry）的是 0 颗，做警示会变成谣言源。
 *   3. 按天分组而不是一条长列表 —— 这是一份「未来一周的日程」。
 */
export default {
	data() {
		return {
			loading: true,
			list: [],
			totalKnown: 0,
			count: 0,
			hazardous: 0,
			pastCount: 0,
			closest: null,
			// 展开中的那一条（null 即全部收起）
			expanded: ''
		}
	},

	computed: {
		totalKnownText() {
			if (!this.totalKnown) return '—'
			return String(this.totalKnown).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
		},

		closestShort() {
			if (!this.closest) return ''
			const m = String(this.closest.at || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
			return m ? `${m[2]}-${m[3]} ${m[4]}:${m[5]}` : ''
		},

		/**
		 * 按接近日期分组。atShort 已经是北京时间（CI 里算好），
		 * 所以这里直接切前 5 位当分组键，不用再处理时区
		 */
		groups() {
			const map = new Map()
			for (const x of this.list) {
				const key = (x.atShort || '').slice(0, 5)
				if (!map.has(key)) map.set(key, [])
				map.get(key).push(x)
			}
			return [...map.entries()]
				.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
				.map(([key, items]) => ({
					key,
					label: key,
					items: items.sort((a, b) => (a.atShort < b.atShort ? -1 : 1))
				}))
		}
	},

	mounted() {
		this.getData()
	},

	methods: {
		async getData() {
			try {
				const d = await spaceData.load('neoNears')
				this.list = (d && d.list) || []
				this.totalKnown = d.totalKnown || 0
				this.count = d.count || this.list.length
				this.hazardous = d.hazardous || 0
				this.pastCount = d.pastCount || 0
				this.closest = d.closest || null
			} catch (e) {
				console.warn('[neo] 加载失败', e)
			}
			this.loading = false
		},

		toggle(x) {
			this.expanded = this.expanded === x.id ? '' : x.id
		},

		copyJpl(x) {
			if (!x.jpl) return
			uni.setClipboardData({
				data: x.jpl,
				success: () => {
					uni.showToast({ title: '链接已复制，请到浏览器打开', icon: 'none', duration: 2000 })
				}
			})
		}
	}
}
</script>

<style scoped>
.glance {
	display: flex;
	align-items: center;
	margin-top: 6rpx;
	padding: 26rpx 10rpx;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	border-radius: 20rpx;
}
.g-cell {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
}
.g-num {
	color: #38bdf8;
	font-size: 44rpx;
	font-weight: 700;
	line-height: 1.1;
}
.g-cap {
	margin-top: 8rpx;
	color: #6b7891;
	font-size: 21rpx;
}
.g-div {
	width: 1rpx;
	height: 60rpx;
	background: rgba(255, 255, 255, 0.07);
}
.glance-note {
	padding: 12rpx 10rpx 0;
}
.gn-text {
	color: #55617a;
	font-size: 21rpx;
	line-height: 1.5;
}

.loading,
.empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 160rpx 40rpx;
}
.hint-text { color: #6b7891; font-size: 26rpx; }
.empty-text { color: #8a97ad; font-size: 28rpx; }

.hero-card {
	margin-top: 20rpx;
	padding: 24rpx;
	background: linear-gradient(135deg, #16233a 0%, #121a28 100%);
	border: 1rpx solid rgba(56, 189, 248, 0.18);
	border-radius: 20rpx;
}
.hc-top {
	display: flex;
	align-items: center;
	justify-content: space-between;
}
.hc-tag {
	padding: 3rpx 14rpx;
	font-size: 19rpx;
	color: #38bdf8;
	background: rgba(56, 189, 248, 0.14);
	border-radius: 6rpx;
}
.hc-date { color: #8a97ad; font-size: 22rpx; }
.hc-name {
	display: block;
	margin-top: 14rpx;
	color: #e8eef6;
	font-size: 34rpx;
	font-weight: 700;
}
.hc-row {
	display: flex;
	align-items: baseline;
	margin-top: 10rpx;
}
.hc-big {
	color: #38bdf8;
	font-size: 30rpx;
	font-weight: 600;
}
.hc-sub {
	margin-left: 16rpx;
	color: #8a97ad;
	font-size: 23rpx;
}
.hc-hint {
	display: block;
	margin-top: 12rpx;
	color: #55617a;
	font-size: 20rpx;
	line-height: 1.6;
}

.day { margin-top: 26rpx; }
.day-head {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	padding: 0 8rpx 10rpx;
}
.day-date {
	color: #c3cede;
	font-size: 25rpx;
	font-weight: 600;
}
.day-count { color: #55617a; font-size: 21rpx; }

.nrow {
	display: flex;
	align-items: center;
	margin-bottom: 12rpx;
	padding: 20rpx 22rpx;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	border-radius: 18rpx;
}
.nrow-hover { background: #1a2232; }

.nr-main { flex: 1; min-width: 0; }
.nr-line1 {
	display: flex;
	align-items: center;
	min-width: 0;
}
.nr-name {
	color: #e2e8f0;
	font-size: 28rpx;
	font-weight: 600;
	/* 名字最长能到「2005 GU」这种 7 字符，但轨道编号形态不定，保险起见单行截断 */
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.nr-haz {
	margin-left: 10rpx;
	padding: 2rpx 10rpx;
	font-size: 18rpx;
	color: #e0b25a;
	background: rgba(224, 178, 90, 0.12);
	border-radius: 5rpx;
	flex-shrink: 0;
}
.nr-meta {
	display: flex;
	align-items: center;
	/* 必须允许换行：日期 + 直径区间 + 速度在窄屏上放不下，
	     不换行就会把右边的「地月距离」挤出屏幕（375 宽实测会切掉） */
	flex-wrap: wrap;
	margin-top: 8rpx;
}
.nr-time,
.nr-dim,
.nr-vel {
	color: #6b7891;
	font-size: 22rpx;
	white-space: nowrap;
}
.nr-sep {
	margin: 0 8rpx;
	color: #3a4459;
	font-size: 20rpx;
}

.nr-more {
	margin-top: 14rpx;
	padding-top: 14rpx;
	border-top: 1rpx dashed rgba(255, 255, 255, 0.08);
}
.nm-line {
	display: block;
	color: #8a97ad;
	font-size: 21rpx;
	line-height: 1.7;
}
.nm-link {
	display: inline-block;
	margin-top: 12rpx;
	color: #38bdf8;
	font-size: 22rpx;
}

.nr-dist {
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	margin-left: 16rpx;
	flex-shrink: 0;
}
.nr-lunar {
	color: #c3cede;
	font-size: 32rpx;
	font-weight: 700;
	line-height: 1.1;
}
/* 20 倍月距以内算「近」：一周里通常只有一两颗，值得让人一眼看见 */
.nr-lunar.near { color: #38bdf8; }
.nr-unit {
	margin-top: 4rpx;
	color: #55617a;
	font-size: 18rpx;
}

.neo-note {
	margin-top: 34rpx;
	text-align: center;
	color: #4a5670;
	font-size: 20rpx;
	line-height: 1.6;
}
</style>
