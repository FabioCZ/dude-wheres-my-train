import fetch from 'node-fetch'
import express from 'express'
import readline from 'readline'
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app'
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore'

// setup
const dataCollectionIntervalMs = 1000 * 60 * 2 // 2 min
const oneHourMs = 60 * 60 * 1000
const oneDayMs = 24 * oneHourMs // 24hr
const arrivalMinuteToleranceMs = 30 * 60 * 1000 // 30 min
const port = 3000
const targetStationId = 40570.0 // California blue line, and yep the ID is decimal
const stopIdNorthBound = "30111"
const stopdIdSouthBound = "30112"
const northBoundDestinations = ["O'Hare", "Rosemont", "Jefferson Park"]
const southBoundDestinations = ["Forest Park", "UIC"]
const app = express()
// process.env.GOOGLE_APPLICATION_CREDENTIALS="./keys/dude-wheres-my-train-771657dd0357.json"
app.use(express.json())
const ctaUrl = 'https://www.transitchicago.com/traintracker/PredictionMap/tmTrains.aspx?line=B&MaxPredictions=6'
initializeApp({credential: applicationDefault()});
const db = getFirestore();
const arrivalCollection = db.collection('arrivals')
const uptimeCollection = db.collection('uptime')

function collectDataAndScheduleNext() {
    collectImmediateData()
    setInterval(collectImmediateData, dataCollectionIntervalMs)
}

function zeroPad(n) {
    return String(n).padStart(2, '0')
}

function predictionToDate(pred) {
    const now = new Date()
    if (pred.includes("Due")) {
        return new Date(now.getTime() + 60 * 1000)
    } else {
        const regex = /\d+/
        const match = pred.match(regex)
        if (match == null) return null
        else return new Date(now.getTime() + (parseInt(match[0]) * 60 * 1000))
    }
}

async function queryForExisting(run, stopId, date) {
    const dateEarliest = new Date(date.getTime() - 1000 * 60 * arrivalMinuteToleranceMs)
    const query = arrivalCollection
        .where("run", "==", run)
        .where("stopId", "==", stopId)
        .where("arrival", ">", Timestamp.fromDate(dateEarliest))
    const res = await query.get()
    if (res.empty) return null
    else return res.docs[0].data()
}

async function addOrUpdateArrival(run, stopId, date) {
    const existing = await queryForExisting(run, stopId, date)
    if (existing == null) {
        const id = `${stopId}_${run}_${date.getFullYear()}${date.getMonth() + 1}${date.getDate()}-${zeroPad(date.getHours())}${zeroPad(date.getMinutes())}`
        const arrival = { id, run, stopId }
        arrival.arrival = Timestamp.fromDate(date)
        arrival.initialPrediction = Timestamp.fromDate(date)
        arrival.createdAt = Timestamp.fromDate(new Date())
        await arrivalCollection.doc(id).set(arrival)
    } else {
        const ref = arrivalCollection.doc(existing.id)
        await ref.update({ arrival: Timestamp.fromDate(date)})
    }
}

async function logUptime() {
    const date = new Date()
    const currId = `${date.getFullYear()}${date.getMonth() + 1}${date.getDate()}-${zeroPad(date.getHours())}00`
    const existingRef = uptimeCollection.doc(currId)
    const existingDoc = await existingRef.get();
    if (existingDoc.exists) {
        const prevCount = existingDoc.data().count
        await existingRef.update({ count: prevCount + 1 })
    } else {
        await uptimeCollection.doc(currId).set({ hourlyTarget: oneHourMs / dataCollectionIntervalMs, count: 1 })
    }
}

async function collectImmediateData() {
    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort() }, 5000);
    try {
        const response = await fetch(ctaUrl);
        const body = await response.json();
        if (body.status != 'OK') return
        const actualTrains = body.dataObject[0].Markers
            .filter(x => x.Predictions.some(pred => pred[0] == targetStationId))

        for (let train of actualTrains) {
            const stopId = northBoundDestinations.some(x => train.DestName.startsWith(x)) ? stopIdNorthBound : stopdIdSouthBound
            const predictionStr = train.Predictions.find(x => x[0] == targetStationId)[2]
            const predictionDate = predictionToDate(predictionStr)
            if (predictionDate != null) {
                await addOrUpdateArrival(train.RunNumber, stopId, predictionDate)
            }
        }
        await logUptime()
    } catch(ex) {
        console.log("Error collecting data: ", ex)
    } finally {
        clearTimeout(timeout)
    }
 }

// Data retrieval
function cloneWithDateConversion(obj) {
    const clone = {}
    Object.assign(clone, obj)
    for(let k of Object.keys(clone)) {
        if (clone[k] instanceof Timestamp) {
            clone[k] = clone[k].toDate()
        }
    }
    return clone
}

async function buildUpTimeStats(dateString) {
    const uptimePerc = []
    for(let i = 0; i < 24; i++) {
        const id = `${dateString}-${zeroPad(i)}00`
        const ref = uptimeCollection.doc(id)
        const doc = await ref.get()
        if (doc.exists) {
            const count = doc.data().count
            const expected = doc.data().hourlyTarget
            uptimePerc.push(count / expected)
        } else {
            uptimePerc.push(0)
        }
    }
    return uptimePerc
}

async function getStatsForDate(dateString) {
    const date = new Date(parseInt(dateString.substring(0, 4)), parseInt(dateString.substring(4, 6)) - 1, parseInt(dateString.substring(6, 8)))
    console.log(`Querying for date: ${date}`)
    const arrivalsQueried = await arrivalCollection
        .where("arrival", ">=", Timestamp.fromDate(date))
        .where("arrival", "<=", Timestamp.fromDate(new Date(date.getTime() + oneDayMs)))
        .orderBy("arrival", "asc")
        .get()
    const resultObj = {}
    resultObj.arrivals = arrivalsQueried.docs.map(x => cloneWithDateConversion(x.data()))
    resultObj.uptimeLog = await buildUpTimeStats(dateString)
    return resultObj
}

// Endpoints
app.get('/v1/stats/:date', async (req, res) => {
    const arrivals = await getStatsForDate(req.params.date)
    res.json(arrivals)
})


//launching code
app.listen(port, () => { console.log(`Starting express app on port: ${port}`)})
collectDataAndScheduleNext()
