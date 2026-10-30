<template>
	<view class="page">
		<nav-bar :solid="true" :title="tabTitle" placeholder />

		<!-- 顶部分类切换：图片 / 视频 / 地球 / 天文 / NASA -->
		<scroll-view class="tabs" scroll-x :show-scrollbar="false">
			<view
				class="tab"
				v-for="t in tabs"
				:key="t.key"
				:class="{ active: tab === t.key }"
				@click="switchTab(t.key)"
			>{{ t.name }}</view>
		</scroll-view>

		<!-- 图片：发射图墙（保留原逻辑） -->
		<block v-if="tab === 'image'">
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

			<view class="foot" v-if="items.length">
				<text class="foot-text" v-if="loadingMore">正在加载更多...</text>
				<text class="foot-text" v-else-if="done">已到底 · 共 {{ total }} 张</text>
				<text class="foot-text" v-else>{{ items.length }} / {{ total || items.length }}</text>
			</view>
		</block>

		<!-- 视频 -->
		<block v-else-if="tab === 'video'">
			<view class="loading" v-if="videoLoading">
				<text class="hint-text">加载中...</text>
			</view>

			<block v-else>
				<view class="grid" v-if="videos.length">
					<view class="gcol" v-for="(col, ci) in vidCols" :key="ci">
						<view
							class="vcard"
							v-for="(v, i) in col"
							:key="ci + '-' + i"
							@click="openVideo(v)"
						>
							<view class="vcover">
								<image class="vcover-img" :src="v.thumb" mode="aspectFill" lazy-load></image>
								<view class="vplay"></view>
								<text class="vtag" v-if="v.official">官方</text>
								<text class="vbadge ok" v-if="v.playable">可播</text>
								<text class="vbadge link" v-else>链接</text>
							</view>
							<text class="vtitle">{{ v.title }}</text>
							<text class="vmeta" v-if="v.publisher">@{{ v.publisher }}</text>
						</view>
					</view>
				</view>

				<view class="empty-box" v-else>
					<text class="empty-icon">🎬</text>
					<text class="empty-text">还没有视频</text>
					<text class="empty-sub">后台正在逐条抓取并转存，过段时间再来看看</text>
				</view>
			</block>
		</block>

		<!-- 地球：EPIC 每日地球影像 -->
		<block v-else-if="tab === 'earth'">
			<view class="loading" v-if="epicLoading">
				<text class="hint-text">加载中...</text>
			</view>

			<block v-else>
				<view class="wall" v-if="epicList.length">
					<view class="col" v-for="(col, ci) in earthCols" :key="ci">
						<view
							class="cell"
							v-for="(c, i) in col"
							:key="ci + '-' + i"
							@click="openPhotoDetail(c.it, '每日地球')"
						>
							<image class="cell-img cell-img-auto" :src="c.it.thumb" mode="widthFix" lazy-load></image>
						</view>
					</view>
				</view>

				<view class="empty-box" v-else>
					<text class="empty-icon">🌍</text>
					<text class="empty-text">还没有地球影像</text>
					<text class="empty-sub">后台正在抓取并转存，过段时间再来看看</text>
				</view>
			</block>
		</block>

		<!-- 天文：APOD 每日天文图 -->
		<block v-else-if="tab === 'astro'">
			<view class="loading" v-if="apodLoading">
				<text class="hint-text">加载中...</text>
			</view>

			<block v-else>
				<view class="wall" v-if="apodList.length">
					<view class="col" v-for="(col, ci) in astroCols" :key="ci">
						<view
							class="cell"
							v-for="(c, i) in col"
							:key="ci + '-' + i"
							@click="openPhotoDetail(c.it, '每日天文')"
						>
							<image class="cell-img cell-img-auto" :src="c.it.thumb" mode="widthFix" lazy-load></image>
						</view>
					</view>
				</view>

				<view class="empty-box" v-else>
					<text class="empty-icon">🔭</text>
					<text class="empty-text">还没有天文图</text>
					<text class="empty-sub">数据每天更新；若已过更新时段仍为空，可手动重试</text>
					<view class="retry-btn" hover-class="retry-btn-hover" @click="retryApod">重新加载</view>
				</view>
			</block>
		</block>

		<!-- NASA 影像：主题筛选 + 网格 -->
		<block v-else-if="tab === 'nasa'">
			<view class="loading" v-if="nasaLoading">
				<text class="hint-text">加载中...</text>
			</view>

			<block v-else>
				<!-- 只保留星云一个主题，二级筛选栏整块去掉（主标签已经叫星云） -->
				<view class="wall" v-if="nasaVisible.length">
					<view class="col" v-for="(col, ci) in nasaCols" :key="ci">
						<view
							class="cell"
							v-for="(c, i) in col"
							:key="ci + '-' + i"
							@click="openPhotoDetail(c.it, '星云')"
						>
							<image class="cell-img cell-img-auto" :src="c.it.thumb" mode="widthFix" lazy-load></image>
						</view>
					</view>
				</view>

				<view class="empty-box" v-else>
					<text class="empty-icon">🌌</text>
					<text class="empty-text">星云影像还在路上</text>
					<text class="empty-sub">后台正在抓取并转存，过段时间再来看看</text>
				</view>

				<!-- 分页提示：星云图多，控制首屏节点数 -->
				<view class="foot" v-if="nasaVisible.length">
					<text class="foot-text" v-if="nasaHasMore">上滑加载更多（{{ nasaVisible.length }} / {{ nasaFiltered.length }}）</text>
					<text class="foot-text" v-else>已显示全部 {{ nasaFiltered.length }} 张</text>
				</view>
			</block>
		</block>

		<!-- 视频内联播放遮罩 -->
		<view class="player-mask" v-if="playing" @click="closePlayer">
			<video
				v-if="playing && playing.cosUrl"
				class="player"
				:src="playing.cosUrl"
				controls
				autoplay
				:show-center-play-btn="true"
				object-fit="contain"
				@click.stop
			></video>
			<view class="player-bar" @click.stop>
				<text class="player-title">{{ playing.title }}</text>
				<text class="player-close" @click="closePlayer">✕</text>
			</view>
		</view>
	</view>
</template>

<script>
/**
 * 全部图片 / 图库总览（分类浏览器）
 *
 * 顶部一个分类切换：图片 / 视频 / 地球 / 天文 / NASA。
 * 「图片」标签完整保留原发射图墙逻辑（分片加载、伪随机高度瀑布流、点开进详情页）。
 * 其余标签各自拉独立数据集，互不影响，切走再切回不会重新拉取（已用 *_Loaded 标记）。
 */
import spaceData from '@/utils/data.js'
import { setAlbum } from '@/utils/album.js'

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

/**
 * 落地时就把高度算好挂到条目上。
 *
 * 高度只跟 id 有关，算一次就恒定；放进 items 里，cols 每次重算直接取，
 * 不用再跑一遍 N 次哈希（第 0 片就有 500 条）。
 */
function withHeight(list) {
	return (list || [])
		.filter((x) => x && x.thumb)
		.map((x) => ({ ...x, h: heightOf(x.id) }))
}

const TAB_KEYS = ['image', 'video', 'earth', 'astro', 'nasa']

export default {
	data() {
		return {
			loading: true,
			loadingMore: false,
			items: [],
			// 已渲染张数（触底 +60）。第 0 片就有 500 条，一次铺满节点首屏会明显变慢
			imageShow: 60,
			// 已加载的分片数（第 0 片算 1）
			loaded: 0,
			chunks: 1,
			total: 0,
			// 当前分类
			tab: 'image',
			tabs: [
				{ key: 'image', name: '发射图片' },
				{ key: 'video', name: '发射视频' },
				{ key: 'earth', name: '今日地球' },
				{ key: 'astro', name: '天文' },
				{ key: 'nasa', name: '星云' }
			],
			// 视频
			videos: [],
			videoLoading: false,
			videoLoaded: false,
			// 地球（EPIC）
			epicList: [],
			epicLoading: false,
			epicLoaded: false,
			// 天文（APOD）
			apodList: [],
			apodLoading: false,
			apodLoaded: false,
			// NASA 影像
			nasaList: [],
			// 已渲染张数（触底 +60）
			nasaShow: 60,
			nasaLoading: false,
			nasaLoaded: false,
			// 内联播放
			playing: null
		}
	},

	computed: {
		// ---- 图片标签：两列瀑布流（保留原逻辑）----
		// 只渲染前 N 张，和星云标签一个套路：节点数压到一屏能铺完的规模
		imageVisible() {
			return this.items.slice(0, this.imageShow)
		},

		cols() {
			const L = []
			const R = []
			let hl = 0
			let hr = 0
			const list = this.imageVisible
			for (let gi = 0; gi < list.length; gi++) {
				const it = list[gi]
				// 高度在落地时已经算好（见 withHeight），这里直接取
				const h = it.h || heightOf(it.id)
				// gi 是全局下标，弹层要拿它定位到 items 里的位置。
				// imageVisible 是 items 的前缀切片，两者下标一致
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
		},

		// ---- 视频标签：两列均分 ----
		vidCols() {
			return this.split2(this.videos)
		},

		// ---- 地球标签：两列均分 ----
		earthCols() {
			return this.waterfall(this.epicList)
		},

		// ---- 天文标签：两列均分 ----
		astroCols() {
			return this.waterfall(this.apodList)
		},

		// ---- NASA 标签：只展示星云 ----
		nasaFiltered() {
			// 缓存里可能还留着旧的多主题数据，这里兜底只取星云；取不到就退回全部
			const nur = this.nasaList.filter((x) => x.theme === 'nebula')
			return nur.length ? nur : this.nasaList
		},

		// 只渲染前 N 张：星云有 300+ 张，一次性铺完节点太多会拖慢滚动
		nasaVisible() {
			return this.nasaFiltered.slice(0, this.nasaShow)
		},

		nasaCols() {
			return this.waterfall(this.nasaVisible)
		},

		nasaHasMore() {
			return this.nasaShow < this.nasaFiltered.length
		},

		tabTitle() {
			const t = this.tabs.find((x) => x.key === this.tab)
			return t ? t.name : '图库'
		}
	},

	async onLoad(options) {
		const tab = (options && options.tab) || 'image'
		this.tab = TAB_KEYS.indexOf(tab) >= 0 ? tab : 'image'

		// 图片标签默认立即加载（保留原行为）
		const g = await spaceData.load('gallery').catch(() => null)
		this.items = withHeight(g && g.list)
		this.total = (g && g.count) || this.items.length
		this.chunks = Math.max(1, (g && g.chunks) || 1)
		this.loaded = this.items.length ? 1 : 0
		this.loading = false

		// 深链进入非图片标签时，同步预拉对应数据
		if (this.tab !== 'image') this.loadTab(this.tab)
	},

	onReachBottom() {
		// 图片标签：先把已加载的这一片铺完，铺满了才去拉下一片
		if (this.tab === 'image') {
			if (this.imageShow < this.items.length) {
				this.imageShow += 60
				return
			}
			this.loadMore()
			return
		}
		// 星云一次几百张，做增量渲染，避免一次性铺满节点
		if (this.tab === 'nasa' && this.nasaHasMore) {
			this.nasaShow += 60
		}
	},

	methods: {
		/**
		 * 瀑布流两列：按已累计高度择优落列，高度由 id 哈希决定（同图恒定）。
		 * 地球 / 天文 / 星云共用，和图片 tab 的排列观感保持一致。
		 */
		waterfall(list) {
			const L = []
			const R = []
			let hl = 0
			let hr = 0
			for (let gi = 0; gi < (list || []).length; gi++) {
				const it = list[gi]
				const h = heightOf(it.id || it.full || String(gi))
				const cell = { it, h, gi }
				if (hl <= hr) {
					L.push(cell)
					hl += h
				} else {
					R.push(cell)
					hr += h
				}
			}
			return [L, R]
		},

		/** 点图进图片详情页：数据经 Storage 传递，避免上千字介绍塞进 URL */
		openPhotoDetail(it, tag) {
			if (!it) return
			try {
				uni.setStorageSync('_photo_detail', {
					full: it.full || it.thumb || '',
					title: it.title || '',
					date: it.date || '',
					intro: it.intro || '',
					credit: it.credit || '',
					tag
				})
			} catch (e) {
				console.warn('[gallery-all] 详情数据暂存失败', e)
			}
			uni.navigateTo({ url: '/pages/photo-detail/photo-detail?from=gallery' })
		},

		// 两列均分（视频仍用等分网格）
		split2(list) {
			const L = []
			const R = []
			list.forEach((v, i) => {
				if (i % 2 === 0) L.push(v)
				else R.push(v)
			})
			return [L, R]
		},

		switchTab(key) {
			if (this.tab === key) return
			this.tab = key
			// 切走再切回不重复拉取（已用 *_Loaded 控制）
			this.loadTab(key)
			// 回到顶部，避免沿用上个标签的滚动位置
			uni.pageScrollTo({ scrollTop: 0, duration: 0 })
		},

		// 首次进入某标签时拉取数据（其余标签懒加载，切走不丢）
		loadTab(key) {
			if (key === 'video' && !this.videoLoaded) this.loadVideos()
			else if (key === 'earth' && !this.epicLoaded) this.loadEpic()
			else if (key === 'astro' && !this.apodLoaded) this.loadApod()
			else if (key === 'nasa' && !this.nasaLoaded) this.loadNasa()
		},

		async loadVideos() {
			this.videoLoading = true
			try {
				const d = await spaceData.load('videos').catch(() => null)
				const list = (d && d.list) || []
				const flat = []
				for (const row of list) {
					const vids = row.vids || []
					for (const v of vids) {
						if (!v || !v.url) continue
						flat.push({
							url: v.url,
							title: v.title || row.name || '发射视频',
							publisher: v.publisher || '',
							official: v.tid === 1 || v.kind === 'Official Webcast',
							thumb: v.cover || '',
							cosUrl: v.cosUrl || '',
							playable: Boolean(v.cosUrl),
							sourceType: v.sourceType || ''
						})
					}
				}
				this.videos = flat
				this.videoLoaded = true
			} catch (e) {
				console.warn('[gallery-all] 视频加载失败', e)
				this.videos = []
			} finally {
				this.videoLoading = false
			}
		},

		openVideo(v) {
			if (v && v.playable && v.cosUrl) {
				this.playing = v
				return
			}
			uni.setClipboardData({
				data: v.url,
				success: () => {
					uni.showToast({ title: '链接已复制，可到浏览器打开', icon: 'none' })
				}
			})
		},

		closePlayer() {
			this.playing = null
		},

		async loadEpic() {
			this.epicLoading = true
			try {
				// 接 onUpdate：命中旧缓存时先渲染缓存，后台刷新到新数据再自动回填。
				// 不接就永远停在旧结果上（EPIC 从 4 张扩到 13 张时，页面一直显示 4 张）
				const d = await spaceData.load('epic', {
					onUpdate: (fresh) => {
						this.epicList = this.epicToList(fresh)
					}
				}).catch(() => null)
				this.epicList = this.epicToList(d)
				this.epicLoaded = true
			} catch (e) {
				console.warn('[gallery-all] EPIC 加载失败', e)
				this.epicList = []
			} finally {
				this.epicLoading = false
			}
		},

		/** 把一份 apod 数据集转成列表：过滤占位哨兵 + 按图去重 */
		apodToList(d) {
			const seen = new Set()
			const out = []
			for (const x of (d && d.list) || []) {
				if (!x || !x.full) continue
				// 占位哨兵：NASA 接口降级时会返回 title="NASA Science"、url 落在
				// science.nasa.gov 的 WP 主题资源目录的占位响应，这种绝不可展示
				if (x.title === 'NASA Science') continue
				if (/\/wp-content\/themes\//.test(x.full || x.thumb || '')) continue
				// 兜底去重：降级可能写出多张相同图，避免「连排重复」
				if (seen.has(x.full)) continue
				seen.add(x.full)
				out.push({
					thumb: x.thumb || x.full,
					full: x.full,
					title: x.titleZh || x.title || '',
					date: (x.date || '').slice(0, 10),
					intro: x.explanationZh || x.explanation || '',
					credit: x.credit || ''
				})
			}
			return out
		},

		/** 把一份 epic 数据集转成列表。EPIC 一组 13 张（一次完整自转扫描），不去重 */
		epicToList(d) {
			return ((d && d.list) || [])
				.filter((x) => x && x.full)
				.map((x) => ({
					thumb: x.thumb || x.full,
					full: x.full,
					title: '地球 · DSCOVR',
					date: (x.date || '').slice(0, 10),
					intro: x.captionZh || x.caption || '',
					credit: 'NASA EPIC'
				}))
		},

		async loadApod() {
			this.apodLoading = true
			try {
				// 传 onUpdate：命中旧缓存时 load 会先返回缓存、后台再刷。
				// 不接这个回调，页面就永远停在旧结果上（缓存 TTL 12h，等不起）
				const d = await spaceData.load('apod', {
					onUpdate: (fresh) => {
						this.apodList = this.apodToList(fresh)
					}
				}).catch(() => null)
				this.apodList = this.apodToList(d)
				this.apodLoaded = true
			} catch (e) {
				console.warn('[gallery-all] APOD 加载失败', e)
				this.apodList = []
			} finally {
				this.apodLoading = false
			}
		},

		/** 空态里的手动重试：force 绕过缓存直接回源，不进 onUpdate */
		async retryApod() {
			if (this.apodLoading) return
			this.apodLoading = true
			try {
				const d = await spaceData.load('apod', { force: true }).catch(() => null)
				this.apodList = this.apodToList(d)
				console.log('[gallery-all] APOD 重试结果', d && d.count)
			} catch (e) {
				console.warn('[gallery-all] APOD 重试失败', e)
			} finally {
				this.apodLoading = false
			}
		},

		async loadNasa() {
			this.nasaLoading = true
			try {
				let d = await spaceData.load('nasaImages').catch(() => null)
				// 老缓存的缓存对象里没有 themes（早期 data.js 白名单漏了这个字段），
				// 强行回源一次把主题清单补齐，否则标签栏永远是空的
				if (d && !(d.themes && d.themes.length)) {
					d = await spaceData.load('nasaImages', { force: true }).catch(() => d)
				}
				const list = (d && d.list) || []
				this.nasaList = list.map((x) => ({
					id: x.id,
					theme: x.theme || '',
					themeName: x.themeName || '',
					title: x.titleZh || x.title || '',
					thumb: x.thumb || '',
					full: x.full || x.thumb || '',
					date: (x.date || '').slice(0, 10),
					intro: x.descZh || x.desc || '',
					credit: x.center || ''
				}))
				this.nasaShow = 60
				this.nasaLoaded = true
			} catch (e) {
				console.warn('[gallery-all] NASA 影像加载失败', e)
				this.nasaList = []
			} finally {
				this.nasaLoading = false
			}
		},

		// ---- 图片标签：分片加载 ----
		async loadMore() {
			if (this.loadingMore || this.loading || this.done) return
			this.loadingMore = true

			try {
				const d = await spaceData.galleryChunk(this.loaded)
				const add = withHeight(d && d.list)

				if (add.length) this.items = this.items.concat(add)

				if (d && d.chunks) this.chunks = d.chunks
				this.loaded++
			} catch (e) {
				console.warn('[gallery-all] 分片加载失败', this.loaded, e && e.message)
			} finally {
				this.loadingMore = false
			}
		},

		/**
		 * 点开一张：进详情页的图片优先态。
		 * 已加载的全部图作为相册上下文，进去后左右滑能一直翻下去
		 */
		preview(gi) {
			const n = this.items.length
			if (!n) return

			const at = Math.max(0, Math.min(Number(gi) || 0, n - 1))
			const item = this.items[at]
			if (!item) return

			setAlbum(this.items, at, 'gallery-all')
			uni.navigateTo({
				url:
					'/pages/launch/launchInfo?id=' + item.id + '&photo=1' +
					(item.net ? '&net=' + encodeURIComponent(item.net) : '')
			})
		}
	}
}
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background: #0a0e17;
	/* 底部给加载提示留白，也避开 iPhone 底部横条（裸值 + constant 兜底，安卓才不掉落） */
	padding-bottom: 60rpx;
	padding-bottom: calc(60rpx + constant(safe-area-inset-bottom));
	padding-bottom: calc(60rpx + env(safe-area-inset-bottom));
	box-sizing: border-box;
}

/* ---- 顶部分类切换 ---- */
.tabs {
	white-space: nowrap;
	padding: 16rpx 12rpx 4rpx;
}

.tab {
	display: inline-block;
	margin: 0 6rpx;
	padding: 8rpx 26rpx;
	border-radius: 999rpx;
	background: #141a26;
	color: #8a97ad;
	font-size: 24rpx;
	line-height: 40rpx;
}

.tab.active {
	background: #38bdf8;
	color: #04121f;
	font-weight: 600;
}

/* ---- 图片标签：瀑布流墙（保留原样式） ---- */
.wall {
	display: flex;
	align-items: flex-start;
	padding: 8rpx 12rpx 0;
}

.col {
	flex: 1;
	min-width: 0;
	padding: 0 6rpx;
	box-sizing: border-box;
}

.cell {
	margin-bottom: 12rpx;
	/* 不做圆角裁切：overflow hidden + 圆角会把图片四角切掉，
	   地球/天文/星云要求严格按原比例展示，这里全程不裁 */
	background: #131a26;
}

.cell-img {
	display: block;
	width: 100%;
	height: 100%;
}

/* 地球/天文/星云：按缩略图原始比例展示（widthFix），不裁切、不放大。
   height 必须 auto，否则父类的 100% 会盖掉 widthFix 算出的高度 */
.cell-img-auto {
	height: auto;
}

/* ---- 底部状态（图片标签） ---- */
.foot {
	display: flex;
	justify-content: center;
	padding: 30rpx 0 10rpx;
}

.foot-text {
	color: #4d5a6e;
	font-size: 22rpx;
}

/* ---- 视频 / 地球 / 天文 / NASA 共用网格 ---- */
.grid {
	display: flex;
	align-items: flex-start;
	padding: 8rpx 8rpx 0;
}

.gcol {
	flex: 1;
	min-width: 0;
	padding: 0 4rpx;
}

/* ---- 视频卡（复制自 video-gallery.vue） ---- */
.vcard {
	margin-bottom: 12rpx;
	border-radius: 10rpx;
	overflow: hidden;
	background: #131a26;
}

.vcover {
	position: relative;
	width: 100%;
	height: 220rpx;
}

.vcover-img {
	display: block;
	width: 100%;
	height: 100%;
	background: #0d1420;
}

.vplay {
	position: absolute;
	left: 50%;
	top: 50%;
	width: 64rpx;
	height: 64rpx;
	margin: -32rpx 0 0 -32rpx;
	border-radius: 50%;
	background: rgba(0, 0, 0, 0.45);
}

.vplay::after {
	content: '';
	position: absolute;
	left: 24rpx;
	top: 20rpx;
	width: 0;
	height: 0;
	border-left: 20rpx solid rgba(255, 255, 255, 0.95);
	border-top: 12rpx solid transparent;
	border-bottom: 12rpx solid transparent;
}

.vtag {
	position: absolute;
	left: 10rpx;
	top: 10rpx;
	padding: 2rpx 10rpx;
	border-radius: 4rpx;
	background: rgba(0, 0, 0, 0.55);
	color: #ffffff;
	font-size: 18rpx;
	line-height: 26rpx;
}

.vbadge {
	position: absolute;
	right: 10rpx;
	top: 10rpx;
	padding: 2rpx 10rpx;
	border-radius: 4rpx;
	font-size: 18rpx;
	line-height: 26rpx;
}

.vbadge.ok {
	background: rgba(56, 189, 248, 0.92);
	color: #04121f;
	font-weight: 600;
}

.vbadge.link {
	background: rgba(0, 0, 0, 0.55);
	color: #cfe6ff;
}

.vtitle {
	display: block;
	padding: 12rpx 12rpx 0;
	color: #e2e8f0;
	font-size: 23rpx;
	line-height: 32rpx;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.vmeta {
	display: block;
	padding: 4rpx 12rpx 12rpx;
	color: #7d8ba0;
	font-size: 20rpx;
	line-height: 28rpx;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.vmeta.dim {
	color: #4d5a6e;
}

/* ---- NASA 卡（复制自 nasa-images.vue） ---- */
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

/* ---- 内联播放遮罩（复制自 video-gallery.vue） ---- */
.player-mask {
	position: fixed;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	z-index: 50;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	background: rgba(4, 6, 10, 0.94);
}

.player {
	width: 100%;
	height: 78vh;
	background: #000;
}

.player-bar {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 24rpx 28rpx calc(24rpx + env(safe-area-inset-bottom));
	box-sizing: border-box;
	background: linear-gradient(to top, rgba(4, 6, 10, 0.9) 0%, rgba(4, 6, 10, 0) 100%);
}

.player-title {
	flex: 1;
	min-width: 0;
	padding-right: 24rpx;
	color: #e2e8f0;
	font-size: 24rpx;
	line-height: 34rpx;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.player-close {
	flex-shrink: 0;
	width: 56rpx;
	height: 56rpx;
	line-height: 56rpx;
	text-align: center;
	border-radius: 50%;
	background: rgba(255, 255, 255, 0.12);
	color: #ffffff;
	font-size: 30rpx;
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

/* 空态里的重试按钮：force 回源，绕开本地缓存 */
.retry-btn {
	margin-top: 32rpx;
	padding: 18rpx 52rpx;
	border-radius: 40rpx;
	background: rgba(56, 189, 248, 0.14);
	border: 1rpx solid rgba(56, 189, 248, 0.42);
	color: #38bdf8;
	font-size: 26rpx;
}

.retry-btn-hover {
	background: rgba(56, 189, 248, 0.26);
	border-color: rgba(56, 189, 248, 0.7);
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
