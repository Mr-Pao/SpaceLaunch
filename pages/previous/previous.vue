<template>
	<view class="page">
		<view class="stat" v-if="total">
			<text class="stat-main">已发射 {{ total }} 次</text>
			<text class="stat-sub">{{ progressText }}</text>
		</view>

		<view class="list">
			<launch-card
				v-for="item in visible"
				:key="item.id"
				:item="item"
				:fav="favIds.indexOf(item.id) !== -1"
				@select="goDetail"
			/>
		</view>

		<view class="loading" v-if="loading && visible.length === 0">
			<text class="hint-text">加载中...</text>
		</view>

		<view class="empty" v-else-if="!loading && visible.length === 0">
			<text class="empty-icon">🛰️</text>
			<text class="hint-text">暂无历史发射数据</text>
		</view>

		<view class="foot-hint" v-if="visible.length > 0">
			<text v-if="loadingMore">正在加载更早的发射…</text>
			<text v-else-if="loadError">{{ loadError }}，上拉重试</text>
			<text v-else-if="hasMore">上拉加载更多</text>
			<text v-else>已显示全部 {{ list.length }} 条</text>
		</view>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import { syncTabBar } from '@/utils/tabbar.js'
import { loadIndex, loadPage, clearIndex } from '@/utils/history.js'
import { snapshot as favSnapshot } from '@/utils/favorites.js'

const STEP = 12

export default {
	data() {
		return {
			// 已从 CDN 拉下来的全部条目（首屏 100 条 + 逐片追加）
			list: [],
			total: 0,
			freshText: '',
			loading: true,
			loadingMore: false,
			loadError: '',
			favIds: [],
			// 一次渲染太多卡片会掉帧，先给 12 张，触底再放
			listNum: STEP,
			// 归档索引与已加载到的分片
			index: null,
			pageIndex: 0
		}
	},

	computed: {
		visible() {
			return this.list.slice(0, this.listNum)
		},
		// 本地还有没渲染出来的
		hasLocal() {
			return this.listNum < this.list.length
		},
		// COS 上还有没下载的分片
		hasArchive() {
			const idx = this.index
			return !!(idx && idx.pages && this.pageIndex < idx.pages.length)
		},
		hasMore() {
			return this.hasLocal || this.hasArchive
		},
		progressText() {
			const idx = this.index
			if (!idx || !idx.total) return this.freshText
			// 归档还没跑完时把进度也显示出来，用户知道「更多」是慢慢补的
			if (!idx.done) {
				return '已归档 ' + idx.archived + ' / ' + idx.total + ' 条'
			}
			return this.freshText
		}
	},

	onLoad() {
		this.getData()
		this.prepareArchive()
	},

	onShow() {
		syncTabBar(1)
	},

	onPullDownRefresh() {
		this.listNum = STEP
		this.pageIndex = 0
		this.index = null
		Promise.all([this.getData(true), this.prepareArchive(true)]).then(() => uni.stopPullDownRefresh())
	},

	onReachBottom() {
		if (this.hasLocal) {
			this.listNum += STEP
			return
		}
		this.loadMore()
	},

	methods: {
		async getData(force) {
			this.loading = true
			try {
				const d = await spaceData.load('previous', { force: !!force })
				this.list = (d && d.list) || []
				this.total = (d && d.count) || this.list.length
				this.freshText = spaceData.freshnessText(d && d.generatedAt)
				this.refreshFav()
			} catch (e) {
				console.warn('[previous] 获取历史发射失败', e)
			} finally {
				this.loading = false
			}
		},

		// 索引很小，先拿到手才能知道总共分了多少片
		async prepareArchive(force) {
			try {
				if (force) clearIndex()
				this.index = await loadIndex()
				this.pageIndex = 0
			} catch (e) {
				// 归档还没跑过 / 还没生成索引，属于正常情况，只显示最近 100 条
				console.log('[previous] 暂无历史归档索引', e && e.message)
				this.index = null
			}
		},

		async loadMore() {
			if (this.loadingMore || !this.hasArchive) return

			this.loadingMore = true
			this.loadError = ''

			try {
				const page = this.index.pages[this.pageIndex]
				const list = await loadPage(page)

				// 归档按 offset 抓取，新任务插入会导致轻微错位，按 id 去重
				const seen = new Set()
				for (const x of this.list) if (x.id) seen.add(x.id)

				const add = list.filter((x) => x.id && !seen.has(x.id))
				if (add.length) {
					this.list = this.list.concat(add)
					this.listNum += STEP
					this.refreshFav()
				}

				this.pageIndex++
			} catch (e) {
				console.warn('[previous] 加载归档分片失败', e)
				this.loadError = '加载失败'
			} finally {
				this.loadingMore = false
			}
		},

		refreshFav() {
			const set = favSnapshot()
			if (!set.size) {
				this.favIds = []
				return
			}
			// 只标记已加载部分，避免每次翻页都全量扫
			const ids = []
			for (const x of this.list) if (set.has(x.id)) ids.push(x.id)
			this.favIds = ids
		},

		goDetail(item) {
			if (!item || !item.id) return
			uni.navigateTo({ url: '/pages/launch/launchInfo?id=' + item.id })
		}
	}
}
</script>

<style lang="scss" scoped>
@import '../../styles/list.scss';

.page {
	min-height: 100vh;
	padding: 20rpx 24rpx 200rpx;
	background: #0a0e17;
	box-sizing: border-box;
}
</style>
