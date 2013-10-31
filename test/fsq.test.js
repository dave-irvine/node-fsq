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
});
