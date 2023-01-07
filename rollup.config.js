import { defineConfig } from 'rollup';
import typescript from '@rollup/plugin-typescript';
import del from 'rollup-plugin-delete';
import copy from 'rollup-plugin-copy';
import { execSync } from 'child_process';

export default defineConfig([
  {
    input: {
      index: 'src/index.ts',
    },
    output: { dir: 'dist', format: 'cjs', sourcemap: true },
    external: [
      "@sinclair/typebox",
      "@redis/client",
      "redis",
      "luxon",
      "cross-fetch",
    ],
    plugins: [
      del({ targets: 'dist/**' }),
      typescript({
        tsconfig: 'tsconfig-prod.json',
      }),
      copy({
        targets: [
          {
            src: '.npmrc',
            dest: 'dist',
          },
          {
            src: 'package.json',
            dest: 'dist',
            transform: (contents) => {
              const content = JSON.parse(contents.toString());
              content.main = 'index.js';
              content.module = 'index.esm.js';
              content.types = 'index.d.js';
              content.repository = 'https://github.com/Enraged-Dun-Cookie-Development-Team/node-common';
              const buildNumber = process.env.BUILD_NUMBER === 'dev' ? 'dev' : parseInt(process.env.BUILD_NUMBER || 'NaN');
              if (!(buildNumber > 0) && buildNumber !== 'dev') {
                throw `无效环境变量BUILD_NUMBER：${process.env.BUILD_NUMBER}`;
              }
              let hash = execSync('git rev-parse --short HEAD').toString().trim();
              if (hash.length < 7 || hash.length > 12) {
                throw `获取git hash失败：${hash}`;
              }
              content.version = `${content.version}-alpha.${buildNumber}+${hash}`;
              delete content['type'];
              delete content['scripts'];
              delete content['lint-staged'];
              return JSON.stringify(content, null, 2);
            },
          },
        ],
      }),
    ],
  },
  {
    input: {
      'index.esm': 'src/index.ts',
    },
    output: { dir: 'dist', format: 'esm', sourcemap: true },
    external: [
      "@sinclair/typebox",
      "@redis/client",
      "redis",
      "luxon",
      "cross-fetch",
    ],
    plugins: [
      typescript({
        tsconfig: 'tsconfig-prod.json',
      }),
    ],
  },
  {
    input: {
      'env/index.esm': 'src/env/index.ts',
      'json/index.esm': 'src/json/index.ts',
      'logger/index.esm': 'src/logger/index.ts',
      'request/index.esm': 'src/request/index.ts',
      'redis/index.esm': 'src/redis/index.ts',
    },
    output: {
      dir: 'dist',
      format: 'esm',
      sourcemap: true,
    },
    external: ['luxon', 'cross-fetch', 'redis', '@redis/client', "ajv-formats", "ajv", "@stoplight/json-ref-resolver","@sinclair/typebox"],
    plugins: [
      typescript({
        tsconfig: 'tsconfig-prod.json',
      }),
    ],
  },
  {
    input: {
      'env/index': 'src/env/index.ts',
      'json/index': 'src/json/index.ts',
      'logger/index': 'src/logger/index.ts',
      'request/index': 'src/request/index.ts',
      'redis/index': 'src/redis/index.ts',
    },
    output: {
      dir: 'dist',
      format: 'cjs',
      sourcemap: true,
    },
    external: ['luxon', 'cross-fetch', 'redis', '@redis/client', "ajv-formats", "ajv", "@stoplight/json-ref-resolver","@sinclair/typebox"],
    plugins: [
      typescript({
        tsconfig: 'tsconfig-prod.json',
      }),
      copy({
        targets: [
          {
            src: 'src/common-package.json',
            dest: 'dist/env',
            rename: 'package.json',
          },
          {
            src: 'src/common-package.json',
            dest: 'dist/json',
            rename: 'package.json',
          },
          {
            src: 'src/common-package.json',
            dest: 'dist/logger',
            rename: 'package.json',
          },
          {
            src: 'src/common-package.json',
            dest: 'dist/request',
            rename: 'package.json',
          },
          {
            src: 'src/common-package.json',
            dest: 'dist/redis',
            rename: 'package.json',
          },
        ],
      }),
    ],
  },
]);
