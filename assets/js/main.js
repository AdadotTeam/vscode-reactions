const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365.25 * DAY;
const MONTH = YEAR / 12;

const timeUnits= [
    ["year", YEAR],
    ["month", MONTH],
    ["day", DAY],
    ["hour", HOUR],
    ["minute", MINUTE],
    ["second", SECOND],
];

const between = (now, compare, locale) => {
    const diffMilliseconds = now.valueOf() - compare.valueOf();

    for (const [currentUnit, scale] of timeUnits) {
        if (diffMilliseconds > scale) {
            return {text:new Intl.RelativeTimeFormat(locale).format(
                -1 * Math.round(diffMilliseconds / scale),
                currentUnit,
            ), scale};
        }
    }

    return {text: "right now", scale:SECOND};
};

function updateClock() {
    const containers = document.querySelectorAll('.time-container');
    let minRefresh = YEAR;

    containers.forEach(container=>{
        const input = container.querySelectorAll('input[name="time"]')[0];
        const locale = container.querySelectorAll('input[name="locale"]')[0];
        const display = container.querySelectorAll('.time')[0];
        const ago = between(new Date(), new Date(input.value), locale);
        minRefresh = Math.min(minRefresh, ago.scale);
        display.innerText = ago.text;
    });

    setTimeout(updateClock, minRefresh);
}

(function () {
    // @ts-ignore
    // const vscode = acquireVsCodeApi();


    // selecting the elements for which we want to add a tooltip
    const containers = document.querySelectorAll(".tooltip-container");


    // change display to 'block' on mouseover
    for (let i = 0; i < containers.length; i++) {
        const container = containers[i];
        const targets = container.querySelectorAll(".tooltip-button");
        const target = targets[0];
        const tooltips = container.querySelectorAll(".tooltip-text");
        const tooltip = tooltips[0];

        if(target && tooltip){

            target.addEventListener('mouseover', () => {
                // @ts-ignore
                tooltip.style.display = 'block';
            }, false);

            target.addEventListener('mouseleave', () => {
                // @ts-ignore
            tooltip.style.display = 'none';
            }, false);
        }
    }

    updateClock();
}());

