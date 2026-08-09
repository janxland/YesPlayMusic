module.exports = {
  presets: [
    [
      '@vue/cli-plugin-babel/preset',
      {
        useBuiltIns: 'usage',
        shippedProposals: true,
      },
    ],
  ],
  // 上游代码使用 numeric separator（如 30_000，ES2021），browserslist 目标太新导致
  // preset-env 不转译，而 webpack4 的 parser 不支持 → 显式强制转译
  plugins: ['@babel/plugin-transform-numeric-separator'],
};
