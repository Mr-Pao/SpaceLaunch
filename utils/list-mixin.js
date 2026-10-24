import spaceData from '@/utils/data.js'
import { snapshot as favSnapshot } from '@/utils/favorites.js'
import { loadIndex, loadPage, clearIndex } from '@/utils/history.js'

/**
 * 收藏的条目排到最前，其余保持快照原有顺序（后端已经按 net 排好，不要打乱）
 */
function favoriteFirst(list) {
	const set = favSnapshot()
	if (!set.size) return list

	const top = []
	const rest = []
	for (const item of list) {
		;(set.has(item.id) ? top : rest).push(item)
	}
	return top.concat(rest)
}

/** 只把「已收藏」的 id 挑出来。卡片要靠它显示标记，所以必须是响应式数组，不能是 Set */
function favoriteIds(list) {
	const set = favSnapshot()
	if (!set.size) return []
	return list.filter((item) => set.has(item.id)).map((item) => item.id)
}

/**
 * 列表页公共逻辑（首页 / 历史 / 活动三家共用）。
 *
 * 这三个页面的数据获取、快照分页、加载态、错误态完全一致，
 * 差别只有数据集名字和每页条数 —— 之前是复制粘贴三份，
 * 改一个地方要改三遍，还容易漏。
 *
 * 用法：
 *   import { createListMixin } from '@/utils/list-mixin.js'
 *   export default {
 *     mixins: [createListMixin({ dataset: 'previous', pageSize: 12 })],
 *     ...
 *   }
 *
 * 注意：onLoad / onPullDownRefresh / onReachBottom 仍然留在各页面里。
 * 小程序端把页面生命周期写进 mixin 行为不够可靠，宁可各页多写两行。
 *
 * @param {string} dataset     数据集名，对应 utils/data.js 里的 FILES
 * @param {number} pageSize    每页条数
 * @param {boolean|'mark'} favorite
 *   true  = 收藏置顶 + 标记（首页）
 *   'mark'= 只标记不置顶（已发射页：历史数据重排会打乱时间序）
 * @param {Function} filter    条目过滤，(item) => boolean，用来剔掉不该显示的条目
 * @param {boolean}  archive   开启「触底接归档分片」能力（已发射页专用：
 *                             快照只有最近 100 条，更早的要在触底时按片去 CDN 拉）
 */
export function createListMixin({
	dataset,
	pageSize = 12,
	favorite = false,
	filter = null,
	archive = false
}) {
	const FAV_TOP = favorite === true
	const FAV_MARK = FAV_TOP || favorite === 'mark'

	return {
		data() {
			return {
				list: [],
				total: 0,
				freshText: '',
				loading: true,
				error: '',
				// 已收藏的 id，交给卡片画标记；重排时一起刷新
				favIds: [],
				// 快照本身只有 50/100 条，分页纯本地切，不发网络请求
				listNum: pageSize,
				// ---- 归档分片（archive: true 时启用）----
				loadingMore: false,
				loadError: '',
				// 归档索引与已加载到的分片序号
				index: null,
				pageIndex: 0
			}
		},

		computed: {
			visible() {
				return this.list.slice(0, this.listNum)
			},
			hasMore() {
				if (!archive) return this.listNum < this.list.length
				// 本地还有没渲染的，或 COS 上还有没下载的分片
				const idx = this.index
				const hasArchivePage = !!(idx && idx.pages && this.pageIndex < idx.pages.length)
				return this.listNum < this.list.length || hasArchivePage
			}
		},

		methods: {
			async getData(force) {
				this.loading = true
				this.error = ''

				try {
					const d = await spaceData.load(dataset, {
						force: !!force,
						// 先出缓存、后台刷新回来再覆盖，避免首屏空白等待
						onUpdate: (fresh) => this.applyData(fresh)
					})
					this.applyData(d)
				} catch (e) {
					console.warn('[' + dataset + '] 获取数据失败', e)
					this.error = '获取数据失败，请检查网络后重试'
				} finally {
					this.loading = false
				}
			},

			applyData(d) {
				if (!d) return

				let raw = d.list || []
				if (filter) raw = raw.filter(filter)

				this.list = FAV_TOP ? favoriteFirst(raw) : raw
				this.favIds = FAV_MARK ? favoriteIds(this.list) : []
				this.total = d.count || this.list.length
				this.freshText = spaceData.freshnessText(d.generatedAt)
			},

			// 从详情页收藏回来时列表要更新：置顶模式重排，标记模式只刷标记
			reorder() {
				if (!FAV_MARK || !this.list.length) return
				if (FAV_TOP) this.list = favoriteFirst(this.list)
				this.favIds = favoriteIds(this.list)
			},

			/**
			 * 追加一批条目（「翻到底后再去 CDN 拉下一段」共用）
			 * 按 id 去重：分段拉取时中间有新任务插入会导致整体错位
			 * @returns {number} 实际追加的条数
			 */
			appendMore(items) {
				if (!items || !items.length) return 0

				const seen = new Set()
				for (const x of this.list) if (x.id) seen.add(x.id)

				const add = items.filter((x) => x.id && !seen.has(x.id))
				if (!add.length) return 0

				this.list = this.list.concat(add)
				if (FAV_MARK) this.favIds = favoriteIds(this.list)
				return add.length
			},

			loadMore() {
				if (!archive) {
					if (this.listNum >= this.list.length) return
					this.listNum += pageSize
					return
				}
				// archive 模式的触底：先放本地剩余，本地见底再去拉下一个分片
				if (this.listNum < this.list.length) {
					this.listNum += pageSize
					return
				}
				this.loadArchive()
			},

			resetPaging() {
				this.listNum = pageSize
			},

			// ---- 归档分片（archive: true 时启用）----

			// 索引很小，先拿到手才能知道总共分了多少片
			async prepareArchive(force) {
				try {
					if (force) clearIndex()
					this.index = await loadIndex()
					this.pageIndex = 0
				} catch (e) {
					// 归档还没跑过 / 还没生成索引，属于正常情况，只显示快照那 100 条
					console.log('[' + dataset + '] 暂无历史归档索引', e && e.message)
					this.index = null
				}
			},

			async loadArchive() {
				const idx = this.index
				if (this.loadingMore) return
				if (!(idx && idx.pages && this.pageIndex < idx.pages.length)) return

				this.loadingMore = true
				this.loadError = ''

				try {
					const page = idx.pages[this.pageIndex]
					const items = await loadPage(page)
					const added = this.appendMore(items)
					if (added) this.listNum += pageSize
					this.pageIndex++
				} catch (e) {
					console.warn('[' + dataset + '] 加载归档分片失败', e)
					this.loadError = '加载失败'
				} finally {
					this.loadingMore = false
				}
			}
		}
	}
}
