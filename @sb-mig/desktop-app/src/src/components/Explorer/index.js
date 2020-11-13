import React, { useState } from "react";
import Sidebar from "./Sidebar";
import Destinations from "./Content/Destinations";
import GeneralInfo from "./Content/GeneralInfo";
import LocalFiles from "./Content/LocalFiles";

const fs = window.require("fs");
const path = window.require("path");

export const contentEnum = {
  destinations: 0,
  generalInfo: 1,
  localFiles: 2,
};

const destinationFiles = [1, 2, 3, 4, 5, 6, 7];
const generalInfoFiles = [1, 2, 3, 4];

const Explorer = (props) => {
  const [whichContent, setWhichContent] = useState(contentEnum.destinations);
  const [folderSelected, setFolderSelected] = useState(false);
  const [files, setFiles] = useState([]);
  const { obs, onSetSource } = props;

  const changeContentTo = (content) => {
    setWhichContent(content);
  };

  const onFolderSelect = (event) => {
    const entries = Object.entries(event.target.files);
    const temp = entries
      .filter((file) => file[1].name[0] !== ".")
      .map((file) => file[1]);
    setFiles(temp);
    setFolderSelected(true);
  };

  const getContent = (files) => {
    let content;
    switch (whichContent) {
      case contentEnum.destinations:
        content = <Destinations destinationFiles={destinationFiles} />;
        break;
      case contentEnum.generalInfo:
        content = <GeneralInfo generalInfoFiles={generalInfoFiles} />;
        break;
      case contentEnum.localFiles:
        content = (
          <LocalFiles files={files} obs={obs} onSetSource={onSetSource} />
        );
        break;
      default:
        content = <Destinations />;
        break;
    }

    return content;
  };

  return (
    <div>
      <div className="container">
        <section className="section -s">
          {folderSelected ? (
            <div className="row">
              <div className="col -s-3">
                <Sidebar onChangeContentTo={changeContentTo} />
              </div>
              <div className="col -s-9">
                <div>{getContent(files)}</div>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <label htmlFor="select-folder" />
              <input
                name="select-folder"
                type="file"
                onChange={onFolderSelect}
                webkitdirectory="true"
                directory="true"
                multiple="true"
              />
              select folder
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Explorer;
