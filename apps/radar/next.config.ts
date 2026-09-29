import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (the local development database) ships WebAssembly and data files.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Deployments use Neon, so keep PGlite out of the serverless bundles: smaller functions
  // start faster.
  outputFileTracingExcludes: {
    "/*": ["./node_modules/@electric-sql/pglite/**/*"],
  },
  // The old pages live on as views of the console.
  async redirects() {
    return [
      { source: "/feed", destination: "/?view=stream", permanent: false },
      { source: "/people", destination: "/?view=people", permanent: false },
      { source: "/people/:id", destination: "/?view=people", permanent: false },
      { source: "/orgs/:id", destination: "/?view=people", permanent: false },
      { source: "/sources", destination: "/?view=sources", permanent: false },
      { source: "/topics", destination: "/?view=settings", permanent: false },
      { source: "/topics/:id", destination: "/?topic=:id&view=health", permanent: false },
    ];
  },
};

export default nextConfig;
