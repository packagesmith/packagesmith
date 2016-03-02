/* @flow */
import { chmod as chmodFile, ensureDir as ensureDirectory, outputFile, readFile } from 'fs-promise';
import {
  yellow as colorTextYellow,
  green as diffAddition,
  grey as diffNoChange,
  red as diffRemoval,
  red as failText,
  green as successText,
} from 'chalk';
import { dirname, join as joinPath, resolve as resolvePath } from 'path';
import { diffLines } from 'diff';
import { exec } from 'child-process-promise';
import inquirer from 'inquirer';
import partial from 'lodash.partial';
import pick from 'lodash.pick';
import pluck from 'lodash.pluck';
import union from 'lodash.union';
import unique from 'lodash.uniq';
import zipObject from 'lodash.zipobject';
const debug = require('debug')('packagesmith');
const debugFile = require('debug')('packagesmith:fileContents');
function prefixString(prefix, stringToPrefix) {
  if (typeof prefix === 'string' && stringToPrefix && typeof stringToPrefix === 'string') {
    return prefix + stringToPrefix;
  }
  return '';
}

function assignOnKey(targetObject, keyName, newObject) {
  for (const key in targetObject) {
    targetObject[key][keyName] = newObject[key];
  }
}

function prompt(questions) {
  return new Promise((resolve) =>
    inquirer.prompt(questions, (answers) => resolve(answers))
  );
}

function promiseToAsyncStyle(promiseCallback) {
  if (typeof promiseCallback === 'function') {
    return function asyncStyle(...args) {
      const done = this.async(); // eslint-disable-line no-invalid-this
      return Promise.resolve(promiseCallback(...args)).then(done, done);
    };
  }
  return promiseCallback;
}

export function gatherProvisionerQuestions(projectPath, provisioners) {
  debug('Gathering questions to ask user...');
  const questions =
    unique(
      union(
        ...pluck(
          provisioners, 'questions'
        )
      ), 'name'
    ).map((question) => {
      question = question || {};
      return {
        ...question,
        default: question.default ?
          promiseToAsyncStyle(partial(question.default, partial.placeholder, projectPath)) :
          null,
        when: question.when ?
          promiseToAsyncStyle(partial(question.when, partial.placeholder, projectPath)) :
          null,
      };
    });
  debug(`  Found ${ questions.length } questions to ask`);
  debug(questions);
  return questions;
}

export async function gatherFileContents(projectPath, provisioner) {
  const fileNames = Object.keys(provisioner);
  debug(`Gathering existing contents for ${ fileNames.length } files...`);
  const fileReadOperations = fileNames.map((fileName) => {
    const type = provisioner[fileName].type || 'file';
    if (type !== 'file') {
      return '';
    }
    const filePath = joinPath(projectPath, fileName);
    debug(`  Attempting to read contents of ${ filePath }`);
    return readFile(filePath, 'utf8')
      .then((contents) => {
        debug(`  Found contents of ${ filePath }`);
        debugFile(contents);
        return contents;
      })
      .catch((readFileError) => {
        debug(readFileError);
        return '';
      });
  });
  const fileContents = await Promise.all(fileReadOperations);
  return zipObject(fileNames, fileContents);
}

export function gatherNewFileContents(provisioners, answers) {
  debug(`Gathering new file contents for ${ Object.keys(provisioners).length } provisions`);
  const newFileContents = {};
  for (const fileName in provisioners) {
    const fileProvisioner = provisioners[fileName];
    if (fileProvisioner && typeof fileProvisioner.contents === 'function') {
      debug(`  Determining new file contents for ${ fileName }`);
      newFileContents[fileName] = fileProvisioner.contents(fileProvisioner.currentContents || '', answers);
    } else if (typeof fileProvisioner.contents === 'string') {
      newFileContents[fileName] = fileProvisioner.contents;
    }
  }
  return newFileContents;
}

export function gatherDiffs(provisioners) {
  const diffs = {};
  function mapDiffToAnsi(part) {
    if (part.added) {
      return diffAddition(prefixString('\n', part.value
        .split('\n')
        .map(partial(prefixString, '+ '))
        .join('\n')
      ));
    } else if (part.removed) {
      return diffRemoval(prefixString('\n', part.value
        .split('\n')
        .map(partial(prefixString, '- '))
        .join('\n')
      ));
    }
    return diffNoChange(part.value
      .split('\n')
      .map(partial(prefixString, '  '))
      .join('\n')
    );
  }
  debug('Determining diff for ${ Object.keys(provisioners).length } provisions');
  for (const fileName in provisioners) {
    debug(`  Determining diff for ${ fileName }`);
    const currentContents = provisioners[fileName].currentContents;
    const newContents = provisioners[fileName].newContents;
    diffs[fileName] = diffLines(currentContents || '', newContents || '', { newlineIsToken: true });
    diffs[fileName].ansiCode = diffs[fileName].map(mapDiffToAnsi).join('');
  }
  return diffs;
}

export async function askPermissionToWriteEachFile(provisioners) {
  const filesToWrite = [];
  debug('Asking user for permission to write files');
  for (const fileName in provisioners) {
    const currentContents = provisioners[fileName].currentContents;
    const newContents = provisioners[fileName].newContents;
    const diffContents = (provisioners[fileName].diff || {}).ansiCode || '';
    if (currentContents === newContents) {
      debug(`  Skipping ${ fileName }, contents are identical`);
      continue;
    }
    if ((provisioners[fileName].type || 'file') !== 'file') {
      debug(`  Skipping ${ fileName }, as it is not a file (${ provisioners[fileName].type })`);
      continue;
    }
    /* eslint-disable no-console */
    if (currentContents === '') {
      console.log(colorTextYellow(`\nProvisioner wants to add ${ fileName }:`));
    } else {
      console.log(colorTextYellow(`\nProvisioner wants to change ${ fileName }:`));
    }
    console.log(diffContents);
    /* eslint-enable no-console */
    const { confirmed } = await prompt({
      name: 'confirmed',
      type: 'confirm',
      message: currentContents === '' ?
        `Create ${ fileName } with these contents?` :
        `Overwrite ${ fileName } with these changes?`,
    });
    if (confirmed) {
      filesToWrite.push(fileName);
    }
  }
  return filesToWrite;
}

export async function runSteps(projectPath, provisioners, stepName) {
  for (const fileName in provisioners) {
    const resolvedPath = resolvePath(projectPath, fileName);
    const stepSet = provisioners[fileName][stepName];
    for (const step of (Array.isArray(stepSet) ? stepSet : [ stepSet ])) {
      if (typeof step === 'string') {
        debug(`Running ${ stepName } step: ${ step }`);
        await exec(step, {
          cwd: dirname(resolvedPath),
          env: process.env,
          stdio: [ 'pipe', process.stdout, process.stderr ],
        });
      } else if (typeof step === 'function') {
        debug(`Running ${ stepName } step: ${ step.name }`);
        await step(resolvedPath);
      }
    }
  }
}

export async function writeFilesAndSetPermissions(projectPath, provisioners) {
  debug(`Writing ${ Object.keys(provisioners).length } files`);
  for (const fileName in provisioners) {
    const filePath = joinPath(projectPath, fileName);
    debug(`Starting write of ${ fileName }`);
    if ((provisioners[fileName].type || 'file') === 'file') {
      debug(`  ${ filePath } is a file, writing contents`);
      debugFile(provisioners[fileName].newContents);
      await outputFile(filePath, provisioners[fileName].newContents, 'utf8');
    } else if (provisioners[fileName].type === 'folder') {
      debug(`  ${ filePath } is a folder, ensuring it exists`);
      await ensureDirectory(filePath);
    }
    if (provisioners[fileName].permissions) {
      await chmodFile(resolvePath(projectPath, fileName), provisioners[fileName].permissions);
    }
  }
}

export function combineContentFunctions(firstFunction, secondFunction) {
  if (typeof firstFunction === 'function') {
    if (typeof secondFunction === 'function') {
      return (contents, ...rest) => secondFunction(firstFunction(contents, ...rest), ...rest);
    }
    return firstFunction;
  } else if (typeof secondFunction === 'function') {
    return secondFunction;
  }
  return null;
}

export function combineProvisionerSets(...provisioners) {
  return provisioners.reduce((fullSet, provisionerSet) => {
    for (const file in provisionerSet) {
      const fileProvisioner = provisionerSet[file];
      if (fullSet[file]) {
        fullSet[file] = {
          before: unique([ ...(fullSet[file].before || []), ...(fileProvisioner.before || []) ]),
          after: unique([ ...(fullSet[file].after || []), ...(fileProvisioner.after || []) ]),
          contents: combineContentFunctions(fullSet[file].contents, fileProvisioner.contents),
        };
      } else {
        fullSet[file] = fileProvisioner;
      }
    }
    return fullSet;
  }, {});
}

export async function runProvisionerSet(projectPath, provisioners) {
  try {
    projectPath = resolvePath(projectPath);
    debug(`Running provisioner set inside ${ projectPath }`);
    await ensureDirectory(projectPath);
    debug('Gathering data about each provisioner');
    const questions = gatherProvisionerQuestions(projectPath, provisioners);
    const answers = questions.length ? await prompt(questions) : {};
    assignOnKey(provisioners, 'currentContents', await gatherFileContents(projectPath, provisioners));
    assignOnKey(provisioners, 'newContents', await gatherNewFileContents(provisioners, answers));
    assignOnKey(provisioners, 'diff', await gatherDiffs(provisioners));
    const filesToWrite = await askPermissionToWriteEachFile(provisioners);
    debug('Beggining provisioning operations');
    const provisionersToRun = pick(provisioners, filesToWrite);
    await runSteps(projectPath, provisionersToRun, 'before');
    await writeFilesAndSetPermissions(projectPath, provisionersToRun);
    await runSteps(projectPath, provisioners, 'command');
    await runSteps(projectPath, provisionersToRun, 'after');
    console.log(`\n${ successText('Provisioning complete!') }\n`); // eslint-disable-line no-console
  } catch (provisionerError) {
    console.log(`\n${ failText('Provisioning failed!') }\n`); // eslint-disable-line no-console
    console.log(provisionerError.stack || provisionerError); // eslint-disable-line no-console
    process.exit(1); // eslint-disable-line no-process-exit, no-magic-numbers
  }
}
export default runProvisionerSet;
