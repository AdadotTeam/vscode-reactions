# Contributing

👍🎉 First off, thanks for taking the time to contribute! 🎉👍

We love your input! We want to make contributing to this project as easy and transparent as possible.

When contributing to this project, please first see if there is an existing issue on the matter.
If not discuss the changes you wish to make via an issue before making changes.

## How to contribute
Follow the below steps to contribute:
1. Discuss contribution in an issue
2. Get the code
3. Run the code
4. Write the code
5. If you've changed the extension's functionality, update the documentation.
6. Update the changelog (remember to give yourself some well-deserved credit here 😉)
7. Add your contribution to the README file
8Create the Pull Request with your changes!

### Getting the code

```
git clone https://github.com/AdadotTeam/vscode-reactions.git
```

Prerequisites

- [Git](https://git-scm.com/), `>= 2.7.2`
- [NodeJS](https://nodejs.org/), `>= 16.14.2`

### Dependencies

From a terminal, where you have cloned the repository, execute the following command to install the required dependencies:

```
npm i
```

### Build

From a terminal, where you have cloned the repository, execute the following command to re-build the project from scratch:

```
yarn run rebuild
```

👉 **NOTE!** This will run a complete rebuild of the project.

Or to just run a quick build, use:

```
yarn run build
```

### Debugging
Start the extension in debug mode by pressing `F5`

### Update the CHANGELOG

The [Change Log](CHANGELOG.md) is updated manually and an entry should be added for each change. Changes are grouped in lists by `added`, `changed`, `removed`, or `fixed`.

Entries should be written in future tense:

- Be sure to give yourself much deserved credit by adding your name and user in the entry

> Added
>
> - Adds awesome feature &mdash; closes [#\<issue\>](https://github.com/gitkraken/vscode-gitlens/issues/<issue>) thanks to [PR #\<pr\>](https://github.com/gitkraken/vscode-gitlens/issues/<pr>) by Your Name ([@\<your-github-username\>](https://github.com/<your-github-username>))
>
> Changed
>
> - Changes or improves an existing feature &mdash; closes [#\<issue\>](https://github.com/gitkraken/vscode-gitlens/issues/<issue>) thanks to [PR #\<pr\>](https://github.com/gitkraken/vscode-gitlens/issues/<pr>) by Your Name ([@\<your-github-username\>](https://github.com/<your-github-username>))
>
> Fixed
>
> - Fixes [#\<issue\>](https://github.com/gitkraken/vscode-gitlens/issues/<issue>) a bug or regression &mdash; thanks to [PR #\<pr\>](https://github.com/gitkraken/vscode-gitlens/issues/<pr>) by Your Name ([@\<your-github-username\>](https://github.com/<your-github-username>))

### Update the README

If this is your first contribution to GitLens, please give yourself credit by adding yourself to the `Contributors` section of the [README](README.md#contributors-) in the following format:

> - `Your Name ([@<your-github-username>](https://github.com/<your-github-username>)) &mdash; [contributions](https://github.com/gitkraken/vscode-gitlens/commits?author=<your-github-username>)`
