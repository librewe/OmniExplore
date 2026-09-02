/**
 * GitHub Pages 部署在子路径（https://<owner>.github.io/<repo>/）。
 * basePath 动态取自 GitHub Actions 注入的 GITHUB_REPOSITORY（owner/repo），
 * 仓库改名自动跟随，零硬编码；本地无该变量时回退为空（dev/build 不受影响）。
 * 其他平台可用 BASE_PATH 环境变量显式覆盖。
 */
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
const basePath = process.env.BASE_PATH || (repo ? `/${repo}` : "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  ...(basePath ? { basePath, assetPrefix: `${basePath}/` } : {}),
};

module.exports = nextConfig;
