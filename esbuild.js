const esbuild = require("esbuild");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

async function main() {
	const ctx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
		],
		// Bundle jsdom-global and its dependencies
		loader: {
			'.node': 'file',
		},
	});

	// Build mocha reporter
	const reporterCtx = await esbuild.context({
		entryPoints: [
			'src/mocha-reporter/hierarchical.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/mocha-reporter/hierarchical.js',
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
		],
		footer: {
			js: 'module.exports = module.exports.default || module.exports;'
		},
	});

	if (watch) {
		await ctx.watch();
		await reporterCtx.watch();
	} else {
		await ctx.rebuild();
		await reporterCtx.rebuild();
		await ctx.dispose();
		await reporterCtx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
