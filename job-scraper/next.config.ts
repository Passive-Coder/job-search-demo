import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["chromadb"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
