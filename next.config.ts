import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["unpdf", "pdfjs-dist", "mammoth", "cheerio"],
};

export default nextConfig;
