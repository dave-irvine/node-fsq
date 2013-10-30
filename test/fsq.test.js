/* jshint node: true */
/* global describe */
/* global it */
/* global beforeEach */
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
	var fakefs = {
		writeFile: function (filename, data, options, callback) {
			callback();
		}
	};

	describe("Property: fs", function () {
		it("should return undefined", function () {
			expect(fsq.fs).to.equal(undefined);
		});

		it("should allow injection of an object to replace internal 'fs' module", function () {
			var writeFileSpy = sinon.spy(fakefs, "writeFile");

			fsq.fs = fakefs;
			fsq.writeFile();

			expect(writeFileSpy).to.have.been.calledOnce;

			fsq.fs = fs;
		});
	});

	describe("Property: handles", function () {
		it("should return current amount of open file handles", function () {
			expect(fsq.handles).to.equal(0);
		});
	});

	describe("writeFile()", function () {
		var promise;

		it("should return a Promise", function () {
			promise = fsq.writeFile();

			expect(promise).to.be.an.instanceOf(Q.makePromise);
		});
	});
});