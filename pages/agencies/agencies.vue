<template>
	<view class="LaunchesInfo">


		<image :src="Agencies.image_url" mode="widthFix"></image>

		<view class="contant">

			<view class="name">
				{{Agencies.name}}
			</view>
			
			<view class="cell-group">
				<view class="cell-picture">
					<image :src="Agencies.logo_url" mode="widthFix"></image>
				</view>
				<view class="cell-details">
					{{Agencies.description}}
				</view>
				<view class="cell-item">
					<view class="cell-item-title">
						缩写
					</view>
					<view class="cell-item-desc">
						{{Agencies.abbrev}}
					</view>
				</view>
				<view class="cell-item">
					<view class="cell-item-title">
						机构类型
					</view>
					<view class="cell-item-desc">
						{{Agencies.type}}
					</view>
				</view>
				<view class="cell-item">
					<view class="cell-item-title">
						成立时间
					</view>
					<view class="cell-item-desc">
						{{Agencies.founding_year}}
					</view>
				</view>
				<view class="cell-item">
					<view class="cell-item-title">
						国家/地区
					</view>
					<view class="cell-item-desc">
						{{Agencies.country_code}}
					</view>
				</view>
				<view class="cell-item">
					<view class="cell-item-title">
						现有发射器
					</view>
					<view class="cell-item-desc">
						{{Agencies.launchers}}
					</view>
				</view>
			</view>
			
			
<!-- 			
			<view class="cell-group">
				<view class="cell-title">发射机构</view>
				<view class="cell-picture">
					<image :src="Agencies.logo_url" mode="widthFix"></image>
				</view>
				<view class="cell-item">
					<view class="cell-item-title">
						缩写
					</view>
					<view class="cell-item-desc">
						{{Agencies.abbrev}}
					</view>
				</view>
				<view class="cell-item">
					<view class="cell-item-title">
						类型
					</view>
					<view class="cell-item-desc">
						{{detail.launch_service_provider.type}}
					</view>
				</view>
				<view class="cell-item">
					<view class="cell-item-title">
						今年发射
					</view>
					<view class="cell-item-desc">
						{{detail.agency_launch_attempt_count_year}}次
					</view>
				</view>
				<view class="cell-item">
					<view class="cell-item-title">
						总发射
					</view>
					<view class="cell-item-desc">
						{{detail.agency_launch_attempt_count}}次
					</view>
				</view>
				<view class="cell-picture">
					<image :src="Agencies.image_url" mode="widthFix"></image>
				</view>
			</view> -->

			
		</view>

	</view>
</template>

<script>
	export default {
		data() {
			return {
				detail: '',
				Agencies: []
			};
		},
		onLoad(e) {
			this.Agencies = getApp().globalData.Agencies.filter(item => item.id == e.id)[0];
			console.log(this.Agencies);
		},
		methods: {

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
					padding: 10rpx ;
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
				
				.cell-item{
					padding: 20rpx;
					display: flex;
					justify-content: space-between;
					align-items: center;
					.cell-item-title{
						font-size: 35rpx;
						color: #3978bb;
						font-weight: 550;
						width: 300rpx;
					}
					.cell-item-desc{
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
