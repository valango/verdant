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

const readOnly = (obj, prop) => assert(0, '%s: property %o is read-only', ME, prop)

class Verdant {
  constructor (dirName, options = undefined) {
    assert(dirName && typeof dirName === 'string', '%s: invalid directory %o', ME, dirName)
    assert(isAbsolute(dirName), '%s: invalid directory %o', ME, dirName)
    const opts = { ...defaultOptions, ...options }
    this.context = opts.context
    this.key4attach = opts.key4attach
    this.key4detach = opts.key4detach
    this._dir = dirName
    this._current = Object.create(null)
    this._sequence = []
    this._map = new Map()
    this._api = new Proxy(this._current, {
      deleteProperty: readOnly,
      //  Never provide the actual object/function reference!
      get: (target, prop /* , receiver */) => {
        const v = target[prop]
        if (v) {
          if (typeof v === 'function') {
            return (...args) => target[prop](...args)
          }
          if (typeof v === 'object') {
            return Array.isArray(v) ? v.slice() : { ...v }
          }
        }
        return v
      },
      set: readOnly
    })
  }

  get api () {
    return this._api
  }

  get loadOrder () {
    return this._sequence.slice()
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
    const api = typeof exports === 'function'
      ? exports(context)
      : exports
    assert(!(api instanceof Promise), '%s: asynchronous default export of %o', path)
    const hook = api[this.key4attach]
    const result = typeof hook === 'function' && hook.call(api, context)

    return result instanceof Promise
      ? result.then(() => this.exposeApi_(api, path)) && _map.set(path, { api, paths }) && this
      : this.exposeApi_(api, path) && _map.set(path, { api, paths }) && this
  }

  exposeApi_ (api, path) {
    const { _current, _map, key4attach, key4detach } = this
    const oldKeys = _map.has(path) && new Set(ownKeys(_map.get(path).api))

    for (const key in api) {
      if (oldKeys) oldKeys.delete(key)
      if (key === key4attach || key === key4detach) continue
      assert(oldKeys || _current[key] === undefined, '%s: conflicting key %o of %o', ME, key, path)
      _current[key] = api[key]
    }
    oldKeys
      ? oldKeys.forEach(key => (_current[key] = undefined))
      : this._sequence.push(path)

    return this
  }

  reloadAllSync () {
    for (const path of this.loadOrder) {
      assert(!(this.load(path) instanceof Promise),
        '%s: %o path has asynchronous %s()', ME, path, this.key4attach)
    }
    return this
  }

  /**
   * A local analogue of Proxy.revoke()
   */
  revoke () {
    if (this._map) {
      const { _current } = this

      for (const key in _current) {
        if (typeof _current[key] === 'function') _current[key] = noop
      }
      this._map = undefined
    }
  }
}

module.exports = Verdant
