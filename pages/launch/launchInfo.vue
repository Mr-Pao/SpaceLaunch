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
			// 图片优先态：进来时首图占满整屏当看图器，底部「查看发射详情」跳详情
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

	// 看图态是整屏看图器，导航栏始终透明（无标题），不随滚动切切实色
	onPageScroll(e) {
		const top = (e && e.scrollTop) || 0
		const d = this.$refs.detail

		// 看图态下导航保持透明：否则滚一下会露出顶栏，盖在图上
		if (this.photoMode) {
			if (this.navSolid) this.navSolid = false
			return
		}

		const threshold = 200
		const solid = top >= threshold
		if (solid !== this.navSolid) this.navSolid = solid

		// 普通详情页的滚动量转发给组件（看图态下组件已忽略）
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
