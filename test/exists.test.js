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
			exists: function (path, callback) {
				callback();
			}
		};
	});

	describe("exists()", function () {
		var promise;

		beforeEach(function () {
			fsq.fs = fakefs;
		});

		afterEach(function () {
			fsq.fs = fs;
			fsq.maxHandles = Number.MAX_VALUE;
		});

		it("should return a Promise", function () {
			promise = fsq.exists();

			expect(promise).to.be.an.instanceOf(Q.makePromise);
		});

		it("should resolve when fs-exists is successful", function (done) {
			// fakefs makes all commands successful by default.
			promise = fsq.exists();

			expect(promise).to.eventually.be.fulfilled.and.notify(done);
		});

		it("should reject when fs-exists returns an error", function (done) {
			var existsStub;

			existsStub = sinon.stub(fakefs, "exists", function (path, callback) {
				callback(new Error());
			});

			promise = fsq.exists();

			promise.finally(
				function () {
					existsStub.restore();
				}
			);

			expect(promise).to.eventually.be.rejected.and.notify(done);
		});

		it("should reject when fs-exists throws an error", function (done) {
			var existsStub;

			existsStub = sinon.stub(fakefs, "exists", function (path, callback) {
				throw new Error();
			});

			promise = fsq.exists();

			promise.finally(
				function () {
					existsStub.restore();
				}
			);

			expect(promise).to.eventually.be.rejected.and.notify(done);
		});

		it("should reduce handle count when successful", function (done) {
			expect(fsq.handles).to.equal(0);

			fsq.exists().finally(
				function () {
					expect(fsq.handles).to.equal(0);
					done();
				}
			);
		});

		it("should reduce handle count when unsuccessful", function (done) {
			var existsStub;

			existsStub = sinon.stub(fakefs, "exists", function (path, callback) {
				throw new Error();
			});

			expect(fsq.handles).to.equal(0);

			fsq.exists().finally(
				function () {
					expect(fsq.handles).to.equal(0);
					existsStub.restore();
					done();
				}
			);
		});

		it("should increase handle count when fs-exists is called", function (done) {
			var existsReadyCallback,
				existsStub;

			existsStub = sinon.stub(fakefs, "exists", function (path, callback) {
				existsReadyCallback = callback;
			});

			fsq.exists().finally(
				function () {
					existsStub.restore();
					done();
				}
			);

			expect(fsq.handles).to.equal(1);

			existsReadyCallback();
		});

		it("should not call fs-exists once maxHandles has been reached", function (done) {
			var cancellablePromise,
				existsReadyCallback,
				existsStub;

			existsStub = sinon.stub(fakefs, "exists", function (path, callback) {
				existsReadyCallback = callback;
			});

			fsq.maxHandles = 1;

			fsq.exists();
			cancellablePromise = fsq.exists();

			cancellablePromise.finally(
				function () {
					expect(existsStub).to.have.been.calledOnce;

					existsStub.restore();
					done();
				}
			);

			expect(existsStub).to.have.been.calledOnce;

			existsReadyCallback();
			cancellablePromise.cancel = true;
		});

		it("should adjust maxHandles once EMFILE is thrown by fs-exists", function (done) {
			var existsReadyCallback,
				existsStub;

			existsStub = sinon.stub(fakefs, "exists", function (path, callback) {
				if (existsStub.callCount === 1) {
					// Store the first exists call for later so that fsq.handles increases.
					existsReadyCallback = callback;
				} else if (existsStub.callCount === 2) {
					// Throw an EMFILE error on the second exists call.
					var error = new Error();
					error.code = "EMFILE";
					callback(error);
				} else {
					// The first exists call has resolved, so the 3rd call is the 2nd exists retrying.
					callback();
				}
			});

			fsq.maxHandles = 2;

			fsq.exists();
			fsq.exists().finally(
				function () {
					existsStub.restore();
					done();
				}
			);

			expect(fsq.maxHandles).to.equal(1);
			existsReadyCallback();
		});

		it("should resolve with the 'exists' parameter returned from fs-exists", function (done) {
			var expectedExistsParameter = [true],
				existsStub;

			existsStub = sinon.stub(fakefs, "exists", function (path, callback) {
				callback(expectedExistsParameter[0]);
			});

			promise = fsq.exists();

			promise.then(
				function (exists) {
					existsStub.restore();
					expect(exists).to.deep.equal(expectedExistsParameter);
				}
			).should.notify(done);
		});
	});
});
