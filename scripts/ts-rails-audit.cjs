#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.files = exports.scan = exports.audit = exports.getTS = void 0;
// Generated compatibility entry; maintained source is tool/src/legacy.cts.
const node_path_1 = __importDefault(require("node:path"));
const api = require(node_path_1.default.join(__dirname, '../dist/tool/src/index.js'));
exports.getTS = api.getTS, exports.audit = api.audit, exports.scan = api.scan, exports.files = api.files;
if (require.main === module) {
    const { main } = require(node_path_1.default.join(__dirname, '../dist/tool/src/cli.js'));
    process.exitCode = main();
}
