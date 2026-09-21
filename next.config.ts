import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(process.cwd()),
  },
  // The stable bundle route reads the generated file at runtime. Keep it in
  // Vercel's server trace even though the file is ignored by git and produced
  // immediately before `next build`.
  outputFileTracingIncludes: {
    '/api/embeds/widget.js': ['./public/widget.js'],
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          // Stable legacy aliases must reach the current route even when a
          // stale file with the same name remains in public/.
          source: '/widget.js',
          destination: '/api/embeds/widget.js',
        },
        {
          source: '/:bundle(widget\\.[a-f0-9]{16}\\.js)',
          destination: '/api/embeds/widget.js',
        },
      ],
    };
  },
};

export default nextConfig;
