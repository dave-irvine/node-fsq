/* jshint node: true */
"use strict";

var fs = require("fs"),
	Q = require("q");

(function () {
	var fsq = {};
	var queues = {
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

	fsq.writeFile = function (filename, data, options) {
		var deferred = Q.defer();

		(function deferredWrite() {
			var unstack = function () {
				setTimeout(function () {
					deferredWrite();
				});
			};

			if (queues.handles < queues.maxHandles) {
				try {
					queues.handles++;
					fs.writeFile(filename, data, options, function (err) {
						queues.handles--;
						if (err) {
							console.log(err);
							if (err.code === "EMFILE") {
								queues.maxHandles--;
								unstack();
							} else {
								deferred.reject(err);
							}
						} else {
							deferred.resolve();
						}
					});
				} catch(err) {
					queues.handles--;
					console.log(err);
					deferred.reject(err);
				}
			} else {
				unstack();
			}
		}());

		return deferred.promise;
	};

	module.exports = fsq;
}());
