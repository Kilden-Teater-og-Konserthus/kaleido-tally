const  http = require('http');
const { Atem } = require('atem-connection')
const myAtem = new Atem()
myAtem.on('info', console.log)
myAtem.on('error', console.error)
const express = require('express')
const app = express();
const port = 3000;
const net = require('net');

var monitors = [
  {
      IP: "10.100.5.132",
      camera: 1,
      name: "Monitor1",
      client: null
  },
  {
      IP: "10.100.5.44",
      camera: 1,
      name: "Monitor2",
      client: null
  },
  {
      IP: "10.100.5.45",
      camera: 1,
      name: "Monitor3",
      client: null
  },
]

app.listen(port, () => console.log(`Example app listening at http://localhost:${port}`))

monitors.forEach(monitor => {
  console.log(monitor.IP)
  monitor.client = new net.Socket();
  monitor.client.connect({port: 13000, host: monitor.IP});

  monitor.client.on('connect', () => {
    console.log('connected to server!');
    monitor.client.write('<openID/>\n');
    monitor.client.write(`<setKDynamicText>set address="0" text="-"</setKDynamicText>\n`);
  });
  monitor.client.on('data', (data) => {
    console.log(data.toString());
    lastAck = true;
    sendCommand();
  });
  monitor.client.on('end', () => {
    console.log('disconnected from server');
  });
});

app.get('/setMonitorCamera', function(req, res){
    console.log(req.originalUrl);
    setMonitorCamera(req.query.monitor,req.query.camera);
    sendTally(true);
    res.sendStatus(200);
});
 
myAtem.connect('10.100.6.220')
 
myAtem.on('connected', () => {
  console.log("connected")
})

var previousState;

var previousAux = 0;

myAtem.on('stateChanged', (state, pathToChange) => {
  console.log("ATEM CHANGE")
  previousState = state;
  if(previousState.video.auxilliaries[0] != previousAux){
    setMonitorCamera(1,previousState.video.auxilliaries[0])
  }
  previousAux = previousState.video.auxilliaries[0];
  sendTally(false);
})

var previousTally = {
  program: 0,
  preview: 0,
  handleTransistion: false
}

function sendTally(forceRefresh){
  if(forceRefresh || previousTally.handleTransistion != (previousState.video.mixEffects[0].transitionPosition.handlePosition != 0) || previousTally.program != previousState.video.mixEffects[0].programInput || previousTally.preview != previousState.video.mixEffects[0].previewInput){
    for (var i = 0; i < monitors.length; i++){
      if(monitors[i].camera == previousState.video.mixEffects[0].programInput || (previousState.video.mixEffects[0].transitionPosition.handlePosition != 0 && monitors[i].camera == previousState.video.mixEffects[0].previewInput)){
        queueCommand(i, `<setKStatusMessage>set id="1" status="ERROR"</setKStatusMessage>\n`)
        queueCommand(i, `<setKStatusMessage>set id="0" status="ERROR"</setKStatusMessage>\n`)
      }
      else{
        queueCommand(i, `<setKStatusMessage>set id="1" status="NORMAL"</setKStatusMessage>\n`)
        queueCommand(i, `<setKStatusMessage>set id="0" status="NORMAL"</setKStatusMessage>\n`)
      }
      if(monitors[i].camera == previousState.video.mixEffects[0].previewInput){
        queueCommand(i, `<setKStatusMessage>set id="2" status="ERROR"</setKStatusMessage>\n`)
      }
      else{
        queueCommand(i, `<setKStatusMessage>set id="2" status="NORMAL"</setKStatusMessage>\n`)
      }
    }
  }
  previousTally.program = previousState.video.mixEffects[0].programInput;
  previousTally.preview = previousState.video.mixEffects[0].previewInput;
  previousTally.handleTransistion = (previousState.video.mixEffects[0].transitionPosition.handlePosition != 0);
}

var commandQueue = [];

function queueCommand(monitor, command){
  commandQueue.push({
    monitor,
    command
  })
}

var lastAck = true;

setInterval(()=>{
 sendCommand();
}, 10)

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

/*   function sendTally(){
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