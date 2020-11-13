import React from "react";
import browserHelp from '../../images/browser-help.png';

const Browser = () => {
  return (
    <>
      <section className="browser-preview section -s">
        <div className="container">
          <div className="row">
            <div className="col -s-6">
              <a alt="link" href="https://www.youtube.com/user/slipstreamsportsllc" target="_blank" rel="noreferrer" className="button -secondary -square">
                <span className="button__content u-s-pr-xs">EF YouTube</span>{" "}
              </a>
            </div>
            <div className="col -s-6">
              <a alt="link" href="https://www.google.com" className="button -secondary -square">
                <span className="button__content u-s-pr-xs">Poseidon</span>{" "}
              </a>
            </div>
          </div>
          <div className="row">
            <div className="col -s-6">
              <a alt="link" href="https://www.google.com" className="button -secondary -square">
                <span className="button__content u-s-pr-xs">
                  Campus Connect
                </span>{" "}
              </a>
            </div>
            <div className="col -s-6">
              <a alt="link" href="https://www.google.com" className="button -secondary -square">
                <span className="button__content u-s-pr-xs">Juno</span>{" "}
              </a>
            </div>
          </div>
          <div className="row">
            <div className="col -s-6">
              <a alt="link" href="https://www.google.com" className="button -secondary -square">
                <span className="button__content u-s-pr-xs">Themis</span>{" "}
              </a>
            </div>
          </div>
        </div>
      </section>
      <section className="section -s">
        <div className="container">
          <div className="row">
            <div className="browser-help">
              <h3 className="h5">
                Pleasu use the browser on the secondary screen for sharing.
              </h3>
              <img
                src={browserHelp}
                alt="This is browser help"
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default Browser;
