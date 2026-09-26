import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { modelConfig } from './providers.js';

export function config(env = process.env) {
  return {
    ...modelConfig(env),
    mcpUrl: env.CONTINUITY_URL ?? 'http://127.0.0.1:43187/mcp',
    outputDir: resolve(env.PROMISE_HOME ?? join(homedir(), 'Documents', 'Promise Continuity'))
  };
}

export function mcpConfig(env = process.env) {
  return {
    mcpUrl: env.CONTINUITY_URL ?? 'http://127.0.0.1:43187/mcp',
    outputDir: resolve(env.PROMISE_HOME ?? join(homedir(), 'Documents', 'Promise Continuity'))
  };
}
