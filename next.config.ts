import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Database drivers load native/wasm assets; keep them out of the bundle.
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
  poweredByHeader: false,

  // Self-contained server bundle for deployment (see DEPLOY.md).
  output: "standalone",

  // schema.sql is read at runtime rather than imported, so the bundler can't
  // see it. Without this it would be missing from the deployed image and the
  // database would fail to open on first boot.
  outputFileTracingIncludes: {
    "/**": ["./src/lib/schema.sql"],
  },
};

export default config;
