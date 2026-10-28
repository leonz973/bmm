// 启动 Next 服务：端口取自环境变量 PORT，未设置时使用默认端口
// 用法：tsx scripts/server.mjs dev | tsx scripts/server.mjs start
import { spawn } from 'node:child_process'
import path from 'node:path'
import * as NextEnv from '@next/env'
import { loadExtraEnvFile } from './utils.mjs'

const DEFAULT_PORT = 3100

const mode = process.argv[2] === 'dev' ? 'dev' : 'start'
const isDev = mode === 'dev'

process.env.NODE_ENV ||= isDev ? 'development' : 'production'
const loadEnvConfig = NextEnv.loadEnvConfig || NextEnv.default.loadEnvConfig
loadEnvConfig(process.cwd(), isDev)
loadExtraEnvFile()

const port = process.env.PORT || String(DEFAULT_PORT)
const nextBin = path.resolve('node_modules/next/dist/bin/next')

const child = spawn(process.execPath, [nextBin, mode, '-p', port], {
  stdio: 'inherit',
  env: { ...process.env, PORT: port },
})

child.on('close', (code) => process.exit(code ?? 0))

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
