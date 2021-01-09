'use strict'

const Verdant = require('./Verdant')

exports = module.exports = (dir, options = undefined) => new Verdant(dir, options)

exports.verdant = exports
