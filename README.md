The _**verdant**_ package makes your Node.js app evergreen by
becoming _**Continuous Deployment** capable_.

It uses a very simple API and has only few limitations for your code.
The main goal of writing _this package_ was to avoid the demanding micro-services stuff
in early stages of application life cycle, while still having _Continuous Deployment_ on
from _the day one_.

Unlike some other similar packages, _`verdant`_ does not modify any of Node.js
original behavior.

* [Usage](#usage)
* [API](#api)
* [Concept](#concept)
* [Restrictions](#restrictions)
* [Compatibility](#compatibility)

## Usage
Of course, it should be installed:

```
yarn add verdant   # npm i -S verdant
```
...before it can be used in your code:

```javascript
const express = require('express')
const app = express()
// Commented out:   const shopAPI = require('./shop')
const verdant = require('verdant')(['./shop']) 
const shopAPI = verdant.attach(app.locals)
process.on('SIGPIPE', () => verdant.reload())     //  Admin pressing the "red button".
// The rest of the application code remains unchanged.

app.use('/shop/hello', shopAPI.hello)
...
```

In the above example, a new namespace for an e-shop API is created and every time
the app receives the `SIGPIPE`, it re-loads its (hopefully fixed) source code again - w/o breaking anything 😎! 

The bad news is, that instead of having just line #3, you ended up adding _two extra lines_ 😖.

**NOTE:** the _`verdant`_ package _does not_ depend on _express.js_ or on any particular
protocol, except the 
[Node.js `module API`](https://nodejs.org/dist/latest-v14.x/docs/api/modules.html#modules_the_module_scope).

## API
### Package exports
   1. _**`Verdant`**_: the object class / constructor - useful for derived classes;
   1. **_`verdant`_**: the factory function, also the default export.
   
### Verdant class

**`Verdant`**`( [ options : object | string[] ] )` constructor.<br />
The valid _`options`_ object keys are:
   - **_`attacher`_** `: string `- [attach](#attaching) hook name, def: `'attach'`;
   - **_`detacher`_** `: string `- [detach](#detaching) hook name, def: `'detach'`;
   - **_`dirPath`_** `: string `- def: _`__dirpath`_ of the parent module;
   - **_`paths`_** `: string[] `- paths for initial [loadables](#concept);
   - **_`strict`_** `: boolean `- enables strict error checking (`true` in production mode).

If the argument is an array of strings, then it is assumed to present the _`paths`_ option.

**`add`**`(path: string) : Verdant` instance method.<br />
Loads the module or package by the path. It resolves the path the same way as _`require()`_
does, except that it uses the _`dirPath`_ option value instead of Node.js `__dirpath`.
An alternative way is to use the _`paths`_ option.

**`api`**` : Proxy<Object>` r/o instance property.<br />
Exposes the (aggregated) API from modules loaded by this instance. This value
remains the same.

**`attach`**`([context : object]) : Proxy | Promise<Proxy>` instance method.<br />
[Attaches](#attaching) (initializes) all loaded loadables, not initialized yet and
returns the API proxy. Returns a promise, if at least one detach hook was asynchronous,
of if the _`asyncAttach`_ option is on.<br />
The returned / resolved value is always the api instance property value and does not change.

> Repeated calls with the same context and w/o anything new being loaded in between,
have no effect. ❓

**`reload`**`([filter : string|RegExp]) : Promise<Verdant>`
instance method.<br />
Reloads all matching loadables, detaching their old instances and repeating the recently
applied attach sequence to each of them.
The optional filter argument applies to loadables paths and may be:
   - a string: must be an exact match or if it contains meta symbols,
   then it will be turned to a RegExp instance;
   - a RegExp: only the loadables with matching paths will be processed.
   
If there were no matches, an error will be thrown, if _`strict`_ option is on.
Repeated calls while reloading in progress, will have no effect.

**`reloadSync`**`([filter : string|RegExp]) : Verdant` instance method.<br />
The same as above, but will throw an exception, if any of attach hooks returns a promise
or if the _`asyncAttach`_ option is on.

**`revoke`**`()` instance method.<br />
This is analogous to Javascript _`Proxy.prototype.revoke()`_, except that it calls
_detach hooks_ of all loaded modules, before rendering the _Verdant_ instance
and its exposed API inactive. Call this method before exiting the application.
Calling this method will interrupt any reloading or attaching in progress.

### Factory function
**`verdant`**`( dirPath : string [, options : object] ) : Verdant`<br />
is just a wrapper around the constructor call. This is also the default export
of the _package_.

## Concept
Here: [life cycle of a loadable module](#life-cycle-of-a-loadable) and 
[what `verdant` does](#what-verdant-does).

An application may contain a set of modules (_**loadables**_), each providing its
own _**sub-API**_.
Often, a _sub-API_ needs a special initialization with a proper context
(e.g. services or shared namespaces), in order to become functional.

A _`Verdant` instance_ represents an aggregated API from its _loadables_,
sharing the same _initialization **context**_. For example, common utility functions
may need no context at all, or may depend on some command-line options;
whereas business logic might need ready-to-use services running, and lower-level
API-s ready to be used.

A _`Verdant` instance_ can fetch a _loadable_ at any time, but it would be unwise
to do this from HTTP request handler, for example. Because of this, initial loading
of _loadables_, their initialization and possible further re-loading are separate operations.

### Life cycle of a loadable
#### Attaching
If loadable exports a function, it is called with the _context_ as
its argument and its return value is used as a _sub-API_. Otherwise, the exported
object is a _sub-API_. Next, if the _sub-API_ contains a specific **_attach hook_**
function, it is called with the _context_. The optional _attach hook_
can be synchronous or asynchronous function with meaningless return value.

#### Operation
Leaving few [restrictions](#restrictions) aside, a loadable can do anything it needs to. 

#### Detaching
On reloading a loadable, the old instance may need to be detached first.
This being a case, its _sub-API_ must have a specific **_detach hook_** function.
This optional function is called w/o arguments, and it must be synchronous.
Typically, this function removes event listeners or object references from
the outside world, so the instance can be _garbage-collected_. Do not
trash any resources needed for servicing a possibly pending asynchronous request, however!

After all the requests targeting this instance, are gone
from [Node.js event queue](https://nodejs.dev/learn/the-nodejs-event-loop), 
the _garbage collector_ should kick in automatically.

### What verdant does
After loading a source code module, _`Verdant`_ instance exposes the module API
via its _`api`_ instance property, which is actually a proxy. This way, the rest of
application code will not see actual data references - so when the module
needs to be reloaded, its old instance can be garbage collected.

The loadable code may run asynchronous operations, though - but this will not
spoil the party here. The old instance will be kept in memory, until all its
asynchronous ops are finished. After this, it will be likely garbage collected.
Even if this fails (for some sort of memory leak bug), the old instance will
still be un-accessible from the moment the new one gets loaded.

Beyond the API proxying and `require.cache` manipulations, there is not much
left for a _`Verdant`_ instance to take care of.

## Restrictions
The loadable modules code must be _**stateless**_ - everything, except database connections,
event handlers and similar (being set up by _attach hook_ and released by _detach hook_),
must live in database records, Node.js event loop or HTTP request/response instances.
This is how the most of the server code should be written anyway.

The loadable main module _should not expose a **class** (constructor)_ via its default export.
The default export may be a synchronous wrapper function only.

All parts of loadable modules exported _API will be **read-only**_ and mutating
any part of it would likely result in an exception thrown. For altering any options,
use the wrapper- or _attach hook_ function instead.

Names in loadable API-s should not overlap - if any part of API collides with an item from
some other module, an exception will be thrown.

## Compatibility
The package relies on _javascript `Proxy`_, so it needs Node.js v6.0 or higher.

_The package_ may fail, if Node.js _`require`_ subsystem is modified in any way.
For this particular reason, good 'ol _**mocha**_, not the magnificent _**jest**_, 
was used for testing here.
