/**
 * Build `client/bundle.js` from `client/cards.js` + `client/engine.js` + `client/index.js`.
 *
 * The static-install artifact follows the client-modules bundle protocol:
 * `window.__ModuleLoader__.load({ id, factory })` registers a lazy CommonJS
 * factory that receives a `require` resolving framework modules (react is a
 * platform module; everything else is inlined). cards.js / engine.js land in
 * the same factory scope ahead of index.js, so the glue code references
 * FireworkCards / CARDS_BY_CATEGORY / pickVariants / mulberry32 /
 * createEngine as bare names — dsh-tasks build-client.mjs 同款内联方案。
 *
 * Stripped from the helper sources: the `'use strict'` prologue and the
 * node-only `module.exports` guard lines (they would clobber the factory's
 * module.exports before index.js sets it).
 *
 * Run: `npm run build:client`
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'))

/** 读入 helper 源并剥掉 node-only 外壳。 */
const helper = (name) => readFileSync(join(here, '..', 'client', name), 'utf8')
  .replace(/^'use strict'\s*/, '')
  .replace(/^if \(typeof module !== 'undefined' && module\.exports\) module\.exports = \w+\s*$/gm, '')
  .trim()

const cards = helper('cards.js')
const rendererCanvas2d = helper('renderer-canvas2d.js')
const rendererWebgl = helper('renderer-webgl.js')
const engine = helper('engine.js')
const source = readFileSync(join(here, '..', 'client', 'index.js'), 'utf8').trim()

const banner = `/* Generated from client/cards.js + client/engine.js + client/index.js by scripts/build-client.mjs — do not edit by hand.
 * Regenerate with: npm run build:client
 */
window.__ModuleLoader__.load({
  id: ${JSON.stringify(pkg.name)},
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" })
    var React = require("react")
`

const footer = `
    return module.exports
  }
})
`

const indent = (code) => code
  .split('\n')
  .map((line) => (line.length === 0 ? line : '    ' + line))
  .join('\n')

const body = `${indent(cards)}\n\n${indent(rendererCanvas2d)}\n\n${indent(rendererWebgl)}\n\n${indent(engine)}\n\n${indent(source)}`
writeFileSync(join(here, '..', 'client', 'bundle.js'), banner + body + footer)
console.log(`built client/bundle.js (${Buffer.byteLength(banner + body + footer, 'utf8')} bytes)`)
