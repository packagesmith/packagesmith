# Provisioner Object formulating

The `runProvisionerSet` function takes an object who's keys are the names of files that need provisioning, and who's values are an object describing how the file should be provisioned.

The objects inside have a few special properties:

### type

The `type` property is a simple string. Currently the only supported types are `'file'` (the default) and `'folder'`.

If the type is `'file'` then the `contents()` function is executed (see below). If the type is `folder` then the folder is created.

##### Example

```js
runProvisionerSet({
  'README.md': {
    type: 'file',
    contents: () => ('Here is a README'),
  },
  'lib': {
    type: 'folder',
  },
});
```

### permissions

The `permissions` can be used to set the file permissions of a file or folder. You can pass it a Number (preferably an [ES6 Octal Literal](http://www.2ality.com/2015/04/numbers-math-es6.html)) or a String which represents an Octal. As for what number you'll pass, please refer to [chmod(2)](http://linux.die.net/man/1/chmod). This has very little effect on Windows systems.

It is advised that you set directory permissions to the executable bit set on one of the permissions (at least one odd number in the octal). Directories use the executable bit to allow users to `cd` into them!

```js
runProvisionerSet({
  'big open file': {
    type: 'file',
    permissions: '666'
    contents: () => ('Everyone can read and write this!'),
  },
  'secrets.json': {
    type: 'file',
    permissions: 0o600
    contents: () => ('shhh! Only the author can read & write this!'),
  },
  'executable-binary-file-thing.bin': {
    type: 'file',
    permissions: '755',
  },
  'non-enterable-folder': {
    type: 'folder',
    permissions: 0o644,
  },
});
```

### questions


```js
runProvisionerSet({
  'big open file': {
    type: 'file',
    permissions: 0o666
    contents: () => ('Everyone can read and write this!'),
  },
  'secrets.json': {
    type: 'file',
    permissions: 0o600
    contents: () => ('shhh! Only the author can read & write this!'),
  },
  'executable-binary-file-thing.bin': {
    type: 'file',
    permissions: 0755,
  },
  'non-enterable-folder': {
    type: 'folder',
    permissions: 0666,
  },
});
```

### beforeStep

The `beforeStep` property is a function that is called before the file write operation of a provisioned file. It is not called if file contents are the same as already on disk, or if the user does not want to write this file.

The `beforeStep` property can return a `Promise`, and `runProvisionerSet`'s internals will patiently wait until the Promise resolves before writing the new contents to file.

You might use this step to, say, delete a lockfile which prevents the file from being written.

```js
runProvisionerSet({
  'packagemanager.packagelist': {
    type: 'file',
    beforeStep: () => new Promise((resolve, reject) => {
      fs.unlink('packagemanager.lockfile', (err) => err ? reject(err) : resolve());
    }),
    contents: () => ('...'),
  },
  '.git/config': {
    type: 'file',
    beforeStep: () => {
      execSync('git init');
    },
    contents: ini((ini) => Object.assign({
      'remote "origin"': {
        url: 'foo/bar'
      }
    }))
  },
  'executable-binary-file-thing.bin': {
    type: 'file',
    permissions: 0755,
  },
  'non-enterable-folder': {
    type: 'folder',
    permissions: 0666,
  },
});
```

### afterStep

The `afterStep` property is a function that is called after the file write operation of a provisioned file. It is not called if file contents are the same as already on disk, or if the user does not want to write this file.

The `afterStep` property can return a `Promise`, and `runProvisionerSet`'s internals will patiently wait until the Promise resolves before moving onto the next step.

You might use this step to, say, install some packages once you've written out a `package.json` or `Gemfile`.

### contents

The `contents` property is a function that, given the original contents of the file, should return some new contents to be written to the file.

The emphasis of `contents` is that it should ideally use parseable formats to provision a file's contents, rather than just template over the top. For example if you want to insert a property into a JSON file - take the contents string, parse it as JSON, add the property, and return the stringified version.

PackageSmith comes with a set of common parseable formats - have a read of the [Formatting Functions](./formatting-functions.md) docs to read more about these.

### command

The `command` property is designed to be an alternative to the `contents` property. The most common cases for provisioning a file is that you are generating some contents to write to the file, or running a command to write to the file.

`command` should be a String which represents a shell command to run on the file. For example `git init` creates a `.git` folder, so you might have the following:

```js
runProvisionerSet({
  '.git': {
    type: 'folder',
    command: 'git init'
  },
});
```
