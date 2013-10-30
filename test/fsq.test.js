/* jshint node: true */
/* global describe, it, beforeEach, afterEach */
"use strict";

var chai = require("chai"),
	chaiAsPromised = require("chai-as-promised"),
	expect = chai.expect,
	fs = require("fs"),
	sinon = require("sinon"),
	sinonChai = require("sinon-chai"),
	Q = require("q");

chai.use(sinonChai);
chai.use(chaiAsPromised);

var fsq = require("../fsq");

describe("fsq", function () {
	var fakefs;

	beforeEach(function () {
		fakefs = {
			writeFile: function (filename, data, options, callback) {
				callback();
			}
		};
	});

	describe("Property: fs", function () {
		it("should return undefined", function () {
			expect(fsq.fs).to.equal(undefined);
		});

		it("should allow injection of an object to replace internal 'fs' module", function (done) {
			var writeFileSpy = sinon.spy(fakefs, "writeFile");

			fsq.fs = fakefs;
			fsq.writeFile().finally(
				function () {
					expect(writeFileSpy).to.have.been.calledOnce;

					fsq.fs = fs;
					done();
				}
			);
		});
	});

	describe("Property: handles", function () {
		beforeEach(function () {
			fsq.fs = fakefs;
		});

		afterEach(function () {
			fsq.fs = fs;
		});

		it("should return current amount of open file handles", function (done) {
			var promise,
				writeFileReady;

			fakefs.writeFile = function (filename, data, options, callback) {
				writeFileReady = callback;
			};

			// There should be no handles open
			expect(fsq.handles).to.equal(0);

			// Try to write a file, this will open a handle
			promise = fsq.writeFile();

			// Until writeFile() is complete in fakefs, we should have a handle open.
			expect(fsq.handles).to.equal(1);

			// Complete writeFile() in fakefs, which will resolve promise
			writeFileReady();

			promise.finally(
				function () {
					// Handles should be back to none
					expect(fsq.handles).to.equal(0);

					done();
				}
			);
		});

		it("should not be able to be changed externally", function () {
			expect(function () {
				fsq.handles = 1;
			}).to.throw(/which has only a getter/);
		});
	});

	describe("Property: maxHandles", function () {
		it("should return the current maximum amount of handles", function () {
			expect(fsq.maxHandles).to.equal(Number.MAX_VALUE);
		});

		it("should be possible to change to a valid Number", function () {
			fsq.maxHandles = 1;
			expect(fsq.maxHandles).to.equal(1);
		});

		it("should throw an Error if trying to change to an invalid Number", function () {
			expect(function () {
				fsq.maxHandles = Infinity;
			}).to.throw();

			expect(function () {
				fsq.maxHandles = NaN;
			}).to.throw();

			expect(function () {
				fsq.maxHandles = Number.MAX_VALUE + 1;
			});
		});

		it("should throw an Error if trying to change to a value less than 1", function () {
			expect(function () {
				fsq.maxHandles = 0;
			}).to.throw();

			expect(function () {
				fsq.maxHandles = -1;
			}).to.throw();

			expect(function () {
				fsq.maxHandles = Number.MIN_VALUE;
			}).to.throw();
		});

		it("should throw an Error if trying to change to something other than a Number", function () {
			expect(function () {
				fsq.maxHandles = [];
			}).to.throw();

			expect(function () {
				fsq.maxHandles = {};
			}).to.throw();

			expect(function () {
				fsq.maxHandles = false;
			}).to.throw();

			expect(function () {
				fsq.maxHandles = "";
			}).to.throw();
		});
	});

	describe("writeFile()", function () {
		var promise;

		beforeEach(function () {
			fsq.fs = fakefs;
		});

		afterEach(function () {
			fsq.fs = fs;
		});

		it("should return a Promise", function () {
			promise = fsq.writeFile();

			expect(promise).to.be.an.instanceOf(Q.makePromise);
		});

		it("should resolve when fs-writeFile is successful", function (done) {
			// fakefs makes all commands successful by default.
			promise = fsq.writeFile();

			expect(promise).to.eventually.be.fulfilled.and.notify(done);
		});

		it("should reject when fs-writeFile returns an error", function (done) {
			var writeFileStub;

			writeFileStub = sinon.stub(fakefs, "writeFile", function (filename, data, options, callback) {
				callback(new Error());
			});

			promise = fsq.writeFile();

			promise.finally(
				function () {
					writeFileStub.restore();
				}
			);

			expect(promise).to.eventually.be.rejected.and.notify(done);
		});

		it("should reject when fs-writeFile throws an error", function (done) {
			var writeFileStub;

			writeFileStub = sinon.stub(fakefs, "writeFile", function (filename, data, options, callback) {
				throw new Error();
			});

			promise = fsq.writeFile();

			promise.finally(
				function () {
					writeFileStub.restore();
				}
			);

			expect(promise).to.eventually.be.rejected.and.notify(done);
		});

		it("should reduce handle count when successful", function (done) {
			expect(fsq.handles).to.equal(0);

			fsq.writeFile().finally(
				function () {
					expect(fsq.handles).to.equal(0);
					done();
				}
			);
		});

		it("should reduce handle count when unsuccessful", function (done) {
			fakefs.writeFile = function (filename, data, options, callback) {
				throw new Error();
			};

			expect(fsq.handles).to.equal(0);

			fsq.writeFile().finally(
				function () {
					expect(fsq.handles).to.equal(0);
					done();
				}
			);
		});

		it("should not call fs-writeFile once maxHandles has been reached", function (done) {
			var cancellablePromise,
				writeFileReadyCallback,
				writeFileStub;

			writeFileStub = sinon.stub(fakefs, "writeFile", function (filename, data, options, callback) {
				writeFileReadyCallback = callback;
			});

			fsq.maxHandles = 1;

			fsq.writeFile();
			cancellablePromise = fsq.writeFile();

			cancellablePromise.finally(
				function () {
					expect(writeFileStub).to.have.been.calledOnce;

					writeFileStub.restore();
					done();
				}
			);

			expect(writeFileStub).to.have.been.calledOnce;

			writeFileReadyCallback();
			cancellablePromise.cancel = true;
		});

		it("should call fs-writeFile after queueing if maxHandles is raised", function (done) {
			var allFSWriteFilesCalled,
				writeFileReadyCallbacks = [],
				writeFileStub;

			writeFileStub = sinon.stub(fakefs, "writeFile", function (filename, data, options, callback) {
				writeFileReadyCallbacks.push(callback);
				if (writeFileStub.callCount === 2) {
					expect(fsq.maxHandles).to.equal(2);
					allFSWriteFilesCalled();
				}
			});

			allFSWriteFilesCalled = function () {
				writeFileReadyCallbacks.forEach(function (callback) {
					callback();
				});
			};

			fsq.maxHandles = 1;

			fsq.writeFile();

			// The first writeFile() is queued, so we should have a handle open.
			expect(fsq.handles).to.equal(1);

			fsq.writeFile().finally(
				function () {
					// Handles have all been closed.
					expect(fsq.handles).to.equal(0);
					expect(writeFileStub).to.have.been.calledTwice;
					done();
				}
			);

			// Hit maxHandles, so the second fs-writeFile should not have been called.
			expect(writeFileStub).to.have.been.calledOnce;

			// Bump maxHandles
			fsq.maxHandles = 2;
			/*
				Ideally we would now check how many times fs-writeFile has been called,
				however because the dequeue is async, we can't tell when it will
				call.

				Put the expectation into the stub, but this seems nasty.
			*/
		});
	});
});
