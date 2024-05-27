/*
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const { getJiraTickets } = require("./shared/jira");
const { jiraTicketsToGitHubIssues } = require("./shared/translate");
const { createIssues } = require('./shared/github');

async function run(githubToken: string) {
    const jiraTickets = await getJiraTickets();
    console.log("Exporting Jira tickets to GitHub issues");
    const ghIssues = jiraTicketsToGitHubIssues(jiraTickets);
    console.log(`Found ${ghIssues.length} issues to be created.`);
    await createIssues(ghIssues, githubToken);
}

const githubToken = process.env['GITHUB_TOKEN'];
if (!githubToken) {
    throw new Error('No GitHub Token provided - set the token in a GITHUB_TOKEN env variable before running');
}
const jiraUsername = process.env['JIRA_USERNAME'];
if (!jiraUsername) {
    throw new Error('No Jira Username provided - set the token in a JIRA_USERNAME env variable before running');
}
const jiraPassword = process.env['JIRA_PASSWORD'];
if (!jiraUsername) {
    throw new Error('No Jira Password provided - set the token in a JIRA_PASSWORD env variable before running');
}

run(githubToken);