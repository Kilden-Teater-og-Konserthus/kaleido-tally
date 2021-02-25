const  http = require('http');
const { Atem } = require('atem-connection')
const myAtem = new Atem()
myAtem.on('info', console.log)
myAtem.on('error', console.error)
const express = require('express')
const app = express();
const port = 3000;
const net = require('net');
const fs = require('fs');
const bodyParser = require('body-parser');

var previousState;

var ATEMState = "disconnected";

var previousTally = {
  program: 0,
  preview: 0,
  handleTransistion: false
}

var commandQueue = [];

var monitors = []

var lastAck = true;

app.use(bodyParser.json());

app.use('/', express.static(__dirname + '/public'));

app.post('/updateTally', function (req, res) {
  console.log(req.originalUrl);
  req.body.forEach((incomingTally, i) => {
    if(monitors[i] == undefined){
      monitors[i] = {}
    }
    else{
      if(incomingTally.IP != monitors[i].IP){
        monitors[i].client.destroy();
        monitors[i].IP = incomingTally.IP;
        newMonitor(monitors[i], i)
      }
    }
    monitors[i].name = incomingTally.name
    monitors[i].camera = incomingTally.camera
  })
  saveSettings();
  res.sendStatus(200);
});

app.get('/setMonitorCamera', function(req, res){
  console.log(req.originalUrl);
  setMonitorCamera(req.query.monitor,req.query.camera);
  sendTally(true);
  saveSettings();
  res.sendStatus(200);
});

app.get('/deleteMonitor', function(req, res){
  console.log(req.originalUrl);
  if(monitors[req.query.monitor].client){
    monitors[req.query.monitor].client.destroy();

  }
  monitors.splice(parseFloat(req.query.monitor), 1)
  saveSettings();
  res.sendStatus(200);
});

app.get('/addMonitor', function(req, res){
  monitors.push({
    IP: "0.0.0.0",
    name: "New Tally",
    camera: 0,
    status: "disconnected"
  })
  saveSettings();
  res.sendStatus(200);
});

app.get('/api', function(req, res){
  var tempMonitors = []
  monitors.forEach((monitor, i) => {
    tempMonitors[i] = {}
    tempMonitors[i].IP = monitor.IP
    tempMonitors[i].name = monitor.name
    tempMonitors[i].camera = parseFloat(monitor.camera)
    tempMonitors[i].status = monitor.status
  })
  res.send(tempMonitors);
});

app.listen(port, () => console.log(`Example app listening at http://localhost:${port}`))

function saveSettings(){
  var tempMonitors = []
  monitors.forEach((monitor, i) => {
    tempMonitors[i] = {}
    tempMonitors[i].IP = monitor.IP
    tempMonitors[i].name = monitor.name
    tempMonitors[i].camera = monitor.camera
  })
  fs.writeFile('settings.json', JSON.stringify(tempMonitors), function (err) {
    if (err) return console.log(err);
    console.log("Settings saved");
  });
}

function startTCP(){
  monitors.forEach((monitor, i) => {
    newMonitor(monitor, i)

  })
}

setInterval(()=>{
  sendCommand();
 }, 10)

function newMonitor(monitor, i){
  monitor.client = new net.Socket();
  monitor.client.connect({port: 13000, host: monitor.IP});


  monitor.client.on('connect', () => {
    console.log('TCP Connected for', monitor.IP);
    monitors[i].status = "connected";
    monitor.client.write('<openID/>\n');
    monitor.client.write(`<setKDynamicText>set address="0" text="-"</setKDynamicText>\n`);
  });
  monitor.client.on('data', (data) => {
    console.log(monitor.IP, data.toString());
    lastAck = true;
    sendCommand();
  });
  monitor.client.on('end', () => {
    monitors[i].status = "disconnected";
    console.log('Connection ended from server', monitor.IP);
  });
  monitor.client.on('error', (error) => {
    monitors[i].status = error.code;
    console.log('Error from server', monitor.IP);
  });
}

function startATEM(){
  myAtem.connect('10.100.6.220');
  ATEMState = "connecting"
  
  myAtem.on('connected', () => {
    console.log("ATEM Connected");
    ATEMState = "connected"

  })

  myAtem.on('disconnected', () => {
    console.log("ATEM Disconnected");
    ATEMState = "disconnected"

  })

  myAtem.on('stateChanged', (state, pathToChange) => {
    console.log("ATEM CHANGE")
    previousState = state;
/*     if(previousState.video.auxilliaries[0] != previousAux){
      setMonitorCamera(1,previousState.video.auxilliaries[0])
    } */
    previousAux = previousState.video.auxilliaries[0];
    sendTally(false);
  })
}

function sendTally(forceRefresh){
  if(forceRefresh || previousTally.handleTransistion != (previousState.video.mixEffects[0].transitionPosition.handlePosition != 0) || previousTally.program != previousState.video.mixEffects[0].programInput || previousTally.preview != previousState.video.mixEffects[0].previewInput){
    for (var i = 0; i < monitors.length; i++){
      console.log(i, monitors[i].camera)
      if(!monitors[i].client.destroyed){
        if(monitors[i].camera == previousState.video.mixEffects[0].programInput || (previousState.video.mixEffects[0].transitionPosition.handlePosition != 0 && monitors[i].camera == previousState.video.mixEffects[0].previewInput)){
          console.log("Kaleido", i, "PGM")
          queueCommand(i, `<setKStatusMessage>set id="1" status="ERROR"</setKStatusMessage>\n`)
          queueCommand(i, `<setKStatusMessage>set id="0" status="ERROR"</setKStatusMessage>\n`)
        }
        else{
          queueCommand(i, `<setKStatusMessage>set id="1" status="NORMAL"</setKStatusMessage>\n`)
          queueCommand(i, `<setKStatusMessage>set id="0" status="NORMAL"</setKStatusMessage>\n`)
        }
        if(monitors[i].camera == previousState.video.mixEffects[0].previewInput){
          console.log("Kaleido", i, "PRV")
          queueCommand(i, `<setKStatusMessage>set id="2" status="ERROR"</setKStatusMessage>\n`)
        }
        else{
          queueCommand(i, `<setKStatusMessage>set id="2" status="NORMAL"</setKStatusMessage>\n`)
        }
      }
              
    }
  }
  previousTally.program = previousState.video.mixEffects[0].programInput;
  previousTally.preview = previousState.video.mixEffects[0].previewInput;
  previousTally.handleTransistion = (previousState.video.mixEffects[0].transitionPosition.handlePosition != 0);
}

function queueCommand(monitor, command){
  commandQueue.push({
    monitor,
    command
  })
}

function sendCommand(){
  if(lastAck == true && commandQueue.length != 0){
    var commandObj = commandQueue.shift();
    monitors[commandObj.monitor].client.write(commandObj.command);
    lastAck = false;
  }
}

function setMonitorCamera(monitor,camera){
  monitors[parseFloat(monitor) - 1].camera = camera;
  monitors[parseFloat(monitor) - 1].client.write(`<setKDynamicText>set address="0" text="Kamera ${camera}"</setKDynamicText>\n`);
  sendTally(true);
}
function start(){
  if(fs.existsSync('settings.json')){

    fs.readFile('settings.json', (err, data) => {
      if (err) throw err;
      monitors = JSON.parse(data);
      console.log("Settings loaded");
      console.log(monitors);
      startTCP();
      startATEM();
    });
    
  }
  else{
    startTCP();
    startATEM();
  }
}

start();
  
/*
function httpRequest(host, port, path){
  return new Promise(function(resolve, reject) {
    var options = {
      host: host,
      path: path,
      port: port,
    };
    callback = function(response) {
      var str = ''
      response.on('data', function (chunk) {
        str += chunk;
      });
    
      response.on('end', function () {
        resolve({str});
      });
    }
    
    var req = http.request(options, callback);
    req.end();
  })
}

function sendTally(){
    for (var i = 0; i < Object.keys(cameras).length; i++){
        if(Object.keys(cameras)[i] == previousState.video.mixEffects[0].programInput){
            //httpRequest(cameras[Object.keys(cameras)[i]].IP, 80, "/cgi-bin/aw_ptz?cmd=%23DA1&res=1")
            //httpRequest(cameras[Object.keys(cameras)[i]].IP, 80, "/cgi-bin/aw_cam?cmd=TLR:1&res=1")
            //httpRequest(cameras[Object.keys(cameras)[i]].IP, 80, "/cgi-bin/aw_cam?cmd=TLG:0&res=1")
          }
          else if(Object.keys(cameras)[i] == previousState.video.mixEffects[0].previewInput){
            //client.write(`<setKStatusMessage>set id="1" status="ERROR"</setKStatusMessage>\n`);
            //httpRequest(cameras[Object.keys(cameras)[i]].IP, 80, "/cgi-bin/aw_cam?cmd=TLG:1&res=1")
            //httpRequest(cameras[Object.keys(cameras)[i]].IP, 80, "/cgi-bin/aw_cam?cmd=TLR:0&res=1")
          }
          else{
            //httpRequest(cameras[Object.keys(cameras)[i]].IP, 80, "/cgi-bin/aw_ptz?cmd=%23DA0&res=1")
            //httpRequest(cameras[Object.keys(cameras)[i]].IP, 80, "/cgi-bin/aw_cam?cmd=TLR:0&res=1")
            //httpRequest(cameras[Object.keys(cameras)[i]].IP, 80, "/cgi-bin/aw_cam?cmd=TLG:0&res=1")
            
          }
        }
        for (var i = 0; i < Object.keys(monitors).length; i++){
           var telnetString = "";
          if(monitors[Object.keys(monitors)[i]].camera == previousState.video.mixEffects[0].programInput){
            client["Monitor" + i].write(`<setKStatusMessage>set id="1" status="ERROR"</setKStatusMessage>\n`);
            client["Monitor" + i].write(`<setKStatusMessage>set id="0" status="ERROR"</setKStatusMessage>\n`);
          }
          else{
            client["Monitor" + i].write(`<setKStatusMessage>set id="1" status="NORMAL"</setKStatusMessage>\n`);
            client["Monitor" + i].write(`<setKStatusMessage>set id="0" status="NORMAL"</setKStatusMessage>\n`);
          }
          if(monitors[Object.keys(monitors)[i]].camera == previousState.video.mixEffects[0].previewInput){
            setTimeout(function(){
              client["Monitor" + i].write(`<setKStatusMessage>set id="2" status="ERROR"</setKStatusMessage>\n`);
            },50)
          }
          else{
            setTimeout(function(){
              client["Monitor" + i].write(`<setKStatusMessage>set id="2" status="NORMAL"</setKStatusMessage>\n`);
            },50)
          } 
        }
    
    console.log(previousState.video.mixEffects[0].programInput) // catch the ATEM state.
    console.log(previousState.video.mixEffects[0].previewInput) // catch the ATEM state.
    console.log(previousState.video.mixEffects[0].transitionPosition) // catch the ATEM state.
  } */