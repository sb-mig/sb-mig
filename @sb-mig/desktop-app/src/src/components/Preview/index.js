import React from "react";

const Preview = (props) => {
  const { screenshot } = props;

  return (
    <section className="content-preview ef-section -xl">
      {screenshot ? <img src={screenshot.img} alt="Preview" />  : "No media selected"}
    </section>
  );
};

export default Preview;
