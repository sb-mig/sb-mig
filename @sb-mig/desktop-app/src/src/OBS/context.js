import React, { createContext, useState } from "react";
import OBSWebSocket from "obs-websocket-js";

const OBSContext = createContext({ obs: null });

const OBSContextProvider = (props) => {
  const [obsContext, ] = useState(
    new OBSWebSocket().connect({ address: "localhost:4444" })
  );

  return (
    <OBSContext.Provider value={obsContext}>
      {props.children}
    </OBSContext.Provider>
  );
};

export { OBSContext, OBSContextProvider };
