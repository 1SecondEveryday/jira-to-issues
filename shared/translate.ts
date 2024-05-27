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

import { GhIssue } from "./github";

const maxIssueDescriptionLength = 65000;

function parseQuote(d: string): string {
    let startIndex = d.indexOf("{quote}");
    if (startIndex <= -1) {
        return d;
    }
    d = d.substring(0, startIndex) + "> " + d.substring(startIndex + "{quote}".length);
    let endIndex = d.indexOf("{quote}");
    if (endIndex > -1) {
        d = d.substring(0, endIndex) + d.substring(endIndex + "{quote}".length);
    } else {
        endIndex = d.length + 100;
    }
    let index = d.indexOf("\n", startIndex);
    while (index < endIndex && index > -1) {
        d = d.substring(0, index) + "\n> " + d.substring(index + "\n> ".length);
        index = d.indexOf("\n", index + "\n> ".length);
    }

    return parseQuote(d);
}

function escapeSpecialChars(d: string): string {
    d = d.replace(/==/g, "\\==");
    d = d.replace(/--/g, "\\--");
    return parseQuote(d.replace(/>/g, "\\>"));
}

function parseLists(d: string): string {
    let curIndex = 0;
    while (curIndex > -1) {
        while (curIndex < d.length && d[curIndex] == " " || d[curIndex] == "\n") {
            curIndex++;
        }
        if (curIndex < d.length - 1 && d[curIndex] == "#" && d[curIndex + 1] == " ") {
            return `${escapeSpecialChars(d.slice(0, curIndex))}- ${parseLists(d.slice(curIndex + 2))}`;
        }
        curIndex = d.indexOf("\n", curIndex);
    }

    return escapeSpecialChars(d);
}

function parseBold(d: string): string {
    const start = d.indexOf("{*}");
    const endOfLine = d.indexOf("\n", start);
    const endOfBlock = d.indexOf("{*}", start);
    if (start > -1 && (endOfBlock < endOfLine || endOfLine < 0) && endOfBlock > -1) {
        return `${parseLists(d.slice(0, start))}_${d.slice(start + 1, endOfBlock)}_${parseBold(d.slice(endOfBlock + 3))}`
    }

    return parseLists(d);
}

function parseItalics(d: string): string {
    const start = d.indexOf("{_}");
    const endOfLine = d.indexOf("\n", start);
    const endOfBlock = d.indexOf("{_}", start);
    if (start > -1 && (endOfBlock < endOfLine || endOfLine < 0) && endOfBlock > -1) {
        return `${parseBold(d.slice(0, start))}_${d.slice(start + 1, endOfBlock)}_${parseUnderline(d.slice(endOfBlock + 3))}`
    }

    return parseBold(d);
}

// Markdown doesn't have underline, so we'll just go with bold
function parseUnderline(d: string): string {
    const start = d.indexOf("+");
    const endOfLine = d.indexOf("\n", start);
    const endOfBlock = d.indexOf("+", start);
    if (start > -1 && (endOfBlock < endOfLine || endOfLine < 0) && endOfBlock > -1) {
        return `${parseItalics(d.slice(0, start))}**${d.slice(start + 1, endOfBlock)}**${parseUnderline(d.slice(endOfBlock + 1))}`
    }

    return parseItalics(d);
}

function fixLinks(d: string): string {
    const start = d.indexOf("[");
    const endOfLine = d.indexOf("\n", start);
    const endOfLink = d.indexOf("]", start);
    const delimiter = d.indexOf("|", start);

    if (start > -1 && endOfLink > start) {
        if (endOfLink > endOfLine && endOfLine > -1) {
            // Potential link spans multiple lines, move on to looking in next line.
            return `${parseUnderline(d.slice(0, endOfLine + 1))}${fixLinks(d.slice(endOfLine + 1))}`;
        }
        let link = d.slice(start + 1, endOfLink);
        let caption = link;
        if (delimiter > -1 && delimiter < endOfLink) {
            caption = d.slice(start + 1, delimiter);
            link = d.slice(delimiter + 1, endOfLink);
        }
        if (link.indexOf("://") > -1) {
            return `${parseUnderline(d.slice(0, start))}[${caption}](${link})${fixLinks(d.slice(endOfLink + 1))}`;
        }

        // No valid link, continue looking in rest of description.
        return `${parseUnderline(d.slice(0, endOfLink + 1))}${fixLinks(d.slice(endOfLink + 1))}`;
    }

    return parseUnderline(d);
}

function parseHeaders(d: string): string {
    const headerToMarkdown = {
        "h1.": "#",
        "h2.": "##",
        "h3.": "###",
        "h4.": "####",
        "h5.": "#####"
    }
    for (const header of Object.keys(headerToMarkdown)) {
        if (d.indexOf(header) == 0) {
            d = headerToMarkdown[header] + d.slice(header.length);
        }
        while (d.indexOf(`\n${header}`) > -1) {
            d = d.replace(`\n${header}`, `\n${headerToMarkdown[header]}`)
        }
    }
    return fixLinks(d)
}

function parseCodeLines(d: string): string {
    const start = d.indexOf("{{");
    const endOfLine = d.indexOf("\n", start);
    const endOfBlock = d.indexOf("}}", start);
    if (start > -1 && (endOfBlock < endOfLine || endOfLine < 0) && endOfBlock > -1) {
        return `${parseHeaders(d.slice(0, start))}\`${d.slice(start + 2, endOfBlock)}\`${parseCodeLines(d.slice(endOfBlock + 2))}`
    }

    return parseHeaders(d);
}

function parseNoFormatBlocks(d: string): string {
    const start = d.indexOf("{noformat}");
    const nextOccurence = d.indexOf("{noformat}", start + 10);
    if (start > -1 && nextOccurence > -1) {
        let codeBlock = d.slice(start + "{noformat}".length, nextOccurence);
        // Jira wraps single line code blocks, GH doesn't - this adds some (dumb) formatting
        let curIndex = 100;
        while (codeBlock.indexOf(" ", curIndex) > -1) {
            curIndex = codeBlock.indexOf(" ", curIndex);
            codeBlock = codeBlock.slice(0, curIndex) + "\n" + codeBlock.slice(curIndex + 1);
            curIndex += 100;
        }
        return `${parseCodeLines(d.slice(0, start))}\`\`\`\n${codeBlock}\n\`\`\`\n${parseCodeBlocks(d.slice(nextOccurence + "{noformat}".length))}`
    }

    return parseCodeLines(d);
}

function parseCodeBlocks(d: string): string {
    const start = d.indexOf("{code");
    const end = d.indexOf("}", start);
    const nextOccurence = d.indexOf("{code}", end);
    if (start > -1 && end > -1 && nextOccurence > -1) {
        let codeBlock = d.slice(end + 1, nextOccurence);
        // Jira wraps single line code blocks, GH doesn't - this adds some (dumb) formatting
        let curIndex = 100;
        while (codeBlock.indexOf(" ", curIndex) > -1) {
            curIndex = codeBlock.indexOf(" ", curIndex);
            codeBlock = codeBlock.slice(0, curIndex) + "\n" + codeBlock.slice(curIndex + 1);
            curIndex += 100;
        }
        return `${parseNoFormatBlocks(d.slice(0, start))}\`\`\`\n${codeBlock}\n\`\`\`\n${parseCodeBlocks(d.slice(nextOccurence + "{code}".length))}`
    }

    return parseNoFormatBlocks(d);
}

function truncate(d: string): string {
    if (d.length <= maxIssueDescriptionLength) {
        return d;
    }
    return `${d.slice(0, maxIssueDescriptionLength)}\n\n issue truncated because of its length - to see full context, see original Jira`;
}

function formatDescription(d: string): string {
    d = parseCodeBlocks(d);
    d = truncate(d);

    return d;
}

function labelForIssueType(issueType): string | null {
    switch (issueType) {
        case "Bug":
        case "Unconfirmed Bug":
            return "bug";

        default:
            return null
    }
}

function jiraToGhIssue(jiraTicket: any): GhIssue {
    let ghIssue = new GhIssue();
    let key = jiraTicket['key'];
    ghIssue.Title = `${key}: ${jiraTicket['fields']['summary']}`;

    let typeLabel = labelForIssueType(jiraTicket['fields']['issuetype']['name']);
    if (typeLabel != null) {
        ghIssue.Labels.add(typeLabel);
    }
    ghIssue.Labels.add("jira");

    ghIssue.Description = formatDescription(jiraTicket['fields']['description'] || '');
    ghIssue.Description += `\n\nImported from Jira [${key}](https://1secondeveryday.atlassian.net/browse/${key}). Original Jira may contain additional context.`;
    ghIssue.Description += `\nReported by: ${jiraTicket['fields']['reporter']['displayName']}.`;
    ghIssue.Assignee = mapAssigneeToHandle(jiraTicket['fields']['assignee']?.['displayName']);
    ghIssue.JiraReferenceId = jiraTicket['id']
    ghIssue.Assignable = isAssignable(ghIssue.Assignee);

    return ghIssue;
}

export function jiraTicketsToGitHubIssues(tickets: any[]): GhIssue[] {
    const filteredJiraTickets = tickets.filter(j => j['fields']['issuetype']['name'] != "Sub-task");
    let issues: GhIssue[] = [];
    for (const jiraTicket of filteredJiraTickets) {
        let ghIssue = jiraToGhIssue(jiraTicket);
        issues.push(ghIssue);
    }

    return issues
}

function mapAssigneeToHandle(assignee: string): string {
    switch (assignee) {
        case "sami":
            return "samsonjs";
        case "Megan Olesky":
            return "molesky";
        case "Mostafa":
            return "mmabdelateef";
        case "jeff":
            return "jefflovejapan";
        case "Marilyn García":
            return "mgarciam";
        case "Jordon de Hoog":
            return "jordond";
        case "Tyler Weidel":
            return "tylerweidel ";
        case "Vinh Dinh":
            return "vpdn";
        case "Silvia Burgos":
            return "TKTK";
        case "Jon Palustre":
            return "TKTK";
    }

    return "";
}



function isAssignable(assignee: string): boolean {
    const assignable = [
        "samsonjs", "molesky", "mmabdelateef", "jefflovejapan", "mgarciam", "jordond",
        "tylerweidel", "vpdn", "silvia-TKTK", "jon-TKTK"
    ];
    return assignable.indexOf(assignee) > -1;
}