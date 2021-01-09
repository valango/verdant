'use strict'

const { expect } = require('chai')
const { join } = require('path')
const { copyFileSync } = require('fs')
const verdant = require('..')

const copy = (name, version) => {
  const src = join('test', 'files', name + version + '.' + name)
  const dst = join('test', 'files', name + '.tmp.' + name)

  copyFileSync(src, dst)
}

const context = {}

describe('basic functionality', () => {
  let t

  before(() => copy('json', 2))

  it('should load statics', () => {
    t = verdant(__dirname, { context })

    context.api = t.api
    t.load('./files/json.tmp.json')
    expect(context.api.name).to.eql('json2')
    expect(context.api.other).to.eql(true)
  })

  it('should reload statics', () => {
    copy('json', 1)
    t.load('./files/json.tmp.json')
    expect(context.api.name).to.eql('json1')
    expect(context.api.other).to.eql(undefined)
  })
})
