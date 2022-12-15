# Toggl exporter

It's a small script to export [toggl](https://toggl.com/) records into a google sheet table within the specified dates.

## Configuration
Copy the `.env.example` file and create a `.env` file from it

### Requirements
- toggle account
    - generated token
- google cloud account
    - generated OAuth 2.0 Client Id as a `credentials.json` file

### Parameters
- Toggl related:
    - TOGGLE_TOKEN
        - generated from toggl.com
    - WORKSPACE_ID
    - USER_AGENT
    - PROJECT_ID
- Google Sheet related:
    - SPREAD_SHEET_ID
    - TAB_NAME
    - START_ROW
        - start row of the inserted table
    - START_COL
        - start column of the inserted table
- functional related:
    - START_DATE="2022-11-01"
        - beginning date of the export
    - END_DATE="2022-12-01"
        - end date of the export
    - TEST_MODE='false'
        - if `true` `mock_data.json` will be used instead of real toggl records
    - GOOGLE_EXPORT_MODE='true'
        - if `false` the result only be displayed into console


## Getting started


```
$ yarn run start
```