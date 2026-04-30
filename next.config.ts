import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist", "mammoth", "cheerio"],
};

export default nextConfig;
