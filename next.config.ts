import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(process.cwd()),
  },
  async headers() {
    const scriptHeaders = [
      { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
      { key: 'Access-Control-Allow-Origin', value: '*' },
      { key: 'Timing-Allow-Origin', value: '*' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
    ];
    return [
      '/api/embeds/widget.js',
      '/widget.js',
      '/:bundle(widget\\.[a-f0-9]{16}\\.js)',
    ].map((source) => ({ source, headers: scriptHeaders }));
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/api/embeds/widget.js',
          destination: '/widget.js',
        },
        {
          source: '/:bundle(widget\\.[a-f0-9]{16}\\.js)',
          destination: '/widget.js',
        },
      ],
    };
  },
};

export default nextConfig;
