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

const { Octokit } = require("@octokit/rest");
const fs = require('fs');
const fetch = require('node-fetch');

const owner = '1SecondEveryday';

export class GhIssue {
    public Assignable: boolean;
    public Assignee?: string;
    public Description: string;
    public JiraKey: string;
    public Labels: Set<string>;
    public Milestone: string;
    public Title: string;
    constructor() {
        this.Assignable = false;
        this.Assignee = "";
        this.Description = "";
        this.JiraKey = "";
        this.Labels = new Set();
        this.Milestone = "";
        this.Title = "";
    }
}

function getStateDir(repo: string): string {
    return `./repo-state/${owner}/${repo}`;
}

function getStateFile(repo: string): string {
    return `${getStateDir(repo)}/alreadyCreated.txt`;
}

function getMappingFile(repo: string): string {
    return `${getStateDir(repo)}/mapping.txt`;
}

function sleep(seconds: number): Promise<null> {
    const ms = seconds * 1000;
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function addComment(repo: string, issueNumber: number, client: any, body: string, retry: number = 0) {
    try {
        let resp = await client.rest.issues.createComment({
            owner: owner,
            repo: repo,
            issue_number: issueNumber,
            body: body,
        });
        if (resp.status == 403) {
            const backoffSeconds = 60 * (2 ** (retry));
            console.log(`Getting rate limited. Sleeping ${backoffSeconds} seconds`);
            await sleep(backoffSeconds);
            console.log("Trying again");
            await addComment(repo, issueNumber, client, body, retry + 1);
        } else if (resp.status > 210) {
            throw new Error(`Failed to comment on issue with status code: ${resp.status}. Full response: ${resp}`);
        }
    } catch (ex) {
        console.log(`Failed to comment on issue with error: ${ex}`);
        const backoffSeconds = 60 * (2 ** (retry));
        console.log(`Sleeping ${backoffSeconds} seconds before retrying`);
        await sleep(backoffSeconds);
        console.log("Trying again");
        await addComment(repo, issueNumber, client, body, retry + 1);
    }
}

async function addMapping(repo: string, issueNumber: number, jiraReference: string, jiraUsername: string, jiraPassword: string) {
    var bodyData = `{
        "body": "This issue has been migrated to https://github.com/${owner}/${repo}/issues/${issueNumber}"
    }`;
    await fetch(`https://1secondeveryday.atlassian.net/rest/api/2/issue/${jiraReference}/comment`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${Buffer.from(`${jiraUsername}:${jiraPassword}`).toString('base64')}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: bodyData
    })
}

async function createIssue(repo: string, issue: GhIssue, client: any, jiraUsername: string, jiraPassword: string, retry: number = 0): Promise<number> {
    let description = issue.Description;
    let assignees: string[] = [];
    if (issue.Assignee && issue.Assignable) {
        assignees.push(issue.Assignee);
    }
    try {
        let resp = await client.rest.issues.create({
            owner: owner,
            repo: repo,
            assignees: assignees,
            title: issue.Title,
            body: description,
            labels: Array.from(issue.Labels)
        });
        if (resp.status == 403) {
            const backoffSeconds = 60 * (2 ** (retry));
            console.log(`Getting rate limited. Sleeping ${backoffSeconds} seconds`);
            await sleep(backoffSeconds);
            console.log("Trying again");
            return await createIssue(repo, issue, client, jiraUsername, jiraPassword, retry + 1);
        } else if (resp.status < 210) {
            console.log(`Issue #${resp.data.number} maps to ${issue.JiraKey}`);
            if (!issue.Assignable && issue.Assignee) {
                console.log(`* Unable to assign ${repo}#${resp.data.number} to user (at)${issue.Assignee}. Please assign yourself, and tag @samsonjs if it doesn't work and he'll assign you. Due to GitHub's spam prevention system, you must be active in order to participate in this repo.`);
                await addComment(repo, resp.data.number, client, `Unable to assign user (at)${issue.Assignee}. Please assign yourself, and tag @samsonjs if it doesn't work and he'll assign you. Due to GitHub's spam prevention system, you must be active in order to participate in this repo.`, 0);
            }
            let mappingFile = getMappingFile(repo);
            fs.appendFileSync(mappingFile, `${resp.data.number}: ${issue.JiraKey}\n`);
            try {
                await addMapping(repo, resp.data.number, issue.JiraKey, jiraUsername, jiraPassword)
            } catch {
                try {
                    await addMapping(repo, resp.data.number, issue.JiraKey, jiraUsername, jiraPassword)
                } catch {
                    console.log(`Failed to record migration of ${issue.JiraKey} to issue number${resp.data.number}`);
                    fs.appendFileSync(mappingFile, `Previous line failed to be recorded in jira\n`);
                }
            }
            return resp.data.number;
        } else {
            throw new Error(`Failed to create issue: ${resp.data.title} with status code: ${resp.status}. Full response: ${resp}`);
        }
    } catch (ex) {
        console.log(`Failed to create issue with error: ${ex}`);
        const backoffSeconds = 60 * (2 ** (retry));
        console.log(`Sleeping ${backoffSeconds} seconds before retrying`);
        await sleep(backoffSeconds);
        console.log("Trying again");
        return await createIssue(repo, issue, client, jiraUsername, jiraPassword, retry + 1);
    }
}

export async function createIssues(issues: GhIssue[], repo: string, token: string, jiraUsername: string, jiraPassword: string) {
    const client = new Octokit({ auth: token });
    let alreadyCreated: string[] = [];
    let stateDir = getStateDir(repo);
    let stateFile = getStateFile(repo);
    if (fs.existsSync(stateFile)) {
        alreadyCreated = fs.readFileSync(stateFile, { encoding: 'utf8' }).split(',');
    } else {
        fs.mkdirSync(stateDir, { recursive: true });
    }
    for (const issue of issues) {
        if (alreadyCreated.indexOf(issue.JiraKey) < 0) {
            await createIssue(repo, issue, client, jiraUsername, jiraPassword);
            alreadyCreated.push(issue.JiraKey);
            fs.writeFileSync(stateFile, alreadyCreated.join(','));
        }
    }
}
