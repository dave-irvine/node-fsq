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
			readdir: function (path, callback) {
				callback();
			}
		};
	});

	describe("readdir()", function () {
		var promise;

		beforeEach(function () {
			fsq.fs = fakefs;
		});

		afterEach(function () {
			fsq.fs = fs;
			fsq.maxHandles = Number.MAX_VALUE;
		});

		it("should return a Promise", function () {
			promise = fsq.readdir();

			expect(promise).to.be.an.instanceOf(Q.makePromise);
		});

		it("should resolve when fs-readdir is successful", function (done) {
			// fakefs makes all commands successful by default.
			promise = fsq.readdir();

			expect(promise).to.eventually.be.fulfilled.and.notify(done);
		});

		it("should reject when fs-readdir returns an error", function (done) {
			var readdirStub;

			readdirStub = sinon.stub(fakefs, "readdir", function (path, callback) {
				callback(new Error());
			});

			promise = fsq.readdir();

			promise.finally(
				function () {
					readdirStub.restore();
				}
			);

			expect(promise).to.eventually.be.rejected.and.notify(done);
		});

		it("should reject when fs-readdir throws an error", function (done) {
			var readdirStub;

			readdirStub = sinon.stub(fakefs, "readdir", function (path, callback) {
				throw new Error();
			});

			promise = fsq.readdir();

			promise.finally(
				function () {
					readdirStub.restore();
				}
			);

			expect(promise).to.eventually.be.rejected.and.notify(done);
		});

		it("should reduce handle count when successful", function (done) {
			expect(fsq.handles).to.equal(0);

			fsq.readdir().finally(
				function () {
					expect(fsq.handles).to.equal(0);
					done();
				}
			);
		});

		it("should reduce handle count when unsuccessful", function (done) {
			var readdirStub;

			readdirStub = sinon.stub(fakefs, "readdir", function (path, callback) {
				throw new Error();
			});

			expect(fsq.handles).to.equal(0);

			fsq.readdir().finally(
				function () {
					expect(fsq.handles).to.equal(0);
					readdirStub.restore();
					done();
				}
			);
		});

		it("should increase handle count when fs-readdir is called", function (done) {
			var readdirReadyCallback,
				readdirStub;

			readdirStub = sinon.stub(fakefs, "readdir", function (path, callback) {
				readdirReadyCallback = callback;
			});

			fsq.readdir().finally(
				function () {
					readdirStub.restore();
					done();
				}
			);

			expect(fsq.handles).to.equal(1);

			readdirReadyCallback();
		});

		it("should not call fs-readdir once maxHandles has been reached", function (done) {
			var cancellablePromise,
				readdirReadyCallback,
				readdirStub;

			readdirStub = sinon.stub(fakefs, "readdir", function (path, callback) {
				readdirReadyCallback = callback;
			});

			fsq.maxHandles = 1;

			fsq.readdir();
			cancellablePromise = fsq.readdir();

			cancellablePromise.finally(
				function () {
					expect(readdirStub).to.have.been.calledOnce;

					readdirStub.restore();
					done();
				}
			);

			expect(readdirStub).to.have.been.calledOnce;

			readdirReadyCallback();
			cancellablePromise.cancel = true;
		});

		it("should adjust maxHandles once EMFILE is thrown by fs-readdir", function (done) {
			var readdirReadyCallback,
				readdirStub;

			readdirStub = sinon.stub(fakefs, "readdir", function (path, callback) {
				if (readdirStub.callCount === 1) {
					// Store the first readdir call for later so that fsq.handles increases.
					readdirReadyCallback = callback;
				} else if (readdirStub.callCount === 2) {
					// Throw an EMFILE error on the second readdir call.
					var error = new Error();
					error.code = "EMFILE";
					callback(error);
				} else {
					// The first readdir call has resolved, so the 3rd call is the 2nd readdir retrying.
					callback();
				}
			});

			fsq.maxHandles = 2;

			fsq.readdir();
			fsq.readdir().finally(
				function () {
					readdirStub.restore();
					done();
				}
			);

			expect(fsq.maxHandles).to.equal(1);
			readdirReadyCallback();
		});

		it("should resolve with the 'files' parameter returned from fs-readdir", function (done) {
			var expectedReaddirParameter = { "files": ["a", "b", "c"] },
				readdirStub;

			readdirStub = sinon.stub(fakefs, "readdir", function (path, callback) {
				callback(null, expectedReaddirParameter.files);
			});

			promise = fsq.readdir();

			promise.then(
				function (files) {
					readdirStub.restore();
					expect(files).to.deep.equal(expectedReaddirParameter);
				}
			).should.notify(done);
		});
	});
});
