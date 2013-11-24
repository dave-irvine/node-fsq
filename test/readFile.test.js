/* jshint node: true, expr: true, unused: false */
/* global describe, it, beforeEach, afterEach */
"use strict";

var chai = require("chai"),
	chaiAsPromised = require("chai-as-promised"),
	expect = chai.expect,
	fs = require("fs"),
	should = require("chai").should(),
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
			readFile: function (filename, options, callback) {
				callback();
			}
		};
	});

	describe("readFile()", function () {
		var promise;

		beforeEach(function () {
			fsq.fs = fakefs;
		});

		afterEach(function () {
			fsq.fs = fs;
			fsq.maxHandles = Number.MAX_VALUE;
		});

		it("should return a Promise", function () {
			promise = fsq.readFile();

			expect(promise).to.be.an.instanceOf(Q.makePromise);
		});

		it("should resolve when fs-readFile is successful", function (done) {
			// fakefs makes all commands successful by default.
			promise = fsq.readFile();

			expect(promise).to.eventually.be.fulfilled.and.notify(done);
		});

		it("should reject when fs-readFile returns an error", function (done) {
			var readFileStub;

			readFileStub = sinon.stub(fakefs, "readFile", function (filename, options, callback) {
				callback(new Error());
			});

			promise = fsq.readFile();

			promise.finally(
				function () {
					readFileStub.restore();
				}
			);

			expect(promise).to.eventually.be.rejected.and.notify(done);
		});

		it("should reject when fs-readFile throws an error", function (done) {
			var readFileStub;

			readFileStub = sinon.stub(fakefs, "readFile", function (filename, options, callback) {
				throw new Error();
			});

			promise = fsq.readFile();

			promise.finally(
				function () {
					readFileStub.restore();
				}
			);

			expect(promise).to.eventually.be.rejected.and.notify(done);
		});

		it("should reduce handle count when successful", function (done) {
			expect(fsq.handles).to.equal(0);

			fsq.readFile().finally(
				function () {
					expect(fsq.handles).to.equal(0);
					done();
				}
			);
		});

		it("should reduce handle count when unsuccessful", function (done) {
			var readFileStub;

			readFileStub = sinon.stub(fakefs, "readFile", function (filename, options, callback) {
				throw new Error();
			});

			expect(fsq.handles).to.equal(0);

			fsq.readFile().finally(
				function () {
					expect(fsq.handles).to.equal(0);
					done();
				}
			);
		});

		it("should increase handle count when fs-readFile is called", function (done) {
			var readFileReadyCallback,
				readFileStub;

			readFileStub = sinon.stub(fakefs, "readFile", function (filename, options, callback) {
				readFileReadyCallback = callback;
			});

			fsq.readFile().finally(
				function () {
					done();
				}
			);

			expect(fsq.handles).to.equal(1);

			readFileReadyCallback();
		});

		it("should not call fs-readFile once maxHandles has been reached", function (done) {
			var cancellablePromise,
				readFileReadyCallback,
				readFileStub;

			readFileStub = sinon.stub(fakefs, "readFile", function (filename, options, callback) {
				readFileReadyCallback = callback;
			});

			fsq.maxHandles = 1;

			fsq.readFile();
			cancellablePromise = fsq.readFile();

			cancellablePromise.finally(
				function () {
					expect(readFileStub).to.have.been.calledOnce;

					readFileStub.restore();
					done();
				}
			);

			expect(readFileStub).to.have.been.calledOnce;

			readFileReadyCallback();
			cancellablePromise.cancel = true;
		});

		it("should adjust maxHandles once EMFILE is thrown by fs-readFile", function (done) {
			var readFileReadyCallback,
				readFileStub;

			readFileStub = sinon.stub(fakefs, "readFile", function (filename, options, callback) {
				if (readFileStub.callCount === 1) {
					// Store the first readFile call for later so that fsq.handles increases.
					readFileReadyCallback = callback;
				} else if (readFileStub.callCount === 2) {
					// Throw an EMFILE error on the second readFile call.
					var error = new Error();
					error.code = "EMFILE";
					callback(error);
				} else {
					// The first readFile call has resolved, so the 3rd call is the 2nd readFile retrying.
					callback();
				}
			});

			fsq.maxHandles = 2;

			fsq.readFile();
			fsq.readFile().finally(
				function () {
					done();
				}
			);

			expect(fsq.maxHandles).to.equal(1);
			readFileReadyCallback();
		});

		it("should resolve with the 'data' parameter returned from fs-readFile", function (done) {
			var expectedDataParameter = ["test"],
				readFileStub;

			readFileStub = sinon.stub(fakefs, "readFile", function (filename, options, callback) {
				callback(null, expectedDataParameter[0]);
			});

			promise = fsq.readFile();

			promise.then(
				function (data) {
					readFileStub.restore();
					expect(data).to.deep.equal(expectedDataParameter);
				}
			).should.notify(done);
		});
	});
});
