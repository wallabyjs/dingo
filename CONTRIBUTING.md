# How to Contribute

If you'd like to contribute to this project, you may contact us by raising an issue in this repo.

Hopefully this document makes the process for contributing clear and answers some questions that you may have.

## [Code of Conduct](https://www.contributor-covenant.org/version/1/4/code-of-conduct/)

We follow the [Contributor Covenant code of conduct](https://www.contributor-covenant.org/version/1/4/code-of-conduct/). Please read this to understand what actions will and will not be tolerated.

## Open Development

All work on Dingo happens directly on [GitHub](/). Please send a pull requests which go through our review process prior to being accepted.

### Workflow and Pull Requests

The core team will be monitoring for pull requests. We'll do our best to provide updates and feedback throughout the process.

_Before_ submitting a pull request, please make sure the following is done…

1.  Fork the repo and create your branch from `master`. A guide on how to fork a repository: https://help.github.com/articles/fork-a-repo/

    Open terminal (e.g. Terminal, iTerm, Git Bash or Git Shell) and type:

    ```sh-session
    $ git clone https://github.com/<your_username>/dingo
    $ cd dingo
    $ git checkout -b my_branch
    ```

    Note: Replace `<your_username>` with your GitHub username

1.  Make sure you have a compatible version of `node` installed (As of May 5th 2020, `v12.x` is recommended).

    ```sh
    node -v
    ```

1.  Run `npm install`.

    ```sh
    npm install
    ```

#### Changelog entries

All changes that add a feature to or fix a bug require a changelog entry containing a description of the change, 
and the number of and link to the pull request. Try to match the structure of the existing entries.

You can add or edit the changelog entry in the GitHub web interface once you have opened the pull request and know the number and link to it.

Make sure to alphabetically order your entry based on package name. If you have changed multiple packages, separate them with a comma.

## Bugs

### Where to Find Known Issues

We use GitHub Issues for our public bugs. We will keep a close eye on this and try to make it clear when we have an internal fix in progress. Before filing a new issue, try to make sure your problem doesn't already exist.

### Reporting New Issues

The best way to get your bug fixed is to provide a reproducable sample. Please provide a public repository with an example and provide steps to replicate your issue.

## How to Get in Touch

- Discord - [Wallaby.js](https://wallabyjs.com/chat/) or via email: [hello@wallabyjs.com](mailto:hello@wallabyjs.com)

## License

By contributing to Dingo, you agree that your contributions will be licensed under its MIT license.