# run with 

```bash
node cli.js
```

## for help

```bash
node cli.js --help
```

## Create config file: config.json

```json
{
  "user": "<Jira username>",
  "domain": "<Jira domain>" 
}
```

## secret file

- create file named: secret
- insert apikey from jira

## install globally

- navigate to project

```bash
npm install --global .
```

- run with

```bash
mh --help
```

## Use timer

When a timer is started with

```bash
mh timer --start <id>
```

if worklog is run with --usetimer or -ut tag, it takes the id and time spent from the timer

Instead of

```bash
mh worklog --id <id> --text "Example text" --spent 1h
```

this can be used

```bash
mh worklog --usetimer --text "Example text" 
```

This incorporates an actual timer for the spent time on a specific task which skips several steps

# TODO:

- worklog time spent should minues with the current
