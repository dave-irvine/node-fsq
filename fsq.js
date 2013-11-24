/* jshint node: true */
"use strict";

var fs = require("fs"),
	Q = require("q");

(function () {
	var fsq = {},
		nodeCaller,
		queues = {
			handles: 0,
			maxHandles: Number.MAX_VALUE
		};

	Object.defineProperty(fsq, "handles", {
		get: function () {
			return queues.handles;
		}
	});

	Object.defineProperty(fsq, "fs", {
		set: function (fsModule) {
			fs = fsModule;
		}
	});

	Object.defineProperty(fsq, "maxHandles", {
		get: function () {
			return queues.maxHandles;
		},
		set: function (val) {
			if (typeof(val) !== "number" || isNaN(val) || !isFinite(val) || val < 1) {
				throw new Error("Invalid value for maxHandles.");
			} else {
				queues.maxHandles = val;
			}
		}
	});

	nodeCaller = function (func, args) {
		var callback,
			deferred = Q.defer(),
			deferredCall,
			unstack;

		callback = function (/* err, ... */) {
			var err,
				returnedArgs = Array.prototype.slice.call(arguments);

			err = returnedArgs[0];
			returnedArgs.shift();

			queues.handles--;

			if (err) {
				if (err.code === "EMFILE") {
					if (queues.handles < 1) {
						deferred.reject(new Error("FSQ: Encounted max file handles from FS module with only 1 handle."));
					} else {
						queues.maxHandles = queues.handles;
						unstack(deferredCall, deferred);
					}
				} else {
					deferred.reject(err);
				}
			} else {
				deferred.resolve(returnedArgs);
			}
		};

		deferredCall = function() {
			if (queues.handles < queues.maxHandles) {
				try {
					queues.handles++;

					args.push(callback);

					fs[func].apply(undefined, args);
				} catch (err) {
					queues.handles--;
					deferred.reject(err);
				}
			} else {
				unstack(deferredCall, deferred);
			}
		};

		unstack = function () {
			setTimeout(function () {
				if (!deferred.promise.cancel) {
					deferredCall();
				} else {
					deferred.reject("FSQ: Promise was cancelled.");
				}
			});
		};

		deferredCall();

		return deferred.promise;
	};

	fsq.writeFile = function (filename, data, options) {
		var args = [filename, data];
		if (typeof(options) !== "function") {
			args.push(options);
		}

		return nodeCaller("writeFile", args);
	};

	fsq.readFile = function (filename, options) {
		var args = [filename];
		if (typeof(options) !== "function") {
			args.push(options);
		}

		return nodeCaller("readFile", args);
	};
	};

	module.exports = fsq;
}());
