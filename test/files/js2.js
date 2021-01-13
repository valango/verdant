'use strict'

module.exports = (context) => {
  context.history || (context.history = [])

  return {
    attach: async () => 0,
    compute: x => {
      context.history.push('js2 ' + x)
      return 3 + x
    },

    slow: x => {
      context.history.push('js2slow ' + x)
      return new Promise((resolve) => {
        console.log('AFTER')
        setTimeout(() => {
          console.log('AFTERWARDS')
          resolve(true) // context.api.compute(x))
        }, 500)
      })
    }
  }
}
