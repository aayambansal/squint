import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectPlatforms } from '../src/prompt/platform.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-platform-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const pkg = (deps: Record<string, string>) =>
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: deps }))

describe('detectPlatforms', () => {
  it('defaults to the web with no signal, and on web frameworks', () => {
    expect(detectPlatforms(dir)).toEqual(['web'])
    pkg({ next: '16', react: '19', 'react-dom': '19' })
    expect(detectPlatforms(dir)).toEqual(['web'])
  })

  it('reads mobile targets from React Native, Expo, Capacitor, and Flutter', () => {
    pkg({ react: '19', 'react-native': '0.80' })
    expect(detectPlatforms(dir)).toEqual(['ios', 'android']) // bare react is not the web
    pkg({ '@capacitor/core': '7', 'react-dom': '19' })
    expect(detectPlatforms(dir)).toEqual(['web', 'ios', 'android'])
    fs.rmSync(path.join(dir, 'package.json'))
    fs.writeFileSync(path.join(dir, 'pubspec.yaml'), 'name: app\ndependencies:\n  flutter:\n    sdk: flutter\n')
    expect(detectPlatforms(dir)).toEqual(['ios', 'android'])
    fs.mkdirSync(path.join(dir, 'macos'))
    expect(detectPlatforms(dir)).toEqual(['ios', 'android', 'desktop'])
  })

  it('reads desktop targets from Electron and Tauri', () => {
    pkg({ electron: '38', 'react-dom': '19' })
    expect(detectPlatforms(dir)).toEqual(['web', 'desktop'])
    fs.rmSync(path.join(dir, 'package.json'))
    fs.mkdirSync(path.join(dir, 'src-tauri'))
    fs.writeFileSync(path.join(dir, 'src-tauri', 'tauri.conf.json'), '{}')
    expect(detectPlatforms(dir)).toEqual(['desktop'])
  })

  it('reads native Xcode and Gradle projects', () => {
    fs.mkdirSync(path.join(dir, 'App.xcodeproj'))
    expect(detectPlatforms(dir)).toEqual(['ios'])
    fs.mkdirSync(path.join(dir, 'android', 'app'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'android', 'app', 'build.gradle.kts'), '')
    expect(detectPlatforms(dir)).toEqual(['ios', 'android'])
  })
})
