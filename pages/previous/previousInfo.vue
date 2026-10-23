<template>
	<view class="LaunchesInfo">
		<view class="loading" v-if="loading">
			<text class="loading-text">加载中...</text>
		</view>

		<view class="empty" v-else-if="!detail">
			<text class="empty-text">未找到该发射任务</text>
			<button class="retry-btn" @click="goHome">返回首页</button>
		</view>

		<block v-else>
			<image v-if="detail.image" :src="detail.image" mode="widthFix"></image>

			<view class="contant">
				<view class="name">
					{{ detail.name }}
				</view>
				<view class="time">
					<uni-dateformat :date="detail.net" format="yyyy年MM月dd日 hh时mm分ss秒"></uni-dateformat>
				</view>

				<view class="cell-group" v-if="detail.mission && (detail.mission.descriptionZh || detail.mission.description || detail.mission.type)">
					<view class="cell-title">任务信息</view>
					<view class="cell-details" v-if="detail.mission.descriptionZh || detail.mission.description">
						{{ detail.mission.descriptionZh || detail.mission.description }}
					</view>
					<view class="cell-item" v-if="detail.mission.type">
						<view class="cell-item-title">类型</view>
						<view class="cell-item-desc">{{ detail.mission.type }}</view>
					</view>
					<view class="cell-item">
						<view class="cell-item-title">状态</view>
						<view class="cell-item-desc">{{ detail.status.name || '未知' }}</view>
					</view>
				</view>

				<!-- 有机构数据才显示，避免从首页直接进来时出现空白卡片 -->
				<view class="cell-group" @click="goAgencies(agency.id)" v-if="agency">
					<view class="cell-title">发射机构</view>
					<view class="cell-picture" v-if="agency.logo_url">
						<image :src="agency.logo_url" mode="widthFix"></image>
					</view>
					<view class="cell-item">
						<view class="cell-item-title">名称</view>
						<view class="cell-item-desc">{{ agency.name }}</view>
					</view>
					<view class="cell-date">查看详情</view>
				</view>

				<view class="cell-group" v-if="detail.pad && detail.pad.name">
					<view class="cell-title">发射台</view>
					<view class="cell-picture" v-if="detail.pad.map_image">
						<image :src="detail.pad.map_image" mode="widthFix"></image>
					</view>
					<view class="cell-item">
						<view class="cell-item-title">名称</view>
						<view class="cell-item-desc">{{ detail.pad.name }}</view>
					</view>
					<view class="cell-item" v-if="detail.pad.location.name">
						<view class="cell-item-title">地址</view>
						<view class="cell-item-desc">{{ detail.pad.location.name }}</view>
					</view>
					<view class="cell-item" v-if="detail.pad.longitude && detail.pad.latitude">
						<view class="cell-item-title">经纬度</view>
						<view class="cell-item-desc">{{ detail.pad.longitude }}, {{ detail.pad.latitude }}</view>
					</view>
					<view class="cell-item" v-if="detail.pad_launch_attempt_count_year !== null">
						<view class="cell-item-title">今年发射</view>
						<view class="cell-item-desc">{{ detail.pad_launch_attempt_count_year }} 次</view>
					</view>
					<view class="cell-item" v-if="detail.pad_launch_attempt_count !== null">
						<view class="cell-item-title">总发射</view>
						<view class="cell-item-desc">{{ detail.pad_launch_attempt_count }} 次</view>
					</view>
				</view>

				<view class="cell-group" v-if="detail.rocket && detail.rocket.configuration.full_name">
					<view class="cell-title">火箭信息</view>
					<view class="cell-item">
						<view class="cell-item-title">名称</view>
						<view class="cell-item-desc">{{ detail.rocket.configuration.full_name }}</view>
					</view>
				</view>
			</view>
		</block>
	</view>
</template>

<script>
	import spaceData from '@/utils/data.js'

	export default {
		data() {
			return {
				// 不再从 globalData 取：那是"必须先访问过列表页"的隐式依赖，
				// 从其它入口直接进详情会拿到 undefined
				detail: null,
				agency: null,
				loading: true
			};
		},
		async onLoad(e) {
			const id = e && e.id

			if (!id) {
				this.loading = false
				return
			}

			// 先读 previous，找不到再读 upcoming（两侧详情页模板一致，互为兜底）
			this.detail = await spaceData.getById('previous', id)
			if (!this.detail) {
				this.detail = await spaceData.getById('upcoming', id)
			}
			this.loading = false

			if (this.detail && this.detail.launch_service_provider && this.detail.launch_service_provider.id) {
				this.agency = await spaceData.getAgencyById(this.detail.launch_service_provider.id)
			}
		},
		methods: {
			goAgencies(id) {
				if (!id) return
				uni.navigateTo({
					url: '/pages/agencies/agencies?id=' + id
				})
			},
			goHome() {
				uni.switchTab({
					url: '/pages/previous/previous'
				})
			}
		}
	}
</script>

<style lang="scss" scoped>
	.LaunchesInfo {
		min-height: 100vh;
		padding-bottom: 40rpx;

		image {
			width: 100%;
		}

		.loading {
			padding: 200rpx 0;
			text-align: center;
		}

		.loading-text {
			color: #7e7e7e;
			font-size: 30rpx;
		}

		.empty {
			padding: 200rpx 40rpx;
			text-align: center;
		}

		.empty-text {
			display: block;
			color: #7e7e7e;
			font-size: 30rpx;
			margin-bottom: 40rpx;
		}

		.retry-btn {
			background: #3978bb;
			color: #fff;
			font-size: 28rpx;
			border-radius: 10rpx;
		}

		.name {
			padding: 40rpx;
			color: #3978bb;
			font-size: 2.125rem;
		}

		.time {
			padding: 0 40rpx 20rpx;
			color: #3978bb;
			font-size: 1.125rem;
		}

		.contant {
			width: 100%;
			display: flex;
			flex-direction: column;
			justify-content: center;
			align-items: center;

			.cell-group {
				display: flex;
				flex-direction: column;
				width: 90%;
				background-color: #282828;
				border-radius: 30rpx;
				margin-bottom: 30rpx;
				padding: 30rpx;

				.cell-title {
					color: #3978bb;
					font-size: 45rpx;
					font-weight: 550;
				}

				.cell-picture {
					padding: 10rpx;
				}

				.cell-date {
					padding-top: 20rpx;
					color: #7e7e7e;
					font-size: 30rpx;
					text-align: right;
				}

				.cell-details {
					padding-top: 20rpx;
					font-size: 32rpx;
					color: #fff;
					line-height: 1.6;
				}

				.cell-item {
					padding: 20rpx 0;
					display: flex;
					justify-content: space-between;
					align-items: center;

					.cell-item-title {
						font-size: 35rpx;
						color: #3978bb;
						font-weight: 550;
						width: 300rpx;
					}

					.cell-item-desc {
						font-size: 30rpx;
						color: #fff;
						width: 400rpx;
						text-align: right;
					}
				}
			}
		}
	}
</style>
