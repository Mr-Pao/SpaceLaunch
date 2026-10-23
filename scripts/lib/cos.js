'use strict'

/**
 * COS 上传
 *
 * 对象必须带两个头，否则小程序端会出问题：
 * - Content-Type: application/json   uni.request 的 dataType 解析依赖它
 * - Cache-Control                    分档设置，避免 CDN 把旧数据缓存太久
 *
 * 图片走 putBuffer 而不是落盘再传：压缩产物本来就在内存里，多写一次磁盘纯属浪费
 */

const fs = require('fs')

function hasCosConfig() {
	const { COS_SECRET_ID, COS_SECRET_KEY, COS_BUCKET, COS_REGION } = process.env
	return Boolean(COS_SECRET_ID && COS_SECRET_KEY && COS_BUCKET && COS_REGION)
}

// SDK 实例复用。每次 new 都会重建连接池，批量上传图片时开销明显
let client = null

function getClient() {
	if (!hasCosConfig()) return null
	if (client) return client

	let COS
	try {
		COS = require('cos-nodejs-sdk-v5')
	} catch (e) {
		throw new Error('缺少 cos-nodejs-sdk-v5，请在 scripts/ 目录执行 npm install')
	}

	client = new COS({
		SecretId: process.env.COS_SECRET_ID,
		SecretKey: process.env.COS_SECRET_KEY
	})
	return client
}

function baseParams(key) {
	return {
		Bucket: process.env.COS_BUCKET,
		Region: process.env.COS_REGION,
		Key: key
	}
}

/** 对象是否已存在。用于图片增量上传，避免每轮都重传 */
function headObject(key) {
	const cos = getClient()
	if (!cos) return Promise.resolve(false)

	return new Promise((resolve) => {
		cos.headObject(baseParams(key), (err, data) => {
			resolve(!err && Boolean(data))
		})
	})
}

/** 传一段内存数据 */
async function putBuffer(buffer, key, contentType, cacheControl) {
	const cos = getClient()
	if (!cos) return false

	const params = {
		...baseParams(key),
		Body: buffer,
		ContentType: contentType || 'application/octet-stream',
		CacheControl: cacheControl || 'public, max-age=300'
	}
	if (process.env.COS_ACL) params.ACL = process.env.COS_ACL

	await new Promise((resolve, reject) => {
		cos.putObject(params, (err) => (err ? reject(err) : resolve()))
	})
	return true
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

	getClient()
	const body = fs.readFileSync(localPath)
	await putBuffer(body, key, 'application/json; charset=utf-8', cacheControl || 'public, max-age=300')

	console.log(`  ↑ 已上传 ${key}`)
	return true
}

module.exports = { upload, hasCosConfig, getClient, headObject, putBuffer }
