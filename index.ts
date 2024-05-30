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

const { fetchJiraTickets, fetchAllJiraTickets } = require("./shared/jira");
const { jiraTicketsToGitHubIssues } = require("./shared/translate");
const { createIssues } = require('./shared/github');

async function run(jiraUsername: string, jiraPassword: string, jiraProject: string, jiraLabel: string, githubToken: string, githubRepo: string) {
    const jiraTickets = await fetchAllJiraTickets(jiraUsername, jiraPassword, jiraProject, jiraLabel);
    console.log("Exporting Jira tickets to GitHub issues");
    const ghIssues = jiraTicketsToGitHubIssues(jiraTickets);
    console.log(`Found ${ghIssues.length} issues to be created.`);
    await createIssues(ghIssues, githubRepo, githubToken, jiraUsername, jiraPassword);
}

const githubRepo = process.env['GITHUB_REPO'];
if (!githubRepo) {
    throw new Error('No GitHub repo provided - set the GITHUB_REPO env variable before running');
}
const githubToken = process.env['GITHUB_TOKEN'];
if (!githubToken) {
    throw new Error('No GitHub token provided - set the token in a GITHUB_TOKEN env variable before running');
}
const jiraUsername = process.env['JIRA_USERNAME'];
if (!jiraUsername) {
    throw new Error('No Jira username provided - set the JIRA_USERNAME env variable before running');
}
const jiraPassword = process.env['JIRA_PASSWORD'];
if (!jiraPassword) {
    throw new Error('No Jira password provided - set the JIRA_PASSWORD env variable before running');
}
const jiraProject = process.env['JIRA_PROJECT'];
if (!jiraProject) {
    throw new Error('No Jira project provided - set the JIRA_PROJECT env variable before running');
}
const jiraLabel = process.env['JIRA_LABEL'];
if (!jiraLabel) {
    throw new Error('No Jira label provided - set the JIRA_LABEL env variable before running');
}

run(jiraUsername, jiraPassword, jiraProject, jiraLabel, githubToken, githubRepo);
