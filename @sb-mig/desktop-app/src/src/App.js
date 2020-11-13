import React, { useEffect, useState, useMemo } from "react";
import OBSWebSocket from "obs-websocket-js";

import Header, { streamSourceEnum } from "./components/Header";
import Explorer from "./components/Explorer";
import Preview from "./components/Preview";
import Browser from './components/Browser';

const App = () => {
  const [streamSource, setStreamSource] = useState(streamSourceEnum.library);
  const [screenshot, setScreenshot] = useState(null);
  const obs = useMemo(() => new OBSWebSocket(), []);
  const obsAdress = "localhost:4444";
  const obsPassword = "";

  useEffect(() => {
    //stuff that happens upon initial render
    ///and subsequent re-renders
    //e.g. make a fetch request, open a socket connection
    obs
      .connect({
        address: obsAdress,
        password: obsPassword,
      })
      .then(() => {
        console.log(`Success! We're connected & authenticated.`);
        //console.log(obs.send('GetSceneList'));
        return obs.send("GetSceneList");
      });
    return () => {
      //stuff that happens when the component unmounts
      //e.g. close socket connection
      obs.disconnect();
    };
  }, [obs]);

  const changeStreamSource = (source) => {
    setStreamSource(source)
  }

  const setSource = async ({ e, sourceName, file }) => {
    takeSourceScreenshot(sourceName);
    const data = await obs.send("SetSourceSettings", {
      sourceName,
      sourceSettings: {
        local_file: file.path,
      },
    });

    console.log(`I've set source to ${data.sourceSettings.local_file}`);
  };

  const takeSourceScreenshot = async (sourceName) => {
    const temp = await obs.send("TakeSourceScreenshot", {
      sourceName,
      embedPictureFormat: "jpeg",
      width: 960,
      height: 540,
    });

    setScreenshot(temp);
  };

  return (
    <div>
      <Header onChangeStreamSource={changeStreamSource} obs={obs} />

      {streamSource === streamSourceEnum.library ? (
        <>
          <Preview obs={obs} screenshot={screenshot} />
          <Explorer obs={obs} onSetSource={setSource} />
        </>
      ) : (
        <Browser />
      )}
    </div>
  );
};

export default App;
