import chai from 'chai';
import {
  gatherFileContents,
  gatherProvisionerQuestions,
  gatherNewFileContents,
  gatherDiffs,
  askPermissionToWriteEachFile,
  runSteps,
  writeFilesAndSetPermissions,
  combineContentFunctions,
  combineProvisionerSets,
} from '../src';
import fileSystemPromise from 'fs-promise';
import childProcess from 'child-process-promise';
import fileSystem from 'fs';
import chaiSpies from 'chai-spies';
import { diffLines } from 'diff';
import inquirer from 'inquirer';
chai.use(chaiSpies).should();
describe('gatherFileContents', () => {

  it('reads files for every key in given object', async function() {
    fileSystemPromise.readFile = chai.spy((name) => Promise.resolve(name));
    const fileMap = {
      'README.md': {
        type: 'file',
      },
      'index.js': {
        type: 'file',
      },
      'foo.bar': {
        type: 'file',
      },
      'biz.bang': {
        type: 'file',
      },
    };
    (await gatherFileContents('/foo/bar', fileMap))
      .should.deep.equal({
        'README.md': '/foo/bar/README.md',
        'index.js': '/foo/bar/index.js',
        'foo.bar': '/foo/bar/foo.bar',
        'biz.bang': '/foo/bar/biz.bang',
      });
    fileSystemPromise.readFile.should.have.been.called.with('/foo/bar/README.md', 'utf8');
    fileSystemPromise.readFile.should.have.been.called.with('/foo/bar/index.js', 'utf8');
    fileSystemPromise.readFile.should.have.been.called.with('/foo/bar/foo.bar', 'utf8');
    fileSystemPromise.readFile.should.have.been.called.with('/foo/bar/biz.bang', 'utf8');
  });

  it('returns blank strings for unreadable files', async function() {
    fileSystemPromise.readFile = chai.spy((name) => {
      if (name === '/foo/bar/README.md') {
        return Promise.reject(new Error('Failed to read file'));
      }
      return Promise.resolve(name);
    });
    const fileMap = {
      'README.md': {
        type: 'file',
      },
      'index.js': {
        type: 'file',
      },
    };
    (await gatherFileContents('/foo/bar', fileMap))
      .should.deep.equal({
        'README.md': '',
        'index.js': '/foo/bar/index.js',
      });
    fileSystemPromise.readFile.should.have.been.called.with('/foo/bar/README.md', 'utf8');
    fileSystemPromise.readFile.should.have.been.called.with('/foo/bar/index.js', 'utf8');
  });

  it('returns blank strings for `type: folder` entries', async function() {
    fileSystemPromise.readFile = chai.spy((name) => Promise.resolve(name));
    const fileMap = {
      '.git': {
        type: 'folder',
      },
      'index.js': {
        type: 'file',
      },
    };
    (await gatherFileContents('/foo/bar', fileMap))
      .should.deep.equal({
        '.git': '',
        'index.js': '/foo/bar/index.js',
      });
    fileSystemPromise.readFile.should.have.been.called.with('/foo/bar/index.js', 'utf8');
  });

});

describe('gatherProvisionerQuestions', () => {
  let provisioners = null;
  beforeEach(() => {
    provisioners = {
      'README.md': {
        questions: [
          {
            name: 'name',
            message: 'name?',
            when: chai.spy(),
            default: chai.spy(),
          },
          {
            name: 'age',
            message: 'age?',
            when: chai.spy(),
            default: chai.spy(),
          },
        ],
      },
      'index.js': {
        questions: [
          {
            name: 'class',
            message: 'class?',
          },
        ],
      },
    };
  });

  it('returns an array of gathered questions', () => {
    const questions = gatherProvisionerQuestions('/foo/bar', provisioners);
    questions.should.have.lengthOf(3);
    questions.should.have.deep.property('[0].name', 'name');
    questions.should.have.deep.property('[0].message', 'name?');
    questions.should.have.deep.property('[0].when').that.is.a('function');
    questions.should.have.deep.property('[0].default').that.is.a('function');
    questions.should.have.deep.property('[1].name', 'age');
    questions.should.have.deep.property('[1].message', 'age?');
    questions.should.have.deep.property('[1].when').that.is.a('function');
    questions.should.have.deep.property('[1].default').that.is.a('function');
    questions.should.have.deep.property('[2].name', 'class');
    questions.should.have.deep.property('[2].message', 'class?');
  });

  it('wraps when/default functions to always be called with projectPath as last argument', () => {
    const questions = gatherProvisionerQuestions('/foo/bar', provisioners);
    const asyncContext = { async: chai.spy() };
    questions.should.have.deep.property('[0].when').that.is.a('function');
    Reflect.apply(questions[0].when, asyncContext, [ 1, 2, 3 ]);
    provisioners['README.md'].questions[0].when.should.have.been.called.with(1, 2, 3, '/foo/bar');
    Reflect.apply(questions[0].when, asyncContext, [ 'a' ]);
    provisioners['README.md'].questions[0].when.should.have.been.called.with('a', '/foo/bar');

    questions.should.have.deep.property('[0].default').that.is.a('function');
    Reflect.apply(questions[0].default, asyncContext, [ 1, 2, 3 ]);
    provisioners['README.md'].questions[0].default.should.have.been.called.with(1, 2, 3, '/foo/bar');
    Reflect.apply(questions[0].default, asyncContext, [ 'a' ]);
    provisioners['README.md'].questions[0].default.should.have.been.called.with('a', '/foo/bar');

    questions.should.have.deep.property('[1].default').that.is.a('function');
    Reflect.apply(questions[1].default, asyncContext, [ 1, 2, 3 ]);
    provisioners['README.md'].questions[1].default.should.have.been.called.with(1, 2, 3, '/foo/bar');
    Reflect.apply(questions[1].default, asyncContext, [ 'a' ]);
    provisioners['README.md'].questions[1].default.should.have.been.called.with('a', '/foo/bar');

  });

});

describe('gatherNewFileContents', () => {
  let provisioners = null;
  beforeEach(() => {
    provisioners = {
      'README.md': {
        type: 'file',
        currentContents: 'Hello',
        contents: chai.spy((contents) => `${contents} World`),
      },
      'index.js': {
        type: 'file',
        currentContents: 'Goodbye',
        contents: chai.spy((contents) => `${contents} World`),
      },
    };
  });

  it('calls provisioners contents() functions', () => {
    gatherNewFileContents(provisioners);

    provisioners['README.md'].contents.should.have.been.called.exactly(1);
    provisioners['index.js'].contents.should.have.been.called.exactly(1);
  });

  it('returns an object with a mapping of files and their new contents', () => {
    const newFiles = gatherNewFileContents(provisioners);
    newFiles.should.have.property('README.md', 'Hello World');
    newFiles.should.have.property('index.js', 'Goodbye World');
  });

  it('passes `currentContents` to the initial content function', () => {
    provisioners['README.md'].currentContents = 'Yo';
    provisioners['index.js'].currentContents = 'Seeya';
    const newFiles = gatherNewFileContents(provisioners);
    newFiles.should.have.property('README.md', 'Yo World');
    newFiles.should.have.property('index.js', 'Seeya World');
  });

});

describe('gatherDiffs', () => {
  let provisioners = null;
  beforeEach(() => {
    provisioners = {
      'README.md': {
        type: 'file',
        currentContents: '',
        newContents: 'Foo',
      },
      'index.js': {
        type: 'file',
        currentContents: 'import foo from bar',
        newContents: 'import bar from bar',
      },
    };
  });

  it('returns a mapping of files, with diff objects for each', () => {
    const diffs = gatherDiffs(provisioners);
    diffs.should.be.an('object');
    diffs.should.have.property('README.md').that.is.an('array').and.has.length.above(0);
    diffs.should.have.property('index.js').that.is.an('array').and.has.length.above(0);
  });

  it('returns `ansiCode` property of each file', () => {
    const diffs = gatherDiffs(provisioners);
    diffs.should.have.deep.property('README\\.md.ansiCode').that.is.a('string');
    diffs.should.have.deep.property('index\\.js.ansiCode').that.is.a('string');
  });

  it('returns a representation of the diff of the file', () => {
    const diffs = gatherDiffs(provisioners);
    const readmeDiff = diffLines('', 'Foo');
    const indexDiff = diffLines('import foo from bar', 'import bar from bar');
    readmeDiff.ansiCode = diffs['README.md'].ansiCode;
    indexDiff.ansiCode = diffs['index.js'].ansiCode;
    diffs.should.have.property('README.md').deep.equal(readmeDiff);
    diffs.should.have.property('index.js').deep.equal(indexDiff);
  });

});

describe('askPermissionToWriteEachFile', () => {
  let provisioners = null;
  let promptAnswers = null;
  /* eslint-disable no-console */
  const oldConsoleLog = console.log;
  beforeEach(() => {
    provisioners = {
      'README.md': {
        type: 'file',
        currentContents: '',
        newContents: 'Foo',
        diff: diffLines('', 'Foo'),
      },
      'index.js': {
        type: 'file',
        currentContents: 'import foo from bar',
        newContents: 'import bar from bar',
        diff: diffLines('import foo from bar', 'import bar from bar'),
      },
    };
    console.log = chai.spy();
    promptAnswers = {};
    inquirer.prompt = chai.spy((questions, callback) => callback(promptAnswers));
  });

  afterEach(() => {
    console.log = oldConsoleLog;
  });

  it('prompts the user to ask if the file should be written, for each file', async function() {
    await askPermissionToWriteEachFile(provisioners);
    inquirer.prompt.should.have.been.called.exactly(2);
  });

  it('returns an array of every file that was permitted to be written', async function() {
    promptAnswers = { confirmed: true };
    (await askPermissionToWriteEachFile(provisioners))
      .should.deep.equal([ 'README.md', 'index.js' ]);

    promptAnswers = { confirmed: false };
    (await askPermissionToWriteEachFile(provisioners))
      .should.deep.equal([]);
  });

  it('automatically skips files with identical contents', async function() {
    promptAnswers = { confirmed: true };
    provisioners['index.js'].currentContents = provisioners['index.js'].newContents;
    (await askPermissionToWriteEachFile(provisioners))
      .should.deep.equal([ 'README.md' ]);

    promptAnswers = { confirmed: false };
    (await askPermissionToWriteEachFile(provisioners))
      .should.deep.equal([]);
  });
  /* eslint-enable no-console */
});

describe('runSteps', () => {
  let provisioners = null;
  let callOrder = null;
  beforeEach(() => {
    callOrder = [];
    childProcess.exec = chai.spy();
    provisioners = {
      'README.md': {
        before: [
          chai.spy(() => callOrder.push(1)),
          chai.spy(() => callOrder.push(2)),
        ],
        miscstep: 'foo',
        after: [
          chai.spy(() => callOrder.push(1)),
          chai.spy(() => callOrder.push(2)),
        ],
      },
      'index.js': {
        before: [
          chai.spy(() => callOrder.push(3)),
          chai.spy(() => callOrder.push(4)),
        ],
        after: [
          chai.spy(() => callOrder.push(3)),
          chai.spy(() => callOrder.push(4)),
        ],
      },
    };
  });

  it('calls each named step sequentially with path argument', async function() {
    await runSteps('/foo/bar', provisioners, 'before');
    provisioners['README.md'].before[0]
      .should.have.been.called(1).with.exactly('/foo/bar/README.md');
    provisioners['README.md'].before[1]
      .should.have.been.called(1).with.exactly('/foo/bar/README.md');
    provisioners['index.js'].before[0]
      .should.have.been.called(1).with.exactly('/foo/bar/index.js');
    provisioners['index.js'].before[1]
      .should.have.been.called(1).with.exactly('/foo/bar/index.js');
    callOrder.should.deep.equal([ 1, 2, 3, 4 ]);
  });

  it('calls only the given step name', async function() {
    await runSteps('/foo/bar', provisioners, 'after');
    provisioners['README.md'].after[0]
      .should.have.been.called(1).with.exactly('/foo/bar/README.md');
    provisioners['README.md'].after[1]
      .should.have.been.called(1).with.exactly('/foo/bar/README.md');
    provisioners['index.js'].after[0]
      .should.have.been.called(1).with.exactly('/foo/bar/index.js');
    provisioners['index.js'].after[1]
      .should.have.been.called(1).with.exactly('/foo/bar/index.js');
    callOrder.should.deep.equal([ 1, 2, 3, 4 ]);
    provisioners['README.md'].before[0].should.not.have.been.called();
    provisioners['README.md'].before[1].should.not.have.been.called();
    provisioners['index.js'].before[0].should.not.have.been.called();
    provisioners['index.js'].before[1].should.not.have.been.called();
  });

  it('passes string steps to exec', async function() {
    await runSteps('/foo/bar', provisioners, 'miscstep');
    childProcess.exec.should.have.been.called(1).with.exactly('foo', {
      cwd: '/foo/bar/README.md',
      env: process.env,
      stdio: [ 'pipe', 1, 2 ],
    });
  });

  it('can take a mixed array of functions and strings', async function() {
    provisioners = {
      'somefile.js': {
        before: [ 'some command', 'some other command', chai.spy() ],
      },
    };
    const childProcessOptions = {
      cwd: '/bar/baz/somefile.js',
      env: process.env,
      stdio: [ 'pipe', 1, 2 ],
    };
    await runSteps('/bar/baz', provisioners, 'before');
    childProcess.exec
      .should.have.been.called(2)
      .with.exactly('some command', childProcessOptions)
      .with.exactly('some other command', childProcessOptions);
    provisioners['somefile.js'].before[2].should.have.been.called(1).with.exactly('/bar/baz/somefile.js');
  });

});

describe('writeFilesAndSetPermissions', () => {
  let provisioners = null;
  const expectedUmask = 0o777 & ~process.umask(); // eslint-disable-line no-bitwise
  beforeEach(() => {
    provisioners = {
      'doc/README.md': {
        type: 'file',
        newContents: 'foobar',
        permissions: 123,
      },
      'index.js': {
        type: 'file',
        newContents: 'bazbing',
        permissions: 456,
      },
    };
    fileSystemPromise.writeFile = chai.spy(() => Promise.resolve());
    fileSystemPromise.chmod = chai.spy(() => Promise.resolve());
    // This simulated an empty folder structure that also happily makes
    // directories when asked. So it fails on the first call with ENOENT,
    // but succeeds on the second.
    const calledBefore = [ '/' ];
    fileSystem.mkdir = chai.spy((dir, mode, callback) => {
      if (calledBefore.indexOf(dir) === -1) {
        calledBefore.push(dir);
        return callback({ code: 'ENOENT' });
      }
      callback(null);
    });
  });

  it('ensures all directories exist', async function() {
    await writeFilesAndSetPermissions('/foo/bar', provisioners);
    fileSystem.mkdir
      .should.have.been.called.with('/foo', expectedUmask)
      .and.with('/foo/bar', expectedUmask)
      .and.with('/foo/bar/doc', expectedUmask);
  });

  it('calls writeFile with the contents of each file, and the path', async function() {
    await writeFilesAndSetPermissions('/foo/bar', provisioners);
    fileSystemPromise.writeFile
      .should.have.been.called.exactly(2)
      .with.exactly('/foo/bar/doc/README.md', 'foobar', 'utf8')
      .and.with.exactly('/foo/bar/index.js', 'bazbing', 'utf8');
  });

  it('calls chmod with permissions', async function() {
    await writeFilesAndSetPermissions('/foo/bar', provisioners);
    fileSystemPromise.chmod
      .should.have.been.called.exactly(2)
      .with.exactly('/foo/bar/doc/README.md', 123)
      .and.with.exactly('/foo/bar/index.js', 456);
  });

  it('ensures `type="folder"` paths exist', async function() {
    await writeFilesAndSetPermissions('/foo/bar', {
      'baz/bing': {
        type: 'folder',
      },
    });
    fileSystem.mkdir
      .should.have.been.called.with('/foo/bar/baz/bing', expectedUmask)
      .and.with('/foo/bar/baz', expectedUmask)
      .and.with('/foo/bar', expectedUmask)
      .and.with('/foo', expectedUmask);
  });

});

describe('combineContentFunctions', () => {

  it('returns firstFunction is secondFunction is not a Function', () => {
    const firstFunction = chai.spy(() => 'foo');
    combineContentFunctions(firstFunction, null).should.equal(firstFunction);
  });

  it('returns secondFunction is firstFunction is not a Function', () => {
    const secondFunction = chai.spy(() => 'foo');
    combineContentFunctions(null, secondFunction).should.equal(secondFunction);
  });

  it('wraps the first and second given functions', () => {
    const firstFunction = chai.spy(() => 'foo');
    const secondFunction = chai.spy(() => 'bar');
    const combined = combineContentFunctions(firstFunction, secondFunction);
    combined(1, 2, 3);
    firstFunction.should.have.been.called(1).with.exactly(1, 2, 3);
    secondFunction.should.have.been.called(1).with.exactly('foo', 2, 3);
  });

});

describe('combineProvisionerSets', () => {

  it('combines all `before` steps into array', () => {
    combineProvisionerSets({
      'README.md': {
        before: 'a',
      },
    }, {
      'README.md': {
        before: 'b',
      },
    }).should.have.deep.property('README\\.md.before').that.equals([ 'a', 'b' ]);
  });

  it('combines all `before` steps into array', () => {
    combineProvisionerSets({
      'README.md': {
        after: 'a',
      },
    }, {
      'README.md': {
        after: 'b',
      },
    }).should.have.deep.property('README\\.md.after').that.equals([ 'a', 'b' ]);
  });

  it('combines all `content` functions into a single function', () => {
    combineProvisionerSets({
      'README.md': {
        contents: (total) => total += 'b',
      },
    }, {
      'README.md': {
        contents: (total) => total += 'c',
      },
    })['README.md'].contents('a', 1, 2, 3).should.equal('abc');
  });

});
