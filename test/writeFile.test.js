/* jshint node: true, expr: true, unused: false */
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

	describe("writeFile()", function () {
		var promise;

		beforeEach(function () {
			fsq.fs = fakefs;
		});

		afterEach(function () {
			fsq.fs = fs;
			fsq.maxHandles = Number.MAX_VALUE;
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
			var writeFileStub;

			writeFileStub = sinon.stub(fakefs, "writeFile", function (filename, data, options, callback) {
				throw new Error();
			});

			expect(fsq.handles).to.equal(0);

			fsq.writeFile().finally(
				function () {
					expect(fsq.handles).to.equal(0);
					done();
				}
			);
		});

		it("should increase handle count when fs-writeFile is called", function (done) {
			var writeFileReadyCallback,
				writeFileStub;

			writeFileStub = sinon.stub(fakefs, "writeFile", function (filename, data, options, callback) {
				writeFileReadyCallback = callback;
			});

			fsq.writeFile().finally(
				function () {
					done();
				}
			);

			expect(fsq.handles).to.equal(1);

			writeFileReadyCallback();
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
			fsq.writeFile().finally(
				function () {
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

		it("should adjust maxHandles once EMFILE is thrown by fs-writeFile", function (done) {
			var writeFileReadyCallback,
				writeFileStub;

			writeFileStub = sinon.stub(fakefs, "writeFile", function (filename, data, options, callback) {
				if (writeFileStub.callCount === 1) {
					// Store the first writeFile call for later so that fsq.handles increases.
					writeFileReadyCallback = callback;
				} else if (writeFileStub.callCount === 2) {
					// Throw an EMFILE error on the second writeFile call.
					var error = new Error();
					error.code = "EMFILE";
					callback(error);
				} else {
					// The first writeFile call has resolved, so the 3rd call is the 2nd writeFile retrying.
					callback();
				}
			});

			fsq.maxHandles = 2;

			fsq.writeFile();
			fsq.writeFile().finally(
				function () {
					done();
				}
			);

			expect(fsq.maxHandles).to.equal(1);
			writeFileReadyCallback();
		});
	});
});
