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

const fetch = require('node-fetch');

const batchSize = 90; // Size of the batch of JIRA issues we'll get at once (days between start and creation date).

function formatDate(d) {
    let month = `${d.getMonth() + 1}`;
    if (d.getMonth() + 1 < 10) {
        month = `0${d.getMonth() + 1}`;
    }
    return `${d.getFullYear()}-${month}-${d.getDate()}`;
}

async function fetchJiraIssues(jql) {
    const authHeader = `Basic ${Buffer.from(`${process.env['JIRA_USERNAME']}:${process.env['JIRA_PASSWORD']}`).toString('base64')}`;
    const url = `https://1secondeveryday.atlassian.net/rest/api/2/search?jql=${encodeURIComponent(jql)}&maxResults=1000`;

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': authHeader,
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch Jira issues: ${response.statusText}`);
    }

    const data = await response.json();
    return data.issues;
}

export async function getJiraTickets() {
    let tickets = [];
    let curEnd = new Date();
    let curStart = new Date();
    curStart.setDate(curStart.getDate() - batchSize);

    while (true) {
        console.log(`Getting Jira issues between ${formatDate(curStart)} and ${formatDate(curEnd)}`);
        const jql = `project = 1SE AND labels = Services AND resolution = Unresolved AND created >= ${formatDate(curStart)} AND created <= ${formatDate(curEnd)} ORDER BY updated DESC`;
        const issues = await fetchJiraIssues(jql);

        if (issues.length === 0) {
            break;
        }

        tickets = tickets.concat(issues);
        curEnd.setDate(curEnd.getDate() - batchSize - 1);
        curStart.setDate(curStart.getDate() - batchSize - 1);
    }

    curStart.setDate(curStart.getDate() - (365 * 50));
    const jql = `project = 1SE AND labels = Services AND resolution = Unresolved AND created >= ${formatDate(curStart)} AND created <= ${formatDate(curEnd)} ORDER BY updated DESC`;
    const issues = await fetchJiraIssues(jql);

    if (issues.length !== 0) {
        tickets = tickets.concat(issues);
    }

    return tickets.reverse();
}
