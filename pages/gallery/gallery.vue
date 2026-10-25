<template>
	<view class="page">
		<nav-bar :solid="true" title="图库" placeholder />

		<!-- 四行横向缓慢漂流：方向交替、四行速度错开。
		     图库从「瀑布流」改成这样，是为了打开就有动静 ——
		     静止的网格再密也只是墙，会动的才像窗。 -->
		<view class="stage" v-if="!loading && rowsA.length">
			<view class="bands">
				<view class="band">
					<view class="track t1">
						<view class="cell wide" v-for="(img, i) in row1" :key="'a' + i" @click="preview(0, i)">
							<image class="cell-img" :src="img.thumb" mode="aspectFill"></image>
						</view>
					</view>
				</view>

				<view class="band">
					<view class="track t2">
						<view class="cell tall" v-for="(img, i) in row2" :key="'b' + i" @click="preview(1, i)">
							<image class="cell-img" :src="img.thumb" mode="aspectFill"></image>
						</view>
					</view>
				</view>

				<view class="band">
					<view class="track t3">
						<view class="cell wide" v-for="(img, i) in row3" :key="'c' + i" @click="preview(2, i)">
							<image class="cell-img" :src="img.thumb" mode="aspectFill"></image>
						</view>
					</view>
				</view>

				<view class="band">
					<view class="track t4">
						<view class="cell tall" v-for="(img, i) in row4" :key="'d' + i" @click="preview(3, i)">
							<image class="cell-img" :src="img.thumb" mode="aspectFill"></image>
						</view>
					</view>
				</view>

				<!-- 左右边缘渐隐：图从两侧淡入淡出，比硬切好看，也暗示「还在滚」 -->
				<view class="edge left"></view>
				<view class="edge right"></view>
			</view>

			<view class="foot">
				<text class="foot-count"><text class="foot-num">{{ total }}</text> 张在库里</text>
				<text class="foot-tip">点任意一张看大图</text>
			</view>

			<!-- 横滚墙只能「看着流」，翻不到 1957 年。想看全就去全量页 -->
			<view class="all-btn" hover-class="all-btn-hover" @click="goAll">
				<text class="all-text">看全部 {{ total }} 张</text>
				<text class="all-arrow">›</text>
			</view>
		</view>

		<view class="loading" v-if="loading">
			<text class="hint-text">加载中...</text>
		</view>

		<view class="empty-box" v-else-if="!images.length">
			<text class="empty-icon">🛰️</text>
			<text class="empty-text">还没有图片</text>
			<text class="empty-sub">历史图片正在由后台逐批补齐，过几个小时再来看看</text>
		</view>

		<!-- 大图弹层：点任意一张打开，同一行内可左右滑动切换 -->
		<photo-view
			:visible="photoVisible"
			:list="photoList"
			:index="photoIndex"
			@close="photoVisible = false"
		/>
	</view>
</template>

<script>
/**
 * 图库
 *
 * 交互只有一件事：看着它们慢慢飘，喜欢就点开看原图。
 * 没有分类、没有搜索、没有视频 tab —— 视频在小程序里本来就播不了
 * （web-view 要配业务域名），与其给个「复制链接」的劝退按钮，不如不做。
 *
 * 为什么每行只放 12 张再复制一份：
 *   无缝循环靠 track 复制内容 + translateX(-50%)。如果 800 张全塞进去，
 *   首屏要渲染 1600 个 image 节点，滑动直接卡死。12 × 4 行 = 48 张原图
 *   （渲染 96 个节点）已经能把屏幕铺满，看起来是「看不完的墙」。
 *
 * 为什么是 4 行而不是 3 行：三行 132px 高的大图铺不满一屏，上下各留一大块空白，
 * 看着像「三个相框」而不是「墙」。4 行、行高交替，才真的密不透风。
 */
import spaceData from '@/utils/data.js'
import { syncTabBar } from '@/utils/tabbar.js'

// 每行取多少张（复制后翻倍就是这个数 ×2 的节点数）
const PER_ROW = 12
// 行数：4 行铺满一屏
const ROWS = 4

export default {
	data() {
		return {
			loading: true,
			images: [],
			// 图库总张数（全量、去重后），底部「看全部」用它。
			// 和 images.length 不是一回事：images 只是第 0 片
			total: 0,
			// 四行各自的原始图（渲染时再拼一份副本）
			raw: [[], [], [], []],
			// 大图弹层：list + 起始下标，弹层内部自己管左右滑
			photoVisible: false,
			photoList: [],
			photoIndex: 0
		}
	},

	computed: {
		// concat 副本：x + x 后动画走 -50% 正好回到起点，看不出接缝
		row1() {
			return this.raw[0].concat(this.raw[0])
		},
		row2() {
			return this.raw[1].concat(this.raw[1])
		},
		row3() {
			return this.raw[2].concat(this.raw[2])
		},
		row4() {
			return this.raw[3].concat(this.raw[3])
		},
		// 模板里判断有没有内容，随便挑一行看
		rowsA() {
			return this.raw[0]
		}
	},

	onShow() {
		syncTabBar(2)
	},

	async onLoad() {
		const g = await spaceData.load('gallery').catch(() => null)
		const list = ((g && g.list) || []).filter((x) => x && x.thumb)

		this.images = list
		this.total = (g && g.count) || list.length

		// 四行交错分配：i % 4，这样同一场发射的相邻图不会挤在同一行
		const buckets = [[], [], [], []]
		list.slice(0, PER_ROW * ROWS).forEach((x, i) => {
			buckets[i % ROWS].push(x)
		})
		this.raw = buckets

		this.loading = false
	},

	methods: {
		goAll() {
			uni.navigateTo({ url: '/pages/gallery-all/gallery-all' })
		},

		/**
		 * 点开看大图。
		 * 传进来的是「复制后」数组的下标，对行长度取模还原成真实位置。
		 *
		 * 把整行交给弹层，而不是单张：同一行里左右滑就能继续看，
		 * 不用退出来再点下一张。
		 */
		preview(row, i) {
			const list = this.raw[row]
			if (!list.length) return

			this.photoList = list
			this.photoIndex = i % list.length
			this.photoVisible = true
		}
	}
}
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background: #0a0e17;
	display: flex;
	flex-direction: column;
	/* 底部给悬浮胶囊 tabBar 让位 */
	padding-bottom: 200rpx;
	box-sizing: border-box;
}

.stage {
	flex: 1;
	display: flex;
	flex-direction: column;
	justify-content: center;
}

/* ---- 三行横滚 ---- */
.bands {
	position: relative;
	overflow: hidden;
	padding: 20rpx 0;
}

.band {
	overflow: hidden;
	margin-bottom: 14rpx;
}

.band:last-child {
	margin-bottom: 0;
}

.track {
	display: inline-flex;
	/* max-content 不认的老内核靠 inline-flex 的 shrink-to-fit 兜底，
	   两种写法都能让 track 宽度 = 内容宽度，动画的 -50% 才有意义 */
	width: max-content;
	will-change: transform;
}

/* 四行速度与方向都错开：同一速度会像一整块在平移，不像各自漂流 */
.t1 {
	animation: marqueeL 52s linear infinite;
}

.t2 {
	animation: marqueeR 44s linear infinite;
}

.t3 {
	animation: marqueeL 62s linear infinite;
}

.t4 {
	animation: marqueeR 48s linear infinite;
}

@keyframes marqueeL {
	from {
		transform: translateX(0);
	}
	to {
		transform: translateX(-50%);
	}
}

@keyframes marqueeR {
	from {
		transform: translateX(-50%);
	}
	to {
		transform: translateX(0);
	}
}

.cell {
	flex-shrink: 0;
	margin-right: 14rpx;
	border-radius: 12rpx;
	overflow: hidden;
	background: #131a26;
}

/* 行高交替：两「宽」两「矮」，四行叠起来才有层次；
   宽高固定 + aspectFill，图被裁一点但整面墙是齐的 */
.wide {
	width: 304rpx;
	height: 216rpx;
}

.tall {
	width: 248rpx;
	height: 176rpx;
}

.cell-img {
	display: block;
	width: 100%;
	height: 100%;
}

/* 左右渐隐：80rpx 刚好盖住一格的三分之一，看得到「有图进来」但读不出细节 */
.edge {
	position: absolute;
	top: 0;
	bottom: 0;
	width: 90rpx;
	z-index: 5;
	pointer-events: none;
}

.edge.left {
	left: 0;
	background: linear-gradient(to right, #0a0e17, rgba(10, 14, 23, 0));
}

.edge.right {
	right: 0;
	background: linear-gradient(to left, #0a0e17, rgba(10, 14, 23, 0));
}

/* ---- 底部说明 ---- */
.foot {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	padding: 30rpx 40rpx 0;
}

.foot-count {
	color: #55637a;
	font-size: 22rpx;
}

.foot-num {
	color: #38bdf8;
	font-size: 26rpx;
	font-weight: 600;
}

.foot-tip {
	color: #7d8ba0;
	font-size: 21rpx;
}

/* ---- 看全部 ---- */
.all-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	align-self: center;
	margin-top: 24rpx;
	padding: 16rpx 34rpx;
	border-radius: 999rpx;
	border: 1rpx solid #1e2b3d;
	background: rgba(56, 189, 248, 0.06);
}

.all-btn-hover {
	background: rgba(56, 189, 248, 0.16);
}

.all-text {
	color: #38bdf8;
	font-size: 25rpx;
	letter-spacing: 1rpx;
}

.all-arrow {
	margin-left: 8rpx;
	color: #38bdf8;
	font-size: 30rpx;
	line-height: 1;
}

/* ---- 空态 / 加载 ---- */
.loading {
	flex: 1;
	display: flex;
	align-items: center;
	justify-content: center;
}

/* .hint-text 原来来自 styles/list.scss，这一页不再引入那份公共样式
   （瀑布流整套都用不上了），单独补一条 */
.hint-text {
	color: #6b7891;
	font-size: 26rpx;
}

.empty-box {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 0 60rpx;
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
