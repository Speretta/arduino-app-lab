#!/usr/bin/env node

/******************************************************************
 * Script to bump the version of Cloud Editor (standalone)
 * and component
 ******************************************************************/
import { exit } from 'node:process';

import glob from 'glob';
import { replaceInFileSync } from 'replace-in-file';

function run(prevVersion, newVersion) {
  try {
    if (!prevVersion || !newVersion) {
      console.log(
        `Invalid versions: previous[${prevVersion}] new[${newVersion}]`,
      );
      exit(-1);
    }
    // trying to see if the previous version is the same than the current, we just quit the script
    // this is useful if user choose 'no' from lerna version
    if (prevVersion === newVersion) {
      console.log(
        `No upgrade needed: previous[${prevVersion}] new[${newVersion}]`,
      );
      exit(-1);
    }

    console.log(`Custom replacement from ${prevVersion} to ${newVersion}`);

    const files = findEnvFiles();
    replaceVersionInEnvFiles(files, newVersion);
    console.log('Custom version replacement succeded');
  } catch (error) {
    console.error('Error occurred: ', error);
  }
}

function findEnvFiles() {
  return glob.sync('./**/.env.{development,production,test}', {
    ignore: [
      './node_modules/**',
      'build/**',
      '.yarn/**',
      'dist/**',
      '__engines__/**',
    ],
  });
}
function replaceVersionInEnvFiles(envFiles, newVersion) {
  const options = {
    files: envFiles,
    from: /VITE_APP_VERSION='\d+\.\d+.\d+'/g,
    to: `VITE_APP_VERSION='${newVersion}'`,
  };
  replaceInFileSync(options);
}

run(process.argv[2], process.argv[3]);
