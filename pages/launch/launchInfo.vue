<template>
	<!-- 薄壳：只管页面级生命周期（滚动转发、分享），内容全在 launch-detail 里。
	     一个入口两种进入方式：从列表来直接是详情，从图片来先满屏看图 -->
	<view class="shell">
		<nav-bar :solid="navSolid" :title="navSolid ? '发射任务详情' : ''" />

		<launch-detail ref="detail" :id="launchId" :net="netHint" :photo="photoMode" />
	</view>
</template>

<script>
export default {
	data() {
		return {
			launchId: '',
			// 调用方带的大致时间（net），归档查找用来直接定位分片，可为空
			netHint: '',
			// 图片优先态：进来时首图占满整屏，上拉逐步变成这个详情页
			photoMode: false,
			navSolid: false
		}
	},

	onLoad(query) {
		this.launchId = (query && query.id) || ''
		// net 让归档查找直接跳到目标分片，省去逐片翻找（见 utils/history.js）
		this.netHint = (query && query.net) ? decodeURIComponent(query.net) : ''
		this.photoMode = Boolean(query && String(query.photo) === '1')
	},

	// 滚过首图后导航栏切成实色，否则图片上的文字看不清
	onPageScroll(e) {
		const top = (e && e.scrollTop) || 0
		const d = this.$refs.detail

		// 图片优先态：形变期间（图片还在收缩）导航必须保持透明，
		// 标题一出来就压在半程的图上，和列表进来的沉浸观感不一致；
		// 形变走完（滚满 range，比普通页的 200 深得多）才允许切实色。
		// 此刻视觉上正好是「滚到普通详情页首图之下」，两边状态一致
		const threshold = d && d.photoOn ? Math.max(200, d.range) : 200
		const solid = top >= threshold
		if (solid !== this.navSolid) this.navSolid = solid

		// 图片优先态的形变完全由滚动量驱动：滚多少，首图缩多少。
		// 转发给组件，它自己决定要不要理（普通详情页直接返回）
		if (d && d.setScroll) d.setScroll(top)
	},

	// 页面实例可能被复用（navigateBack 回来而不是重新 onLoad），
	// 内容在组件里，刷新审核开关这件事转给它
	onShow() {
		const d = this.$refs.detail
		if (d && d.refreshReview) d.refreshReview()
	},

	// 分享仍然定义在页面上：组件里没有 onShareAppMessage 这个生命周期，
	// 数据从组件实例上取（横滑换过图时 id 也跟着变）
	onShareAppMessage() {
		const d = this.$refs.detail
		if (!d) return { title: '发射任务详情', path: '/pages/launch/launchInfo' }
		return {
			title: d.shareText,
			path: '/pages/launch/launchInfo?id=' + d.curId + d._netQuery(),
			imageUrl: d.shareImg
		}
	},
	onShareTimeline() {
		const d = this.$refs.detail
		if (!d) return { title: '发射任务详情' }
		return {
			title: d.shareText,
			query: 'id=' + d.curId + d._netQuery(true),
			imageUrl: d.shareImg
		}
	}
}
</script>

<style lang="scss" scoped>
.shell {
	min-height: 100vh;
	background: #0a0e17;
}
</style>
