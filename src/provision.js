import { exec } from 'child-process-promise';
import { basename as baseNamePath } from 'path';
import { nameQuestion, descriptionQuestion } from './questions';
import kebabCase from 'lodash.kebabCase';
const provisionerSet = {

  'index.es6': {
    contents: (contents) => (contents ||
`#!/usr/bin/env node
const provisionerSet = {
  // put file provisions here...
}
export default provisionerSet;
if (require.main === module) {
  require('provision')(process.cwd(), provisionerSet);
}`),
  },

  'package.json': {
    questions: [
      nameQuestion,
      descriptionQuestion,
    ],
    async after(fileName) {
      const cwd = baseNamePath(fileName);
      await exec('npm prune', { cwd, env: process.env });
      await exec('npm install', { cwd, env: process.env });
    },
    contents(contents, answers) {
      const packageJson = contents ? JSON.parse(contents) : {};
      const newJson = {
        name: answers.name,
        description: answers.description,
        version: '1.0.0',
        license: 'MIT',
        main: 'index.js',
        bin: {
          [`provision-${kebabCase(answers.name)}`]: 'index.js',
          ...packageJson.bin,
        },
        ...packageJson,

        dependencies: {
          'provision': '^1.0.0',
          ...packageJson.dependencies,
        },
      };
      return JSON.stringify(newJson, null, 2);
    },
  },
};
if (require.main === module) {
  require('./')(process.cwd(), provisionerSet); // eslint-disable-line global-require
}
