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
 * @param {string} [contentType] 默认按 JSON 处理
 */
async function upload(localPath, key, cacheControl, contentType) {
	if (!hasCosConfig()) {
		console.log(`  · 未配置 COS 环境变量，跳过上传 ${key}`)
		return false
	}

	getClient()
	const body = fs.readFileSync(localPath)
	await putBuffer(
		body,
		key,
		contentType || 'application/json; charset=utf-8',
		cacheControl || 'public, max-age=300'
	)

	console.log(`  ↑ 已上传 ${key}`)
	return true
}

/**
 * 读 COS 上的 JSON。
 *
 * 桶是公有读，所以**不需要密钥**——只要桶名和地域。
 * 这一点很关键：本地干跑增量脚本时没有 secret，也能读到线上已有数据，
 * 从而算出「哪些还没抓过」，不必每次都从零开始。
 *
 * 错误语义（2026-10-25 评审 P1-1 修正，别改回去）：
 *   404 = 文件还不存在 → 返回 null，调用方按「从零开始」处理，这是正常态；
 *   网络失败 / 5xx / 解析失败 = **抛错**，调用方中止本轮 ——
 *   以前一律按 null 处理，增量脚本会拿着「空存量」只写入本轮几条
 *   就覆盖上传，线上几百条历史数据一次清零且不可自愈。
 */
/**
 * 读 COS 上的 JSON。
 *
 * @param {string} key 对象键，例如 space-data/launches-previous.json
 * @param {object} [opts]
 * @param {boolean} [opts.notFoundIsNull=true]
 *   404 是否当作「文件还不存在」返回 null（增量场景的默认正常态）；
 *   若传 false，404 也会抛错。
 *
 * 语义说明（P2-17）：本函数与 scripts/sync.js 里的私有 readCosJson 是**两份独立实现**，
 * 故意不共享——sync.js 那份是「非 200 即抛」的强依赖读取（拿不到终态就中止），
 * 这里是「404→null、其余抛错」的增量读取。两者语义不同，改之前看清楚调用方要哪个，
 * 不要为了消除重复把 sync.js 改去复用本函数，否则会破坏强依赖读取的失败中止行为。
 */
async function readCosJson(key, { notFoundIsNull = true } = {}) {
	const { COS_BUCKET, COS_REGION } = process.env
	if (!COS_BUCKET || !COS_REGION) return null
	const url = `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/${key}`

	let res
	try {
		res = await fetch(url, { signal: AbortSignal.timeout(30000) })
	} catch (e) {
		throw new Error(`读取 ${key} 网络失败: ${e.message}`)
	}
	if (res.status === 404) {
		// 默认把 404 当「还没有这个文件」处理（增量从零开始）；显式 notFoundIsNull=false 时抛错
		if (notFoundIsNull) return null
		throw new Error(`读取 ${key} 失败: HTTP 404（notFoundIsNull=false）`)
	}
	if (!res.ok) throw new Error(`读取 ${key} 失败: HTTP ${res.status}`)
	return await res.json()
}

module.exports = { upload, hasCosConfig, getClient, headObject, putBuffer, readCosJson }
