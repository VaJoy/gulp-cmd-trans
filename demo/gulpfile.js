/**
 * Created by vajoylan on 2015/7/28.
 */
var gulp = require('gulp');
var transport = require('../index.js');


gulp.task('transport', function () {
    return gulp.src('./src/js/**/*.js')
        .pipe(transport({'path':'src/js'}))
        .pipe(gulp.dest('./dest/transport/js'));
});


gulp.task('default',function(){
    gulp.run('transport');
});