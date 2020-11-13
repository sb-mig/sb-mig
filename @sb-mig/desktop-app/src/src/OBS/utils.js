import OBSWebSocket from "obs-websocket-js";

const obs = new OBSWebSocket();
const obsAdress = "localhost:4444";
const obsPassword = "";

// OBS functions
export async function sendCommand(command, params) {
  try {
    return await obs.send(command, params || {});
  } catch (e) {
    console.log("Error sending command", command, " - error is:", e);
    return {};
  }
}


  export async function setScene(e, sceneName) {
    await sendCommand('SetCurrentScene', { 'scene-name': sceneName });
  }

  export async function setPreview(e, sceneName) {
    return await sendCommand('SetPreviewScene', { 'scene-name': sceneName });
  }

  export async function transitionScene(e) {
    return await sendCommand('TransitionToProgram');
  }

  export async function startStream() {
    return await sendCommand('StartStreaming');
  }

  export async function stopStream() {
    return await sendCommand('StopStreaming');
  }

  export async function startRecording() {
    return await sendCommand('StartRecording');
  }

  export async function stopRecording() {
    return await sendCommand('StopRecording');
  }

  export async function getPreviewScene() {
    return await sendCommand('GetPreviewScene');
  }

  export async function getSceenScreenshoot(currentScene, pictureFormat = 'jpeg', width = 960, height = 540) {
    return await sendCommand('TakeSourceScreenshot', { sourceName: currentScene, embedPictureFormat: pictureFormat, width, height })
  }

  export async function updateScenes(listOfScenes, currentScene) {
    console.log("update scene fired")
    // let data = await sendCommand('GetSceneList');
    // const scenes = listOfScenes.filter(i => {
    //   return i.name.indexOf('(hidden)') === -1;
    // }); // Skip hidden scenes

    const isStudioMode = true
    
    if (isStudioMode) {
      obs
        .send('GetPreviewScene')
        .then(data => {
            console.log('asdasd');
            console.log(data); 
            return data.name
        })
        .catch(_ => {
          // Switching off studio mode calls SwitchScenes, which will trigger this
          // before the socket has recieved confirmation of disabled studio mode.
        });
    }
    console.log('Scenes updated');
  }


  // GET
  export async function getSceneList() {
    await sendCommand('GetSceneList')
  }


  export default obs
  .connect({
    address: obsAdress,
    password: obsPassword,
  })
  .then(() => {
    console.log(`Success! We're connected & authenticated.`);
    //console.log(obs.send('GetSceneList'));
    return obs.send("GetSceneList");
  });




  // OBS events
//   obs.on('ConnectionClosed', () => {
//     connected = false;
//     window.history.pushState('', document.title, window.location.pathname + window.location.search); // Remove the hash
//     console.log('Connection closed');
//   });

//   obs.on('AuthenticationSuccess', async () => {
//     console.log('Connected');
//     connected = true;
//     document.location.hash = host; // For easy bookmarking
//     const version = (await sendCommand('GetVersion')).obsWebsocketVersion || '';
//     console.log('OBS-websocket version:', version);
//     if(compareVersions(version, OBS_WEBSOCKET_LATEST_VERSION) < 0) {
//       alert('You are running an outdated OBS-websocket (version ' + version + '), please upgrade to the latest version for full compatibility.');
//     }
//     await sendCommand('SetHeartbeat', { enable: true });
//     await getStudioMode();
//     await updateScenes();
//     await getScreenshot();
//     document.querySelector('#program').classList.remove('is-hidden');
//   });

//   obs.on('AuthenticationFailure', async () => {
//     password = prompt('Please enter your password:', password);
//     if (password === null) {
//       connected = false;
//       password = '';
//     } else {
//       await connect();
//     }
//   });

//   // Heartbeat
//   obs.on('Heartbeat', data => {
//     heartbeat = data;
//   });

//   // Scenes
//   obs.on('SwitchScenes', async (data) => {
//     console.log(`New Active Scene: ${data.sceneName}`);
//     await updateScenes();
//   });

//   obs.on('error', err => {
//     console.error('Socket error:', err);
//   });

//   obs.on('StudioModeSwitched', async (data) => {
//     console.log(`Studio Mode: ${data.newState}`);
//     isStudioMode = data.newState;
//     if (!isStudioMode) {
//       currentPreviewScene = false;
//     } else {
//       await updateScenes();
//     }
//   });

//   obs.on('PreviewSceneChanged', async(data) => {
//     console.log(`New Preview Scene: ${data.sceneName}`);
//     await updateScenes();
//   });