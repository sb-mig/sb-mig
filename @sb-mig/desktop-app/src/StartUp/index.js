import React, { useEffect } from "react";
const path = window.require("path");
const rootPath = window.require("electron-root-path").rootPath;
const { ipcRenderer } = window.require("electron");

const StartUp = () => {
  useEffect(() => {
    const args = ["arg1", "arg2"];
    ipcRenderer.invoke("get-app-path", ...args);
  }, []);

  const onFileInputChange = (event) => {
      console.log("what is this event: ")
      console.log(event.target.directories)
      console.log(event)
  }

  return (
    <div>
      <h1>Start up</h1>
      <label for="workingDirectory">Working directory: </label><input onChange={onFileInputChange} name="workingDirectory" type="file" webkitdirectory="true" multiple="true" />
      <h4>Working directory (process.cwd()): {process.cwd()}</h4>
      <h4>Working directory (__dirname): {__dirname}</h4>
      <h5>Root path using electron-root-path: {rootPath}</h5>
      <h6>
        filename: {__filename} and folder with it {path.dirname(__filename)}
      </h6>
    </div>
  );
};

export default StartUp;
