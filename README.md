fsq
===

*Node.js FS with Q.js*

####What?

This module takes Node.js FS module, promisify's all its functions using Q.js, and gives them back to you. It also queues all your requests to avoid the EMFILE error.

####Why?

I like Promises.

####Anything else?

Well yes, seeing as you asked. You can quite often run into the EMFILE error whereby you have too many file descriptors open. The "fix" is usually to allow more file descriptors, but that seems to be just delaying the inevitable.

Since we are doing asynchronous IO anyway, it shouldn't really matter if we take a slightly more pragmatic approach and queue up our FS requests when we start hitting the EMFILE limit.

[graceful-fs](https://github.com/isaacs/node-graceful-fs) does this, but I think it only queues ```open()``` and ```readdir()```, and doesn't use Promises. I like Promises.
