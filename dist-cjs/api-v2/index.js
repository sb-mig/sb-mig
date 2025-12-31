"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.discover = exports.sync = exports.spaces = exports.roles = exports.presets = exports.plugins = exports.datasources = exports.components = exports.auth = exports.assets = exports.stories = exports.createClient = exports.testAsyncConnection = exports.testConnection = void 0;
// Test functions for ESM/CJS interop testing
var test_js_1 = require("./test.js");
Object.defineProperty(exports, "testConnection", { enumerable: true, get: function () { return test_js_1.testConnection; } });
Object.defineProperty(exports, "testAsyncConnection", { enumerable: true, get: function () { return test_js_1.testAsyncConnection; } });
// Client
var client_js_1 = require("./client.js");
Object.defineProperty(exports, "createClient", { enumerable: true, get: function () { return client_js_1.createClient; } });
// Stories
exports.stories = __importStar(require("./stories/index.js"));
// Resources (thin wrappers)
exports.assets = __importStar(require("./assets/index.js"));
exports.auth = __importStar(require("./auth/index.js"));
exports.components = __importStar(require("./components/index.js"));
exports.datasources = __importStar(require("./datasources/index.js"));
exports.plugins = __importStar(require("./plugins/index.js"));
exports.presets = __importStar(require("./presets/index.js"));
exports.roles = __importStar(require("./roles/index.js"));
exports.spaces = __importStar(require("./spaces/index.js"));
// Sync (data-only)
exports.sync = __importStar(require("./sync/index.js"));
// Discovery
exports.discover = __importStar(require("./discover/index.js"));
