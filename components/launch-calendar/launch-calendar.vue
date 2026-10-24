<template>
	<view class="cal">
		<view class="cal-head">
			<view class="cal-nav" @click="shiftMonth(-1)"><text class="cal-nav-arrow">‹</text></view>
			<text class="cal-month">{{ year }} 年 {{ month }} 月</text>
			<view class="cal-nav" @click="shiftMonth(1)"><text class="cal-nav-arrow">›</text></view>
		</view>

		<view class="cal-week">
			<text class="cal-wd" v-for="w in weekHeads" :key="w">{{ w }}</text>
		</view>

		<view class="cal-grid">
			<view
				class="cal-cell"
				v-for="(c, i) in grid"
				:key="i"
				:class="{ dim: !c.inMonth, today: c.isToday, sel: c.dateStr === selected }"
				@click="onTap(c)"
			>
				<text class="cal-day">{{ c.day }}</text>
				<view class="cal-dots" v-if="c.launches.length">
					<text class="cal-dot" v-for="n in Math.min(c.launches.length, 3)" :key="n"></text>
				</view>
				<text class="cal-num" v-if="c.launches.length > 1">{{ c.launches.length }}</text>
			</view>
		</view>
	</view>
</template>

<script>
/**
 * 发射日历（按月网格 + 日期打点）。
 *
 * - 数据来自父页传入的 upcoming 已加载列表（快照 100 条，触底可追后续）；
 *   日期取 net 的前 10 位（UTC 日期），与列表排序口径一致
 * - 点有任务的日子 → $emit('pick', { dateStr, launches })，列表渲染交给父页
 * - 6 行 7 列固定网格：不同月份高度一致，切换不跳动
 */
const pad = (n) => (n < 10 ? '0' + n : '' + n)

export default {
	name: 'launch-calendar',

	props: {
		items: { type: Array, default: () => [] }
	},

	data() {
		const now = new Date()
		return {
			weekHeads: ['日', '一', '二', '三', '四', '五', '六'],
			year: now.getFullYear(),
			month: now.getMonth() + 1,
			selected: ''
		}
	},

	computed: {
		grid() {
			const startWeek = new Date(this.year, this.month - 1, 1).getDay()
			const daysInMonth = new Date(this.year, this.month, 0).getDate()
			const daysPrev = new Date(this.year, this.month - 1, 0).getDate()

			// 本月数据按日期分组
			const byDate = {}
			for (const x of this.items) {
				if (!x || !x.net) continue
				const ds = x.net.slice(0, 10)
				;(byDate[ds] = byDate[ds] || []).push(x)
			}

			const t = new Date()
			const todayStr = t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate())

			const cells = []
			for (let i = 0; i < 42; i++) {
				const dayNum = i + 1 - startWeek
				let day
				let inMonth
				if (dayNum < 1) {
					day = daysPrev + dayNum
					inMonth = false
				} else if (dayNum > daysInMonth) {
					day = dayNum - daysInMonth
					inMonth = false
				} else {
					day = dayNum
					inMonth = true
				}
				const dateStr = inMonth ? this.year + '-' + pad(this.month) + '-' + pad(day) : ''
				cells.push({
					day,
					inMonth,
					dateStr,
					isToday: dateStr === todayStr,
					launches: byDate[dateStr] || []
				})
			}
			return cells
		}
	},

	methods: {
		shiftMonth(delta) {
			let m = this.month + delta
			let y = this.year
			if (m < 1) {
				m = 12
				y--
			} else if (m > 12) {
				m = 1
				y++
			}
			this.year = y
			this.month = m
		},

		onTap(c) {
			if (!c.inMonth || !c.launches.length) return
			this.selected = c.dateStr
			this.$emit('pick', { dateStr: c.dateStr, launches: c.launches })
		}
	}
}
</script>

<style lang="scss" scoped>
.cal {
	padding: 24rpx;
	background: #141a26;
	border-radius: 20rpx;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
}

.cal-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 16rpx;
}

.cal-month {
	color: #ffffff;
	font-size: 30rpx;
	font-weight: 600;
}

.cal-nav {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 64rpx;
	height: 64rpx;
	border-radius: 50%;
	background: rgba(255, 255, 255, 0.06);
}

.cal-nav-arrow {
	color: #ffffff;
	font-size: 40rpx;
	line-height: 1;
	margin-top: -4rpx;
}

.cal-week,
.cal-grid {
	display: grid;
	grid-template-columns: repeat(7, 1fr);
}

.cal-wd {
	text-align: center;
	color: #4a5568;
	font-size: 22rpx;
	padding-bottom: 8rpx;
}

.cal-cell {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: flex-start;
	padding: 10rpx 0 14rpx;
	min-height: 84rpx;
	border-radius: 12rpx;
}

.cal-cell.dim {
	opacity: 0.28;
}

.cal-cell.sel {
	background: rgba(56, 189, 248, 0.14);
}

.cal-day {
	color: #e2e8f0;
	font-size: 26rpx;
	line-height: 1.4;
}

.cal-cell.today .cal-day {
	color: #38bdf8;
	font-weight: 600;
}

.cal-dots {
	display: flex;
	margin-top: 6rpx;
}

.cal-dot {
	width: 8rpx;
	height: 8rpx;
	border-radius: 50%;
	background: #f5c33b;
	margin: 0 3rpx;
}

.cal-num {
	position: absolute;
	top: 2rpx;
	right: 6rpx;
	color: #f5c33b;
	font-size: 18rpx;
}
</style>
