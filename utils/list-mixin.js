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
 * 列表页公共逻辑（发射页 / 活动页共用）。
 *
 * 这三个页面的数据获取、快照分页、加载态、错误态完全一致，
 * 差别只有数据集名字和每页条数 —— 之前是复制粘贴三份，
 * 改一个地方要改三遍，还容易漏。
 *
 * 用法一（单数据集，活动页）：
 *   mixins: [createListMixin({ dataset: 'events', pageSize: 12 })]
 *
 * 用法二（多数据集，发射页的「待发射 / 已发射」二段式）：
 *   mixins: [createListMixin({
 *     feeds: {
 *       upcoming: { dataset: 'upcoming', pageSize: 12, favorite: true, filter: isStillUpcoming },
 *       previous: { dataset: 'previous', pageSize: 12, favorite: 'mark', archive: true }
 *     }
 *   })]
 *   页面里调 this.switchFeed('previous') 切换，两边各自记住翻页进度。
 *
 * 注意：onLoad / onPullDownRefresh / onReachBottom 仍然留在各页面里。
 * 小程序端把页面生命周期写进 mixin 行为不够可靠，宁可各页多写两行。
 *
 * @param {string} dataset     数据集名，对应 utils/data.js 里的 FILES
 * @param {number} pageSize    每页条数
 * @param {boolean|'mark'} favorite
 *   true  = 收藏置顶 + 标记（待发射）
 *   'mark'= 只标记不置顶（已发射：历史数据重排会打乱时间序）
 * @param {Function} filter    条目过滤，(item) => boolean，用来剔掉不该显示的条目
 * @param {boolean}  archive   开启「触底接归档分片」能力（已发射专用：
 *                             快照只有最近 100 条，更早的要在触底时按片去 CDN 拉）
 * @param {Object}   feeds     多数据集配置，传了就走多 feed 模式（此时上面四项忽略）
 */
export function createListMixin({ dataset, pageSize = 12, favorite = false, filter = null, archive = false, feeds = null }) {
	const MULTI = !!feeds
	const FEEDS = feeds || { default: { dataset, pageSize, favorite, filter, archive } }
	const FIRST = Object.keys(FEEDS)[0]

	/**
	 * 各 feed 的翻页现场。
	 *
	 * 刻意存在闭包里而不是 data 里：里面装着整份 list（可能是几千条），
	 * 放进 data 会被深度响应式代理，切一次 feed 就是几万次 getter/setter，
	 * 而它本来只用于「切回来时原样恢复」，不需要参与渲染。
	 */
	const store = {}
	// 请求序号：切 feed 时旧请求回来不能覆盖新 feed 的数据
	let reqSeq = 0

	/** 当前 feed 的配置。非多 feed 模式时 feed 为空串，回退到唯一那套 */
	function confOf(vm) {
		return FEEDS[vm.feed] || FEEDS[FIRST]
	}

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
				listNum: (MULTI ? FEEDS[FIRST].pageSize : pageSize) || 12,
				// ---- 归档分片 ----
				loadingMore: false,
				loadError: '',
				// 归档索引与已加载到的分片序号
				index: null,
				pageIndex: 0,
				// ---- 多 feed ----
				// 当前 feed 名；单 feed 模式为空串
				feed: MULTI ? FIRST : '',
				// 当前 feed 是否具备归档能力（computed 里不能读闭包，只能读响应式值）
				archived: MULTI ? !!FEEDS[FIRST].archive : !!archive
			}
		},

		computed: {
			visible() {
				return this.list.slice(0, this.listNum)
			},
			hasMore() {
				if (!this.archived) return this.listNum < this.list.length
				// 本地还有没渲染的，或 COS 上还有没下载的分片
				const idx = this.index
				const hasArchivePage = !!(idx && idx.pages && this.pageIndex < idx.pages.length)
				return this.listNum < this.list.length || hasArchivePage
			}
		},

		methods: {
			/**
			 * 切换数据集。已加载过的 feed 原样恢复现场（列表、翻页位置、归档进度），
			 * 没加载过的按需拉一次。首屏由页面自己在 onLoad 里 getData。
			 *
			 * 现场的存取是「切走时存、切回时取完即删」：
			 * 留在 store 里跟踪是不行的 —— applyData / appendMore 都是整体替换数组，
			 * store 里那份引用会静默过期（用户翻到第 300 条，切回来只剩 100 条）。
			 */
			async switchFeed(name) {
				if (!FEEDS[name] || name === this.feed) return

				// 存下当前 feed 的现场
				if (this.feed) {
					store[this.feed] = {
						list: this.list,
						total: this.total,
						freshText: this.freshText,
						listNum: this.listNum,
						pageIndex: this.pageIndex,
						index: this.index
					}
				}

				const conf = FEEDS[name]
				this.feed = name
				this.archived = !!conf.archive
				this.loadError = ''
				this.error = ''

				const s = store[name]
				if (s) {
					// 取完就删，避免后续再被当成「还有效的现场」
					delete store[name]
					this.list = s.list
					this.total = s.total
					this.freshText = s.freshText
					this.listNum = s.listNum
					this.pageIndex = s.pageIndex
					this.index = s.index
					this.loading = false
					this.reorder()
					return
				}

				this.list = []
				this.total = 0
				this.freshText = ''
				this.listNum = conf.pageSize || 12
				this.pageIndex = 0
				this.index = null
				this.loading = true

				const tasks = [this.getData()]
				if (conf.archive) tasks.push(this.prepareArchive())
				await Promise.all(tasks)
			},

			async getData(force) {
				const conf = confOf(this)
				const seq = ++reqSeq
				this.loading = true
				this.error = ''

				try {
					const d = await spaceData.load(conf.dataset, {
						force: !!force,
						// 先出缓存、后台刷新回来再覆盖，避免首屏空白等待
						onUpdate: (fresh) => {
							if (seq === reqSeq) this.applyData(fresh)
						}
					})
					if (seq !== reqSeq) return
					this.applyData(d)
				} catch (e) {
					if (seq !== reqSeq) return
					console.warn('[' + conf.dataset + '] 获取数据失败', e)
					this.error = '获取数据失败，请检查网络后重试'
				} finally {
					if (seq === reqSeq) this.loading = false
				}
			},

			applyData(d) {
				if (!d) return

				const conf = confOf(this)
				let raw = d.list || []
				if (conf.filter) raw = raw.filter(conf.filter)

				this.list = conf.favorite === true ? favoriteFirst(raw) : raw
				this.favIds = conf.favorite ? favoriteIds(this.list) : []
				this.total = d.count || this.list.length
				this.freshText = spaceData.freshnessText(d.generatedAt)
			},

			// 从详情页收藏回来时列表要更新：置顶模式重排，标记模式只刷标记
			reorder() {
				const conf = confOf(this)
				if (!conf.favorite || !this.list.length) return
				if (conf.favorite === true) this.list = favoriteFirst(this.list)
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
				if (confOf(this).favorite) this.favIds = favoriteIds(this.list)
				return add.length
			},

			loadMore() {
				const pageStep = confOf(this).pageSize || pageSize
				if (!this.archived) {
					if (this.listNum >= this.list.length) return
					this.listNum += pageStep
					return
				}
				// archive 模式的触底：先放本地剩余，本地见底再去拉下一个分片
				if (this.listNum < this.list.length) {
					this.listNum += pageStep
					return
				}
				this.loadArchive()
			},

			resetPaging() {
				this.listNum = confOf(this).pageSize || pageSize
			},

			// ---- 归档分片 ----

			// 索引很小，先拿到手才能知道总共分了多少片
			async prepareArchive(force) {
				const conf = confOf(this)
				try {
					if (force) clearIndex()
					this.index = await loadIndex()
					this.pageIndex = 0
				} catch (e) {
					// 归档还没跑过 / 还没生成索引，属于正常情况，只显示快照那 100 条
					console.log('[' + conf.dataset + '] 暂无历史归档索引', e && e.message)
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
					if (added) this.listNum += confOf(this).pageSize || pageSize
					this.pageIndex++
				} catch (e) {
					console.warn('[' + confOf(this).dataset + '] 加载归档分片失败', e)
					this.loadError = '加载失败'
				} finally {
					this.loadingMore = false
				}
			}
		}
	}
}
