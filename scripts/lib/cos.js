'use strict'

/**
 * COS 上传
 *
 * 对象必须带两个头，否则小程序端会出问题：
 * - Content-Type: application/json   uni.request 的 dataType 解析依赖它
 * - Cache-Control                    分档设置，避免 CDN 把旧数据缓存太久
 */

const fs = require('fs')

function hasCosConfig() {
	const { COS_SECRET_ID, COS_SECRET_KEY, COS_BUCKET, COS_REGION } = process.env
	return Boolean(COS_SECRET_ID && COS_SECRET_KEY && COS_BUCKET && COS_REGION)
}

/**
 * @param {string} localPath 本地文件路径
 * @param {string} key COS 上的对象键，例如 space-data/launches-upcoming.json
 * @param {string} cacheControl 例如 'public, max-age=300'
 */
async function upload(localPath, key, cacheControl) {
	if (!hasCosConfig()) {
		console.log(`  · 未配置 COS 环境变量，跳过上传 ${key}`)
		return false
	}

	let COS
	try {
		COS = require('cos-nodejs-sdk-v5')
	} catch (e) {
		throw new Error('缺少 cos-nodejs-sdk-v5，请在 scripts/ 目录执行 npm install')
	}

	const cos = new COS({
		SecretId: process.env.COS_SECRET_ID,
		SecretKey: process.env.COS_SECRET_KEY
	})

	const body = fs.readFileSync(localPath)

	// COS_ACL=public-read 时给单个对象打公有读，这样不必把整个桶改成公有读
	const params = {
		Bucket: process.env.COS_BUCKET,
		Region: process.env.COS_REGION,
		Key: key,
		Body: body,
		ContentType: 'application/json; charset=utf-8',
		CacheControl: cacheControl || 'public, max-age=300'
	}
	if (process.env.COS_ACL) params.ACL = process.env.COS_ACL

	await new Promise((resolve, reject) => {
		cos.putObject(params, (err) => (err ? reject(err) : resolve()))
	})

	console.log(`  ↑ 已上传 ${key}`)
	return true
}

module.exports = { upload, hasCosConfig }
