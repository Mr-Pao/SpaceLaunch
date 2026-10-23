import spaceData from '@/utils/data.js'
import { snapshot as favSnapshot } from '@/utils/favorites.js'

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
 * @param {boolean} favorite   是否把收藏的条目置顶（只有发射列表需要）
 */
export function createListMixin({ dataset, pageSize = 12, favorite = false }) {
	return {
		data() {
			return {
				list: [],
				total: 0,
				freshText: '',
				loading: true,
				error: '',
				// 快照本身只有 50 条，分页纯本地切，不发网络请求
				listNum: pageSize
			}
		},

		computed: {
			visible() {
				return this.list.slice(0, this.listNum)
			},
			hasMore() {
				return this.listNum < this.list.length
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
				const raw = d.list || []
				this.list = favorite ? favoriteFirst(raw) : raw
				this.total = d.count || this.list.length
				this.freshText = spaceData.freshnessText(d.generatedAt)
			},

			// 从详情页收藏回来时列表要重排，但不需要重新请求数据
			reorder() {
				if (!favorite || !this.list.length) return
				this.list = favoriteFirst(this.list)
			},

			loadMore() {
				if (!this.hasMore) return
				this.listNum += pageSize
			},

			resetPaging() {
				this.listNum = pageSize
			}
		}
	}
}
