<template>
	<view class="page">
		<nav-bar :solid="true" title="全部图片" placeholder />

		<!-- 两列密排：哪列短就往哪列塞，列尾自然参差，比等高网格更像「墙」 -->
		<view class="wall" v-if="items.length">
			<view class="col" v-for="(col, ci) in cols" :key="'c' + ci">
				<view
					class="cell"
					v-for="(c, i) in col"
					:key="c.it.id + '_' + i"
					:style="{ height: c.h + 'rpx' }"
					@click="preview(c.gi)"
				>
					<image class="cell-img" :src="c.it.thumb" mode="aspectFill" lazy-load></image>
				</view>
			</view>
		</view>

		<view class="loading" v-if="loading">
			<text class="hint-text">加载中...</text>
		</view>

		<view class="empty-box" v-else-if="!items.length">
			<text class="empty-icon">🛰️</text>
			<text class="empty-text">还没有图片</text>
			<text class="empty-sub">历史图片正在由后台逐批补齐，过几个小时再来看看</text>
		</view>

		<!-- 底部：已看 N / 共 M，加载中转圈，到底了给一句话 -->
		<view class="foot" v-if="items.length">
			<text class="foot-text" v-if="loadingMore">正在加载更多...</text>
			<text class="foot-text" v-else-if="done">已到底 · 共 {{ total }} 张</text>
			<text class="foot-text" v-else>{{ items.length }} / {{ total || items.length }}</text>
		</view>

		<photo-view
			:visible="photoVisible"
			:list="items"
			:index="photoIndex"
			@close="photoVisible = false"
		/>
	</view>
</template>

<script>
/**
 * 全部图片（图库的全量视图）
 *
 * 为什么单独一页，而不是把图库那个横滚墙换掉：
 *   横滚墙的价值是「打开就有动静」，一屏永远看不完；但它的内容量被
 *   滚动速度限制死了 —— 每行 12 张，用户盯一天也翻不到 1957 年。
 *   想看全历史的图，必须是一个能主动下翻的页面。
 *
 * 数据为什么分片：
 *   全量约 2500 张唯一图 ≈ 700KB。一次拉下来，弱网要转十几秒，
 *   Storage 也放不下（10MB 配额还要给别的数据集）。
 *   后端按 500 张一片切好，这里先渲染第 0 片（就在 gallery 索引里，
 *   不多发一次请求），滑到底再拉下一片。
 *
 * 为什么高度是算出来的伪随机：
 *   真瀑布流要么等 image load 回调（首屏会跳一下），要么写死等高（就不是瀑布流了）。
 *   用 id 的 hash 取三档高度，同一张图永远同一个高度 —— 不闪、不错位，
 *   看起来依然是参差的。
 */
import spaceData from '@/utils/data.js'

// 三档高度（rpx）。差得够开才看得出参差，又不能差到一屏只放两张
const HEIGHTS = [360, 440, 520]

/** 按 id 取确定高度：FNV-1a，同 id 恒定，列表追加时老图不会重新洗牌 */
function heightOf(id) {
	const s = String(id || '')
	let h = 2166136261
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i)
		h = Math.imul(h, 16777619)
	}
	return HEIGHTS[(h >>> 0) % HEIGHTS.length]
}

export default {
	data() {
		return {
			loading: true,
			loadingMore: false,
			items: [],
			// 已加载的分片数（第 0 片算 1）
			loaded: 0,
			chunks: 1,
			total: 0,
			photoVisible: false,
			photoIndex: 0
		}
	},

	computed: {
		cols() {
			const L = []
			const R = []
			let hl = 0
			let hr = 0
			for (let gi = 0; gi < this.items.length; gi++) {
				const it = this.items[gi]
				const h = heightOf(it.id)
				// gi 是全局下标，弹层要拿它定位到 items 里的位置
				if (hl <= hr) {
					L.push({ it, h, gi })
					hl += h
				} else {
					R.push({ it, h, gi })
					hr += h
				}
			}
			return [L, R]
		},

		done() {
			return this.loaded >= this.chunks
		}
	},

	async onLoad() {
		const g = await spaceData.load('gallery').catch(() => null)

		this.items = ((g && g.list) || []).filter((x) => x && x.thumb)
		this.total = (g && g.count) || this.items.length
		this.chunks = Math.max(1, (g && g.chunks) || 1)
		this.loaded = this.items.length ? 1 : 0
		this.loading = false
	},

	onReachBottom() {
		this.loadMore()
	},

	methods: {
		async loadMore() {
			if (this.loadingMore || this.loading || this.done) return
			this.loadingMore = true

			try {
				const d = await spaceData.galleryChunk(this.loaded)
				const add = ((d && d.list) || []).filter((x) => x && x.thumb)

				// 分片号对不上说明线上重新切过片（数据变多了），已加载的位置会错位。
				// 这种情况只追加不重排，让用户手里的位置保持不动
				if (add.length) this.items = this.items.concat(add)

				// 线上总片数比进来时多（后台又扫到新图）就跟着更新，不然永远翻不到新片
				if (d && d.chunks) this.chunks = d.chunks
				this.loaded++
			} catch (e) {
				// 网络失败不推进 loaded：用户再滑一次会重试同一片
				console.warn('[gallery-all] 分片加载失败', this.loaded, e && e.message)
			} finally {
				this.loadingMore = false
			}
		},

		preview(gi) {
			const n = this.items.length
			if (!n) return
			this.photoIndex = Math.max(0, Math.min(Number(gi) || 0, n - 1))
			this.photoVisible = true
		}
	}
}
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background: #0a0e17;
	/* 底部给加载提示留白，也避开 iPhone 底部横条 */
	padding-bottom: calc(60rpx + env(safe-area-inset-bottom));
	box-sizing: border-box;
}

.wall {
	display: flex;
	align-items: flex-start;
	padding: 8rpx 12rpx 0;
}

.col {
	flex: 1;
	min-width: 0;
	/* 两列之间靠 padding 撑开，不用 gap —— 旧内核的 flex gap 不生效 */
	padding: 0 6rpx;
	box-sizing: border-box;
}

.cell {
	margin-bottom: 12rpx;
	border-radius: 10rpx;
	overflow: hidden;
	background: #131a26;
}

.cell-img {
	display: block;
	width: 100%;
	height: 100%;
}

/* ---- 底部状态 ---- */
.foot {
	display: flex;
	justify-content: center;
	padding: 30rpx 0 10rpx;
}

.foot-text {
	color: #4d5a6e;
	font-size: 22rpx;
}

/* ---- 空态 / 加载 ---- */
.loading {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 200rpx 0;
}

.hint-text {
	color: #6b7891;
	font-size: 26rpx;
}

.empty-box {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 200rpx 60rpx 0;
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
</style>
