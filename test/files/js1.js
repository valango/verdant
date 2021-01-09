'use strict'

module.exports = (context) => {
  context.js1 = { compute: 0 }

  return {
    compute: x => {
      context.js1.compute += 1
      return 2 * x
    }
  }
}
