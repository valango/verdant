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

const context = { baa: 'BAA' }

describe('basic functionality', () => {
  let t

  before(() => copy('json', 2))

  it('should load statics', () => {
    t = verdant({ __dirname, strict: true })

    context.api = t.api
    t.add('./files/json.tmp.json')
    expect(context.api.name).to.eql('json2')
    expect(context.api.other).to.eql(true)
  })

  it('should reload statics', () => {
    copy('json', 1)
    t.reloadSync('./files/json.tmp.json')
    expect(context.api.name).to.eql('json1')
    expect(context.api.other).to.eql(undefined)
  })

  it('should do async', async () => {
    copy('js', 1)
    t.add('./files/js.tmp').attach(context)
    copy('js', 2)
    expect(context.api.compute(1)).to.equal(2)
    const res = context.api.slow(1)
    await t.reload()
    const r = await res
    expect(r).to.equal(4)
    expect(context.history).to.eql(['js1 1', 'js1slow 1', 'js2 1'])
  })

  it('complain about no match',()=>{
    expect(()=>t.reload('nope')).to.throw('nothing matches')
  })

  it('should be redd-only', () => {
    expect(() => (context.api.compute = 0)).to.throw('read-only')
  })

  it('should revoke', () => {
    t.revoke()
    expect(context.api.slow(22)).to.equal(undefined)
  })
})
