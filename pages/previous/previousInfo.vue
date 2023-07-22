<template>
	<view class="LaunchesInfo">


		<image :src="detail.image" mode="widthFix"></image>

		<view class="contant">

			<view class="name">
				{{detail.name}}
			</view>
			<view class="time">
				<uni-dateformat :date="detail.net" format='yyyy年MM月dd日 hh时mm分ss秒'></uni-dateformat>
			</view>
			<!-- 
			<view class="cell-group">
				<view class="cell-title">{{detail.name}}</view>
				<view class="cell-date">
					任务编号：#{{detail.orbital_launch_attempt_count_year}}
				</view>
				<view class="cell-date">
					发射时间：<uni-dateformat :date="detail.net" format='yyyy年MM月dd日 hh时mm分ss秒'></uni-dateformat>
				</view>
				<view class="cell-details">
					{{detail.mission.description}}
				</view>
			</view> -->


			<view class="cell-group" v-if="detail.mission">
				<view class="cell-title">任务信息</view>
				<view class="cell-details">
					{{detail.mission.description}}
				</view>
				<view class="cell-item">
					<view class="cell-item-title">
						类型
					</view>
					<view class="cell-item-desc">
						{{detail.mission.type}}
					</view>
				</view>
				<view class="cell-item">
					<view class="cell-item-title">
						状态
					</view>
					<view class="cell-item-desc">
						{{detail.status.name}}
					</view>
				</view>
			</view>



			<view class="cell-group" @click="goAgencies(Agencies.id)" v-if="Agencies">
				<view class="cell-title">发射机构</view>
				<view class="cell-picture">
					<image :src="Agencies.logo_url" mode="widthFix"></image>
				</view>
				<view class="cell-date">
					查看详情
				</view>
			</view>

			<view class="cell-group" v-if="detail.pad">
				<view class="cell-title">发射台</view>
				<view class="cell-picture">
					<image :src="detail.pad.map_image" mode="widthFix"></image>
				</view>
				<view class="cell-item">
					<view class="cell-item-title">
						名称
					</view>
					<view class="cell-item-desc">
						{{detail.pad.name}}
					</view>
				</view>
				<view class="cell-item">
					<view class="cell-item-title">
						地址
					</view>
					<view class="cell-item-desc">
						{{detail.pad.location.name}}
					</view>
				</view>
				<view class="cell-item">
					<view class="cell-item-title">
						经纬度
					</view>
					<view class="cell-item-desc">
						{{detail.pad.longitude}},{{detail.pad.latitude}}
					</view>
				</view>
				<view class="cell-item">
					<view class="cell-item-title">
						今年发射
					</view>
					<view class="cell-item-desc">
						{{detail.pad_launch_attempt_count_year}}次
					</view>
				</view>
				<view class="cell-item">
					<view class="cell-item-title">
						总发射
					</view>
					<view class="cell-item-desc">
						{{detail.pad_launch_attempt_count}}次
					</view>
				</view>
			</view>

			<view class="cell-group" v-if="detail.rocket">
				<view class="cell-title">火箭信息</view>
				<view class="cell-item">
					<view class="cell-item-title">
						名称
					</view>
					<view class="cell-item-desc">
						{{detail.rocket.configuration.full_name}}
					</view>
				</view>
			</view>

 
		</view>

	</view>
</template>

<script>
	export default {
		data() {
			return {
				detail: '',
				Agencies: [],
				Launcher: []
			};
		},
		onLoad(e) {
			this.detail = getApp().globalData.LaunchPrevious[e.id];
			console.log(this.detail);
			this.Agencies = getApp().globalData.Agencies.filter(item => item.id == this.detail.launch_service_provider.id)[0];
			this.Launcher = getApp().globalData.Launcher.filter(item => item.id == this.detail.rocket.configuration.id)[0];
			console.log(this.Launcher);
		},
		methods: {
			goAgencies(e) {
				uni.navigateTo({
					url: '/pages/agencies/agencies?id=' + e
				})
			}

		}
	}
</script>

<style lang="scss" scoped>
	.LaunchesInfo {
		image {
			width: 100%;
		}

		.name {
			padding: 40rpx;
			color: #3978bb;
			font-size: 2.125rem;
			// font-weight: 600;
		}

		.time {
			padding-bottom: 20rpx;
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
				}

				.cell-item {
					padding: 20rpx;
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
