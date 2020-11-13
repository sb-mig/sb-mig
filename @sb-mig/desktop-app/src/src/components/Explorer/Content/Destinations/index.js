import React from "react";

const Destinations = (props) => {
  const { destinationFiles } = props;
  
  return (
    <div>
      <div className="destinations ef-row">
        {destinationFiles.map((file) => {
          return (
            <div key={file}>
              <div className="content-tile">
                <IconAcademicMaterial />
              </div>
              <p className="para">This is file</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Destinations;
