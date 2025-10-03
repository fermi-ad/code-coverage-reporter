# Code Coverage Report

A GiHub Action to generate a comment within Pull Requests with the latest code coverage metrics for that branch.

## How to use
This action may be called from within any workflow that produces a `lcov.info` file. Generally, this would be created by the test engine of whatever programming language is being used. The code coverage action exposes the following inputs for customizing the report.

- #### github_token
  This is the permissions token passed from the calling workflow. It is used to call the GitHub API and add the coverage report to the Pull Request. 

  Default: The `github.token` inherited from the calling workflow. Ensure the permissions for the job are set so that this action can leave comments in the pull request.

- #### coverage_file
  This is the path to the `lcov.info` (or whatever name you give it - it must be in the format of a `lcov.info` file) from the project's root directory.
  
  Default: `coverage/lcov.info`

- #### coverage_threshold
  This is the targeted percentage of code coverage. Any coverage percentage less than this (in a single file, across a directory, or across the entire project) will be marked with a ' :no_entry: '. Any coverage within 10% of the threshold will be marked with a ' :warning: '. Finally, any percentage greater than that will be marked with a ' :white_check_mark: '.

  Example:  `coverage_threshold: 80`
  - 0% - 79% is marked with :no_entry:
  - 80% - 88% is marked with :warning:
  - 89% - 100% is marked with :white_check_mark:

  Default: 80

- #### include_pattern
  This is a regex pattern to denote the sorts of files that require test coverage. For example, in a Dart project, this would be all the files that have the `.dart` suffix. 
  
  This value is **required**.

- #### exclude_pattern
  This is a regex pattern to denote any files that should be ignored by the coverage calculation. 
  
  Again, taking Dart as an example, all the test files end with `.dart`, but we don't want those files crushing the test coverage metrics (why would we write tests to cover our tests? Then we'd need tests for those tests, and now we're creating an infinity of tests...). Because all the Dart tests live in the `test/` directory, we can add a pattern here that excludes any filepath with `test/` in it. 
  
  Note that any file appearing in the `lcov.info` report should **never** be matched by this pattern, or else the action will fail. 
  
  This value is **required**.
 
## Build

This is a JavaScript GitHub action, with `index.js` as its entry point. To ensure dependencies are correctly aligned for use within CI/CD pipelines, the "development" code must be packaged into a "production" `index.js`.

All source code is within this outer directory, and the executed code is compiled to `dist/index.js`. If any changes are made, a new `dist/index.js` must be built. 

### Packaging
To package the `dist/index.js`, use `esbuild` or `ncc`. The steps are as follows:
1. #### Install the GitHub libraries
  This action makes use of GitHub's `@actions/core` and `@actions/github` libraries. Bring them into the development environment using 
  ```
  npm install @actions/core @actions/github
  ```
2. #### Install the packaging library (ncc)
  The next step is to install the packaging tool you'll use. Here, we'll use `@vercel/ncc`. Install it with 
  ```
  npm install -g @vercel/ncc
  ```
3. #### Build the distributable
  Generate the executable JS file with
  ```
  ncc build src/index.js --out dist
  ```

## Example output

---

## Code Coverage Report - :no_entry: 3.82% 
<details>

<summary> 

### lib - :no_entry: 3.82% 

</summary> 

<details>

<summary>

### lib/main.dart - :no_entry: 0.00% 

</summary> 

Uncovered lines: :no_entry: This file is missing coverage. 

</details> 

<details>

<summary>

### lib/models - :no_entry: 55.56% 

</summary> 

<details>

<summary>

### lib/models/es_data.dart - :no_entry: 55.56% 

</summary> 

Uncovered lines: :warning: 17-24 

</details> 


</details> 

<details>

<summary>

### lib/views - :no_entry: 0.00% 

</summary> 

<details>

<summary>

### lib/views/es_status.dart - :no_entry: 0.00% 

</summary> 

Uncovered lines: :no_entry: This file is missing coverage. 

</details> 


</details> 


</details> 

---

---
