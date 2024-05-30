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

const batchSize = 90; // Size of the batch of Jira tickets we'll get at once (days between start and creation date).

function formatDate(d: Date) {
    let month = `${d.getMonth() + 1}`;
    if (d.getMonth() + 1 < 10) {
        month = `0${month}`;
    }
    let day = String(d.getDate());
    if (d.getDate() < 10) {
        day = `0${day}`;
    }
    return `${d.getFullYear()}-${month}-${day}`;
}

export async function fetchJiraTickets(username: string, password: string, project: string, label: string, startDate: Date, endDate: Date) {
    const jql = `project = ${project} AND labels = ${label} AND resolution = Unresolved AND created >= ${formatDate(startDate)} AND created <= ${formatDate(endDate)} ORDER BY updated DESC`;
    const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    const url = `https://1secondeveryday.atlassian.net/rest/api/2/search?jql=${encodeURIComponent(jql)}&maxResults=1000`;

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': authHeader,
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch Jira tickets: ${response.statusText}`);
    }

    const data = await response.json();
    return data.issues;
}

export async function fetchAllJiraTickets(username: string, password: string, project: string, label: string) {
    let allTickets = [];
    let curEnd = new Date(Date.now() + 68400000); // need to go forward a day for some reason
    let curStart = new Date();
    curStart.setDate(curStart.getDate() - batchSize);

    while (true) {
        console.log(`Getting Jira tickets between ${formatDate(curStart)} and ${formatDate(curEnd)}`);
        const tickets = await fetchJiraTickets(username, password, project, label, curStart, curEnd);

        if (tickets.length === 0) {
            break;
        }

        allTickets = allTickets.concat(tickets);
        curEnd.setDate(curEnd.getDate() - batchSize - 1);
        curStart.setDate(curStart.getDate() - batchSize - 1);
    }

    curStart.setDate(curStart.getDate() - (365 * 50));
    const lastTickets = await fetchJiraTickets(username, password, project, label, curStart, curEnd);

    if (lastTickets.length !== 0) {
        allTickets = allTickets.concat(lastTickets);
    }

    return allTickets.reverse();
}
