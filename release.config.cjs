module.exports = {
    branches: [
        {
            name: 'master',
            channel: 'latest',
            type: 'release',
        },
        {
            name: 'beta',
            channel: 'beta',
            prerelease: true,
        },
    ],
    plugins: [
        '@semantic-release/commit-analyzer',
        '@semantic-release/release-notes-generator',
        [
            '@semantic-release/changelog',
            {
                changelogFile: 'CHANGELOG.md',
            },
        ],
        '@semantic-release/github',
        '@semantic-release/npm',
        [
            '@semantic-release/git',
            {
                assets: ['CHANGELOG.md', 'package.json'],
            },
        ],
        [
            'semantic-release-slack-bot',
            {
                notifyOnSuccess: true,
                notifyOnFail: true,
                markdownReleaseNotes: true,
                slackWebhook:
                    'https://hooks.slack.com/services/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',
            },
        ],
    ],
};
