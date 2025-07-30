module.exports = {
  globDirectory: './docs',
  globPatterns: [
    '**/*.{ico,jpg,png,html,js,svg,webmanifest,css,woff2,woff,eot,ttf,json}',
  ],
  swSrc: './src/sw.js',
  swDest: './docs/sw.js',
  maximumFileSizeToCacheInBytes: 5000000,
}
