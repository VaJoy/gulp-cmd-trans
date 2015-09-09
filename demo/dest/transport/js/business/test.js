define("business/test", [ "business/router", "business/constants", "util/cacheData", "jsBridge/common" ], function(require, exports, module) {
    var router = require("business/router"), constants = require("business/constants"), cacheData = require("util/cacheData"), common = require("jsBridge/common");
    router.abc();
});