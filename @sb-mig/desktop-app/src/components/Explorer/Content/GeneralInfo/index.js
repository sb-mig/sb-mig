import React from "react";

const GeneralInfo = (props) => {
  const { generalInfoFiles } = props;

  return (
    <div>
      <div className="row">
        {generalInfoFiles.map((file) => {
          return (
            <div className="col" key={file}>
              <div className="content-tile">
                some icon
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GeneralInfo;
