<template>
	<view class="LaunchesInfo">
		<view class="loading" v-if="loading">
			<text class="loading-text">加载中...</text>
		</view>

		<view class="empty" v-else-if="!Agencies.id">
			<text class="empty-text">未找到该机构信息</text>
		</view>

		<block v-else>
			<!-- 实测 350 家里只有 44 家有 image_url、127 家有 logo_url，所以主图要兜底到 logo -->
			<image
				v-if="Agencies.image_url || Agencies.logo_url"
				:src="Agencies.image_url || Agencies.logo_url"
				mode="widthFix"
			></image>

			<view class="contant">
				<view class="name">
					{{ Agencies.name }}
				</view>

				<view class="cell-group">
					<!-- 主图已用 logo 兜底时就不再重复展示 -->
					<view class="cell-picture" v-if="Agencies.logo_url && Agencies.image_url">
						<image :src="Agencies.logo_url" mode="widthFix"></image>
					</view>
					<view class="cell-details" v-if="Agencies.descriptionZh || Agencies.description">
						{{ Agencies.descriptionZh || Agencies.description }}
					</view>
					<view class="cell-item" v-if="Agencies.abbrev">
						<view class="cell-item-title">缩写</view>
						<view class="cell-item-desc">{{ Agencies.abbrev }}</view>
					</view>
					<view class="cell-item" v-if="Agencies.type">
						<view class="cell-item-title">机构类型</view>
						<view class="cell-item-desc">{{ Agencies.type }}</view>
					</view>
					<view class="cell-item" v-if="Agencies.founding_year">
						<view class="cell-item-title">成立时间</view>
						<view class="cell-item-desc">{{ Agencies.founding_year }}</view>
					</view>
					<view class="cell-item" v-if="Agencies.country_code">
						<view class="cell-item-title">国家/地区</view>
						<view class="cell-item-desc">{{ Agencies.country_code }}</view>
					</view>
					<view class="cell-item" v-if="Agencies.launchers">
						<view class="cell-item-title">现有发射器</view>
						<view class="cell-item-desc">{{ Agencies.launchers }}</view>
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
				Agencies: {},
				loading: true
			};
		},
		async onLoad(e) {
			const id = e && e.id
			if (id) {
				const found = await spaceData.getAgencyById(id)
				if (found) this.Agencies = found
			}
			this.loading = false
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
			color: #7e7e7e;
			font-size: 30rpx;
		}

		.name {
			padding: 40rpx;
			color: #3978bb;
			font-size: 2.125rem;
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

				.cell-picture {
					padding: 10rpx;
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
