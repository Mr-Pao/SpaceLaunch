<template>
	<view class="event">

		<view v-if="showLoading">
			<u-loading-icon text="发射数据加载中" mode="semicircle" textSize="20"></u-loading-icon>
		</view>


		<view class="contant" v-else>
			<view v-for="(item, index) in Event.slice(0,listNum)" :key="index">
				<view class="cell-group">
					<view class="cell-picture">
						<image :src="item.feature_image" mode="aspectFill"></image>
					</view>
					<view class="cell-type" decode='true'>
						{{item.type.name}}&ensp;.
						<uni-dateformat class="cell-date" :date="item.date"></uni-dateformat>
					</view>

					<view class="cell-title">{{item.name}}</view>
					<view class="cell-tag">
						<uni-tag  v-if="item.location" :circle="true" :text="item.location" type="primary" size="mini" />
						<uni-tag  v-if="item.launches.length>0" :circle="true" :text="item.launches[0].name" type="warning" size="mini" />
					</view>

					<view class="cell-desc">
						{{item.description}}
					</view>
					
				</view>
			</view>
		</view>
		
		
		<!-- 加载更多 -->
		<uni-load-more :status="status"></uni-load-more>
		
	</view>
</template>

<script>
	export default {
		data() {
			return {
				showLoading: true,
				status: 'more',
				listNum: 3,
			};
		},
		onLoad() {

		},
		async onShow() {
			this.Event = getApp().globalData.Event;
			console.log(this.Event);
			this.showLoading = false;
			
		},
		onReachBottom() {
			this.status = 'loading';
			this.listNum = this.listNum + 3;
			console.log(this.listNum);
			if (this.listNum >= this.Event.length) this.status = 'nomore';
			else this.status = 'loading';
		},

	}
</script>

<style lang="scss" scoped>
	.contant {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: 0rpx;
		padding-bottom: 200rpx;
		.cell-group {
			display: flex;
			flex-direction: column;
			width: 550rpx;
			// background-color: #282828;
			margin-top: 250rpx;

			.cell-type {
				display: flex;
				padding-top: 30rpx;
				color: #3978bb;
				font-size: 25rpx;
			}

			.cell-date {
				color: #7e7e7e;
				font-size: 20rpx;
			}

			.cell-picture {
				image {
					box-shadow: 15rpx 20rpx 25px  ;
					width: 550rpx;
					height: 550rpx;
					border-radius: 30rpx;
				}
			}
			.cell-tag{
				padding-top: 20rpx;
			}


			.cell-title {
				padding-top: 30rpx;
				color: #fff;
				font-size: 45rpx;
				font-weight: 550;
			}

			.cell-desc {
				padding-top: 20rpx;
				font-size: 30rpx;
				color: #7e7e7e;
			}

			// .cell-picture {
			// 	padding: 10rpx;
			// }

			// .cell-date {
			// 	padding-top: 20rpx;
			// 	color: #7e7e7e;
			// 	font-size: 30rpx;
			// 	text-align: right;
			// }

			// .cell-details {
			// 	padding-top: 20rpx;
			// 	font-size: 32rpx;
			// 	color: #fff;
			// }

			// .cell-item {
			// 	padding: 20rpx;
			// 	display: flex;
			// 	justify-content: space-between;
			// 	align-items: center;

			// 	.cell-item-title {
			// 		font-size: 35rpx;
			// 		color: #3978bb;
			// 		font-weight: 550;
			// 		width: 300rpx;
			// 	}

			// 	.cell-item-desc {
			// 		font-size: 30rpx;
			// 		color: #fff;
			// 		width: 400rpx;
			// 		text-align: right;
			// 	}
			// }

		}
	}
</style>
