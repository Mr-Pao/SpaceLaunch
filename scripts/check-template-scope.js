/**
 * 模板作用域检查：模板里调用的函数必须挂在实例上
 *
 * 这个坑已经踩过两次（astroName、agencyLabel）：
 * Vue3 options API 的模板只能看到实例成员（data / computed / methods / props），
 * 模块作用域里 import 进来的函数它是看不见的。`{{ fn(x) }}` 写起来毫无提示，
 * 编译也过，真机一渲染就 `_ctx.fn is not a function` 白屏 + 满屏 warn。
 *
 * 判定：模板中出现 `name(`，且 name 来自 import，而组件里没有同名成员
 * （成员指 `name(` / `name:` / `name,` 三种声明形式）。
 *
 *   node scripts/check-template-scope.js
 *
 * 退出码 1 表示有问题，可以直接串进发布前检查。
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SKIP_DIR = new Set(['node_modules', 'unpackage', '.git', 'dist', '.workbuddy', 'scripts', 'static'])

function walk(dir, out) {
	for (const name of fs.readdirSync(dir)) {
		const p = path.join(dir, name)
		const st = fs.statSync(p)
		if (st.isDirectory()) {
			if (SKIP_DIR.has(name)) continue
			walk(p, out)
		} else if (name.endsWith('.vue')) {
			out.push(p)
		}
	}
	return out
}

/** 取模板 / 脚本两段。任何一个不存在就跳过（不是 SFC） */
function split(s) {
	const ti = s.indexOf('<template>')
	const te = s.lastIndexOf('</template>')
	const si = s.indexOf('<script>')
	const se = s.indexOf('</script>')
	if (ti < 0 || te < 0 || si < 0 || se < 0) return null
	return { tpl: s.slice(ti + 10, te), scr: s.slice(si + 8, se) }
}

/**
 * import 引入的名字（支持 `a as b`）。
 *
 * `as` 前后的两个名字都要收：模板里写 `{{ a(x) }}` 一样会崩，
 * 因为模板根本看不到模块作用域，管你本地叫什么。
 * 只收本地名的话，「import 原名 as 新名 + 忘记挂实例」这种
 * 最典型的翻车姿势正好漏过去。
 */
function importedNames(scr) {
	const out = new Set()
	const re = /import\s*\{([^}]*)\}/g
	let m
	while ((m = re.exec(scr))) {
		for (const part of m[1].split(',')) {
			const s = part.trim()
			if (!s) continue
			const as = s.split(/\s+as\s+/)
			out.add((as[0] || '').trim())
			if (as[1]) out.add(as[1].trim())
		}
	}
	return out
}

/** 把 import 语句整段抹掉，免得 `import { x }` 自己被当成成员声明 */
function stripImports(scr) {
	return scr
		.replace(/import\s*\{[^}]*\}\s*from\s*['"][^'"]*['"]/g, '')
		.replace(/import\s+[\w$*\s{},]+\s+from\s*['"][^'"]*['"]/g, '')
		.replace(/import\s*['"][^'"]*['"]/g, '')
}

/** 模板里以 `name(` 形式出现的标识符 */
function calledNames(tpl) {
	const out = new Set()
	const re = /([a-zA-Z_$][\w$]*)\s*\(/g
	let m
	while ((m = re.exec(tpl))) out.add(m[1])
	return out
}

function hasMember(body, name) {
	const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	// 声明形式：`name(` 方法、`name:` 属性、`name,` 简写（methods 里放函数引用）
	return new RegExp('(?:^|[\\s{,(])' + esc + '\\s*[(,:]', 'm').test(body)
}

const files = walk(ROOT, [])
let bad = 0

for (const file of files) {
	const parts = split(fs.readFileSync(file, 'utf8'))
	if (!parts) continue

	const imports = importedNames(parts.scr)
	if (!imports.size) continue

	const body = stripImports(parts.scr)
	const missed = [...calledNames(parts.tpl)].filter(
		(n) => imports.has(n) && !hasMember(body, n)
	)

	if (missed.length) {
		bad++
		console.log('  ✗ ' + path.relative(ROOT, file).replace(/\\/g, '/') + '  ->  ' + missed.join(' '))
		console.log('      模板直接调了 import 的函数，实例上没有。改成 import 重命名 + 方法里转一层')
	}
}

console.log(
	bad
		? `\n模板作用域检查：${bad} 个文件有问题`
		: `模板作用域检查：${files.length} 个 .vue 全部通过`
)
process.exit(bad ? 1 : 0)
