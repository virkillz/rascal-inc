/**
 * Plugin registry — all built-in plugins are imported statically here.
 *
 * To add a new plugin:
 * 1. Create plugins/<name>/index.ts implementing RascalPlugin
 * 2. Create plugins/<name>/plugin.json with metadata
 * 3. Import and add it to builtInPlugins below
 */

import { elevenlabsPlugin } from './elevenlabs/index.js'
import { geminiImagePlugin } from './gemini-image/index.js'
import { youtubePlugin } from './youtube/index.js'
import { remotionPlugin } from './remotion/index.js'

export { elevenlabsPlugin, geminiImagePlugin, youtubePlugin, remotionPlugin }

export const builtInPlugins = [
  elevenlabsPlugin,
  geminiImagePlugin,
  youtubePlugin,
  remotionPlugin,
]
