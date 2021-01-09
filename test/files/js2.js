'use strict'

module.exports = (context) => {
  context.js2 = { compute: 0 }

  return {
    compute: x => {
      context.js2.compute += 1
      return 3 + x
    }
  }
}
