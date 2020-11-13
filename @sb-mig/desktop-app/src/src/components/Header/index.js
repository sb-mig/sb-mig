import React from "react";

export const streamSourceEnum = {
  browser: "browser",
  library: "library"
}

// OBS functions
export async function sendCommand(obs, command, params) {
  try {
    return await obs.send(command, params || {});
  } catch (e) {
    console.log("Error sending command", command, " - error is:", e);
    return {};
  }
}

export async function setScene(obs, e, sceneName) {
  await sendCommand(obs, "SetCurrentScene", { "scene-name": sceneName });
}

const Header = (props) => {
  const changeScene = async (e, camera) => {
    await setScene(props.obs, e, camera);
  };

  return (
    <div className="header">
      <div className="logo-header">
        <div className="row">
          <div className="col u-p-s u-f-light">Virtual Office</div>
        </div>
      </div>
      <div className="container">
        <section className="section -s">
          <div className="row">
            <div className="col -s-3">
              <div className="button-group -condensed">
                <button onClick={() => props.onChangeStreamSource(streamSourceEnum.library)} type="button" className="button -secondary -square">
                  <span className="button__content">Library</span>
                </button>
                <button onClick={() => props.onChangeStreamSource(streamSourceEnum.browser)} type="button" className="button -secondary -square">
                  <span className="button__content">Browser</span>
                </button>
              </div>
            </div>
            <div className="col -s-3">
              <div className="button-group -condensed">
                <button
                  onClick={(e) => changeScene(e, "Share Screen")}
                  type="button"
                  className="button -secondary -square"
                >
                  <span className="button__content">Share Screen</span>
                </button>
                <button type="button" className="button -secondary -square">
                  <span className="button__content">Mic</span>
                </button>
              </div>
            </div>

            <div className="col -s-offset-3 -s-3">
              <div className="button-group -condensed">
                <button
                  onClick={(e) => changeScene(e, "First Camera")}
                  type="button"
                  className="button -secondary -square"
                >
                  <span className="button__content">First</span>
                </button>
                <button
                  onClick={(e) => changeScene(e, "Second Camera")}
                  type="button"
                  className="button -secondary -square"
                >
                  <span className="button__content">Second</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Header;
