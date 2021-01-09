'use strict'

const assert = require('assert-fine')
const { isAbsolute, resolve } = require('path')
const { cache } = require
const { ownKeys } = Reflect
const noop = () => undefined

const ME = 'Verdant'

const defaultOptions = {
  key4attach: 'attach',
  key4detach: 'detach'
}

class Verdant {
  constructor (dirName, options = undefined) {
    assert(dirName && typeof dirName === 'string', '%s: invalid directory %o', ME, dirName)
    assert(isAbsolute(dirName), '%s: invalid directory %o', ME, dirName)
    const opts = { ...defaultOptions, ...options }
    this.api = Object.create(null)
    this.context = opts.context || Object.create(null)
    this.key4attach = opts.key4attach
    this.key4detach = opts.key4detach
    this._dir = dirName
    this._api = Object.create(null)
    this._map = new Map()
  }

  /**
   * (Re)loads the module by path.
   * @param {string} path
   * @returns {string[]} paths loaded - the first one is of the main module.
   */
  load_ (path) {
    const fullPath = path[0] === '.' ? resolve(this._dir, path) : path
    const before = new Set(ownKeys(cache))
    require(fullPath)               //  Fills in the cache[fullPath].exports!
    return ownKeys(cache).filter(k => !before.has(k))
  }

  /**
   * Loads or reloads a module by path, registers and attaches it.
   * @param {string} path
   * @returns {Verdant|Promise<Verdant>}
   */
  load (path) {
    const { _map } = this
    if (!_map) return this                 //  Sorry, I am revoked!

    if (_map.has(path)) {
      const { api, paths } = this._map.get(path)

      ;(api[this.key4detach] || noop)()
      paths.forEach(path => {
        delete cache[path]
      })
    }
    const { context } = this
    const paths = this.load_(path)
    const { exports } = cache[paths[0]]
    const api = typeof exports === 'function' ? exports(context) : exports
    assert(!(api instanceof Promise), '%s: asynchronous default export of %o', path)
    const hook = api[this.key4attach]
    const result = typeof hook === 'function' && hook.call(api, context)

    return result instanceof Promise
      ? result.then(() => this.exposeApi_(api, path)) && _map.set(path, { api, paths }) && this
      : this.exposeApi_(api, path) && _map.set(path, { api, paths }) && this
  }

  exposeApi_ (api, path) {
    const { _api, _map, key4attach, key4detach } = this
    const oldKeys = _map.has(path) && new Set(ownKeys(_map.get(path).api))

    for (const key in api) {
      if (oldKeys) oldKeys.delete(key)
      if (key === key4attach || key === key4detach) continue
      assert(oldKeys || this.api[key] === undefined, '%s: conflicting key %o of %o', ME, key, path)
      if (typeof api[key] === 'function') {
        _api[key] = api[key]

        if (this.api[key] === undefined) {
          this.api[key] = function (...args) {
            return _api[key].apply(this, args)
          }
        }
      } else {
        this.api[key] = api[key]
      }
    }
    oldKeys && oldKeys.forEach(key => (_api[key] = this.api[key] = undefined))
    return this
  }

  /**
   * A local analogue of Proxy.revoke()
   */
  revoke () {
    if (this._api) {
      for (const key in this.api) {
        this.api[key] = noop
      }
      this._api = this._map = undefined
    }
  }
}

module.exports = Verdant
