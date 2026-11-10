import type { NextConfig } from "next";

/** Статический экспорт для GitHub Pages: EXPORT_STATIC=1 bun run build:static */
const isExport = process.env.EXPORT_STATIC === "1";
const REPO_NAME = "lenia";

const nextConfig: NextConfig = {
  ...(isExport
    ? {
        output: "export",
        basePath: `/${REPO_NAME}`,
        images: { unoptimized: true },
      }
    : { output: "standalone" }),
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
