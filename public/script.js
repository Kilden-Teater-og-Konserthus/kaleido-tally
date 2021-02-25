var lastResponse = []

function refresh(){
    fetch('/api').then(function(response) {
        return response.json();
    }).then(function(tallyData) {
        //console.log(tallyData);
        if(JSON.stringify(tallyData) != JSON.stringify(lastResponse)){
            $(".container").html("");
            $(".container").append(`
                <div class="tallyRow header">
                    <div class="tallyID">#</div>
                    <div class="tallyName">Name</div>
                    <div class="tallyIP">IP</div>
                    <div class="cameraSelect">Current Camera</div>
                    <div class="tallyStatus">Status</div>
                    <div class="tallyStatus">Delete</div>
                    </div>
            `);
            tallyData.forEach((tally, i) => {
                $(".container").append(`
                <div class="tallyRow" id="${i}">
                    <div class="tallyID">${i+1}</div>
                    <input type="text"      class="tallyName"       value="${tally.name}"       onchange="setValue(this, 'name')">
                    <input type="text"      class="tallyIP"         value="${tally.IP}"         onchange="setValue(this, 'IP')">
                    <input type="number"    class="cameraSelect"    value="${tally.camera}"     onchange="setValue(this, 'camera')">
                    <div class="tallyStatus">${tally.status}</div>
                    <button onclick="deleteTally(this)">Delete</button>
                </div>
                `);
            });
            $(".container").append(`
                <button class="addTallyButton" onclick="addTally()">Add Tally</button>
            `);
            lastResponse = tallyData;
        }
    });
}

setInterval(() => {
    refresh();    
}, 100);


function addTally(){
    fetch('/addMonitor')

}

function setValue(input, value){
    lastResponse[$(input).parent().attr("id")][value] = input.value;
    sendUpdate();
}

function deleteTally(button){
    fetch('/deleteMonitor?monitor=' + parseFloat($(button).parent().attr("id")))
}

function sendUpdate(){
    console.log(lastResponse)
    fetch("/updateTally",{
        method: "POST",
        body: JSON.stringify(lastResponse),
        headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json'
        },
    })
}