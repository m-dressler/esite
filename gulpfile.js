// @ts-check
import gulp from 'gulp';
import fs from "fs";
import ts from "gulp-typescript";
import minify from "gulp-minify";

const buildFolder = './lib';

const tsProject = ts.createProject("tsconfig.json");

/**
 * @param {string} path 
 */
const clearDirectory = async (path) => {
  await fs.promises.access(path, fs.constants.F_OK).catch(() => fs.mkdirSync(path));
  const files = fs.readdirSync(path);

  /** @type {Promise<void>[]} */
  const removals = [];
  for (const file of files)
    removals.push(fs.promises.rm(`${path}/${file}`, { recursive: true, force: true }));
  await Promise.all(removals);
}

const taskNames = [];

/**
 * @param {string} name 
 * @param {import('gulp').TaskFunction} task 
 */
const addTask = (name, task) => {
  taskNames.push(name);
  gulp.task(name, task);
}

addTask('delete-build', (done) => clearDirectory(buildFolder).then(() => done()));

addTask('ts-build', () =>
  tsProject.src().pipe(tsProject()).js.pipe(gulp.dest(buildFolder)));

addTask('minify', () => gulp.src(buildFolder + '/**/*.js').pipe(minify({
  ext: { min: '.js' }, noSource: true
})).pipe(gulp.dest(buildFolder)));

export default gulp.series(...taskNames);
