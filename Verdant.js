'use strict'

const assert = require('assert-fine')
const { format } = require('util')
const { resolve } = require('path')
const { cache } = require
const { ownKeys } = Reflect
const noop = () => undefined
const nothing = Symbol('nothing')
const direct = Symbol('direct')     //  This loadable should not be initialized.

const ME = 'Verdant'

/**
 * @typedef {Object} TLoadable
 * @property {Object} [api]     - API after initialization
 * @property {Object} context   - initialization context
 * @property {function()} detach
 * @property {Object} exports   - module exports
 * @property {string} path      - the original add(path) argument
 * @property {Object} paths     - all paths (including the main module)
 */

const defaultOptions = {
  attach: 'attach',               //  Attach hook name used by loadables.
  detach: 'detach',               //  Detach hook name.
  __dirname: require.main.path,   //  Good ol require() stuff.
  paths: [],                      //  Paths to be loaded immediately.
  strict: process.env.NODE_ENV === 'production' //  Do not complain, throw!
}

const readOnly = (obj, prop) => assert(0, '%s: property %o is read-only', ME, prop)

class Verdant {
  constructor (options = undefined) {
    let opts = Array.isArray(options) ? { paths: options } : options
    this._opts = opts = { ...defaultOptions, ...opts }
    if (!opts.dirName) opts.dirName = opts.__dirname
    this._busy = false
    this._current = Object.create(null)
    /** @type {TLoadable[]} */
    this._loaded = []
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
    this._opts.paths.forEach(path => this.add(path))
  }

  /**
   * Loads and registers a loadable.
   * @param {string} path
   */
  add (path) {
    const { attach, detach } = this._opts
    const { api, paths, exports } = this.load_(path)
    let context = nothing

    if (paths.length) {
      //  If the loaded API is pure static, then disable any attach/detach stuff.
      if (api && typeof api === 'object' &&
        typeof api[attach] !== 'function' && typeof api[detach] !== 'function') {
        context = direct
      }
      const rec = { api, context, detach: noop, exports, path, paths }
      this._loaded.push(rec)
      if (context === direct) this.expose_([rec])
    }
    return this
  }

  load_ (path) {
    const length = ownKeys(cache).length
    const toLoad = path[0] === '.' ? resolve(this._opts.dirName, path) : path
    const api = require(toLoad)
    const paths = ownKeys(cache).slice(length)
    return { api, exports: api, paths }
  }

  /**
   * This thing does not change over reloads.
   * @type {Proxy<Object>}
   */
  get api () {
    return this._api
  }

  attach_ (loadables, ctx = nothing) {
    let api, res
    const { async, attach, detach } = this._opts, promises = []

    for (const loadable of loadables) {
      if (ctx !== nothing) loadable.context = ctx
      const { context, exports, path } = loadable

      if (typeof exports === 'function') {
        assert(!((api = exports(context)) instanceof Promise),
          '%s: %o wrapper returned a promise', ME, path)
        api = { ...exports, ...api }
      } else {
        api = { ...exports }
      }

      if (typeof (res = api[attach]) === 'function') {
        if ((res = res(context)) instanceof Promise || async) {
          if (async === false) this.complain('%o.%s returned a promise', path, attach)
          promises.push(res)
        }
        delete api[attach]
      }
      if (typeof (res = api[detach]) === 'function') {
        loadable.detach = res
        delete api[detach]
      }
      loadable.api = api
    }
    if (async) promises.push(0)
    return promises
  }

  /**
   * Initialize all fresh loadables with the given context.
   * @param {Object} [context]
   */
  attach (context = undefined) {
    const loadables = this._loaded.filter(
      rec => rec.context !== context && rec.context !== direct)
    const promises = this.attach_(loadables, context)

    return promises.length
      ? Promise.all(promises).then(() => this.expose_(loadables).api)
      : this.expose_(loadables).api
  }

  /**
   * Say unpleasant things or throw an exception.
   * @param {string} fmt
   * @param args
   * @returns {Verdant}
   */
  complain (fmt, ...args) {
    const message = ME + ':' + format(fmt, ...args)

    if (this._opts.strict) throw new Error(message)

    process.stderr.write(message + '\n')
    return this
  }

  /**
   * @param {string|RegExp} filter
   * @returns {Promise<Verdant>|Verdant}
   * @private
   */
  reload_ (filter) {
    let loadables

    if (filter) {
      if (filter instanceof RegExp) {
        loadables = this._loaded.filter(rec => filter.test(rec.path))
      } else {
        loadables = this._loaded.filter(rec => rec.path === filter)
      }
    } else {
      loadables = this._loaded.slice()
    }
    if (loadables.length === 0 && this._loaded.length !== 0) {
      this.complain('%s.reload(%o): nothing matches', ME, filter)
      return this._opts.async ? Promise.resolve(this) : this
    }
    //  Collect the old API keys and invalidate the require.cache
    const oldKeys = [], detachers = []

    for (const loadable of loadables) {
      ownKeys(loadable.api).forEach(key => oldKeys.push(key))
      loadable.paths.forEach(path => delete cache[path])
    }
    //  Re-load all the affected loadables.
    for (const loadable of loadables) {
      const loaded = this.load_(loadable.path)
      assert(loaded.paths.length, '%s.reload(): nothing loaded for %o', ME, loadable.path)
      Object.assign(loadable, loaded)
    }

    this._busy = true

    const done = this.attach_(loadables)  //  Initialize new API-s

    return done instanceof Promise
      ? done.then(() => this.expose_(loadables, oldKeys, detachers))
      : this.expose_(loadables, oldKeys, detachers)
  }

  /**
   * Reload all the stuff that has been initialized already.
   * NB: this part of async API wil be probably removed!
   * @param {string|RegExp} filter
   * @returns {Verdant|Promise<Verdant>}
   */
  reload (filter = undefined) {
    assert(this._opts.async !== false, '%s.reload() called in synchronous mode', ME)
    if (this._busy) return Promise.resolve(this)
    const result = this.reload_(filter)
    return result instanceof Promise ? result.then(() => this) : Promise.resolve(this)
  }

  /**
   * Reload all the stuff that has been initialized already.
   *
   * @param {string|RegExp} filter
   * @returns {Verdant}
   */
  reloadSync (filter = undefined) {
    if (this._busy) return this
    const result = this.reload_(filter)
    assert(!(result instanceof Promise), '%s.reloadSync() had a promise', ME)
    return result
  }

  /**
   * Aggregates and exposes the sub-API-s.
   * @param {TLoadable[]} loadables
   * @param {string[]} oldKeys
   * @param {function()[]} detachers
   * @returns {Verdant}
   * @private
   */
  expose_ (loadables, oldKeys = undefined, detachers = undefined) {
    const { _current } = this

    detachers && detachers.forEach(fn => fn())
    oldKeys && oldKeys.forEach(key => delete _current[key])
    loadables.forEach(({ api, path }) => {
      for (const key of ownKeys(api)) {
        assert(_current[key] === undefined, '%s.expose: key %o conflict in %o', ME, key, path)
        _current[key] = api[key]
      }
    })
    this._busy = false
    return this
  }

  /**
   * A local analogue of Proxy.prototype.revoke()
   */
  revoke () {
    if (this._loaded) {
      const { _current } = this

      for (const key in _current) {
        if (typeof _current[key] === 'function') _current[key] = noop
      }
      this._loaded = undefined
    }
  }
}

module.exports = Verdant
