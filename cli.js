#!/usr/bin/env node
import yargs from 'yargs';
import fetch from 'node-fetch';
import { hideBin } from 'yargs/helpers';
import { parseISO, format } from 'date-fns';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configFile = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
const user = config.user;
const secretFile = path.join(__dirname, 'secret');
const apiToken = fs.readFileSync(secretFile, 'utf8').trim().toString();
const domain = config.domain;

yargs(hideBin(process.argv))
    .command('worklog', 'Log work to Jira', (yargs) => {
        return yargs
            .option('id', {
                describe: 'Jira issue ID',
                type: 'string'
            })
            .option('text', {
                describe: 'Work log comment',
                type: 'string',
                alias: 't'
            })
            .option('usetimer', {
                describe: `Use current timer's id and time spent`,
                type: 'boolean',
                alias: 'ut'
            })
            .option('spent', {
                describe: 'Time spent. It uses the same format as in Jira which means 8 hours are written as: 8h and so on',
                type: 'string'
            })
            .option('date', {
                describe: 'Date for the work log in the format of yyyy-mm-dd',
                type: 'string'
            })
    }, (argv) => {
        handleWorklog(argv);
    })
    .command('focus', 'Manage focus items', (yargs) => {
        return yargs
            .option('add', {
                describe: 'Add a new focus item',
                type: 'string',
                alias: 'a'
            })
            .option('list', {
                describe: 'List all focus items',
                type: 'boolean',
                alias: 'l'
            })
            .option('remove', {
                describe: 'Remove a focus item by ID',
                type: 'string',
                alias: 'r'
            })
    }, (argv) => {
        handleFocus(argv);
    })
    .command('timer', 'Track time', (yargs => {
        return yargs
            .option('start', {
                describe: 'Start timer for task',
                type: 'string'
            })
            .option('stop', {
                describe: 'Stop timer',
                type: 'boolean'
            })
            .option('current', {
                describe: 'Get current timer',
                type: 'boolean',
                alias: 'c'
            })
    }), (argv) => {
        handleTimer(argv);
    })
    .demandCommand(1, 'You need to specify a command')
    .help()
    .parse();

function handleTimer(argv) {
    const timerFile = path.join(__dirname, 'timer.json');

    if (argv.start) {
        let date = new Date()
        const newTimer = {
            id: argv.start,
            startTime: date.toISOString()
        };
        fs.writeFileSync(timerFile, JSON.stringify(newTimer, null, 2));
        console.log(`Timer started ${date.toTimeString()} with id ${newTimer.id}`);
    }
    else if (argv.current) {
        if (!fs.existsSync(timerFile)) {
            console.log("No timer running");
            return;
        }

        const timer = JSON.parse(fs.readFileSync(timerFile, 'utf8'));
        if (!timer) {
            console.log("Corrupt json timer");
            return;
        }

        const diffMs = new Date(new Date().toISOString()) - new Date(timer.startTime);
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const hours = Math.floor(diffMinutes / 60);
        const minutes = diffMinutes % 60;

        console.log(`Timer ${timer.id} is at ${hours} hours and ${minutes} minutes`);
    }
    else if (argv.stop) {
        if (!fs.existsSync(timerFile)) {
            console.log("No timer running");
            return;
        }
        const timer = JSON.parse(fs.readFileSync(timerFile, 'utf8'));
        if (!timer) {
            console.log("Corrupt json timer");
            return;
        }
        const diffMs = new Date(new Date().toISOString()) - new Date(timer.startTime);
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const hours = Math.floor(diffMinutes / 60);
        const minutes = diffMinutes % 60;

        console.log(`Stopped timer ${timer.id} with a total running time of ${hours} hours and ${minutes} minutes`);
        fs.unlinkSync(timerFile);
    } else {
        console.log('use --start, --stop, or --current with the timer command');
    }
}

async function handleWorklog(argv) {
    const dt = argv.date
        ? parseISO(`${argv.date}T00:00:00Z`)
        : new Date();

    const text = argv.text
        ? argv.text
        : "";

    let spent = argv.spent;
    let id = argv.id;

    const timerFile = path.join(__dirname, 'timer.json');

    if (argv.usetimer) {
        if (!fs.existsSync(timerFile)) {
            console.log("No timer running");
            return;
        }

        const timer = JSON.parse(fs.readFileSync(timerFile, 'utf8'));
        if (!timer) {
            console.log("Corrupt json timer");
            return;
        }

        const diffMs = new Date(new Date().toISOString()) - new Date(timer.startTime);
        spent = Math.floor(diffMs / (1000 * 60)) + "m";
        const hours = Math.floor(spent / 60);
        if (hours == NaN) hours = 0;
        const minutes = spent % 60;
        if (minutes == NaN) minutes = 0;

        id = timer.id;

        console.log(`Found timer with id ${id} and spent time ${hours} hours and ${minutes} minutes`)
        console.log(`Adding timelog to Jira`)
    }

    console.log("id: " + id);
    console.log("text: " + text);
    console.log("spent: " + spent);
    const jiraTs = format(dt, "yyyy-MM-dd'T'HH:mm:ss.SSSxx");
    console.log(`date: ${jiraTs}`);

    const bodyData = `{
"comment": {
"content": [
{
"content": [
{
"text": "${text}",
"type": "text"
}
],
"type": "paragraph"
}
],
"type": "doc",
"version": 1
},
"started": "${jiraTs}",
"timeSpent": "${spent}",
"visibility": null 
}`;

    fetch(`https://${domain}.atlassian.net/rest/api/3/issue/${id}/worklog`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${Buffer.from(
                user + ':' + apiToken
            ).toString('base64')}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: bodyData
    })
        .then(response => {
            console.log(
                `Response: ${response.status} ${response.statusText}`
            );
            if (response.ok) {
                if (fs.existsSync(timerFile)) fs.unlinkSync(timerFile);

            } else {
                if (fs.existsSync(timerFile))
                    console.log(`Not unlinking file due to unsuccessful status code: ${response.status}`);
            }
        })
        .catch(err => console.error(err));
}

async function handleFocus(argv) {
    const focusFile = path.join(__dirname, 'focus.json');

    try {
        if (!fs.existsSync(focusFile)) {
            fs.writeFileSync(focusFile, JSON.stringify([], null, 2));
        }
    } catch (err) {
        console.error('Error initializing focus file:', err);
        return;
    }

    // Read existing focus items
    const focusItems = JSON.parse(fs.readFileSync(focusFile, 'utf8'));

    const formatTerminalLink = (text, url) => {
        return `\u001b]8;;${url}\u0007${text}\u001b]8;;\u0007`;
    };

    if (argv.add) {
        // Add a new focus item
        const issue = await GetIssue(argv.add, user, apiToken, domain);

        if (issue === undefined) {
            console.log(`Could not find issue with id ${argv.add}`);
            return;
        };

        const newItem = {
            id: argv.add,
            summary: issue.fields.summary,
            created: new Date().toISOString(),
            url: `https://${domain}.atlassian.net/browse/${argv.add}`
        };
        focusItems.push(newItem);
        fs.writeFileSync(focusFile, JSON.stringify(focusItems, null, 2));
        console.log(`Added focus item ${newItem.id}: ${newItem.summary}`);
    } else if (argv.list) {
        // List all focus items
        if (focusItems.length === 0) {
            console.log('No focus items. Add one with "focus --add <text>"');
        } else {
            console.log('Focus items:');
            focusItems.forEach(item => {
                const linkDisplay = item.url ? `${formatTerminalLink(item.id.toUpperCase(), item.url)}` : '';
                console.log(`[${linkDisplay}] ${item.summary} (FOCUS ADDED: ${new Date(item.created).toLocaleString()})`);
            });
        }
    } else if (argv.remove !== undefined) {
        // Remove a focus item
        const index = focusItems.findIndex(item => item.id.toLowerCase() === argv.remove.toLowerCase());
        if (index !== -1) {
            const removed = focusItems.splice(index, 1)[0];
            fs.writeFileSync(focusFile, JSON.stringify(focusItems, null, 2));
            console.log(`Removed focus item ${removed.id}: ${removed.summary}`);
        } else {
            console.log(`No focus item with ID ${argv.remove}`);
        }
    } else {
        console.log('use --add, --list, or --remove with the focus command');
    }
}

async function GetIssue(id, usr, token, domain) {
    return fetch(`https://${domain}.atlassian.net/rest/api/3/issue/${id}?fields=summary`, {
        method: 'GET',
        headers: {
            'Authorization': `Basic ${Buffer.from(
                usr + ':' + token
            ).toString('base64')}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
    })
        .then(response => {
            console.log(
                `Response: ${response.status} ${response.statusText}`
            );
            return response.json();
        })
        .catch(err => console.error(err));
}

