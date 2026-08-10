const defaultPayload = {
    "firstName": "John",
    "lastName": "Smith",
    "isAlive": true,
    "age": 27,
    "address": {
        "streetAddress": "21 2nd Street",
        "city": "New York",
        "state": "NY",
        "postalCode": "10021-3100"
    },
    "phoneNumbers": [{
            "type": "home",
            "number": "212 555-1234"
        },
        {
            "type": "office",
            "number": "646 555-4567"
        },
        {
            "type": "mobile",
            "number": "123 456-7890"
        }
    ],
    "children": [],
    "spouse": null
}

let currentPayload;

function setCurrentPayload (payload) {
    currentPayload = payload;
}
setCurrentPayload(defaultPayload)

function getPayload(){
    return currentPayload
}

function updatePayload() {
    const text = document.getElementById('payloadInput').value
    try {
        const json = JSON.parse(text)
        setCurrentPayload(json)
        return true
    } catch (e) {
        alert("Unable to parse input payload. Please try again!")
        return false
    }
}

/** @param {number} targetBytes */
function makeJsonPayload(targetBytes) {
    const makeItem = (index) => ({
        id: index,
        name: `item-${index}`,
        value: 'x'.repeat(48),
        flag: index % 2 === 0,
    })

    const unitBytes = JSON.stringify(makeItem(0)).length + 1
    const itemCount = Math.max(1, Math.ceil(targetBytes / unitBytes))
    const items = []

    for (let index = 0; index < itemCount; index += 1) {
        items.push(makeItem(index))
    }

    return { items }
}

/** @param {number} depth */
function makeDeepPayload(depth) {
    let node = { leaf: true, value: 'end' }

    for (let level = 0; level < depth; level += 1) {
        node = { level, child: node }
    }

    return node
}

// Factories, not values: the transfer benchmark detaches its buffer on every send.
const payloadProfiles = {
    json_1kb: () => makeJsonPayload(1024),
    json_64kb: () => makeJsonPayload(64 * 1024),
    json_1mb: () => makeJsonPayload(1024 * 1024),
    deep_object: () => makeDeepPayload(200),
    binary_1mb: () => new ArrayBuffer(1024 * 1024),
}

/** @param {string} profileKey */
function getPayloadFactory(profileKey) {
    const factory = payloadProfiles[profileKey]

    if (!factory) {
        throw new Error(`Unknown payload profile: ${profileKey}`)
    }

    return factory
}

/** @param {string} profileKey */
function describePayloadProfile(profileKey) {
    const sample = getPayloadFactory(profileKey)()

    if (sample instanceof ArrayBuffer) {
        return { bytes: sample.byteLength, kind: 'arraybuffer' }
    }

    return { bytes: JSON.stringify(sample).length, kind: 'json' }
}

module.exports = {
    getPayload,
    updatePayload,
    getPayloadFactory,
    describePayloadProfile,
}
