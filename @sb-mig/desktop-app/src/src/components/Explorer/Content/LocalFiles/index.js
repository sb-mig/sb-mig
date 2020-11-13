import React from "react";

// const electron = window.require("electron");
// const invokeSomeEventToMainProcess = () => {
//   console.log("clicking ?");
//   const args = [1, 2, 3, 4];
//   electron.ipcRenderer.invoke("perform-action", ...args);
// };

const LocalFiles = (props) => {
  const { files, onSetSource } = props;

  return (
    <div>
      <div className="row">
        {files.map((file) => {
          return (
            <div key={`${file.path}`}>
              <div
                className="content-tile"
                onClick={(e) =>
                  onSetSource({
                    e,
                    sourceName: "Video Source",
                    file,
                  })
                }
              >
                some icon
              </div>
              <p className="para">{file.name}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LocalFiles;
