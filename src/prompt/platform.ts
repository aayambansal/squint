import fs from 'node:fs'
import path from 'node:path'

/**
 * Which platforms a repo ships to, read from its manifests. Drives
 * which bundled design skills ride along: HIG on Apple targets,
 * Material on Android, desktop conventions for Electron/Tauri. Cheap
 * on purpose — a handful of existsSync calls per ask, no globbing.
 */
export type Platform = 'web' | 'ios' | 'android' | 'desktop'

const ORDER: Platform[] = ['web', 'ios', 'android', 'desktop']

const MOBILE_DEPS = [
  'react-native',
  'expo',
  '@capacitor/core',
  '@ionic/core',
  '@ionic/react',
  '@ionic/vue',
  '@ionic/angular',
  '@nativescript/core',
  'nativescript',
]

const DESKTOP_DEPS = ['electron', '@tauri-apps/api', '@tauri-apps/cli', '@wailsapp/runtime', '@neutralinojs/lib']

const DESKTOP_FILES = [
  'src-tauri/tauri.conf.json',
  'tauri.conf.json',
  'electron-builder.yml',
  'electron-builder.json',
  'forge.config.js',
  'forge.config.ts',
  'wails.json',
]

/** `react-dom` rather than `react`: React Native repos depend on react too. */
const WEB_DEPS = [
  'react-dom',
  'react-native-web',
  'vue',
  'svelte',
  '@sveltejs/kit',
  'next',
  'nuxt',
  'astro',
  'solid-js',
  '@angular/core',
  'vite',
  '@remix-run/react',
  'preact',
  'lit',
]

function readDeps(cwd: string): Record<string, string> {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    return { ...pkg.dependencies, ...pkg.devDependencies }
  } catch {
    return {}
  }
}

function exists(cwd: string, rel: string): boolean {
  return fs.existsSync(path.join(cwd, rel))
}

function dirHasSuffix(dir: string, suffixes: string[]): boolean {
  try {
    return fs.readdirSync(dir).some((entry) => suffixes.some((s) => entry.endsWith(s)))
  } catch {
    return false
  }
}

export function detectPlatforms(cwd: string): Platform[] {
  const found = new Set<Platform>()
  const deps = readDeps(cwd)
  const has = (name: string) => name in deps

  if (MOBILE_DEPS.some(has)) {
    found.add('ios')
    found.add('android')
  }
  if (DESKTOP_DEPS.some(has) || DESKTOP_FILES.some((f) => exists(cwd, f))) found.add('desktop')

  // Flutter: pubspec with a flutter section; desktop folders mark desktop targets.
  if (exists(cwd, 'pubspec.yaml')) {
    let pubspec = ''
    try {
      pubspec = fs.readFileSync(path.join(cwd, 'pubspec.yaml'), 'utf8')
    } catch {
      // unreadable pubspec: ignore
    }
    if (/^\s*flutter\s*:/m.test(pubspec)) {
      found.add('ios')
      found.add('android')
      if (['macos', 'windows', 'linux'].some((d) => exists(cwd, d))) found.add('desktop')
    }
  }

  // Native Apple projects (Xcode project or workspace at the root or under ios/).
  const appleSuffixes = ['.xcodeproj', '.xcworkspace']
  if (dirHasSuffix(cwd, appleSuffixes) || dirHasSuffix(path.join(cwd, 'ios'), appleSuffixes) || exists(cwd, 'ios/Podfile')) {
    found.add('ios')
  }
  if (exists(cwd, 'Package.swift') && !found.has('web')) found.add('ios')

  // Native Android projects.
  if (
    exists(cwd, 'android/app/build.gradle') ||
    exists(cwd, 'android/app/build.gradle.kts') ||
    exists(cwd, 'app/src/main/AndroidManifest.xml') ||
    exists(cwd, 'app/build.gradle.kts') ||
    exists(cwd, 'app/build.gradle')
  ) {
    found.add('android')
  }

  if (WEB_DEPS.some(has) || exists(cwd, 'index.html') || exists(cwd, 'public/index.html')) found.add('web')

  // squint is a frontend harness: with no signal at all, assume the web.
  if (found.size === 0) found.add('web')
  return ORDER.filter((p) => found.has(p))
}
