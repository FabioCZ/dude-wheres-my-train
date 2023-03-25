// Parses GTFS files to extract departure times for a given station in both directions for all days of the week
// Make sure to include calendar + stop_times + trips files from GTFS in runtime directory
import fs from 'fs'
import readline from 'readline'
// const stopIdNorthBound = "30179" // Pulaski to ord
// const stopIdSouthBound = "30180" // Pulaski to fp
const stopIdNorthBound = "30111"
const stopIdSouthBound = "30112"
const routeName = "Blue"
const calendarFile = "calendar.txt"
const stopTimesFiles = "stop_times.txt"
const tripsFile = "trips.txt"

function getReadlineInterface(fileName) {
    const fileStream = fs.createReadStream(fileName);

    return readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });
}

// returns dict, key: trip id, value: service id
async function findTripsForRoute(route) {
    const rl = getReadlineInterface(tripsFile)

    const trips = {}
    for await (const line of rl) {
        if (line.startsWith(routeName)) {
            const split = line.split(",")
            trips[split[2]] = split[1]
        }
    }
    rl.close()
    return trips
}

// key: service, value: bool array of length 7
async function findDaysForServices(services) {
    const rl = getReadlineInterface(calendarFile)
    const serviceToDays = {}
    for await (const line of rl) {
        const split = line.split(",")
        if (services.some(ser => ser == split[0])) {
            serviceToDays[split[0]] = split.slice(1, 8).map(day => day == 1) // map to bools
        }
    }
    rl.close()
    return serviceToDays
}

function writeTimesToFile(times, fileName) {
    times.sort()
    const perHour = {}
    for(let time of times) {
        const hr = time.startsWith("24") ? "00" : time.substring(0,2)
        if (hr in perHour) {
            perHour[hr]++
        } else {
            perHour[hr] = 1
        }
    }
    const outputObj = { 
        totalPerDay: times.length,
        allDepartures: times,
        hourlyTrainCount: perHour
    }

    console.log("Total for " + fileName + ":" + times.length)
    const writer = fs.createWriteStream(fileName, { flags: "w" })
    writer.write(JSON.stringify(outputObj))
    writer.close()
}

async function parseDeparturesForStations() {
    const tripsToServices = await findTripsForRoute(routeName)
    const servicesToDays = await findDaysForServices(Object.values(tripsToServices))

    const rl = getReadlineInterface(stopTimesFiles)
    const southBoundTimes = [[],[],[],[],[],[],[]]
    const northBoundTimes = [[],[],[],[],[],[],[]]

    for await (const line of rl) {
        const split = line.split(",")
        if (split[0] in tripsToServices && (split[3] == stopIdSouthBound || split[3] == stopIdNorthBound)) {
            const days = servicesToDays[tripsToServices[split[0]]]
            for(var dayIdx = 0; dayIdx < 7; dayIdx++) {
                if (days[dayIdx]) {
                    const destArr = split[3] == stopIdSouthBound ? southBoundTimes[dayIdx] : northBoundTimes[dayIdx]
                    if (!destArr.includes(split[2])) {
                        destArr.push(split[2])
                    }
                }
            }
        }
    }

    for(var dayIdx = 0; dayIdx < 7; dayIdx++) {
        // Days are zero-indexed, starting with Monday == 0
        writeTimesToFile(southBoundTimes[dayIdx], `schedules/${stopIdSouthBound}_${dayIdx}.json`)
        writeTimesToFile(northBoundTimes[dayIdx], `schedules/${stopIdNorthBound}_${dayIdx}.json`)
    }
}

await parseDeparturesForStations()
