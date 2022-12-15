require('dotenv').config()
const axios = require("axios");
const API_URL = 'https://track.toggl.com/reports/api/v2/details';
const {
    SPREAD_SHEET_ID,
    PROJECT_ID,
    TOGGLE_TOKEN,
    WORKSPACE_ID,
    USER_AGENT,
    TAB_NAME,
    START_ROW,
    START_COL,
    START_DATE,
    END_DATE,
    TEST_MODE,
    GOOGLE_EXPORT_MODE
} = process.env;
const moment = require('moment');
const { google } = require('googleapis');
const { getAuth } = require("./google-auth");
const testData = require("./mock_data.json");

const fetchData = async (startDate, endDate, page) => {

    return new Promise((resolve, reject) => {
        axios.get(API_URL, {
            params: {
                workspace_id: WORKSPACE_ID,
                since: startDate,
                until: endDate,
                user_agent: USER_AGENT,
                page: page,
                project_ids: PROJECT_ID,
            },
            auth: {
                username: TOGGLE_TOKEN,
                password: 'api_token'
            },
            headers: {
                'Content-Type': 'application/json',
            },
        })
            .then(response => {
                resolve(response.data);
            })
            .catch(error => {
                console.error(error.response.data.error);
                reject(error);
            });
    });

};

const getData = async (startDate, endDate) => {

    const totalCount = 0;
    const data = [];
    let page = 1

    do {
        const response = await fetchData(startDate, endDate, page);
        totalPages = response.total_pages;
        data.push(...response.data);
        page++;
    } while (totalCount > data.length);

    return data.map(item => {
        return {
            start: item.start,
            end: item.end,
        };
    });
};

const generateDays = (start, end) => {
    const days = []
    const dateStart = moment(start)
    const dateEnd = moment(end)
    while (dateEnd.diff(dateStart, 'days') >= 0) {
        days.push({
            date: dateStart.format('YYYY-MM-DD'),
            entries: [],
            duration: 0,
            startTime: null,
            endTime: null,
            break: 0,
        })
        dateStart.add(1, 'days')
    }
    return days
}

const generateReport = async (timeEntries, startDate, endDate) => {
    let allDuration = 0;
    const days = generateDays(startDate, endDate);

    // create 2 entries if the entry is ending in a different day
    for (let i = 0; i < timeEntries.length; i++) {
        const entry = timeEntries[i];
        if (moment(entry.start).format('YYYY-MM-DD') !== moment(entry.end).format('YYYY-MM-DD')) {
            const newEnd = moment(entry.start).hour(23).minute(59).second(59).millisecond(999).format();
            const newStart = moment(entry.end).hour(0).minute(0).second(0).millisecond(0).format();
            timeEntries.push({
                start: newStart,
                end: entry.end,
            })
            timeEntries[i].end = newEnd;


        }
    }

    timeEntries.forEach(item => {
        const start = roundDownDate(item.start);
        const end = roundUpDate(item.end);
        const duration = end.diff(start, 'minutes');

        const day = days.find(day => day.date === start.format('YYYY-MM-DD'));
        if (day) {
            day.entries.push(item);
            day.duration += duration;
            if (day.startTime === null || start.diff(day.startTime, 'minutes') < 0) {
                day.startTime = start;
            }
            if (day.endTime === null || end.diff(day.endTime, 'minutes') > 0) {
                day.endTime = end;
            }
        }
    });

    // calculate breaks
    days.forEach(day => {
        if (day.startTime && day.endTime) {
            const start = moment(day.startTime);
            const end = moment(day.endTime);
            const duration = end.diff(start, 'minutes');
            day.break = duration - day.duration;

            // add breaks if auto break is not reasonable and not reaching a 10 % break of the total duration
            if (day.duration > 5 * 60 && day.break / day.duration < 0.1) {
                day.break = 0.1 * day.duration;
            }

            day.break = roundToNearest30Up(day.break);

            day.duration = duration - day.break;
            allDuration += day.duration;

        }

    });

    // todo if day starts early and ends late and the break is big, try to modify the start or end time to make the break smaller

    return {
        duration: `${Math.floor(allDuration / 60)} hours`,
        days: days?.map(day => {
            return {
                ...day,
                formattedDuration: moment.utc(moment.duration(day.duration, 'minutes').asMilliseconds()).format('HH:mm'),
                formattedBreak: day.break ? moment.utc(moment.duration(day.break, 'minutes').asMilliseconds()).format('HH:mm') : null,
                formattedStartTime: day.startTime ? day.startTime.format('HH:mm') : null,
                formattedEndTime: day.endTime ? day.endTime.format('HH:mm') === '00:00' ? '23:59' : day.endTime.format('HH:mm') : null,
            }
        })
    };
};

function roundUpDate(date) {
    const min = moment(date).minute();
    return moment(date).add(min > 40 ? 1 : 0, 'hours').minutes((min <= 40 && min > 10) ? 30 : 0)
}

function roundDownDate(date) {
    const min = moment(date).minute();
    return moment(date).add(min > 50 ? 1 : 0, 'hours').minutes(min > 20 && min <= 50 ? 30 : 0);
}

function roundToNearest30Up(num) {
    return Math.ceil(num / 30) * 30;
}

const getEndColumn = (startColumn, offset = 3) => {
    const alpha = Array.from(Array(26)).map((e, i) => i + 65);
    const alphabet = alpha.map((x) => String.fromCharCode(x));
    const index = alphabet.indexOf(startColumn);
    return index === -1 ? alphabet[+offset] : alphabet[index + offset];
}

const writeDaysToGoogleSheet = async (days) => {

    if (!days || !days.length) {
        return;
    }

    const endRow = parseInt(START_ROW) + days.length - 1;
    const endColumn = getEndColumn(START_COL, 3);
    const range = `${TAB_NAME}!${START_COL}${START_ROW}:${endColumn}${endRow}`

    const values = [
        ...days.map(day => [
            day.date,
            day.formattedStartTime,
            day.formattedEndTime,
            day.formattedBreak
        ])
    ];

    const auth = await getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREAD_SHEET_ID,
        range: range,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
            range: range,
            majorDimension: 'ROWS',
            values: values
        }
    }, (err, result) => {
        if (err) {
            console.error(err?.message);
        } else {
            console.log(`${result.data.updatedCells} cells updated in range ${result.data.updatedRange}.`);
        }
    });

}

const printExport = (report) => {
    console.table([
        ['Date', 'Start', 'End', 'Break', 'Duration'],
        ...report.days.map(day => [
            day.date,
            day.formattedStartTime,
            day.formattedEndTime,
            day.formattedBreak,
            day.formattedDuration
        ])
    ]);
    console.log('Total duration: ', report.duration);
}

(async () => {
    const testMode = TEST_MODE === 'true';
    const googleExportMode = GOOGLE_EXPORT_MODE === 'true';
    const startDate = testMode ? testData.start : START_DATE;
    const endDate = testMode ? testData.end : END_DATE;
    console.log('Test mode: ', testMode);

    const timeEntries = testMode ? testData.data : await getData(startDate, endDate);
    const report = await generateReport(timeEntries, startDate, endDate);
    printExport(report);
    if (googleExportMode) {
        await writeDaysToGoogleSheet(report?.days);
    }
})();

module.exports = {
    getData,
    generateReport,
    writeDaysToGoogleSheet
};
