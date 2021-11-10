import fetch from 'node-fetch';
import express from 'express';

// setup
const dataCollectionIntervalMs = 1000 * 60 * 0.25
const port = 3000
const targetStationId = 40570.0 // California blue line, and yep the ID is decimal
const northBoundDestinations = ["O'Hare", "Rosemont", "Jefferson Park"]
const southBoundDestinations = ["Forest Park", "UIC"]
const app = express()
app.use(express.json())
const ctaUrl = 'https://www.transitchicago.com/traintracker/PredictionMap/tmTrains.aspx?line=B&MaxPredictions=6'

const arrivals = []
function collectDataAndScheduleNext() {
    collectImmediateData()
    setInterval(collectImmediateData, dataCollectionIntervalMs)
}

function predictionToDate(pred) {
    const now = new Date()
    if (pred.includes("Due")) {
        return new Date(now + 60 * 1000)
    } else {
        const regex = /\d+/
        const match = pred.match(regex)
        if (match == null) return null
        else return new Date(now.getTime() + (parseInt(match[0]) * 60 * 1000))
    }
}

function addOrUpdateArrival(run, isNorthBound, date) {
    for(let arrival of arrivals) {
        if (arrival.run == run &&
            arrival.isNorthBound == isNorthBound &&
            arrival.date > new Date(new Date() - 1000 * 60 * 30)) {
                arrival.date = date
                return
            }
    }
    const newArrival = { run, isNorthBound, date, initialPrediction: date }
    arrivals.push(newArrival)
}


async function collectImmediateData() {
    const response = await fetch(ctaUrl);
    const body = await response.json();
    if (body.status != 'OK') return
    const actualTrains = body.dataObject[0].Markers
        .filter(x => x.Predictions.some(pred => pred[0] == targetStationId))

    for (let train of actualTrains) {
        const isNorthBound = northBoundDestinations.some(x => train.DestName.startsWith(x))
        const predictionStr = train.Predictions.find(x => x[0] == targetStationId)[2]
        const predictionDate = predictionToDate(predictionStr)
        if (predictionDate != null) {
            addOrUpdateArrival(train.RunNumber, isNorthBound, predictionDate)
        }
    }
    console.log(arrivals)
 }

// Data save

// Data retrieval
function getStatsForDate(date) {

}

// Endpoints
app.get('v1/stats/:date', (req, res) => {
    res.json(getStatsForDate(req.params.date))
})


//launching code
app.listen(port, () => { console.log(`Starting express app on port: ${port}`)})
collectDataAndScheduleNext()