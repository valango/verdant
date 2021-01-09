A verdant instance is a container of API endpoints, exported from
source modules. Its _`refresh()`_ method reloads the specified module
or all known modules. This happens without interrupting
any running processes or services from the application itself.

```javascript
const verdant = require('verdant')
const express = require('express')
const app = express()

app.locals.shopAPI = verdant.load('shop/logic').api

app.use('/shop', app.locals.shopAPI.hello)

process.on('SIGINT', () => app.logic.load('shop/logic'))
```

In the above example, a new namespace for e-shop API is created and every time
the app receives the SIGINT, it checks the specified file system part, re-loading
all the source modules that have been changed since the most recent loading.

The verdant package does not depend on express nor any particular way of inter-process
communication. In our example, we could as well run the refresh() by timer, but this
won't be the best solution in most cases.

## API
### Package exports
   1. _**`Verdant`**_: the object class / constructor - useful for derived classes;
   1. **_`verdant`_**: the factory function, also the default export.
   
### Verdant class
#### constructor
`Verdant( fileSpec: string[] | string | RegExp [, options: Object] )`

* the fileSpec argument tells which files to load and where to find those.
* the valid options are:
   - context : any - arguments for the module factory function.
   - reload : string   - the name for reload() method - necessary if your API uses 'reload';
   - strategy : function - how the loadable modules should be treated (see default strategy);
   - tearDown : string - name for the tearDown function and instance method; default: 'tearDown'.
   
#### Default strategy
Every loadable module should provide an API via it's named exports, or to export a factory
function as a default.

The factory function may be synchronous or asynchronous. The Verdant instance does not handle
any exceptions from the factory function.

The tearDown function, if present, will be searched for from the exported API. If found, then
this function is called from the tearDown instance method. The tearDown option determines
the actual name of this function.

#### Instance methods
**`reload`**`([module : string]) : number`

If specified, the module is re-loaded unconditionally. Otherwise, the source files of all loaded modules
will be checked for updates - and this may take some time. The method returns the number of
actually loaded source files. Throws an exception, if the specified name does not match any module
already loaded.

_**Note:** this method does not call the tearDown function._

**`tearDown`**`() : number | Promise<number>`
Calls the tearDown method of every module having one. If at least one of called methods returns a
promise, this method returns a promise, too. The numeric value is a count of tearDown handlers called.
Calling this method renders the Verdant instance - any further instance method calls will just return
`undefined`.
