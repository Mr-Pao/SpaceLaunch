<template>
	<!-- 资讯详情底部弹窗。
	     三个入口共用：资讯页列表、今日页资讯卡、发射详情页的「相关报道」。
	     早期从发射页点报道会 navigateTo 到资讯页再弹抽屉，等于「另开一页去看一条
	     本来就只占半屏的内容」；现在全部就地弹，关掉就回到原处 -->
	<view v-if="article">
		<view class="mask" @click="close"></view>
		<view class="sheet">
			<view class="sheet-grab"></view>
			<scroll-view scroll-y class="sheet-body">
				<image v-if="article.image" class="d-img" :src="article.image" mode="widthFix" />
				<text class="d-title">{{ article.titleZh || article.title }}</text>
				<view class="d-meta">
					<text class="d-site">{{ article.site }}</text>
					<text class="d-sep">·</text>
					<text class="d-time">{{ article.at }}</text>
				</view>
				<text class="d-sum" v-if="article.summaryZh">{{ article.summaryZh }}</text>
				<text class="d-sum d-en" v-else-if="article.summary">{{ article.summary }}</text>

				<!-- 主次按「这页最想让你干什么」定：能跳发射时，跳转才是主线
				     （资讯一半的价值在于能回连发射详情），复制链接退居次要；
				     打不开时复制就是唯一能用的动作，于是把主色还给它 -->
				<view class="d-acts">
					<view class="act" :class="{ primary: !hasLaunchRef }" @click="copyUrl">
						<text class="act-text">复制原文链接</text>
					</view>
					<!-- 与列表的「发射」标签同源（都看 launchRefs）。
					     以前这里挂的是运行时网络查询结果，导致列表打着标签、
					     详情里按钮却凭空消失 -->
					<view v-if="hasLaunchRef" class="act primary" @click="goLaunch">
						<text class="act-text">查看相关发射</text>
					</view>
				</view>

				<text class="d-hint">小程序内不转载正文，复制链接到浏览器可读全文</text>
			</scroll-view>
		</view>

		<!-- 多条候选时的选择层。`launches[]` 不标主次（SNAPI 只给 launch_id + provider），
		     猜「哪个是这期的主角」必然错 —— 好奇号博客那条就是这么被链到 2011 年
		     MSL 发射上的。所以干脆不猜：一条直接跳，多条列出来让人自己选。 -->
		<view v-if="picker" class="pick-mask" @click="picker = false"></view>
		<view v-if="picker" class="pick-sheet">
			<view class="sheet-grab"></view>
			<text class="pick-title">这条资讯涉及 {{ launchRefs.length }} 次发射</text>
			<text class="pick-sub">这条资讯提到了多次发射，按时间从近到远排</text>
			<scroll-view scroll-y class="pick-list">
				<view
					class="pick-row"
					v-for="(r, i) in launchRefs"
					:key="r.id"
					@click="jumpTo(r)"
				>
					<text class="pick-idx">{{ i + 1 }}</text>
					<view class="pick-info">
						<text class="pick-name">{{ r.name || '未命名任务' }}</text>
						<text class="pick-net">{{ shortTime(r.net) }}</text>
					</view>
					<text class="pick-arrow">›</text>
				</view>
			</scroll-view>
		</view>
	</view>
</template>

<script>
import { setTabBarHidden } from '@/utils/tabbar.js'
import { formatShort } from '@/utils/format.js'

/**
 * 一条资讯的详情弹窗。纯展示 + 两个动作，自己不发任何请求：
 * 「这篇涉及哪几次发射、能不能打开」由 CI 预先算好写在 launchRefs 里，前端零查询。
 */
export default {
	props: {
		// 传 null 即关闭
		article: { type: Object, default: null },
		// 当前已经在看的发射 id（发射详情页里用）。点某个发射时
		// 如果就是这一次，关掉弹窗就够了，不必再开一页一模一样的详情
		curLaunchId: { type: String, default: '' }
	},

	data() {
		return {
			// 多条候选时的选择层
			picker: false
		}
	},

	computed: {
		/**
		 * 这篇资讯涉及、且确认能打开的全部发射（CI 已排好序：最接近发布时间的在前）。
		 * 兼容旧数据：CI 还没刷到新版时只有单个 launchRef。
		 */
		launchRefs() {
			const a = this.article
			if (!a) return []
			if (Array.isArray(a.launchRefs)) return a.launchRefs.filter((r) => r && r.id)
			if (a.launchRef && a.launchRef.id) return [a.launchRef]
			return []
		},

		hasLaunchRef() {
			return this.launchRefs.length > 0
		}
	},

	watch: {
		// 今日页有悬浮胶囊 tabBar，而自定义 tabBar 渲染在页面之上的独立层，
		// 页面里 z-index 再高也压不住它 —— 弹窗下沿会被切掉一截。
		// 弹的时候让它自己消失，关掉再放出来（utils/tabbar.js 已有这套机制，
		// 非 tab 页拿不到实例，静默跳过）
		article(v) {
			this.setBarHidden(!!v)
			// 换了一条资讯就收起选择层，别让它跟着带过去
			this.picker = false
		}
	},

	// 兜底：组件被销毁（切页/热重载）时别把 tabBar 留在隐藏态
	beforeDestroy() {
		this.setBarHidden(false)
	},

	methods: {
		setBarHidden(hidden) {
			setTabBarHidden(hidden)
		},

		shortTime(v) {
			return formatShort(v)
		},

		close() {
			// 先恢复 tabBar 再通知父组件：jumpTo 会紧接着 navigateTo，
			// 到了新页面再想恢复就找不到 tabBar 实例了
			this.setBarHidden(false)
			this.$emit('close')
		},

		copyUrl() {
			const u = this.article && this.article.url
			if (!u) return
			uni.setClipboardData({
				data: u,
				success: () => {
					uni.showToast({ title: '链接已复制，请到浏览器打开', icon: 'none', duration: 2000 })
				}
			})
		},

		/**
		 * 「查看相关发射」：一条时直接跳，多条先让用户选。
		 * 不自动挑第一个 —— 数组顺序是 SNAPI 的提及顺序，没有语义。
		 */
		goLaunch() {
			const refs = this.launchRefs
			if (!refs.length) return
			if (refs.length === 1) {
				this.jumpTo(refs[0])
				return
			}
			this.picker = true
		},

		/**
		 * 跳发射详情。带上 net 让详情页直达归档分片
		 * （否则只能从最新往回翻，限深 12 片，十几年前的老任务翻不到）。
		 */
		jumpTo(ref) {
			if (!ref || !ref.id) return

			// 已经在这个发射的详情页上：关掉弹窗就是「看到了」
			if (this.curLaunchId && String(ref.id) === String(this.curLaunchId)) {
				this.picker = false
				this.close()
				return
			}

			let url = '/pages/launch/launchInfo?id=' + encodeURIComponent(ref.id)
			if (ref.net) url += '&net=' + encodeURIComponent(ref.net)

			this.picker = false
			this.close()
			uni.navigateTo({
				url,
				fail: () => uni.showToast({ title: '该发射未收录', icon: 'none' })
			})
		}
	}
}
</script>

<style lang="scss">
.mask {
	position: fixed;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	background: rgba(0, 0, 0, 0.62);
	/* 压住 tabBar / 导航栏，否则从今日页弹出时底部会被 tabBar 划一道 */
	z-index: 60;
}

.sheet {
	position: fixed;
	left: 0;
	right: 0;
	bottom: 0;
	max-height: 82vh;
	background: #0a0f16;
	border-radius: 28rpx 28rpx 0 0;
	z-index: 61;
	overflow: hidden;
	padding-bottom: env(safe-area-inset-bottom);
}

.sheet-grab {
	width: 72rpx;
	height: 8rpx;
	border-radius: 4rpx;
	background: rgba(255, 255, 255, 0.18);
	margin: 18rpx auto 6rpx;
}

.sheet-body {
	max-height: 76vh;
	padding: 12rpx 32rpx 40rpx;
	box-sizing: border-box;
}

.d-img {
	width: 100%;
	border-radius: 18rpx;
	margin-bottom: 24rpx;
	background: #0b1118;
}

.d-title {
	display: block;
	font-size: 36rpx;
	line-height: 1.4;
	font-weight: 600;
	color: #f2f6fa;
}

.d-meta {
	margin-top: 16rpx;
	display: flex;
	align-items: center;
}
.d-site {
	font-size: 23rpx;
	color: #5c8fb3;
}
.d-sep {
	font-size: 23rpx;
	color: #3d4a58;
	margin: 0 10rpx;
}
.d-time {
	font-size: 23rpx;
	color: #5d6a7a;
}

.d-sum {
	display: block;
	margin-top: 26rpx;
	font-size: 28rpx;
	line-height: 1.72;
	color: #b9c6d4;
}
.d-en {
	color: #8593a3;
}

.d-acts {
	margin-top: 36rpx;
	display: flex;
	flex-wrap: wrap;
}
.act {
	padding: 20rpx 34rpx;
	margin-right: 18rpx;
	margin-bottom: 16rpx;
	border-radius: 999rpx;
	background: rgba(255, 255, 255, 0.07);
	border: 1rpx solid rgba(255, 255, 255, 0.1);
}
.act.primary {
	background: #38bdf8;
	border-color: #38bdf8;
}
.act-text {
	font-size: 26rpx;
	color: #cfe0ee;
}
.act.primary .act-text {
	color: #04121c;
	font-weight: 600;
}

.d-hint {
	display: block;
	margin-top: 14rpx;
	font-size: 21rpx;
	color: #4f5b6b;
	line-height: 1.6;
}

/* ---- 多条候选：选择层（压在详情面板之上）---- */
.pick-mask {
	position: fixed;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	background: rgba(0, 0, 0, 0.72);
	z-index: 62;
}

.pick-sheet {
	position: fixed;
	left: 0;
	right: 0;
	bottom: 0;
	max-height: 74vh;
	background: #0a0f16;
	border-radius: 28rpx 28rpx 0 0;
	z-index: 63;
	overflow: hidden;
	padding-bottom: env(safe-area-inset-bottom);
}

.pick-title {
	display: block;
	padding: 8rpx 32rpx 0;
	font-size: 30rpx;
	font-weight: 600;
	color: #f2f6fa;
}

.pick-sub {
	display: block;
	padding: 10rpx 32rpx 0;
	font-size: 21rpx;
	line-height: 1.5;
	color: #5d6a7a;
}

.pick-list {
	max-height: 56vh;
	padding: 18rpx 24rpx 32rpx;
	box-sizing: border-box;
}

.pick-row {
	display: flex;
	align-items: center;
	padding: 22rpx 20rpx;
	border-radius: 18rpx;
	background: rgba(255, 255, 255, 0.04);
	margin-bottom: 14rpx;
}

.pick-idx {
	width: 44rpx;
	font-size: 22rpx;
	color: #5c8fb3;
	font-weight: 600;
}

.pick-info {
	flex: 1;
	min-width: 0;
}

.pick-name {
	display: block;
	font-size: 27rpx;
	line-height: 1.4;
	color: #dfe9f3;
	/* 型号 | 任务 的组合名可能很长，两行截断 */
	overflow: hidden;
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
}

.pick-net {
	display: block;
	margin-top: 6rpx;
	font-size: 21rpx;
	color: #5d6a7a;
}

.pick-arrow {
	font-size: 34rpx;
	color: #3d4a58;
	margin-left: 12rpx;
}
</style>
