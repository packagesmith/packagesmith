# PackageSmith

PackageSmith is a library to help you make tools which can intelligently generate & maintain (or provision, or scaffold) projects quickly and easily.

If you typically create & use "boilerplate" repositories and modify them, or if you have a project where you copy folders/files into new destinations, just so you can re-use the boilerplate code from them; then this tool may be able to help you - rather than making a boilerplate, you can make an intelligent provisioning tool which can generate & maintain a package.

### Install

This is a utility library, to use on top of your own tools. To get it working, simply run:

```sh
$ npm install --save packagesmith@latest
```

However, PackageSmith comes with a handy provisioning tool, to provision your own PackageSmith tools! Simply run:

```sh
# Locally
$ npm install --save packagesmith@latest
$ ./node_modules/.bin/provision-packagesmith .

# Globally
$ npm install --global packagesmith@latest
$ provision-packagesmith my-new-provisioning-tool
```

### Usage

PackageSmith's main export is a function: `runProvisionerSet`. This takes an Object - which declares a set of files to create, and instructions on how to create them.

#### runProvisionerSet

`runProvisionerSet` which will take an Object describing a set of provisioner files, and run them. It determines the old contents of the file to give to the provisioner which calculates the new contents, works out a diff - and if there is a difference it will ask the user if they like and want to write the differences.

Here's a slightly more extended sequence of events on how runProvisionerSet works:

 1. Ensures the given project directory exists
 2. For every file in the provisioner set:
   1. Gather the list of questions that need answering before this file can be provisioned
   2. De-duplicate this list
 3. Ask all of the gathered questions, formulating an `answers` object.
 4. For every file in the provisioner set:
   1. Determine if an existing file exists, and read its contents
   2. Run the file provisioner, determining the _new_ contents of the file.
   3. Work out a diff between the old and new contents
   4. If the file has changed, present the diff to the user and ask the user wants to write the file
   5. If the user says yes:
    1. If the file provisioner had a beforeStep, run it
    2. If the user wants to write the file, then do so
    3. If the file provisioner had an afterStep, run it
 5. Finish


Here is a simple example demonstrating basic functionality;

```js
import { runProvisionerSet } from 'packagesmith';

runProvisionerSet('/path/to/the/dir/i/want/to/provision', {

  'file': {
    contents(oldContents) {
      return oldContents || 'This is a file!';
    }
  }

});
```
