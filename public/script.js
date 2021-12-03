function makeElement(htmlString) {
    var template = document.createElement('template');
    template.innerHTML = htmlString.trim();
    return template.content.firstChild;
}

function makePerfTable(name, perf, uptime) {
    var table = `<div><h3>${name}</h3><table><tr><th>Hour</th><th>Scheduled</th><th>Actual Arrivals</th><th>% of Trains</th><th>Data Quality</th></tr>`
    var totalScheduled = 0
    var totalActual = 0
    var totalUptime = 0
    for(let i = 0; i < 24; i++) {
        const scheduled = perf[i].scheduled
        totalScheduled += scheduled
        const actual = perf[i].actualArrivals
        totalActual += actual
        const percentage = ((actual/scheduled)*100).toFixed(1)
        const dataQuality = (Math.min(uptime[i],1) * 100).toFixed(1)
        totalUptime += Math.min(uptime[i],1)
        table += `<tr><td>${i}</td><td>${scheduled}</td><td>${actual}</td><td>${percentage}%</td><td>${dataQuality}%</tr>`
    }
    const totalPercentage = ((totalActual/totalScheduled)*100).toFixed(1)
    const totalQuality = ((totalUptime / 24) * 100).toFixed(1)
    table += `<tr><td>Total</td><td>${totalScheduled}</td><td>${totalActual}</td><td>${totalPercentage}%</td><td>${totalQuality}%</td></tr></table></div>`
    return makeElement(table)
}

function onDataFetched(date, stats) {
    const resDiv = document.getElementById("res")
    while (resDiv.firstChild) {
        resDiv.removeChild(resDiv.firstChild);
    }
    const northBoundPerf = stats.onTimePerformance["30111"]
    const southBoundPerf = stats.onTimePerformance["30112"]
    resDiv.appendChild(makePerfTable(`${date} - To O'Hare`, northBoundPerf, stats.uptimeLog))
    resDiv.appendChild(makePerfTable(`${date} - To Forest Park`, southBoundPerf, stats.uptimeLog))
}

// date - value of date picker event, YYYY-MM-DD
function dateChanged(date) {
    const dtString = date.replaceAll("-","")
    fetch(`v1/stats/${dtString}`)
    .then(res => res.json())
    .then(data => onDataFetched(date, data))
}

function onLoad() {
    // Start on yesterday
    const oneDayMs = 1000 * 60 * 60 * 24
    const d = new Date(new Date().getTime() - oneDayMs)
    const dateString = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, 0)}-${(d.getDate()).toString().padStart(2, 0)}`
    dateChanged(dateString)
    document.getElementById("date-picker").value = dateString
}