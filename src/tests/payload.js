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
        json = JSON.parse(text)
        setCurrentPayload(json)
        return true
    } catch (e) {
        alert("Unable to parse input payload. Please try again!")
        return false
    }
}

module.exports = {
    getPayload,
    updatePayload
}
