import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (the local development database) ships WebAssembly and data files.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
