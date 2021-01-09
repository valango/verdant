'use strict'

module.exports = (context) => {
  context.history || (context.history = [])

  return {
    compute: x => {
      context.history.push('js1 ' + x)
      return 2 * x
    },

    slow: x => {
      context.history.push('js1slow ' + x)
      return new Promise((resolve) => {
        setTimeout(() => resolve(context.api.compute(x)), 500)
      })
    }
  }
}
