#!/usr/bin/env node
/**
 * tabBar 配置一致性校验（P1-4）
 *
 * 背景：tabBar 配置天然分散在两处，且结构不同——
 *   1) pages.json 的 tabBar.list（微信平台要求，唯一真源）
 *   2) custom-tab-bar/index.js 的 data.list（自定义悬浮胶囊实际渲染用的）
 * pages.json 是声明式的没法引用 JS 模块，两边只能手抄，
 * 图标路径或顺序一旦不一致，tab 与页面就错位（index 选中态对不上页面）。
 *
 * 本脚本以 pages.json 为真源，校验 custom-tab-bar/index.js 的
 * pagePath 顺序与 text 文案是否一致；不一致 exit 1。
 *
 * 运行：node scripts/check-tabbar.js
 * 触发：.github/workflows/check.yml（push 改动 tabBar 相关文件时）
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')

function readJsonWithComments(file) {
	// pages.json 允许注释（uni-app 约定），先剥掉再 parse
	const raw = fs.readFileSync(file, 'utf8')
	return JSON.parse(raw.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''))
}

function extractBarList(file) {
	// custom-tab-bar 是原生组件（不走 uni 编译），直接正则抢单引号字符串字段
	const raw = fs.readFileSync(file, 'utf8')
	const items = []
	const re = /pagePath:\s*'([^']+)'/g
	let m
	while ((m = re.exec(raw))) items.push(m[1])
	// text 与 pagePath 同块出现，按同样顺序抓出来
	const texts = []
	const tre = /text:\s*'([^']+)'/g
	while ((m = tre.exec(raw))) texts.push(m[1])
	return items.map((p, i) => ({ pagePath: p, text: texts[i] || '' }))
}

const pages = readJsonWithComments(path.join(ROOT, 'pages.json'))
const truth = (pages.tabBar && pages.tabBar.list || []).map((it) => ({
	pagePath: it.pagePath,
	text: it.text
}))
const bar = extractBarList(path.join(ROOT, 'custom-tab-bar', 'index.js'))

const errors = []

if (truth.length !== bar.length) {
	errors.push(`数量不一致：pages.json ${truth.length} 项 vs custom-tab-bar ${bar.length} 项`)
}

const n = Math.min(truth.length, bar.length)
for (let i = 0; i < n; i++) {
	if (truth[i].pagePath !== bar[i].pagePath) {
		errors.push(`第 ${i + 1} 项 pagePath 错位：pages.json「${truth[i].pagePath}」vs custom-tab-bar「${bar[i].pagePath}」`)
	}
	if (truth[i].text !== bar[i].text) {
		errors.push(`「${truth[i].pagePath}」text 不一致：pages.json「${truth[i].text}」vs custom-tab-bar「${bar[i].text}」`)
	}
}

/**
 * 第三个错位来源：各 tab 页 onShow 里的 syncTabBar(N)。
 * 它决定底部高亮哪一项，调完顺序最容易漏改 —— 配置一致、高亮错位，
 * 从 pages.json 和 custom-tab-bar 两边都看不出来。
 */
const pagesDir = path.join(ROOT, 'pages')
let checked = 0
for (const dir of fs.readdirSync(pagesDir)) {
	const file = path.join(pagesDir, dir, dir + '.vue')
	if (!fs.existsSync(file)) continue

	const m = /syncTabBar\((\d+)\)/.exec(fs.readFileSync(file, 'utf8'))
	if (!m) continue

	const idx = truth.findIndex((it) => it.pagePath === `pages/${dir}/${dir}`)
	if (idx < 0) continue

	checked++
	if (Number(m[1]) !== idx) {
		errors.push(`${dir}.vue 的 syncTabBar(${m[1]}) 与该页在 tabBar 里的位置（第 ${idx + 1} 项）不一致`)
	}
}

if (errors.length) {
	console.error('✗ tabBar 配置不一致：')
	errors.forEach((e) => console.error('  - ' + e))
	console.error('\n以 pages.json 的 tabBar.list 为准修改 custom-tab-bar/index.js。')
	process.exit(1)
}

console.log(`✓ tabBar 一致：${truth.length} 项，顺序、文案与各页选中索引均匹配（校验 ${checked} 个页面）`)
