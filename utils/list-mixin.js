import spaceData from '@/utils/data.js'

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
 */
export function createListMixin({ dataset, pageSize = 12 }) {
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
				this.list = d.list || []
				this.total = d.count || this.list.length
				this.freshText = spaceData.freshnessText(d.generatedAt)
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
