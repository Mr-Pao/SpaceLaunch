<template>
	<!-- 薄壳：只管导航栏变色的滚动监听与分享，内容全在 launch-detail 里 -->
	<view class="shell">
		<nav-bar :solid="navSolid" :title="navSolid ? '发射任务详情' : ''" />

		<launch-detail ref="detail" :id="launchId" :net="netHint" />
	</view>
</template>

<script>
export default {
	data() {
		return {
			launchId: '',
			// 调用方带的大致时间（net），归档查找用来直接定位分片，可为空
			netHint: '',
			navSolid: false
		}
	},

	onLoad(query) {
		this.launchId = (query && query.id) || ''
		// net 让归档查找直接跳到目标分片，省去逐片翻找（见 utils/history.js）
		this.netHint = (query && query.net) ? decodeURIComponent(query.net) : ''
	},

	// 滚过首图后导航栏切成实色，否则图片上的文字看不清
	onPageScroll(e) {
		const solid = e.scrollTop > 200
		if (solid !== this.navSolid) this.navSolid = solid
	},

	// 页面实例可能被复用（navigateBack 回来而不是重新 onLoad），
	// 内容在组件里，刷新审核开关这件事转给它
	onShow() {
		const d = this.$refs.detail
		if (d && d.refreshReview) d.refreshReview()
	},

	// 分享仍然定义在页面上：组件里没有 onShareAppMessage 这个生命周期，
	// 数据从组件实例上取（shareText / shareImg / launchId 都是组件的计算属性）
	onShareAppMessage() {
		const d = this.$refs.detail
		if (!d) return { title: '发射任务详情', path: '/pages/launch/launchInfo' }
		return {
			title: d.shareText,
			path: '/pages/launch/launchInfo?id=' + d.id + d._netQuery(),
			imageUrl: d.shareImg
		}
	},
	onShareTimeline() {
		const d = this.$refs.detail
		if (!d) return { title: '发射任务详情' }
		return {
			title: d.shareText,
			query: 'id=' + d.id + d._netQuery(true),
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
